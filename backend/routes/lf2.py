"""LF-2 v1 · Letters and Follow-ups v2.

Dedicated router that lets other tools (PSW-1, CHSP-1, hardship walkthrough,
CE-3, CMP-1) generate real letter chains and deliver them via Resend.

Core concepts:
  * A **template chain** is an ordered sequence of letter templates targeting
    different recipients (e.g., Provider → ACQSC → My Aged Care).
  * When a user triggers a chain we generate ``letter_drafts`` records for
    each step, pre-filled with the participant's data and the source case.
  * Each draft can be edited, previewed, and dispatched via Resend. On send
    we also record a follow-up date so the caller sees a reminder.

Feature flag: ``LF_2_LETTERS``. Access is gated via the CORE-1 assert helper.
"""
from __future__ import annotations

import os
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr, Field

logger = logging.getLogger("lf2")

lf2_router = APIRouter(prefix="/lf2", tags=["lf2"])

_db: AsyncIOMotorDatabase = None  # type: ignore
_user_dep: Optional[Callable] = None
_core1_assert_access: Optional[Callable] = None
_send_email: Optional[Callable] = None


def init_lf2_routes(*, db, user_dep, core1_assert_access=None, send_email=None) -> None:
    global _db, _user_dep, _core1_assert_access, _send_email
    _db = db
    _user_dep = user_dep
    _core1_assert_access = core1_assert_access
    _send_email = send_email


def _flag_enabled() -> bool:
    return os.environ.get("LF_2_LETTERS_FLAG", "true").lower() != "false"


async def _assert_flag() -> None:
    if not _flag_enabled():
        raise HTTPException(status_code=403, detail="LF-2 is currently disabled")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


async def ensure_lf2_indexes() -> None:
    if _db is None:
        return
    await _db.lf2_letter_drafts.create_index("participant_id")
    await _db.lf2_letter_drafts.create_index("chain_id")
    await _db.lf2_letter_drafts.create_index("status")
    await _db.lf2_letter_chains.create_index("participant_id")


# ---------------------------------------------------------------------------
# Template library (in-code; a future migration may move this to Mongo)
# ---------------------------------------------------------------------------

RECIPIENT_TYPES = {"provider", "acqsc", "my_aged_care", "carer_gateway", "ombudsman", "other"}

TEMPLATES: Dict[str, Dict[str, Any]] = {
    "hardship_provider_notify": {
        "recipient_type": "provider",
        "subject_template": "Financial hardship supplement application for {participant_name}",
        "body_template": (
            "Dear {provider_name},\n\n"
            "I am writing on behalf of {participant_name} regarding an application for the "
            "financial hardship supplement under the Aged Care Act 2024.\n\n"
            "We would like to keep you informed while the application is under review by "
            "My Aged Care. During this time we ask that you continue current services and "
            "hold any invoice escalation.\n\n"
            "Please confirm receipt of this notice within 7 days.\n\n"
            "Yours sincerely,\n{caregiver_name}\nOn behalf of {participant_name}"
        ),
    },
    "hardship_myagedcare_application": {
        "recipient_type": "my_aged_care",
        "subject_template": "Financial hardship supplement application, {participant_name}",
        "body_template": (
            "To the My Aged Care assessment team,\n\n"
            "I am submitting an application for the financial hardship supplement on behalf "
            "of {participant_name} (AC ID: {participant_ac_id}).\n\n"
            "Supporting evidence is attached separately. Please contact me at {caregiver_email} "
            "or {caregiver_phone} for follow-up.\n\n"
            "Kind regards,\n{caregiver_name}"
        ),
    },
    "psw_notice_to_current_provider": {
        "recipient_type": "provider",
        "subject_template": "Formal notice of Support at Home provider switch, {participant_name}",
        "body_template": (
            "Dear {provider_name},\n\n"
            "In accordance with our agreement and the Aged Care Act 2024, this letter provides "
            "formal notice of {participant_name}'s switch of Support at Home provider effective "
            "{switch_effective_date}.\n\n"
            "Please prepare a final settlement statement covering all unbilled services and any "
            "refund of prepaid balances. We ask this be issued within 14 days of the effective date.\n\n"
            "The incoming provider is {incoming_provider_name}. Please liaise with them for any "
            "handover of care records under privacy consent already provided.\n\n"
            "Yours sincerely,\n{caregiver_name}"
        ),
    },
    "psw_welcome_to_incoming_provider": {
        "recipient_type": "provider",
        "subject_template": "Support at Home switch confirmation, {participant_name}",
        "body_template": (
            "Dear {incoming_provider_name},\n\n"
            "This confirms our decision to move {participant_name}'s Support at Home services "
            "to your organisation effective {switch_effective_date}.\n\n"
            "We look forward to receiving the initial care plan and starting on the agreed date.\n\n"
            "Kind regards,\n{caregiver_name}"
        ),
    },
    "chsp_dispute_provider": {
        "recipient_type": "provider",
        "subject_template": "CHSP fee dispute, {participant_name} (invoice {invoice_reference})",
        "body_template": (
            "Dear {provider_name},\n\n"
            "We are writing to formally dispute a charge on invoice {invoice_reference} for "
            "{participant_name}. The billed amount of ${billed_amount} exceeds the expected fee "
            "of ${expected_amount}, giving a variance of {variance_percentage}%.\n\n"
            "Please review the underlying units and daily fee schedule and either correct the "
            "charge or provide a written explanation within 10 business days.\n\n"
            "Yours sincerely,\n{caregiver_name}"
        ),
    },
    "cmp1_escalation_provider": {
        "recipient_type": "provider",
        "subject_template": "Complaint escalation, {complaint_subject}",
        "body_template": (
            "Dear {provider_name},\n\n"
            "We are formally escalating our complaint dated {complaint_opened_date} regarding "
            "{complaint_subject}.\n\n"
            "Despite our previous engagement we have not received a satisfactory response, and "
            "the matter has now been outstanding for {days_open} days.\n\n"
            "If we do not receive a substantive reply within 14 days we will refer this matter to "
            "the Aged Care Quality and Safety Commission.\n\n"
            "Yours sincerely,\n{caregiver_name}"
        ),
    },
    "cmp1_acqsc_referral": {
        "recipient_type": "acqsc",
        "subject_template": "Aged Care complaint referral, {complaint_subject}",
        "body_template": (
            "To the Aged Care Quality and Safety Commission,\n\n"
            "We wish to refer a complaint regarding {provider_name} concerning "
            "{complaint_subject}. The complaint was opened on {complaint_opened_date} and remains "
            "unresolved after {days_open} days of engagement with the provider.\n\n"
            "Details, correspondence, and supporting evidence are attached.\n\n"
            "Yours sincerely,\n{caregiver_name}"
        ),
    },
}

CHAINS: Dict[str, Dict[str, Any]] = {
    "hardship_full": {
        "title": "Financial Hardship Application Chain",
        "description": "Notifies the current provider and submits the hardship application to My Aged Care.",
        "steps": [
            {"template_key": "hardship_provider_notify", "follow_up_days": 7},
            {"template_key": "hardship_myagedcare_application", "follow_up_days": 21},
        ],
    },
    "psw_switch_full": {
        "title": "Provider Switch Notification Chain",
        "description": "Sends formal notice to the outgoing provider and a welcome letter to the incoming provider.",
        "steps": [
            {"template_key": "psw_notice_to_current_provider", "follow_up_days": 14},
            {"template_key": "psw_welcome_to_incoming_provider", "follow_up_days": 3},
        ],
    },
    "chsp_dispute_full": {
        "title": "CHSP Fee Dispute Chain",
        "description": "Sends the dispute to the provider only, escalates to ACQSC if no response within 10 days.",
        "steps": [
            {"template_key": "chsp_dispute_provider", "follow_up_days": 10},
        ],
    },
    "cmp1_escalation_full": {
        "title": "Complaint Escalation Chain",
        "description": "Escalates a complaint to provider senior leadership then to ACQSC.",
        "steps": [
            {"template_key": "cmp1_escalation_provider", "follow_up_days": 14},
            {"template_key": "cmp1_acqsc_referral", "follow_up_days": 30},
        ],
    },
}


@lf2_router.get("/templates")
async def list_templates(request: Request):
    await _assert_flag()
    await _user_dep(request)  # auth required
    return {"templates": [
        {"key": k, "recipient_type": v["recipient_type"], "subject_template": v["subject_template"]}
        for k, v in TEMPLATES.items()
    ]}


@lf2_router.get("/chains")
async def list_chains(request: Request):
    await _assert_flag()
    await _user_dep(request)
    return {"chains": [
        {"key": k, "title": v["title"], "description": v["description"],
         "steps": [{"template_key": s["template_key"], "follow_up_days": s["follow_up_days"]} for s in v["steps"]]}
        for k, v in CHAINS.items()
    ]}


def _fill_template(text: str, ctx: Dict[str, Any]) -> str:
    """Simple `{key}` substitution; unknown keys are left as-is so the user
    can spot placeholders that still need filling."""
    def _lookup(match: str) -> str:
        v = ctx.get(match)
        if v is None:
            return "{" + match + "}"
        return str(v)
    out = text
    for key in list(ctx.keys()):
        out = out.replace("{" + key + "}", str(ctx[key] if ctx[key] is not None else ""))
    return out


class GenerateChainIn(BaseModel):
    chain_key: str
    participant_id: str
    context: Dict[str, Any] = Field(default_factory=dict)
    source_case_id: Optional[str] = None
    source_tool: Optional[str] = None  # "psw1" | "chsp1" | "hardship" | "cmp1" | ...


@lf2_router.post("/generate-chain")
async def generate_chain(body: GenerateChainIn, request: Request):
    """Generate a letter chain draft. Returns the created chain plus its
    per-step draft letters, each ready for edit or send.
    """
    await _assert_flag()
    user = await _user_dep(request)
    chain_def = CHAINS.get(body.chain_key)
    if not chain_def:
        raise HTTPException(status_code=404, detail=f"Unknown chain key: {body.chain_key}")
    if _core1_assert_access:
        await _core1_assert_access(user, body.participant_id)

    # Load participant + household context so template placeholders resolve nicely.
    participant = await _db.participants.find_one(
        {"id": body.participant_id},
        {"_id": 0, "first_name": 1, "surname": 1, "provider_name": 1},
    ) or {}
    ctx: Dict[str, Any] = {
        "participant_name": " ".join(x for x in [participant.get("first_name"), participant.get("surname")] if x) or "the participant",
        "provider_name": participant.get("provider_name") or "the current provider",
        "caregiver_name": (user.get("full_name") or user.get("email") or "The caregiver") if isinstance(user, dict) else "The caregiver",
        "caregiver_email": user.get("email") if isinstance(user, dict) else None,
        "caregiver_phone": user.get("phone") if isinstance(user, dict) else None,
        **body.context,
    }

    chain_id = str(uuid4())
    now = _now()
    drafts: List[dict] = []
    for order, step in enumerate(chain_def["steps"]):
        tpl = TEMPLATES.get(step["template_key"])
        if not tpl:
            continue
        subject = _fill_template(tpl["subject_template"], ctx)
        body_text = _fill_template(tpl["body_template"], ctx)
        draft = {
            "id": str(uuid4()),
            "chain_id": chain_id,
            "step_order": order,
            "template_key": step["template_key"],
            "recipient_type": tpl["recipient_type"],
            "participant_id": body.participant_id,
            "subject": subject,
            "body_html": body_text.replace("\n", "<br>"),
            "body_text": body_text,
            "recipient_email": None,
            "recipient_name": None,
            "status": "draft",
            "follow_up_days": step["follow_up_days"],
            "follow_up_due_at": _iso(now + timedelta(days=step["follow_up_days"])),
            "sent_at": None,
            "delivery_result": None,
            "source_case_id": body.source_case_id,
            "source_tool": body.source_tool,
            "created_at": now,
            "created_by_user_id": user.get("id") if isinstance(user, dict) else None,
        }
        drafts.append(draft)

    chain_doc = {
        "id": chain_id,
        "chain_key": body.chain_key,
        "title": chain_def["title"],
        "participant_id": body.participant_id,
        "source_case_id": body.source_case_id,
        "source_tool": body.source_tool,
        "status": "in_progress",
        "created_at": now,
        "step_count": len(drafts),
    }
    await _db.lf2_letter_chains.insert_one(chain_doc)
    if drafts:
        await _db.lf2_letter_drafts.insert_many(drafts)

    for d in drafts:
        d.pop("_id", None)
        d["created_at"] = _iso(d["created_at"])
    chain_doc.pop("_id", None)
    chain_doc["created_at"] = _iso(chain_doc["created_at"])

    return {"chain": chain_doc, "drafts": drafts}


class EditDraftIn(BaseModel):
    subject: Optional[str] = None
    body_text: Optional[str] = None
    recipient_email: Optional[EmailStr] = None
    recipient_name: Optional[str] = None


@lf2_router.patch("/drafts/{draft_id}")
async def edit_draft(draft_id: str, body: EditDraftIn, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    draft = await _db.lf2_letter_drafts.find_one({"id": draft_id})
    if not draft:
        raise HTTPException(status_code=404, detail="Not found")
    if _core1_assert_access:
        await _core1_assert_access(user, draft["participant_id"])
    if draft.get("status") == "sent":
        raise HTTPException(status_code=400, detail="Cannot edit a sent letter")
    updates: Dict[str, Any] = {"updated_at": _now()}
    if body.subject is not None:
        updates["subject"] = body.subject.strip()
    if body.body_text is not None:
        updates["body_text"] = body.body_text
        updates["body_html"] = body.body_text.replace("\n", "<br>")
    if body.recipient_email is not None:
        updates["recipient_email"] = str(body.recipient_email)
    if body.recipient_name is not None:
        updates["recipient_name"] = body.recipient_name
    await _db.lf2_letter_drafts.update_one({"id": draft_id}, {"$set": updates})
    doc = await _db.lf2_letter_drafts.find_one({"id": draft_id}, {"_id": 0})
    if doc and isinstance(doc.get("created_at"), datetime):
        doc["created_at"] = _iso(doc["created_at"])
    return {"draft": doc}


@lf2_router.get("/drafts/{draft_id}")
async def get_draft(draft_id: str, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    draft = await _db.lf2_letter_drafts.find_one({"id": draft_id}, {"_id": 0})
    if not draft:
        raise HTTPException(status_code=404, detail="Not found")
    if _core1_assert_access:
        await _core1_assert_access(user, draft["participant_id"])
    if isinstance(draft.get("created_at"), datetime):
        draft["created_at"] = _iso(draft["created_at"])
    return {"draft": draft}


@lf2_router.post("/drafts/{draft_id}/send")
async def send_draft(draft_id: str, request: Request):
    """Dispatch the draft via Resend (or a mocked send when RESEND_API_KEY is
    a test/demo key). Records ``sent_at`` and the delivery result on the draft.
    """
    await _assert_flag()
    user = await _user_dep(request)
    draft = await _db.lf2_letter_drafts.find_one({"id": draft_id})
    if not draft:
        raise HTTPException(status_code=404, detail="Not found")
    if _core1_assert_access:
        await _core1_assert_access(user, draft["participant_id"])
    if draft.get("status") == "sent":
        raise HTTPException(status_code=400, detail="Already sent")
    recipient = draft.get("recipient_email")
    if not recipient:
        raise HTTPException(status_code=400, detail="Recipient email required before sending")
    if not _send_email:
        raise HTTPException(status_code=503, detail="Email delivery is not configured")

    result: Dict[str, Any]
    try:
        result = await _send_email(
            to=recipient,
            subject=draft["subject"],
            html=draft["body_html"],
        )
    except Exception as e:  # pragma: no cover
        logger.warning("LF-2 send failed: %s", e)
        result = {"ok": False, "reason": str(e)}

    now = _now()
    await _db.lf2_letter_drafts.update_one(
        {"id": draft_id},
        {"$set": {
            "status": "sent" if result.get("ok") else "send_failed",
            "sent_at": now if result.get("ok") else None,
            "delivery_result": result,
        }},
    )
    return {"sent": bool(result.get("ok")), "result": result, "follow_up_due_at": draft.get("follow_up_due_at")}


@lf2_router.get("/participants/{pid}/chains")
async def list_chains_for_participant(pid: str, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    if _core1_assert_access:
        await _core1_assert_access(user, pid)
    chains = await _db.lf2_letter_chains.find({"participant_id": pid}, {"_id": 0}).sort("created_at", -1).to_list(50)
    drafts = await _db.lf2_letter_drafts.find({"participant_id": pid}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for c in chains:
        if isinstance(c.get("created_at"), datetime):
            c["created_at"] = _iso(c["created_at"])
    for d in drafts:
        if isinstance(d.get("created_at"), datetime):
            d["created_at"] = _iso(d["created_at"])
    return {"chains": chains, "drafts": drafts}


@lf2_router.get("/status")
async def status():
    return {
        "lf_2_letters": _flag_enabled(),
        "email_delivery_configured": _send_email is not None,
        "template_count": len(TEMPLATES),
        "chain_count": len(CHAINS),
        "spec": "LF-2 v1",
    }
