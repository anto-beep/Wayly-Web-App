"""OJ-1 v1.1, Onboarding Journey HTTP surface.

Guides new users through a sequenced path: Persona → CSC-1 → CE-2 →
Budget Calculator → CPR-1 → Complete. Persona is locked at step zero.
Steps support "I already know this" skips with a `user_declared` source.

Endpoints
---------
POST /api/journeys                      , get-or-create the caller's active journey
GET  /api/journeys/current              , read the caller's active journey
PUT  /api/journeys/{id}/persona         , lock persona (idempotent, one-shot)
PUT  /api/journeys/{id}/steps/{step}    , mark step complete or skipped
POST /api/journeys/{id}/complete        , mark journey completed
POST /api/journeys/{id}/skip            , skip the whole onboarding
GET  /api/journeys/{id}/pdf             , on-demand PDF summary (no storage)

Wire in server.py:
    from routes.journeys import build_journeys_router
    api.include_router(build_journeys_router(db=db, user_dep=_user_from_request))
"""
from __future__ import annotations

import io
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

logger = logging.getLogger("wayly.oj1.routes")

# Ordered step list for the sequenced flow.
STEP_ORDER = ["persona", "csc", "ce2", "budget", "cpr"]
SUBSTANTIVE_STEPS = {"csc", "ce2", "budget", "cpr"}

# October 2026 variant trigger, signups from this date see additional
# personal-care funding context at the CE-2 step.
OCTOBER_2026_CUTOVER = datetime(2026, 10, 1, tzinfo=timezone.utc)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _default_journey_doc(user_id: str, participant_id: Optional[str] = None) -> dict:
    now = _now_iso()
    now_dt = datetime.now(timezone.utc)
    variant = "october_2026" if now_dt >= OCTOBER_2026_CUTOVER else "default"
    return {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "participant_id": participant_id,
        "persona": None,
        "persona_locked_at": None,
        "status": "in_progress",
        "variant": variant,
        "started_at": now,
        "last_activity_at": now,
        "completed_at": None,
        "steps": {
            "persona": {"status": "pending", "source": None, "data": None, "timestamp": None},
            "csc":     {"status": "pending", "source": None, "data": None, "timestamp": None},
            "ce2":     {"status": "pending", "source": None, "data": None, "timestamp": None},
            "budget":  {"status": "pending", "source": None, "data": None, "timestamp": None},
            "cpr":     {"status": "pending", "source": None, "data": None, "timestamp": None},
        },
        "events": [
            {"type": "journey_started", "at": now, "variant": variant},
        ],
    }


class PersonaBody(BaseModel):
    persona: Literal["participant", "caregiver"]


class StepBody(BaseModel):
    status: Literal["complete", "skipped"]
    source: Optional[Literal["computed", "user_declared"]] = None
    data: Optional[dict] = None


def build_journeys_router(*, db, user_dep: Callable) -> APIRouter:
    router = APIRouter(tags=["onboarding-journey"])

    async def _require_user(request: Request) -> dict:
        user = await user_dep(request)
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        return user

    async def _load(journey_id: str, user_id: str) -> dict:
        doc = await db.journeys.find_one({"id": journey_id, "user_id": user_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Journey not found")
        return doc

    async def _touch(journey_id: str, extra: Optional[dict] = None) -> None:
        upd = {"last_activity_at": _now_iso()}
        if extra:
            upd.update(extra)
        await db.journeys.update_one({"id": journey_id}, {"$set": upd})

    async def _append_event(journey_id: str, event: dict) -> None:
        await db.journeys.update_one({"id": journey_id}, {"$push": {"events": event}})

    @router.post("/journeys")
    async def create_or_get_journey(request: Request, participant_id: Optional[str] = None):
        """Idempotent, one active journey per (user, participant). If the
        user's signup ``role`` is already ``caregiver`` or ``participant``,
        the persona step is auto-locked with that value on first create so
        the walkthrough skips straight to the substantive stops."""
        user = await _require_user(request)
        uid = user["id"]

        q = {"user_id": uid, "status": "in_progress"}
        if participant_id:
            q["participant_id"] = participant_id

        existing = await db.journeys.find_one(q, {"_id": 0})
        if existing:
            return existing

        doc = _default_journey_doc(uid, participant_id)

        # Auto-lock persona from signup role. Only accept the two values the
        # UI understands; anything else falls through to the manual step.
        signup_role = (user.get("role") or "").lower().strip()
        if signup_role not in ("caregiver", "participant"):
            # Fall back to a fresh DB read in case the user_dep returned a
            # minimal record without the role field.
            fresh = await db.users.find_one({"id": uid}, {"role": 1, "_id": 0})
            signup_role = ((fresh or {}).get("role") or "").lower().strip()

        if signup_role in ("caregiver", "participant"):
            now = doc["started_at"]
            doc["persona"] = signup_role
            doc["persona_locked_at"] = now
            doc["steps"]["persona"] = {
                "status": "complete",
                "source": "signup",
                "data": None,
                "timestamp": now,
            }
            doc["events"].append({"type": "persona_selected", "persona": signup_role,
                                  "source": "signup", "at": now})

        await db.journeys.insert_one({**doc})
        return {k: v for k, v in doc.items() if k != "_id"}

    @router.get("/journeys/current")
    async def current(request: Request, participant_id: Optional[str] = None, include_completed: bool = False):
        user = await _require_user(request)
        uid = user["id"]
        q = {"user_id": uid, "status": "in_progress"}
        if participant_id:
            q["participant_id"] = participant_id
        doc = await db.journeys.find_one(q, {"_id": 0})
        if not doc and include_completed:
            q2 = {"user_id": uid, "status": "completed"}
            if participant_id:
                q2["participant_id"] = participant_id
            doc = await db.journeys.find_one(q2, {"_id": 0}, sort=[("completed_at", -1)])
        if not doc:
            return {"journey": None}
        return {"journey": doc}

    @router.put("/journeys/{journey_id}/persona")
    async def lock_persona(journey_id: str, body: PersonaBody, request: Request):
        user = await _require_user(request)
        doc = await _load(journey_id, user["id"])
        if doc.get("persona_locked_at"):
            # Persona is one-shot; further attempts are ignored (idempotent).
            return doc
        now = _now_iso()
        await db.journeys.update_one(
            {"id": journey_id},
            {
                "$set": {
                    "persona": body.persona,
                    "persona_locked_at": now,
                    "steps.persona.status": "complete",
                    "steps.persona.source": "user_declared",
                    "steps.persona.timestamp": now,
                    "last_activity_at": now,
                }
            },
        )
        await _append_event(journey_id, {"type": "persona_selected", "persona": body.persona, "at": now})
        return await _load(journey_id, user["id"])

    @router.put("/journeys/{journey_id}/steps/{step}")
    async def update_step(journey_id: str, step: str, body: StepBody, request: Request):
        if step not in SUBSTANTIVE_STEPS:
            raise HTTPException(status_code=400, detail=f"Unknown step: {step}")
        user = await _require_user(request)
        doc = await _load(journey_id, user["id"])
        if not doc.get("persona_locked_at"):
            raise HTTPException(status_code=400, detail="Persona must be selected before completing steps")

        # Enforce order: cannot complete a later step until earlier substantive
        # steps are complete or skipped.
        prior = STEP_ORDER[: STEP_ORDER.index(step)]
        for p in prior:
            if p == "persona":
                continue
            if doc["steps"][p]["status"] not in ("complete", "skipped"):
                raise HTTPException(status_code=400, detail=f"Prior step not finished: {p}")

        source = body.source or ("user_declared" if body.status == "skipped" else "computed")
        now = _now_iso()
        upd = {
            f"steps.{step}.status": body.status,
            f"steps.{step}.source": source,
            f"steps.{step}.data": body.data or {},
            f"steps.{step}.timestamp": now,
            "last_activity_at": now,
        }
        await db.journeys.update_one({"id": journey_id}, {"$set": upd})
        await _append_event(journey_id, {
            "type": "step_updated", "step": step, "status": body.status,
            "source": source, "at": now,
        })
        return await _load(journey_id, user["id"])

    @router.post("/journeys/{journey_id}/complete")
    async def complete_journey(journey_id: str, request: Request):
        user = await _require_user(request)
        doc = await _load(journey_id, user["id"])
        if doc.get("status") == "completed":
            return doc
        # All substantive steps must be complete or skipped.
        for s in SUBSTANTIVE_STEPS:
            if doc["steps"][s]["status"] not in ("complete", "skipped"):
                raise HTTPException(status_code=400, detail=f"Step not finished: {s}")
        now = _now_iso()
        await db.journeys.update_one(
            {"id": journey_id},
            {"$set": {"status": "completed", "completed_at": now, "last_activity_at": now}},
        )
        await _append_event(journey_id, {"type": "journey_completed", "at": now})
        return await _load(journey_id, user["id"])

    @router.post("/journeys/{journey_id}/skip")
    async def skip_journey(journey_id: str, request: Request):
        """Skip the whole onboarding at step zero. Marks the journey abandoned."""
        user = await _require_user(request)
        doc = await _load(journey_id, user["id"])
        if doc.get("persona_locked_at"):
            raise HTTPException(status_code=400, detail="Cannot skip after persona selected")
        now = _now_iso()
        await db.journeys.update_one(
            {"id": journey_id},
            {"$set": {"status": "abandoned", "last_activity_at": now}},
        )
        await _append_event(journey_id, {"type": "journey_skipped_top", "at": now})
        return {"ok": True}

    @router.get("/journeys/{journey_id}/pdf")
    async def journey_pdf(journey_id: str, request: Request):
        user = await _require_user(request)
        doc = await _load(journey_id, user["id"])
        pdf_bytes = _render_journey_pdf(doc, user)
        headers = {"Content-Disposition": f"inline; filename=wayly-journey-{journey_id[:8]}.pdf"}
        return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)

    return router


def _render_journey_pdf(doc: dict, user: dict) -> bytes:
    """On-demand summary PDF. No PDF is ever stored server-side (OJ-1 §11)."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib import colors

    buf = io.BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
                            topMargin=18 * mm, bottomMargin=18 * mm, title="Wayly Onboarding Journey")
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=20, leading=24)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=13, leading=16, spaceBefore=8)
    body = ParagraphStyle("body", parent=styles["BodyText"], fontName="Helvetica", fontSize=10.5, leading=14)

    persona = (doc.get("persona") or "you").title()
    person_name = user.get("name") or user.get("email") or "You"

    story = []
    story.append(Paragraph("Your Wayly Onboarding Summary", h1))
    story.append(Paragraph(f"Prepared for {person_name} · {persona} view", body))
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "This is a snapshot of the guided walk-through you just completed. "
        "It is generated on demand and is not stored on our servers. "
        "Keep a copy for your records if you like.", body))
    story.append(Spacer(1, 6))

    story.append(Paragraph("Step-by-step outcome", h2))
    labels = {
        "csc":    "Classification Self-Check",
        "ce2":    "Contribution Estimator",
        "budget": "Budget Calculator",
        "cpr":    "Support Plan Reviewer",
    }
    rows = [["Step", "Status", "Source", "When"]]
    for k in ["csc", "ce2", "budget", "cpr"]:
        st = doc["steps"].get(k, {}) or {}
        rows.append([
            labels[k],
            (st.get("status") or "pending").title(),
            (st.get("source") or "-").replace("_", " ").title(),
            (st.get("timestamp") or "-")[:19].replace("T", " "),
        ])
    tbl = Table(rows, colWidths=[65 * mm, 30 * mm, 35 * mm, 40 * mm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F3F1EB")),
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 10),
        ("FONT", (0, 1), (-1, -1), "Helvetica", 10),
        ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#5A5548")),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#C8C3B8")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(tbl)

    story.append(Spacer(1, 10))
    story.append(Paragraph("What happens next", h2))
    story.append(Paragraph(
        "Your dashboard now shows a preview tile of the quarterly pacing view. "
        "The full pacing tool arrives with the next release; nothing you enter here is lost.", body))

    if doc.get("variant") == "october_2026":
        story.append(Spacer(1, 6))
        story.append(Paragraph("October 2026 note", h2))
        story.append(Paragraph(
            "Your account was created after 1 October 2026. Personal-care funding "
            "changes may affect your contribution estimate; see the Contribution "
            "Estimator page for the current rates.", body))

    pdf.build(story)
    buf.seek(0)
    return buf.read()
