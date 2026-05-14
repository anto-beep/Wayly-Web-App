"""Adviser portal — minimal multi-client list view for Adviser-plan users.

Endpoints (all prefixed by `/api` via the parent router include):
  GET    /adviser/clients          — list adviser's clients
  POST   /adviser/clients          — add a client (invite-by-email; soft-create stub)
  PATCH  /adviser/clients/{cid}    — edit name/notes/status
  DELETE /adviser/clients/{cid}    — remove a client from the adviser's roster
  GET    /adviser/summary          — quick stats card for the portal landing
  GET    /adviser/clients/{cid}/snapshot       — read-only household snapshot (JSON)
  GET    /adviser/clients/{cid}/review-pack.pdf — one-click PDF review pack

Auto-link hook (called from server.py):
  link_client_by_email(user_id, email)              — flips status to active + sets linked_user_id when client signs up.
  link_client_household(user_id, household_id)      — wires the household_id once onboarding completes.

Storage: `adviser_clients` collection. Each doc:
  { id, adviser_user_id, client_name, client_email, status, notes,
    linked_user_id, linked_household_id,
    invited_at, last_seen_at, created_at, updated_at }

This is a stub workspace — when the linked client signs up with the same
email later, we'll match them by lower-cased email and surface a "linked"
badge. The Adviser can then open the snapshot + PDF review pack one-click.
"""
from __future__ import annotations
import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, Field

from models import new_id, now_iso

adviser_router = APIRouter(prefix="/adviser", tags=["adviser"])


# --- shared deps (injected from server.py at registration time) ---
_db = None
_require_adviser = None
_max_clients_for = None


def init_adviser_routes(*, db, require_adviser_dep, max_clients_for):
    """Wire dependencies from server.py without circular import."""
    global _db, _require_adviser, _max_clients_for
    _db = db
    _require_adviser = require_adviser_dep
    _max_clients_for = max_clients_for


async def link_client_by_email(user_id: str, email: str) -> int:
    """Hook: called after signup/google-session. Finds any adviser_clients
    rows matching the email and links them to this user_id. Returns the
    number of rows linked. Idempotent — safe to call many times.
    """
    if _db is None or not email:
        return 0
    email_lc = email.lower().strip()
    res = await _db.adviser_clients.update_many(
        {"client_email": email_lc, "linked_user_id": None},
        {"$set": {"linked_user_id": user_id, "status": "active", "updated_at": now_iso()}},
    )
    return res.modified_count


async def link_client_household(user_id: str, household_id: str) -> int:
    """Hook: called after household creation. Wires linked_household_id
    into any adviser_clients row already linked to this user. Returns
    rows updated. Idempotent.
    """
    if _db is None or not household_id:
        return 0
    res = await _db.adviser_clients.update_many(
        {"linked_user_id": user_id, "linked_household_id": None},
        {"$set": {"linked_household_id": household_id, "updated_at": now_iso()}},
    )
    return res.modified_count


class ClientCreate(BaseModel):
    client_name: str = Field(min_length=1, max_length=120)
    client_email: EmailStr
    notes: Optional[str] = Field(default=None, max_length=1000)


class ClientUpdate(BaseModel):
    client_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    notes: Optional[str] = Field(default=None, max_length=1000)
    status: Optional[str] = Field(default=None, pattern="^(invited|active|inactive|archived)$")


def _user_dep(request: Request):
    if _require_adviser is None:
        raise HTTPException(status_code=500, detail="Adviser router not initialised")
    return _require_adviser(request)


@adviser_router.get("/summary")
async def adviser_summary(request: Request):
    user = await _user_dep(request)
    plan = (user.get("plan") or "").lower()
    cap = _max_clients_for(plan)
    total = await _db.adviser_clients.count_documents({"adviser_user_id": user["id"]})
    active = await _db.adviser_clients.count_documents({"adviser_user_id": user["id"], "status": "active"})
    invited = await _db.adviser_clients.count_documents({"adviser_user_id": user["id"], "status": "invited"})
    return {
        "plan": plan,
        "max_clients": cap,
        "clients_total": total,
        "clients_active": active,
        "clients_invited": invited,
        "seats_remaining": max(0, cap - total),
    }


@adviser_router.get("/clients")
async def list_clients(request: Request):
    user = await _user_dep(request)
    cursor = _db.adviser_clients.find(
        {"adviser_user_id": user["id"]},
        {"_id": 0},
    ).sort("created_at", -1).limit(500)
    return [doc async for doc in cursor]


@adviser_router.post("/clients")
async def add_client(body: ClientCreate, request: Request):
    user = await _user_dep(request)
    plan = (user.get("plan") or "").lower()
    cap = _max_clients_for(plan)
    existing = await _db.adviser_clients.count_documents({"adviser_user_id": user["id"]})
    if existing >= cap:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "client_cap_reached",
                "message": f"Your {plan.capitalize()} plan allows up to {cap} clients. Archive an inactive client or upgrade your plan.",
                "max_clients": cap,
            },
        )
    email_lc = body.client_email.lower().strip()
    dup = await _db.adviser_clients.find_one(
        {"adviser_user_id": user["id"], "client_email": email_lc}, {"_id": 0, "id": 1},
    )
    if dup:
        raise HTTPException(status_code=409, detail="Client already on your roster")
    # Soft-link: if a user with this email exists, link them + their household.
    linked = await _db.users.find_one({"email": email_lc}, {"_id": 0, "id": 1, "household_id": 1})
    now = now_iso()
    doc = {
        "id": new_id(),
        "adviser_user_id": user["id"],
        "client_name": body.client_name.strip(),
        "client_email": email_lc,
        "linked_user_id": linked["id"] if linked else None,
        "linked_household_id": linked.get("household_id") if linked else None,
        "status": "active" if linked else "invited",
        "notes": (body.notes or "").strip() or None,
        "invited_at": now,
        "last_seen_at": None,
        "created_at": now,
        "updated_at": now,
    }
    await _db.adviser_clients.insert_one(doc)
    doc.pop("_id", None)
    return doc


@adviser_router.patch("/clients/{cid}")
async def update_client(cid: str, body: ClientUpdate, request: Request):
    user = await _user_dep(request)
    found = await _db.adviser_clients.find_one(
        {"id": cid, "adviser_user_id": user["id"]}, {"_id": 0},
    )
    if not found:
        raise HTTPException(status_code=404, detail="Client not found")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return found
    updates["updated_at"] = now_iso()
    await _db.adviser_clients.update_one(
        {"id": cid, "adviser_user_id": user["id"]}, {"$set": updates},
    )
    found.update(updates)
    return found


@adviser_router.delete("/clients/{cid}")
async def remove_client(cid: str, request: Request):
    user = await _user_dep(request)
    res = await _db.adviser_clients.delete_one(
        {"id": cid, "adviser_user_id": user["id"]},
    )
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"ok": True, "deleted": cid}


# ---------------------------------------------------------------------------
# Per-client read-only access — snapshot + PDF review pack
# ---------------------------------------------------------------------------
async def _load_client_household(adviser_user_id: str, cid: str) -> dict:
    """Returns {client, household, statements, members} after verifying the
    adviser owns this client row AND the client has a linked household.
    Raises 404 / 409 with helpful detail bodies otherwise."""
    client = await _db.adviser_clients.find_one(
        {"id": cid, "adviser_user_id": adviser_user_id}, {"_id": 0},
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    hh_id = client.get("linked_household_id")
    if not hh_id:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "client_not_linked",
                "message": "This client hasn't signed up yet or hasn't completed household onboarding. Read-only access activates the moment they finish onboarding.",
                "client_email": client.get("client_email"),
                "status": client.get("status"),
            },
        )
    household = await _db.households.find_one({"id": hh_id}, {"_id": 0})
    if not household:
        raise HTTPException(status_code=410, detail="Client household no longer available")
    statements_cur = _db.statements.find(
        {"household_id": hh_id},
        {"_id": 0, "file_b64": 0},
    ).sort("uploaded_at", -1).limit(12)
    statements = [s async for s in statements_cur]
    members_cur = _db.household_members.find(
        {"household_id": hh_id, "status": "active"}, {"_id": 0, "email": 1, "role": 1},
    ).limit(10)
    members = [m async for m in members_cur]
    return {"client": client, "household": household, "statements": statements, "members": members}


def _snapshot_metrics(statements: list) -> dict:
    """Quick aggregates over the household's recent statements."""
    total_line_items = 0
    total_anomalies = 0
    flagged: list = []
    spent = 0.0
    for s in statements:
        items = s.get("line_items") or []
        total_line_items += len(items)
        anomalies = s.get("anomalies") or []
        total_anomalies += len(anomalies)
        if anomalies and len(flagged) < 8:
            for a in anomalies[: max(0, 8 - len(flagged))]:
                flagged.append({
                    "statement_id": s.get("id"),
                    "period": s.get("period_label"),
                    "type": a.get("type") or a.get("kind") or "anomaly",
                    "summary": (a.get("explanation") or a.get("message") or a.get("description") or "")[:240],
                })
        for it in items:
            try:
                spent += float(it.get("amount") or it.get("total") or 0)
            except Exception:
                continue
    return {
        "statements_count": len(statements),
        "line_items_total": total_line_items,
        "anomalies_total": total_anomalies,
        "spent_total_aud": round(spent, 2),
        "flagged_sample": flagged,
    }


@adviser_router.get("/clients/{cid}/snapshot")
async def client_snapshot(cid: str, request: Request):
    user = await _user_dep(request)
    bundle = await _load_client_household(user["id"], cid)
    metrics = _snapshot_metrics(bundle["statements"])
    h = bundle["household"]
    # Mark "last seen" timestamp (most-recent statement) on the client row.
    last_stmt = bundle["statements"][0] if bundle["statements"] else None
    if last_stmt:
        await _db.adviser_clients.update_one(
            {"id": cid, "adviser_user_id": user["id"]},
            {"$set": {"last_seen_at": last_stmt.get("uploaded_at") or now_iso()}},
        )
    return {
        "client": {
            "id": bundle["client"]["id"],
            "name": bundle["client"]["client_name"],
            "email": bundle["client"]["client_email"],
            "status": bundle["client"]["status"],
            "notes": bundle["client"].get("notes"),
        },
        "household": {
            "id": h.get("id"),
            "participant_name": h.get("participant_name"),
            "classification": h.get("classification"),
            "provider_name": h.get("provider_name"),
            "grandfathered": h.get("grandfathered"),
            "created_at": h.get("created_at"),
        },
        "metrics": metrics,
        "recent_statements": [
            {
                "id": s.get("id"),
                "period": s.get("period_label"),
                "uploaded_at": s.get("uploaded_at"),
                "anomalies": len(s.get("anomalies") or []),
                "line_items": len(s.get("line_items") or []),
            }
            for s in bundle["statements"][:6]
        ],
        "members_count": len(bundle["members"]),
    }


def _build_review_pack_pdf(snapshot: dict, adviser_name: str) -> bytes:
    """Render a single-page A4 review pack PDF from the snapshot dict."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    )

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=18 * mm, bottomMargin=18 * mm,
        title=f"Wayly Review Pack — {snapshot['client']['name']}",
        author=f"Wayly · {adviser_name}",
    )
    base = getSampleStyleSheet()
    NAVY = colors.HexColor("#1F3A5F")
    MUTED = colors.HexColor("#6F6A60")

    h1 = ParagraphStyle("h1", parent=base["Heading1"], fontName="Helvetica-Bold",
                        fontSize=22, textColor=NAVY, leading=26, spaceAfter=4)
    h2 = ParagraphStyle("h2", parent=base["Heading2"], fontName="Helvetica-Bold",
                        fontSize=13, textColor=NAVY, leading=16, spaceBefore=10, spaceAfter=4)
    body = ParagraphStyle("body", parent=base["BodyText"], fontName="Helvetica",
                          fontSize=10, textColor=NAVY, leading=14)
    muted = ParagraphStyle("muted", parent=body, textColor=MUTED, fontSize=9)

    c = snapshot["client"]
    h = snapshot["household"]
    m = snapshot["metrics"]
    flow = []
    flow.append(Paragraph("Wayly Review Pack", h1))
    flow.append(Paragraph(
        f"Prepared by {adviser_name} · "
        f"Generated {datetime.utcnow().strftime('%d %b %Y')}", muted,
    ))
    flow.append(Spacer(1, 8))

    # Client header
    flow.append(Paragraph("Client", h2))
    client_tbl = Table([
        ["Name", c.get("name") or "—"],
        ["Email", c.get("email") or "—"],
        ["Status", (c.get("status") or "").capitalize()],
        ["Notes", c.get("notes") or "—"],
    ], colWidths=[35 * mm, None])
    client_tbl.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TEXTCOLOR", (0, 0), (0, -1), MUTED),
        ("TEXTCOLOR", (1, 0), (1, -1), NAVY),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -2), 0.25, colors.HexColor("#E6E1D6")),
    ]))
    flow.append(client_tbl)

    # Household summary
    flow.append(Paragraph("Household", h2))
    hh_tbl = Table([
        ["Participant", h.get("participant_name") or "—"],
        ["Classification", str(h.get("classification") or "—")],
        ["Provider", h.get("provider_name") or "—"],
        ["Grandfathered", "Yes" if h.get("grandfathered") else "No"],
        ["On Wayly since", (h.get("created_at") or "").split("T")[0] or "—"],
    ], colWidths=[35 * mm, None])
    hh_tbl.setStyle(client_tbl.getStyle() if hasattr(client_tbl, "getStyle") else TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TEXTCOLOR", (0, 0), (0, -1), MUTED),
        ("TEXTCOLOR", (1, 0), (1, -1), NAVY),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -2), 0.25, colors.HexColor("#E6E1D6")),
    ]))
    flow.append(hh_tbl)

    # Metrics row
    flow.append(Paragraph("At-a-glance", h2))
    metrics_tbl = Table([
        ["Statements", "Line items", "Anomalies flagged", "Total spent (AUD)"],
        [
            str(m.get("statements_count", 0)),
            str(m.get("line_items_total", 0)),
            str(m.get("anomalies_total", 0)),
            f"${m.get('spent_total_aud', 0):,.2f}",
        ],
    ], colWidths=[40 * mm, 40 * mm, 45 * mm, 45 * mm])
    metrics_tbl.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("FONTSIZE", (0, 1), (-1, 1), 14),
        ("TEXTCOLOR", (0, 0), (-1, 0), MUTED),
        ("TEXTCOLOR", (0, 1), (-1, 1), NAVY),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#FAF7F2")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E6E1D6")),
        ("LINEABOVE", (0, 1), (-1, 1), 0.5, colors.HexColor("#E6E1D6")),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    flow.append(metrics_tbl)

    # Recent statements
    flow.append(Paragraph("Recent statements", h2))
    rows = [["Period", "Uploaded", "Anomalies", "Line items"]]
    for s in snapshot.get("recent_statements", []) or []:
        rows.append([
            s.get("period") or "—",
            (s.get("uploaded_at") or "").split("T")[0] or "—",
            str(s.get("anomalies") or 0),
            str(s.get("line_items") or 0),
        ])
    if len(rows) == 1:
        rows.append(["—", "—", "—", "—"])
    st_tbl = Table(rows, colWidths=[40 * mm, 35 * mm, 35 * mm, 35 * mm])
    st_tbl.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (-1, 0), MUTED),
        ("TEXTCOLOR", (0, 1), (-1, -1), NAVY),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#FAF7F2")),
        ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor("#E6E1D6")),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    flow.append(st_tbl)

    # Flagged sample
    flagged = m.get("flagged_sample") or []
    if flagged:
        flow.append(Paragraph("Flagged anomalies (sample)", h2))
        for f in flagged[:6]:
            flow.append(Paragraph(
                f"<b>{(f.get('type') or 'anomaly').capitalize()}</b> · {f.get('period') or ''} — {f.get('summary') or ''}",
                body,
            ))
            flow.append(Spacer(1, 2))

    # Footer
    flow.append(Spacer(1, 12))
    flow.append(Paragraph(
        "Wayly Adviser · Read-only review pack · This document contains client-supplied "
        "data exported under your Adviser subscription. Treat as confidential.",
        muted,
    ))

    doc.build(flow)
    pdf_bytes = buf.getvalue()
    buf.close()
    return pdf_bytes


@adviser_router.get("/clients/{cid}/review-pack.pdf")
async def client_review_pack_pdf(cid: str, request: Request):
    user = await _user_dep(request)
    bundle = await _load_client_household(user["id"], cid)
    metrics = _snapshot_metrics(bundle["statements"])
    snapshot = {
        "client": {
            "id": bundle["client"]["id"],
            "name": bundle["client"]["client_name"],
            "email": bundle["client"]["client_email"],
            "status": bundle["client"]["status"],
            "notes": bundle["client"].get("notes"),
        },
        "household": bundle["household"],
        "metrics": metrics,
        "recent_statements": [
            {
                "id": s.get("id"),
                "period": s.get("period_label"),
                "uploaded_at": s.get("uploaded_at"),
                "anomalies": len(s.get("anomalies") or []),
                "line_items": len(s.get("line_items") or []),
            }
            for s in bundle["statements"][:6]
        ],
    }
    pdf_bytes = _build_review_pack_pdf(snapshot, user.get("name") or user.get("email") or "Adviser")
    fname = (
        f"wayly-review-pack-{bundle['client']['client_name'].replace(' ', '_')}"
        f"-{datetime.utcnow().strftime('%Y%m%d')}.pdf"
    )
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{fname}"',
            "X-Wayly-Review-Pack": "1",
        },
    )

