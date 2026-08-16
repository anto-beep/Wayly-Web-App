"""LF-1 v1.2, Letters & Follow-ups route module (Iteration 1 skeleton).

Exposes the deterministic HTTP surface needed by the situation triage front
door and the correspondence log CRUD. The letter generation engine lands in
Iteration 2 as a separate router (`routes.lf1_generate`).

Iteration 1 endpoints
---------------------
* ``GET  /api/lf1/directory``                    , directory metadata.
* ``GET  /api/lf1/directory/recipients``         , list recipients (WS3).
* ``GET  /api/lf1/directory/recipients/{key}``   , single recipient.
* ``GET  /api/lf1/situations``                   , 12-situation triage front door (WS1).
* ``GET  /api/lf1/archetypes``                   , archetype metadata.
* ``POST /api/lf1/correspondence``               , create a correspondence log entry.
* ``GET  /api/lf1/correspondence``               , list the user's entries.
* ``GET  /api/lf1/correspondence/{id}``          , fetch a single entry.
* ``PATCH /api/lf1/correspondence/{id}/autosave``, draft autosave (WS8 T31).
* ``PATCH /api/lf1/correspondence/{id}``          , full patch (status,
  follow-up date, response summary, feedback, terms_ack, etc.).
* ``DELETE /api/lf1/correspondence/{id}``         , user-initiated deletion
  with audit-record preservation (WS8 T39).
* ``POST /api/lf1/correspondence/{id}/inbound``  , log an inbound message
  (WS8 T30, bidirectional).
"""
from __future__ import annotations

import datetime as _dt
import logging
import secrets
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field

from lib import lf1

logger = logging.getLogger("wayly.lf1")


def _iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


def _add_days(days: int | None) -> str | None:
    if not days:
        return None
    d = _dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(days=days)
    return d.date().isoformat()


# ---------------------------------------------------------------------------
# Pydantic bodies
# ---------------------------------------------------------------------------


class CreateCorrespondenceBody(BaseModel):
    situation_id: int
    participant_id: str | None = None
    archetype: str | None = None            # optional override
    direction: str = "outbound"
    recipient_type: str | None = None
    recipient_specific: dict | None = None
    sender_identity: str | None = None      # participant | family_caregiver | recorded_representative | poa
    sender_authority_basis: str | None = None
    complaint_mode: str | None = None       # open | confidential | anonymous (nullable)
    atsi_preference: bool = False
    source_import: dict | None = None       # {tool, record_id, fields...}
    intake: dict | None = None              # per-archetype intake payload


class AutosaveBody(BaseModel):
    """WS8 T31, every intake field change autosaves. Debounced client side."""
    intake: dict | None = None
    content_draft: str | None = None
    sender_authority_basis: str | None = None
    recipient_specific: dict | None = None
    complaint_mode: str | None = None
    atsi_preference: bool | None = None


class PatchCorrespondenceBody(BaseModel):
    status: str | None = None
    content_final: str | None = None
    sent_at: str | None = None
    sent_via: str | None = None
    follow_up_date: str | None = None
    response_summary: str | None = None
    response_received_at: str | None = None
    feedback: dict | None = None
    terms_ack: bool | None = None
    sign_off_required: bool | None = None
    sign_off_by: str | None = None
    output_formats_generated: list[str] | None = None
    complaint_mode: str | None = None
    atsi_preference: bool | None = None


class InboundBody(BaseModel):
    """WS8 T30, user manually logs an inbound message."""
    inbound_source: str  # email | portal | post | phone_note
    inbound_received_at: str | None = None
    content: str
    from_label: str | None = None
    replies_to: str | None = None  # optional, the outbound entry this inbound replies to


# Iteration 2/3/4 bodies

class GenerateBody(BaseModel):
    """Iteration 2, request a fresh LLM-drafted letter."""
    intake: dict | None = None
    persist: bool = True  # write to content_draft on the log entry


class ToneCheckBody(BaseModel):
    body: str


class FeedbackBody(BaseModel):
    rating: str  # "up" | "down"
    reason: str | None = None


class ShareBody(BaseModel):
    share_with_user_ids: list[str] = []
    require_sign_off: bool = False
    sign_off_message: str | None = None


class SignOffBody(BaseModel):
    approver_user_id: str | None = None
    note: str | None = None


class ResponseDraftBody(BaseModel):
    """Iteration 4, build a reply draft off an inbound message."""
    inbound_content: str
    inbound_from_label: str | None = None
    stance: str | None = None  # accept | refute | ask_for_info | escalate


class AttachSourceBody(BaseModel):
    tool: str
    record_id: str
    fields: dict | None = None
    note: str | None = None


# ---------------------------------------------------------------------------
# Router builder
# ---------------------------------------------------------------------------


def build_lf1_router(db, get_current_user_id, get_current_user_id_optional, require_paid_plan=None):
    r = APIRouter(tags=["lf1"])

    # Per LF-1 locked decision #24: full LF-1 access for trial users. When
    # a paid-plan dependency is provided, apply it to write endpoints only
    # (create/generate/PDF/share). Read-only directory + situation lookups
    # remain open so anonymous marketing pages can render them.
    _paid_dep = None
    if require_paid_plan is not None:
        async def _paid_dep_impl(request: Request, response: Response):
            await require_paid_plan(request, response, "Letters & Follow-ups")
        _paid_dep = Depends(_paid_dep_impl)

    # ---------- Directory (WS3) ----------

    @r.get("/lf1/directory")
    async def directory_metadata():
        return lf1.directory_metadata()

    @r.get("/lf1/directory/recipients")
    async def list_recipients(tag: str | None = Query(default=None)):
        rows = lf1.list_recipients()
        if tag:
            rows = [r_ for r_ in rows if tag in (r_.get("tags") or [])]
        return {"recipients": rows}

    @r.get("/lf1/directory/recipients/{key}")
    async def get_recipient(key: str):
        row = lf1.get_recipient(key)
        if not row:
            raise HTTPException(status_code=404, detail="Recipient not found")
        return row

    # ---------- Situation triage (WS1) ----------

    @r.get("/lf1/situations")
    async def list_situations():
        return {"situations": lf1.SITUATIONS}

    @r.get("/lf1/archetypes")
    async def list_archetypes():
        return {"archetypes": lf1.ARCHETYPES}

    @r.get("/lf1/safety")
    async def safety_copy():
        return {
            "elder_abuse": lf1.ELDER_ABUSE_SAFETY_COPY,
            "terms_footer": lf1.TERMS_FOOTER_COPY,
        }

    # ---------- Correspondence log (WS8) ----------

    @r.post("/lf1/correspondence")
    async def create_correspondence(
        body: CreateCorrespondenceBody,
        user_id: str = Depends(get_current_user_id),
    ):
        situation = lf1.get_situation(body.situation_id)
        if not situation:
            raise HTTPException(status_code=400, detail="Unknown situation_id")

        archetype = body.archetype or situation["archetype"]
        if archetype not in lf1.ARCHETYPES:
            raise HTTPException(status_code=400, detail=f"Unknown archetype: {archetype}")

        if body.direction not in lf1.DIRECTIONS:
            raise HTTPException(status_code=400, detail=f"Unknown direction: {body.direction}")

        if body.sender_identity and body.sender_identity not in lf1.SENDER_IDENTITIES:
            raise HTTPException(status_code=400, detail="Unknown sender_identity")

        if body.complaint_mode and body.complaint_mode not in lf1.COMPLAINT_MODES:
            raise HTTPException(status_code=400, detail="Unknown complaint_mode")

        recipient_type = body.recipient_type or situation.get("default_recipient")
        if recipient_type and recipient_type not in lf1.RECIPIENT_TYPES:
            raise HTTPException(status_code=400, detail="Unknown recipient_type")

        # Resolve the participant's first name so gendered situation labels
        # (1, 2, 11) can be personalised at write time. Downstream views, PDF
        # exports, and the log all read this stored value. Participants are
        # scoped by account_id so we resolve that from the caller's user_id
        # via the accounts / account_members collections.
        participant_first_name: str | None = None
        if body.participant_id:
            acct = (
                await db.account_members.find_one(
                    {"user_id": user_id, "status": "ACTIVE"},
                    {"_id": 0, "account_id": 1},
                )
                or await db.accounts.find_one(
                    {"owner_user_id": user_id}, {"_id": 0, "id": 1},
                )
                or {}
            )
            account_id = acct.get("account_id") or acct.get("id")
            if account_id:
                p = await db.participants.find_one(
                    {"id": body.participant_id, "account_id": account_id},
                    {"_id": 0, "first_name": 1, "preferred_name": 1, "name": 1},
                )
                if p:
                    participant_first_name = (
                        (p.get("preferred_name") or "").strip()
                        or (p.get("first_name") or "").strip()
                        or ((p.get("name") or "").strip().split(" ", 1)[0])
                        or None
                    )
        situation_label = lf1.render_situation_label(
            situation["label"], participant_first_name,
        )

        follow_up = _add_days(lf1.default_response_window_days(body.situation_id, archetype))

        entry_id = secrets.token_urlsafe(12)
        doc = {
            "id": entry_id,
            "user_id": user_id,
            "participant_id": body.participant_id,
            "direction": body.direction,
            "archetype": archetype,
            "situation_id": body.situation_id,
            "situation_label": situation_label,
            "recipient_type": recipient_type,
            "recipient_specific": body.recipient_specific,
            "sender_identity": body.sender_identity,
            "sender_authority_basis": body.sender_authority_basis,
            "complaint_mode": body.complaint_mode,
            "atsi_preference": bool(body.atsi_preference),
            "content_draft": "",
            "content_final": None,
            "draft_versions": [],
            "output_formats_generated": [],
            "status": "draft",
            "sent_at": None,
            "sent_via": None,
            "expected_response_by": follow_up,
            "follow_up_date": follow_up,
            "response_received_at": None,
            "response_summary": None,
            "next_action_suggested": None,
            "source_import": body.source_import,
            "intake": body.intake or {},
            "shared_with": [],
            "sign_off_required": False,
            "sign_off_by": None,
            "sign_off_at": None,
            "replies_to": None,
            "inbound_source": None,
            "inbound_received_at": None,
            "feedback": None,
            "terms_ack": False,
            "created_at": _iso(),
            "updated_at": _iso(),
        }
        await db.lf1_correspondence.insert_one(doc)
        doc.pop("_id", None)
        return {"entry": doc}

    @r.get("/lf1/correspondence")
    async def list_correspondence(
        participant_id: str | None = Query(default=None),
        status: str | None = Query(default=None),
        user_id: str = Depends(get_current_user_id),
    ):
        q: dict[str, Any] = {"user_id": user_id}
        if participant_id:
            q["participant_id"] = participant_id
        if status:
            q["status"] = status
        cursor = db.lf1_correspondence.find(q, {"_id": 0}).sort("updated_at", -1)
        rows = await cursor.to_list(length=500)
        return {"entries": rows}

    @r.get("/lf1/correspondence/{entry_id}")
    async def read_correspondence(
        entry_id: str,
        user_id: str = Depends(get_current_user_id),
    ):
        row = await db.lf1_correspondence.find_one(
            {"user_id": user_id, "id": entry_id}, {"_id": 0}
        )
        if not row:
            raise HTTPException(status_code=404, detail="Correspondence entry not found")
        return row

    @r.patch("/lf1/correspondence/{entry_id}/autosave")
    async def autosave_correspondence(
        entry_id: str,
        body: AutosaveBody,
        user_id: str = Depends(get_current_user_id),
    ):
        row = await db.lf1_correspondence.find_one({"user_id": user_id, "id": entry_id}, {"_id": 0})
        if not row:
            raise HTTPException(status_code=404, detail="Correspondence entry not found")
        update: dict[str, Any] = {"updated_at": _iso()}
        for key in ("intake", "content_draft", "sender_authority_basis",
                     "recipient_specific", "complaint_mode", "atsi_preference"):
            val = getattr(body, key)
            if val is not None:
                update[key] = val
        # Autosave never transitions status out of draft.
        if row.get("status") == "draft":
            update["status"] = "draft"
        await db.lf1_correspondence.update_one(
            {"user_id": user_id, "id": entry_id},
            {"$set": update},
        )
        return {"ok": True, "saved_at": update["updated_at"]}

    @r.patch("/lf1/correspondence/{entry_id}")
    async def patch_correspondence(
        entry_id: str,
        body: PatchCorrespondenceBody,
        user_id: str = Depends(get_current_user_id),
    ):
        row = await db.lf1_correspondence.find_one({"user_id": user_id, "id": entry_id}, {"_id": 0})
        if not row:
            raise HTTPException(status_code=404, detail="Correspondence entry not found")

        update: dict[str, Any] = {"updated_at": _iso()}

        if body.status is not None:
            if body.status not in lf1.CORRESPONDENCE_STATUSES:
                raise HTTPException(status_code=400, detail=f"Unknown status: {body.status}")
            update["status"] = body.status
            if body.status == "sent" and not row.get("sent_at") and not body.sent_at:
                update["sent_at"] = _iso()
            if body.status == "responded" and not row.get("response_received_at") and not body.response_received_at:
                update["response_received_at"] = _iso()

        for key in ("content_final", "sent_at", "sent_via", "follow_up_date",
                     "response_summary", "response_received_at", "feedback",
                     "terms_ack", "sign_off_required", "sign_off_by",
                     "output_formats_generated", "complaint_mode", "atsi_preference"):
            val = getattr(body, key)
            if val is not None:
                update[key] = val

        if "content_final" in update and row.get("content_final") != update["content_final"]:
            # Snapshot the outgoing content into the draft_versions array so
            # WS8 T32 (versioning) has a persistent trail. Canonical is always
            # the current content_final.
            versions = list(row.get("draft_versions") or [])
            versions.append({
                "version_id": secrets.token_urlsafe(8),
                "content": update["content_final"],
                "created_at": _iso(),
                "canonical": True,
            })
            # Mark previous versions non-canonical.
            for v in versions[:-1]:
                v["canonical"] = False
            update["draft_versions"] = versions

        if body.sign_off_by:
            update["sign_off_at"] = _iso()

        await db.lf1_correspondence.update_one(
            {"user_id": user_id, "id": entry_id},
            {"$set": update},
        )
        row2 = await db.lf1_correspondence.find_one(
            {"user_id": user_id, "id": entry_id}, {"_id": 0}
        )
        return {"entry": row2}

    @r.delete("/lf1/correspondence/{entry_id}")
    async def delete_correspondence(
        entry_id: str,
        user_id: str = Depends(get_current_user_id),
    ):
        row = await db.lf1_correspondence.find_one({"user_id": user_id, "id": entry_id}, {"_id": 0})
        if not row:
            raise HTTPException(status_code=404, detail="Correspondence entry not found")
        # Deletion audit record (WS8 T39).
        await db.lf1_deletions.insert_one({
            "id": secrets.token_urlsafe(12),
            "user_id": user_id,
            "entry_id": entry_id,
            "archetype": row.get("archetype"),
            "situation_id": row.get("situation_id"),
            "status_at_deletion": row.get("status"),
            "deleted_at": _iso(),
        })
        await db.lf1_correspondence.delete_one({"user_id": user_id, "id": entry_id})
        return {"deleted": True}

    @r.post("/lf1/correspondence/{entry_id}/inbound")
    async def log_inbound(
        entry_id: str,
        body: InboundBody,
        user_id: str = Depends(get_current_user_id),
    ):
        parent = await db.lf1_correspondence.find_one(
            {"user_id": user_id, "id": entry_id}, {"_id": 0}
        )
        if not parent:
            raise HTTPException(status_code=404, detail="Parent correspondence entry not found")

        if body.inbound_source not in lf1.INBOUND_SOURCES:
            raise HTTPException(status_code=400, detail="Unknown inbound_source")

        inbound_id = secrets.token_urlsafe(12)
        doc = {
            **{k: parent.get(k) for k in (
                "participant_id", "situation_id", "situation_label",
                "recipient_type", "recipient_specific", "archetype",
            )},
            "id": inbound_id,
            "user_id": user_id,
            "direction": "inbound",
            "sender_identity": None,
            "sender_authority_basis": None,
            "complaint_mode": None,
            "atsi_preference": False,
            "content_draft": body.content,
            "content_final": body.content,
            "draft_versions": [],
            "output_formats_generated": [],
            "status": "responded",
            "sent_at": None,
            "sent_via": None,
            "expected_response_by": None,
            "follow_up_date": None,
            "response_received_at": None,
            "response_summary": None,
            "next_action_suggested": None,
            "source_import": None,
            "intake": {},
            "shared_with": [],
            "sign_off_required": False,
            "sign_off_by": None,
            "sign_off_at": None,
            "replies_to": body.replies_to or entry_id,
            "inbound_source": body.inbound_source,
            "inbound_received_at": body.inbound_received_at or _iso(),
            "inbound_from_label": body.from_label,
            "feedback": None,
            "terms_ack": False,
            "created_at": _iso(),
            "updated_at": _iso(),
        }
        await db.lf1_correspondence.insert_one(doc)
        # Transition the parent to responded so the log chronology reflects
        # the reply-received event.
        await db.lf1_correspondence.update_one(
            {"user_id": user_id, "id": entry_id},
            {"$set": {
                "status": "responded",
                "response_received_at": doc["inbound_received_at"],
                "updated_at": _iso(),
            }},
        )
        doc.pop("_id", None)
        return {"entry": doc}

    # ---------- Iteration 2: LLM generation + PDF ----------

    @r.post("/lf1/correspondence/{entry_id}/generate")
    async def generate_letter(
        entry_id: str,
        body: GenerateBody,
        user_id: str = Depends(get_current_user_id),
    ):
        from services import lf1_generate as _gen

        entry = await db.lf1_correspondence.find_one(
            {"user_id": user_id, "id": entry_id}, {"_id": 0}
        )
        if not entry:
            raise HTTPException(status_code=404, detail="Correspondence entry not found")

        # Merge any inline intake overrides so the user can tweak fields
        # in the intake form and hit "Generate" without a separate save.
        if body.intake:
            merged_intake = {**(entry.get("intake") or {}), **body.intake}
            entry = {**entry, "intake": merged_intake}

        # PERSONA-1 §G, attach the caller's persona so the letter's voice
        # matches the sender. Best-effort; falls back to caregiver defaults.
        try:
            from lib.persona import load_persona_context
            entry["_persona_context"] = await load_persona_context(db, user_id)
        except Exception:
            entry["_persona_context"] = None

        try:
            payload = await _gen.generate_letter(entry)
        except _gen.SourceDataMissing as missing:
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "source_data_missing",
                    "missing_fields": list(missing.args[0]),
                },
            )
        except Exception:
            logger.exception("LF-1 generate failed for entry %s", entry_id)
            raise HTTPException(status_code=502, detail="Draft generation temporarily unavailable")

        if body.persist:
            await db.lf1_correspondence.update_one(
                {"user_id": user_id, "id": entry_id},
                {"$set": {
                    "content_draft": payload["body"],
                    "intake": entry.get("intake") or {},
                    "updated_at": _iso(),
                }},
            )
        return payload

    @r.post("/lf1/correspondence/{entry_id}/pdf")
    async def pdf_export(
        entry_id: str,
        user_id: str = Depends(get_current_user_id),
    ):
        from fastapi.responses import Response as _Response
        from services import lf1_generate as _gen
        from services import lf1_pdf as _pdf

        entry = await db.lf1_correspondence.find_one(
            {"user_id": user_id, "id": entry_id}, {"_id": 0}
        )
        if not entry:
            raise HTTPException(status_code=404, detail="Correspondence entry not found")

        # Prefer content_final; fall back to content_draft.
        body_text = entry.get("content_final") or entry.get("content_draft") or ""
        subject_text = (entry.get("intake") or {}).get("subject") or "Correspondence"
        # If the LLM was previously invoked we snapshotted the subject onto
        # the draft; try to reparse it out.
        if body_text.lower().lstrip().startswith("subject:"):
            first_line, _, rest = body_text.partition("\n")
            subject_text = first_line.split(":", 1)[1].strip()
            body_text = rest.strip()

        cover = _gen.build_cover_note(entry)

        # Sender display: pull the user's display name.
        user = await db.users.find_one(
            {"id": user_id}, {"_id": 0, "name": 1, "email": 1},
        ) or {}
        pdf_bytes = _pdf.render_letter_pdf(
            subject=subject_text,
            body=body_text,
            cover_note=cover,
            sender_display_name=user.get("name"),
            sender_authority_basis=entry.get("sender_authority_basis"),
            sender_email=user.get("email"),
            include_opan_footer=cover.get("include_opan_footer", False),
            archetype=entry.get("archetype") or "",
            situation_label=entry.get("situation_label"),
        )

        # Track output format used (T33).
        formats = list(entry.get("output_formats_generated") or [])
        if "pdf" not in formats:
            formats.append("pdf")
            await db.lf1_correspondence.update_one(
                {"user_id": user_id, "id": entry_id},
                {"$set": {"output_formats_generated": formats, "updated_at": _iso()}},
            )

        filename = f"wayly-letter-{(entry.get('archetype') or 'letter')}.pdf"
        return _Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    # ---------- Iteration 3: cross-tool imports ----------

    @r.get("/lf1/cross-tool-signals")
    async def cross_tool_signals(
        user_id: str = Depends(get_current_user_id),
    ):
        """Return the fields Iteration 3 tap-through CTAs need to pre-fill
        a correspondence entry: recent decoded statement, latest CE state,
        latest classification-check result, latest care plan, and recent
        PPC saved-checks."""
        signals: dict[str, Any] = {}

        household = await db.households.find_one({"members.user_id": user_id})
        household_id = (household or {}).get("id")

        if household_id:
            stmt = await db.statements.find_one(
                {"household_id": household_id, "state": {"$nin": ["archived", "deleted"]}},
                {"_id": 0, "id": 1, "period_label": 1, "line_items": 1, "audit_json": 1, "uploaded_at": 1},
                sort=[("uploaded_at", -1)],
            )
            if stmt:
                signals["statement_decoder"] = {
                    "statement_id": stmt.get("id"),
                    "period_label": stmt.get("period_label"),
                    "top_anomalies": ((stmt.get("audit_json") or {}).get("anomalies") or [])[:5],
                    "line_item_count": len(stmt.get("line_items") or []),
                }

        ce_state = await db.contribution_estimates.find_one(
            {"user_id": user_id}, {"_id": 0}, sort=[("created_at", -1)]
        )
        if ce_state:
            signals["contribution_estimator"] = {
                "pension_status": ce_state.get("pension_status"),
                "is_grandfathered": ce_state.get("is_grandfathered"),
                "classification": ce_state.get("classification"),
                "created_at": ce_state.get("created_at"),
            }

        classification = await db.classification_check_results.find_one(
            {"user_id": user_id}, {"_id": 0}, sort=[("created_at", -1)]
        )
        if classification:
            signals["classification_self_check"] = {
                "current_class": classification.get("current_classification"),
                "suggested_class": classification.get("suggested_classification"),
                "created_at": classification.get("created_at"),
            }

        # Care Plan Reviewer, latest review with any findings.
        care_plan = await db.care_plans.find_one(
            {"user_id": user_id}, {"_id": 0, "id": 1, "provider_name": 1, "findings": 1, "updated_at": 1},
            sort=[("updated_at", -1)],
        )
        if care_plan:
            findings = care_plan.get("findings") or {}
            total_findings = sum(len(findings.get(k) or []) for k in ("compliance", "choice", "efficiency"))
            signals["care_plan_reviewer"] = {
                "care_plan_id": care_plan.get("id"),
                "provider_name": care_plan.get("provider_name"),
                "findings_count": total_findings,
                "updated_at": care_plan.get("updated_at"),
            }

        # PPC v2 recent saved checks.
        ppc_checks_cursor = db.ppc_saved_checks.find(
            {"user_id": user_id}, {"_id": 0}
        ).sort("created_at", -1).limit(5)
        ppc_checks = await ppc_checks_cursor.to_list(length=5)
        if ppc_checks:
            signals["provider_price_checker"] = {
                "recent_checks": [
                    {
                        "id": c.get("id"),
                        "service": c.get("service"),
                        "provider": c.get("provider_display_name"),
                        "position": c.get("position"),
                        "rate": c.get("rate"),
                    }
                    for c in ppc_checks
                ],
            }

        return {"signals": signals}

    @r.post("/lf1/correspondence/{entry_id}/attach-source")
    async def attach_source(
        entry_id: str,
        body: AttachSourceBody,
        user_id: str = Depends(get_current_user_id),
    ):
        entry = await db.lf1_correspondence.find_one(
            {"user_id": user_id, "id": entry_id}, {"_id": 0}
        )
        if not entry:
            raise HTTPException(status_code=404, detail="Correspondence entry not found")
        source_import = {
            "tool": body.tool,
            "record_id": body.record_id,
            "fields": body.fields or {},
            "note": body.note,
            "imported_at": _iso(),
        }
        # Merge imported fields into intake so the LLM sees them.
        intake = dict(entry.get("intake") or {})
        for k, v in (body.fields or {}).items():
            intake.setdefault(k, v)
        await db.lf1_correspondence.update_one(
            {"user_id": user_id, "id": entry_id},
            {"$set": {
                "source_import": source_import,
                "intake": intake,
                "updated_at": _iso(),
            }},
        )
        return {"source_import": source_import, "intake": intake}

    # ---------- Iteration 3: tone check ----------

    @r.post("/lf1/correspondence/{entry_id}/tone-check")
    async def tone_check(
        entry_id: str,
        body: ToneCheckBody,
        user_id: str = Depends(get_current_user_id),
    ):
        # Feature-flag gate.
        flag = await db.feature_flags.find_one({"name": "lf1_tone_check"}, {"_id": 0})
        if not (flag and flag.get("enabled")):
            return {"enabled": False, "tone": None, "concerns": [], "suggested_edits": []}

        entry = await db.lf1_correspondence.find_one(
            {"user_id": user_id, "id": entry_id}, {"_id": 0}
        )
        if not entry:
            raise HTTPException(status_code=404, detail="Correspondence entry not found")
        # Tone check applies only to complaint / escalation / guided_pathway per spec.
        arch = entry.get("archetype") or ""
        if arch not in ("complaint", "escalation", "guided_pathway"):
            return {"enabled": True, "skipped": True, "reason": "archetype_not_covered"}

        from services import lf1_generate as _gen
        result = await _gen.tone_check(body.body)
        result["enabled"] = True
        return result

    # ---------- Iteration 3: feedback ----------

    @r.post("/lf1/correspondence/{entry_id}/feedback")
    async def submit_feedback(
        entry_id: str,
        body: FeedbackBody,
        user_id: str = Depends(get_current_user_id),
    ):
        if body.rating not in ("up", "down"):
            raise HTTPException(status_code=400, detail="rating must be 'up' or 'down'")
        entry = await db.lf1_correspondence.find_one(
            {"user_id": user_id, "id": entry_id}, {"_id": 0}
        )
        if not entry:
            raise HTTPException(status_code=404, detail="Correspondence entry not found")
        payload = {
            "rating": body.rating,
            "reason": body.reason,
            "created_at": _iso(),
        }
        await db.lf1_correspondence.update_one(
            {"user_id": user_id, "id": entry_id},
            {"$set": {"feedback": payload, "updated_at": _iso()}},
        )
        # Write to the dedicated feedback collection for analytics.
        await db.lf1_feedback.insert_one({
            "id": secrets.token_urlsafe(12),
            "user_id": user_id,
            "entry_id": entry_id,
            "archetype": entry.get("archetype"),
            "recipient_type": entry.get("recipient_type"),
            **payload,
        })
        return {"feedback": payload}

    # ---------- Iteration 3: follow-ups + escalation ----------

    @r.get("/lf1/follow-ups")
    async def list_follow_ups(user_id: str = Depends(get_current_user_id)):
        """Return outbound sent entries whose follow-up window has expired
        (or is about to) plus a suggested next-step for the caller."""
        cursor = db.lf1_correspondence.find(
            {
                "user_id": user_id,
                "direction": "outbound",
                "status": {"$in": ["sent", "awaiting_response"]},
                "follow_up_date": {"$ne": None},
            },
            {"_id": 0},
        )
        rows = await cursor.to_list(length=500)
        today = _dt.date.today()
        overdue: list[dict] = []
        upcoming: list[dict] = []
        for e in rows:
            try:
                due = _dt.date.fromisoformat(str(e.get("follow_up_date"))[:10])
            except Exception:
                continue
            days_delta = (due - today).days
            e2 = dict(e)
            e2["days_until_due"] = days_delta
            e2["suggested_next_action"] = _suggest_next_action(e, days_delta)
            if days_delta < 0:
                overdue.append(e2)
            elif days_delta <= 3:
                upcoming.append(e2)
        overdue.sort(key=lambda x: x["days_until_due"])
        upcoming.sort(key=lambda x: x["days_until_due"])
        return {"overdue": overdue, "upcoming": upcoming}

    @r.post("/lf1/correspondence/{entry_id}/escalate")
    async def escalate(
        entry_id: str,
        user_id: str = Depends(get_current_user_id),
    ):
        """Escalate an outbound entry to the next-level recipient. Creates
        a new correspondence entry seeded with the original's chronology,
        transitions the original to `escalated`."""
        parent = await db.lf1_correspondence.find_one(
            {"user_id": user_id, "id": entry_id}, {"_id": 0}
        )
        if not parent:
            raise HTTPException(status_code=404, detail="Correspondence entry not found")

        # Escalation target map.
        parent_recipient = parent.get("recipient_type")
        target_recipient = {
            "provider_cm": "provider_senior",
            "provider_senior": "acqsc",
            "mac": "acqsc",
            "acqsc": "ombudsman",
        }.get(parent_recipient)
        if not target_recipient:
            raise HTTPException(
                status_code=400,
                detail=f"No escalation target defined for recipient_type={parent_recipient}",
            )

        # Chronology auto-inclusion, pull all outbound entries in the same
        # thread by walking `replies_to` and same-participant-same-situation.
        siblings = await db.lf1_correspondence.find(
            {
                "user_id": user_id,
                "participant_id": parent.get("participant_id"),
                "situation_id": parent.get("situation_id"),
                "id": {"$ne": entry_id},
            },
            {"_id": 0, "id": 1, "created_at": 1, "sent_at": 1, "archetype": 1,
             "recipient_type": 1, "situation_label": 1, "content_final": 1},
        ).sort("created_at", 1).to_list(length=25)

        chronology = [
            {
                "id": s.get("id"),
                "date": s.get("sent_at") or s.get("created_at"),
                "archetype": s.get("archetype"),
                "recipient": s.get("recipient_type"),
                "situation": s.get("situation_label"),
            }
            for s in siblings
        ] + [
            {
                "id": parent.get("id"),
                "date": parent.get("sent_at") or parent.get("created_at"),
                "archetype": parent.get("archetype"),
                "recipient": parent.get("recipient_type"),
                "situation": parent.get("situation_label"),
            }
        ]

        follow_up = _add_days(
            lf1.default_response_window_days(parent.get("situation_id"), "escalation")
        )
        new_id = secrets.token_urlsafe(12)
        doc = {
            "id": new_id,
            "user_id": user_id,
            "participant_id": parent.get("participant_id"),
            "direction": "outbound",
            "archetype": "escalation",
            "situation_id": parent.get("situation_id"),
            "situation_label": parent.get("situation_label"),
            "recipient_type": target_recipient,
            "recipient_specific": None,
            "sender_identity": parent.get("sender_identity"),
            "sender_authority_basis": parent.get("sender_authority_basis"),
            "complaint_mode": parent.get("complaint_mode") or "open",
            "atsi_preference": bool(parent.get("atsi_preference")),
            "content_draft": "",
            "content_final": None,
            "draft_versions": [],
            "output_formats_generated": [],
            "status": "draft",
            "sent_at": None,
            "sent_via": None,
            "expected_response_by": follow_up,
            "follow_up_date": follow_up,
            "response_received_at": None,
            "response_summary": None,
            "next_action_suggested": None,
            "source_import": None,
            "intake": {
                "participant_name": (parent.get("intake") or {}).get("participant_name"),
                "escalation_summary": f"Escalation of prior correspondence with {parent_recipient}.",
                "prior_attempts": chronology,
            },
            "shared_with": [],
            "sign_off_required": False,
            "sign_off_by": None,
            "sign_off_at": None,
            "replies_to": None,
            "escalated_from": entry_id,
            "inbound_source": None,
            "inbound_received_at": None,
            "feedback": None,
            "terms_ack": False,
            "created_at": _iso(),
            "updated_at": _iso(),
        }
        await db.lf1_correspondence.insert_one(doc)

        # Mark the parent as escalated so the log shows the transition.
        await db.lf1_correspondence.update_one(
            {"user_id": user_id, "id": entry_id},
            {"$set": {
                "status": "escalated",
                "next_action_suggested": f"escalated to {target_recipient}",
                "updated_at": _iso(),
            }},
        )
        doc.pop("_id", None)
        return {"escalation_entry": doc, "chronology_included": len(chronology)}

    # ---------- Iteration 4: safeguarding record ----------

    @r.post("/lf1/correspondence/{entry_id}/safeguarding-record")
    async def safeguarding_record(
        entry_id: str,
        body: GenerateBody,
        user_id: str = Depends(get_current_user_id),
    ):
        """Generate a structured safeguarding record (situation 11).

        Runs the standard LLM generator with archetype='guided_pathway'
        which produces a factual chronology, not a persuasion letter.
        """
        entry = await db.lf1_correspondence.find_one(
            {"user_id": user_id, "id": entry_id}, {"_id": 0}
        )
        if not entry:
            raise HTTPException(status_code=404, detail="Correspondence entry not found")
        if entry.get("archetype") != "guided_pathway":
            raise HTTPException(status_code=400, detail="Not a guided-pathway entry")

        # Same path as generate_letter but forces the archetype and adds
        # a safeguarding marker on the entry.
        from services import lf1_generate as _gen
        if body.intake:
            merged_intake = {**(entry.get("intake") or {}), **body.intake}
            entry = {**entry, "intake": merged_intake}
        try:
            payload = await _gen.generate_letter(entry)
        except _gen.SourceDataMissing as missing:
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "source_data_missing",
                    "missing_fields": list(missing.args[0]),
                },
            )

        if body.persist:
            await db.lf1_correspondence.update_one(
                {"user_id": user_id, "id": entry_id},
                {"$set": {
                    "content_draft": payload["body"],
                    "intake": entry.get("intake") or {},
                    "next_action_suggested": "Keep this record for your file. Consider attaching to a future ACQSC complaint.",
                    "updated_at": _iso(),
                }},
            )
        return {**payload, "record_type": "safeguarding_note"}

    # ---------- Iteration 4: Family Coordinator sharing + sign-off ----------

    @r.post("/lf1/correspondence/{entry_id}/share")
    async def share_entry(
        entry_id: str,
        body: ShareBody,
        user_id: str = Depends(get_current_user_id),
    ):
        entry = await db.lf1_correspondence.find_one(
            {"user_id": user_id, "id": entry_id}, {"_id": 0}
        )
        if not entry:
            raise HTTPException(status_code=404, detail="Correspondence entry not found")
        shared_with = list(entry.get("shared_with") or [])
        for uid in body.share_with_user_ids:
            if uid not in shared_with:
                shared_with.append(uid)
        update: dict[str, Any] = {
            "shared_with": shared_with,
            "sign_off_required": body.require_sign_off,
            "updated_at": _iso(),
        }
        await db.lf1_correspondence.update_one(
            {"user_id": user_id, "id": entry_id},
            {"$set": update},
        )
        # Log a share event.
        await db.lf1_shares.insert_one({
            "id": secrets.token_urlsafe(12),
            "entry_id": entry_id,
            "owner_user_id": user_id,
            "shared_with": body.share_with_user_ids,
            "require_sign_off": body.require_sign_off,
            "sign_off_message": body.sign_off_message,
            "created_at": _iso(),
        })
        return {"shared_with": shared_with, "sign_off_required": body.require_sign_off}

    @r.post("/lf1/correspondence/{entry_id}/sign-off")
    async def sign_off_entry(
        entry_id: str,
        body: SignOffBody,
        user_id: str = Depends(get_current_user_id),
    ):
        entry = await db.lf1_correspondence.find_one(
            {"user_id": user_id, "id": entry_id}, {"_id": 0}
        )
        if not entry:
            raise HTTPException(status_code=404, detail="Correspondence entry not found")
        if not entry.get("sign_off_required"):
            raise HTTPException(status_code=400, detail="Sign-off not required on this entry")

        approver = body.approver_user_id or user_id
        await db.lf1_correspondence.update_one(
            {"user_id": user_id, "id": entry_id},
            {"$set": {
                "sign_off_by": approver,
                "sign_off_at": _iso(),
                "sign_off_note": body.note,
                "updated_at": _iso(),
            }},
        )
        return {"sign_off_by": approver, "sign_off_at": _iso()}

    # ---------- Iteration 4: Response Draft ----------

    @r.post("/lf1/correspondence/{entry_id}/response-draft")
    async def response_draft(
        entry_id: str,
        body: ResponseDraftBody,
        user_id: str = Depends(get_current_user_id),
    ):
        entry = await db.lf1_correspondence.find_one(
            {"user_id": user_id, "id": entry_id}, {"_id": 0}
        )
        if not entry:
            raise HTTPException(status_code=404, detail="Correspondence entry not found")

        # Force archetype to response_draft; enrich intake with the inbound.
        merged_intake = {
            **(entry.get("intake") or {}),
            "inbound_summary": body.inbound_content,
            "inbound_from": body.inbound_from_label,
            "stance": body.stance or "ask_for_info",
        }
        working_entry = {**entry, "archetype": "response_draft", "intake": merged_intake}

        from services import lf1_generate as _gen
        try:
            payload = await _gen.generate_letter(working_entry)
        except _gen.SourceDataMissing as missing:
            raise HTTPException(
                status_code=422,
                detail={"error": "source_data_missing", "missing_fields": list(missing.args[0])},
            )
        await db.lf1_correspondence.update_one(
            {"user_id": user_id, "id": entry_id},
            {"$set": {
                "content_draft": payload["body"],
                "intake": merged_intake,
                "archetype": "response_draft",
                "updated_at": _iso(),
            }},
        )
        return payload

    return r


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _suggest_next_action(entry: dict, days_delta: int) -> str:
    archetype = entry.get("archetype") or ""
    recipient = entry.get("recipient_type") or ""
    if days_delta < 0:
        # Overdue.
        target_map = {
            "provider_cm": "provider_senior",
            "provider_senior": "acqsc",
            "mac": "acqsc",
            "acqsc": "ombudsman",
        }
        target = target_map.get(recipient)
        if target:
            return f"Escalate to {target.replace('_', ' ')}"
        return "Send a follow-up reminder"
    if days_delta == 0:
        return "Follow up today"
    return f"Follow up in {days_delta} day{'s' if days_delta != 1 else ''}"
