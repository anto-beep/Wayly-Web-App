"""Wayly Support Ticketing, SUP-0, SUP-1, SUP-2, SUP-3.

Implements the canonical schema from `wayly-support-schema.sql`. Because the
legacy Phase D module already owns the `support_tickets` collection (different
shape), this SUP-* system lives under the `sup_*` namespace:

  sup_tickets, sup_defects, sup_messages, sup_attachments,
  sup_tool_snapshots, sup_triage, sup_events, sup_counters

The field names INSIDE each collection match the schema verbatim, so the
later Supabase (Postgres, Sydney) migration is a straight document-to-row
mapping, only the collection-to-table name changes.

Hard guarantees enforced here (not just in the UI):
  - References WAY-0001 / DEF-0001 are generated atomically via $inc.
  - `get_user_visible_thread` ALWAYS filters {visibility: "public"}, so an
    internal staff note can never leak through this helper.
  - An `original_statement` attachment can ONLY be written when the parent
    ticket has consent_to_share_statement = True; the create endpoint
    enforces this and would raise loudly if a code path tried otherwise.
  - Every state change writes an immutable `sup_events` row.

Triage (SUP-3) is wired but gated behind SUPPORT_TRIAGE_ENABLED. Until the
Bedrock Sydney migration the flag stays off; the prompt, JSON contract and
guardrails are baked in so flipping it on is a one-line change.
"""
from __future__ import annotations

import os
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Literal, Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# DB handle
# ---------------------------------------------------------------------------
_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]


# ---------------------------------------------------------------------------
# Constants, enum value sets (mirror the schema)
# ---------------------------------------------------------------------------
TICKET_STATUS = ("received", "under_review", "awaiting_user", "resolved", "closed")
TICKET_CATEGORY = (
    "figure_incorrect",
    "rule_misapplied",
    "situation_not_captured",
    "tool_misunderstood_input",
    "other",
)
CLAIMED_SOURCE = (
    "assessor",
    "official_letter",
    "my_aged_care",
    "aged_care_rules",
    "own_reading",
    "other",
)
TICKET_CHANNEL = ("in_tool", "manual")
MESSAGE_AUTHOR = ("user", "staff", "system", "ai")
MESSAGE_VISIBILITY = ("public", "internal")
ATTACHMENT_TYPE = ("original_statement", "screenshot", "other", "user_upload", "admin_upload")

# Ticket-attachment upload limits (user + admin file adds on ongoing tickets)
MAX_TICKET_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB per file
ALLOWED_TICKET_UPLOAD_MIMES = {
    "image/png", "image/jpeg", "image/jpg", "image/webp",
    "application/pdf",
}
ALLOWED_TICKET_UPLOAD_EXTS = {"png", "jpg", "jpeg", "webp", "pdf"}
TRIAGE_CLASSIFICATION = (
    "confirmed_defect",
    "legislative_figure_error",
    "user_misunderstanding",
    "out_of_scope",
    "duplicate",
    "needs_human",
)
SEVERITY = ("critical", "high", "medium", "low")
DEFECT_STATUS = ("open", "investigating", "fix_in_progress", "fixed", "wont_fix", "not_a_defect")
DEFECT_ROOT_CAUSE = (
    "prompt_error",
    "legislative_figure_error",
    "missing_rule",
    "ui_bug",
    "data_error",
    "scope_limitation",
    "other",
)
TICKET_EVENT_TYPE = (
    "created",
    "consent_recorded",
    "triaged",
    "status_changed",
    "message_added",
    "linked_to_defect",
    "attachment_purged",
    "csat_received",
    # v2
    "priority_changed",
    "assignee_changed",
    "tag_added",
    "tag_removed",
    "edited_by_user",
    "closed_by_user",
    "reopened_by_user",
    "attachment_added",
)

TICKET_PRIORITY = ("low", "normal", "high", "urgent")

CONSENT_TEXT_VERSION = "support-consent-v1"
TRIAGE_PROMPT_VERSION = "triage-v1"
TRIAGE_CONFIDENCE_FLOOR = 0.6
PURGE_DAYS = 90


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _strip(d: Optional[dict]) -> Optional[dict]:
    if not d:
        return d
    d.pop("_id", None)
    return d


# ---------------------------------------------------------------------------
# Indexes, created on first router build
# ---------------------------------------------------------------------------
async def _ensure_indexes() -> None:
    try:
        await db.sup_tickets.create_index("reference", unique=True)
        await db.sup_tickets.create_index("user_id")
        await db.sup_tickets.create_index("status")
        await db.sup_tickets.create_index("category")
        await db.sup_tickets.create_index("linked_defect_id")
        # v2 additions
        await db.sup_tickets.create_index("priority")
        await db.sup_tickets.create_index("assignee_id")
        await db.sup_tickets.create_index("tags")
        await db.sup_tickets.create_index("last_activity_at")
        try:
            await db.sup_tickets.create_index(
                [("reference", "text"), ("user_note", "text"),
                 ("user_email", "text"), ("user_name", "text"), ("tool_name", "text")],
                name="sup_tickets_text",
            )
        except Exception:  # text index may already exist with a different weight
            pass
        await db.sup_messages.create_index([("ticket_id", 1), ("created_at", 1)])
        await db.sup_attachments.create_index("purge_after",
            partialFilterExpression={"purged_at": None})
        await db.sup_tool_snapshots.create_index("ticket_id", unique=True)
        await db.sup_events.create_index([("ticket_id", 1), ("created_at", 1)])
        await db.sup_defects.create_index("reference", unique=True)
        await db.sup_triage.create_index("ticket_id")
        # Macros (canned responses)
        await db.sup_macros.create_index("slug", unique=True)
    except Exception as exc:  # pragma: no cover, index calls are idempotent
        logger.warning("sup_* index create skipped: %s", exc)


# ---------------------------------------------------------------------------
# Reference generation, atomic, sequential, zero-padded
# ---------------------------------------------------------------------------
async def _next_reference(kind: str) -> str:
    """kind = 'ticket' -> WAY-0001, kind = 'defect' -> DEF-0001."""
    counter_id = "ticket_ref" if kind == "ticket" else "defect_ref"
    prefix = "WAY" if kind == "ticket" else "DEF"
    doc = await db.sup_counters.find_one_and_update(
        {"_id": counter_id},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    # Motor returns the post-update doc; cope with first-insert path.
    seq = (doc or {}).get("seq")
    if not seq:
        doc = await db.sup_counters.find_one({"_id": counter_id})
        seq = (doc or {}).get("seq", 1)
    return f"{prefix}-{seq:04d}"


# ---------------------------------------------------------------------------
# Event writer, single append-only audit trail
# ---------------------------------------------------------------------------
async def _write_event(
    *,
    ticket_id: str,
    event_type: str,
    actor_type: Optional[str] = None,
    actor_id: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> None:
    if event_type not in TICKET_EVENT_TYPE:
        raise ValueError(f"unknown event_type: {event_type}")
    await db.sup_events.insert_one({
        "ticket_id": ticket_id,
        "event_type": event_type,
        "actor_type": actor_type,
        "actor_id": actor_id,
        "metadata": metadata or {},
        "created_at": _now(),
    })


# ---------------------------------------------------------------------------
# Read helper, public-only thread (cannot be bypassed)
# ---------------------------------------------------------------------------
async def get_user_visible_thread(ticket_id: str) -> List[dict]:
    """Return the public message thread for a ticket. ALWAYS filters
    visibility='public' so internal notes can never escape this helper."""
    cursor = db.sup_messages.find(
        {"ticket_id": ticket_id, "visibility": "public"},
        {"_id": 0},
    ).sort("created_at", 1)
    return [m async for m in cursor]


# ---------------------------------------------------------------------------
# Attachment write guard, original_statement requires consent
# ---------------------------------------------------------------------------
async def _create_attachment(
    *,
    ticket_id: str,
    type_: str,
    storage_path: str,
    filename: Optional[str] = None,
    mime_type: Optional[str] = None,
    size_bytes: Optional[int] = None,
    purge_after: Optional[str] = None,
) -> dict:
    if type_ not in ATTACHMENT_TYPE:
        raise ValueError(f"unknown attachment type: {type_}")
    if type_ == "original_statement":
        ticket = await db.sup_tickets.find_one(
            {"id": ticket_id}, {"_id": 0, "consent_to_share_statement": 1}
        )
        if not ticket or not ticket.get("consent_to_share_statement"):
            raise RuntimeError(
                "original_statement attachment requires explicit consent "
                "(consent_to_share_statement=true) on the parent ticket."
            )
    import secrets
    att = {
        "id": secrets.token_urlsafe(12),
        "ticket_id": ticket_id,
        "type": type_,
        "storage_path": storage_path,
        "filename": filename,
        "mime_type": mime_type,
        "size_bytes": size_bytes,
        "uploaded_at": _now(),
        "purge_after": purge_after,
        "purged_at": None,
    }
    await db.sup_attachments.insert_one(att)
    return _strip(att)


async def _persist_ticket_upload(
    *,
    ticket_id: str,
    file: UploadFile,
    actor_type: Literal["user", "staff"],
    actor_id: str,
) -> dict:
    """Read a user-supplied file, validate size + MIME, base64-store it inline
    on the attachment row, write an `attachment_added` event, and return the
    public projection."""
    import base64
    import secrets

    filename_raw = (file.filename or "attachment").strip()
    ext = filename_raw.rsplit(".", 1)[-1].lower() if "." in filename_raw else ""
    mime = (file.content_type or "").lower()
    if ext not in ALLOWED_TICKET_UPLOAD_EXTS and mime not in ALLOWED_TICKET_UPLOAD_MIMES:
        raise HTTPException(
            status_code=415,
            detail="Only PNG, JPEG, WebP and PDF files are supported for ticket attachments.",
        )
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="The file is empty.")
    if len(raw) > MAX_TICKET_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File is too big. Maximum size is {MAX_TICKET_UPLOAD_BYTES // (1024 * 1024)} MB.",
        )
    # Normalise the filename to something safe.
    safe_stem = "".join(c for c in filename_raw.rsplit(".", 1)[0] if c.isalnum() or c in ("-", "_", " ", "."))[:80] or "attachment"
    safe_name = f"{safe_stem}.{ext}" if ext else safe_stem
    is_pdf = ext == "pdf" or mime == "application/pdf"
    att_type = "user_upload" if actor_type == "user" else "admin_upload"

    att_id = secrets.token_urlsafe(12)
    att = {
        "id": att_id,
        "ticket_id": ticket_id,
        "type": att_type,
        "storage_path": f"inline://{att_id}",
        "filename": safe_name,
        "mime_type": mime or ("application/pdf" if is_pdf else "application/octet-stream"),
        "size_bytes": len(raw),
        "uploaded_at": _now(),
        "uploaded_by_type": actor_type,
        "uploaded_by_id": actor_id,
        "purge_after": None,
        "purged_at": None,
        # base64-encoded payload lives on the attachment row itself for now.
        # If we outgrow this we can switch to an object store, the projection
        # returned to clients does NOT include this key.
        "file_b64": base64.b64encode(raw).decode("ascii"),
    }
    await db.sup_attachments.insert_one(att)
    await _write_event(
        ticket_id=ticket_id,
        event_type="attachment_added",
        actor_type=actor_type,
        actor_id=actor_id,
        metadata={"filename": safe_name, "size": len(raw), "kind": att_type},
    )
    return {
        "id": att["id"],
        "type": att_type,
        "filename": safe_name,
        "mime_type": att["mime_type"],
        "size_bytes": att["size_bytes"],
        "uploaded_at": att["uploaded_at"],
        "uploaded_by_type": actor_type,
    }


async def _stream_ticket_attachment(ticket_id: str, attachment_id: str) -> Response:
    """Return the raw file bytes for an attachment. Callers must have already
    guarded ownership (user/admin/ticket match)."""
    import base64
    att = await db.sup_attachments.find_one(
        {"id": attachment_id, "ticket_id": ticket_id}, {"_id": 0},
    )
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    if att.get("purged_at") or not att.get("file_b64"):
        raise HTTPException(
            status_code=410,
            detail="This file has been purged from our systems and is no longer available.",
        )
    try:
        raw = base64.b64decode(att["file_b64"])
    except Exception:
        raise HTTPException(status_code=500, detail="Could not decode attachment")
    mime = att.get("mime_type") or "application/octet-stream"
    filename = att.get("filename") or "attachment"
    return Response(
        content=raw,
        media_type=mime,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# Retention purge - triggered via /admin/support/retention/purge and by the
# scheduled cleanup job (see server.py trial_scheduler). Nulls the blob AND
# the path so a purged attachment leaves only metadata behind for audit.
# ---------------------------------------------------------------------------
async def purge_expired_attachments() -> int:
    """Find sup_attachments where purge_after < now and purged_at is null,
    null the storage_path AND the file_b64 blob, set purged_at, write an
    attachment_purged event. Returns the number of attachments purged."""
    now = _now()
    purged = 0
    cursor = db.sup_attachments.find(
        {"purge_after": {"$lt": now}, "purged_at": None},
        {"_id": 0},
    )
    async for att in cursor:
        # Blob is stored inline as ``file_b64`` today. Null it out AND the
        # storage_path so a fully purged attachment leaves only metadata
        # (filename, mime, size, purge_after, purged_at) behind for audit.
        await db.sup_attachments.update_one(
            {"id": att["id"]},
            {"$set": {
                "storage_path": None,
                "file_b64": None,
                "purged_at": now,
            }},
        )
        await _write_event(
            ticket_id=att["ticket_id"],
            event_type="attachment_purged",
            actor_type="system",
            metadata={"attachment_id": att["id"], "original_size": att.get("size_bytes")},
        )
        purged += 1
    return purged


# ---------------------------------------------------------------------------
# SUP-3 triage stub, gated behind SUPPORT_TRIAGE_ENABLED
# ---------------------------------------------------------------------------
async def _run_triage(ticket: dict, snapshot: dict) -> None:
    """Background triage. If the feature flag is off, write nothing.
    When enabled (post-Bedrock-Sydney), this calls the LLM with the
    triage-v1 prompt, parses strict JSON, applies the 0.6 confidence floor,
    and persists a sup_triage row. The reply draft is NEVER sent to the
    user automatically."""
    if os.environ.get("SUPPORT_TRIAGE_ENABLED", "false").lower() != "true":
        return
    try:
        # Lazy import, only loaded when flag is on.
        from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
    except Exception as exc:  # pragma: no cover
        logger.warning("triage skipped, emergentintegrations not available: %s", exc)
        return

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        logger.warning("triage skipped, EMERGENT_LLM_KEY missing")
        return

    open_defects = []
    async for d in db.sup_defects.find(
        {"status": {"$in": ["open", "investigating", "fix_in_progress"]}},
        {"_id": 0, "reference": 1, "title": 1, "tool_name": 1},
    ).limit(50):
        open_defects.append(d)

    payload = {
        "ticket_reference": ticket["reference"],
        "category": ticket["category"],
        "user_note": ticket.get("user_note"),
        "user_claimed_answer": ticket.get("user_claimed_answer"),
        "user_claimed_source": ticket.get("user_claimed_source"),
        "tool_name": snapshot["tool_name"],
        "tool_version": snapshot["tool_version"],
        "tool_input": snapshot["tool_input"],
        "tool_output": snapshot["tool_output"],
        "original_statement_text": snapshot.get("original_statement_text"),
        "open_defects": open_defects,
    }

    system_prompt = _TRIAGE_SYSTEM_PROMPT
    try:
        chat = LlmChat(
            api_key=api_key,
            session_id=f"triage-{ticket['id']}",
            system_message=system_prompt,
        ).with_model("anthropic", "claude-sonnet-4-5")
        import json as _json
        msg = UserMessage(text=_json.dumps(payload))
        raw = await chat.send_message(msg)
        # Strict JSON, the model is instructed to return only JSON.
        parsed = _json.loads(raw.strip().strip("`").strip())
    except Exception as exc:
        logger.warning("triage call failed for %s: %s", ticket["reference"], exc)
        await db.sup_triage.insert_one({
            "ticket_id": ticket["id"],
            "model": "claude-sonnet-4-5",
            "prompt_version": TRIAGE_PROMPT_VERSION,
            "suggested_classification": "needs_human",
            "suggested_severity": None,
            "suggested_priority": None,
            "duplicate_of_defect_id": None,
            "reasoning": f"triage call failed: {exc}",
            "suggested_reply_draft": None,
            "confidence": 0.0,
            "human_agreed": None,
            "created_at": _now(),
        })
        return

    # Confidence floor, force needs_human if model under-confident.
    confidence = float(parsed.get("confidence") or 0.0)
    classification = parsed.get("suggested_classification") or "needs_human"
    if confidence < TRIAGE_CONFIDENCE_FLOOR:
        classification = "needs_human"
    if classification not in TRIAGE_CLASSIFICATION:
        classification = "needs_human"

    dup_ref = parsed.get("duplicate_of_defect_reference")
    dup_defect_id = None
    if dup_ref:
        d = await db.sup_defects.find_one({"reference": dup_ref}, {"_id": 0, "id": 1})
        dup_defect_id = (d or {}).get("id")

    await db.sup_triage.insert_one({
        "ticket_id": ticket["id"],
        "model": "claude-sonnet-4-5",
        "prompt_version": TRIAGE_PROMPT_VERSION,
        "suggested_classification": classification,
        "suggested_severity": parsed.get("suggested_severity"),
        "suggested_priority": parsed.get("suggested_priority"),
        "duplicate_of_defect_id": dup_defect_id,
        "reasoning": parsed.get("reasoning"),
        "suggested_reply_draft": parsed.get("suggested_reply_draft"),
        "confidence": confidence,
        "human_agreed": None,
        "created_at": _now(),
    })
    await _write_event(
        ticket_id=ticket["id"],
        event_type="triaged",
        actor_type="ai",
        metadata={"classification": classification, "confidence": confidence},
    )


_TRIAGE_SYSTEM_PROMPT = (
    "You are the first-pass triage reviewer for Wayly, an Australian "
    "information service that helps families understand the Support at Home "
    "aged care program. A user has reported that one of Wayly's tools "
    "returned something that looks incorrect. Your job is to classify the "
    "report, judge its severity, draft a reply for a human to review, and "
    "flag possible duplicates. You never contact the user directly and your "
    "output is only ever a draft.\n\n"
    "Hard rules, in order of priority:\n"
    "1. You output a single JSON object and nothing else. No prose, no "
    "markdown, no code fences, no commentary before or after.\n"
    "2. Any dispute about a specific figure, including a dollar amount, a "
    "percentage, a cap, a supplement, a contribution amount, or a "
    "classification level, must be classified as 'legislative_figure_error'. "
    "You must not decide the correct figure yourself and you must not state a "
    "corrected figure in your reasoning or in the reply draft.\n"
    "3. If you cannot classify the report with reasonable confidence, set "
    "'suggested_classification' to 'needs_human' and set 'confidence' "
    "honestly low.\n"
    "4. The reply draft is in Wayly's voice: warm, clear, calm, dignified, "
    "grounded in evidence. Australian English. No em dashes. Do not use the "
    "words navigate, unlock, leverage, seamless, embark, delve, robust, "
    "harness, or empower. The reply never promises a fix, never gives "
    "clinical or financial advice, and never states a corrected legislative "
    "figure. It ends with this exact line: 'Wayly gives you information to "
    "help you understand the Support at Home program. It is not clinical or "
    "financial advice.'\n\n"
    "Output exactly this JSON shape:\n"
    "{\"suggested_classification\":\"...\",\"suggested_severity\":\"...\","
    "\"suggested_priority\":1,\"duplicate_of_defect_reference\":null,"
    "\"reasoning\":\"...\",\"suggested_reply_draft\":\"...\","
    "\"confidence\":0.0}"
)


# ---------------------------------------------------------------------------
# Pydantic intake models
# ---------------------------------------------------------------------------
class IntakeRequest(BaseModel):
    tool_name: str = Field(min_length=1, max_length=80)
    tool_version: str = Field(default="v1", max_length=40)
    app_version: Optional[str] = Field(default=None, max_length=40)
    tool_input: Dict[str, Any] = Field(default_factory=dict)
    tool_output: Dict[str, Any] = Field(default_factory=dict)
    channel: Literal["in_tool", "manual"] = "in_tool"
    category: Literal[
        "figure_incorrect", "rule_misapplied", "situation_not_captured",
        "tool_misunderstood_input", "other",
    ]
    user_note: Optional[str] = Field(default=None, max_length=4000)
    user_claimed_answer: Optional[str] = Field(default=None, max_length=2000)
    user_claimed_source: Optional[Literal[
        "assessor", "official_letter", "my_aged_care",
        "aged_care_rules", "own_reading", "other",
    ]] = None
    user_claimed_source_detail: Optional[str] = Field(default=None, max_length=400)
    consent_to_share_statement: bool = False
    consent_text_version: Optional[str] = None
    statement_id: Optional[str] = None  # link to an existing statement upload


class ReplyBody(BaseModel):
    body: str = Field(min_length=1, max_length=10000)


class CsatBody(BaseModel):
    csat_score: int = Field(ge=1, le=5)
    csat_comment: Optional[str] = Field(default=None, max_length=2000)


class StatusBody(BaseModel):
    status: Literal["received", "under_review", "awaiting_user", "resolved", "closed"]
    resolution_summary: Optional[str] = Field(default=None, max_length=4000)


class DefectCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    tool_name: str = Field(min_length=1, max_length=80)
    tool_version_affected: Optional[str] = None
    severity: Literal["critical", "high", "medium", "low"] = "medium"
    root_cause: Optional[Literal[
        "prompt_error", "legislative_figure_error", "missing_rule",
        "ui_bug", "data_error", "scope_limitation", "other",
    ]] = None
    legislative_reference: Optional[str] = None


class DefectLink(BaseModel):
    defect_id: str


class DefectResolve(BaseModel):
    resolution_note: str = Field(min_length=3, max_length=4000)
    fixed_in_version: Optional[str] = None
    notify_reporters: bool = True


class TriageAgree(BaseModel):
    human_agreed: bool


# ------- v2 models -------
class UserEditTicket(BaseModel):
    user_note: Optional[str] = Field(default=None, max_length=4000)
    user_claimed_answer: Optional[str] = Field(default=None, max_length=2000)
    user_claimed_source: Optional[Literal[
        "assessor", "official_letter", "my_aged_care",
        "aged_care_rules", "own_reading", "other",
    ]] = None
    user_claimed_source_detail: Optional[str] = Field(default=None, max_length=400)

    # Defensive: coerce empty strings from form submissions to None so a
    # placeholder "" doesn't fail the Literal validator with a 422.
    @field_validator("user_claimed_source", mode="before")
    @classmethod
    def _blank_source_to_none(cls, v):
        if v is None or v == "":
            return None
        return v

    @field_validator("user_note", "user_claimed_answer", "user_claimed_source_detail", mode="before")
    @classmethod
    def _blank_string_to_none(cls, v):
        if v == "":
            return None
        return v


class AdminTicketPatch(BaseModel):
    priority: Optional[Literal["low", "normal", "high", "urgent"]] = None
    assignee_id: Optional[str] = None  # send empty string "" to unassign
    add_tags: Optional[List[str]] = None
    remove_tags: Optional[List[str]] = None


class BulkAction(BaseModel):
    ticket_ids: List[str] = Field(min_length=1, max_length=200)
    action: Literal["set_priority", "set_assignee", "set_status", "add_tag", "remove_tag"]
    value: str = Field(min_length=0, max_length=100)


class MacroCreate(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    body: str = Field(min_length=2, max_length=6000)


class MacroUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=2, max_length=120)
    body: Optional[str] = Field(default=None, min_length=2, max_length=6000)


# ---------------------------------------------------------------------------
# Email helpers (called from endpoints)
# ---------------------------------------------------------------------------
async def _send_email_safe(*, to: str, subject: str, html: str) -> None:
    try:
        from email_service import send_email
        await send_email(to=to, subject=subject, html=html)
    except Exception as exc:  # pragma: no cover
        logger.warning("support email send failed: %s", exc)


def _html_escape(s: str) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _email_shell(*, heading: str, body_html: str) -> str:
    return f"""<!doctype html>
<html><body style="font-family:Helvetica,Arial,sans-serif;background:#FBF8F3;padding:24px;color:#0E4D52">
  <table align="center" style="width:600px;max-width:100%;background:#fff;border-radius:12px;border:1px solid #E5DCC9;overflow:hidden">
    <tr><td style="padding:20px 28px;background:#0E4D52;color:#fff">
      <div style="font-family:Georgia,serif;font-size:22px">Wayly</div>
      <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.85;margin-top:4px">Support</div>
    </td></tr>
    <tr><td style="padding:24px 28px">
      <h2 style="margin:0 0 12px;font-family:Georgia,serif;color:#0E4D52;font-size:20px">{_html_escape(heading)}</h2>
      <div style="font-size:15px;line-height:1.65;color:#0E4D52">{body_html}</div>
      <hr style="border:0;border-top:1px solid #E5DCC9;margin:24px 0" />
      <p style="margin:0;font-size:12px;color:#6b6b6b;line-height:1.6">Wayly gives you information to help you understand the Support at Home program. It is not clinical or financial advice.</p>
    </td></tr>
  </table>
</body></html>"""


async def _email_acknowledgement(*, to: str, first_name: str, reference: str) -> None:
    body = (
        f"<p style='margin:0 0 12px'>Hi {_html_escape(first_name or 'there')},</p>"
        f"<p style='margin:0 0 12px'>Thanks for letting us know that something did not look right. We have your ticket and a member of the Wayly team will look into it.</p>"
        f"<p style='margin:0 0 12px'>Your reference is <strong>{_html_escape(reference)}</strong>. We aim to come back to you within 14 days.</p>"
        f"<p style='margin:0 0 12px'>You can check progress any time by opening <a href='https://wayly.com.au/support' style='color:#0E4D52;font-weight:600'>Support</a> in Wayly.</p>"
        f"<p style='margin:16px 0 0'>Warm regards,<br>The Wayly Team</p>"
    )
    await _send_email_safe(
        to=to,
        subject=f"We Have Received Your Ticket ({reference})",
        html=_email_shell(heading="Your Ticket Has Been Received", body_html=body),
    )


async def _email_reply_notice(*, to: str, first_name: str, reference: str, reply_body: str) -> None:
    body = (
        f"<p style='margin:0 0 12px'>Hi {_html_escape(first_name or 'there')},</p>"
        f"<p style='margin:0 0 12px'>The Wayly team has replied to your ticket <strong>{_html_escape(reference)}</strong>.</p>"
        f"<blockquote style='margin:12px 0;padding:12px 16px;border-left:3px solid #6B8F71;background:#F4F1EA;color:#0E4D52;font-size:14px;line-height:1.6'>{_html_escape(reply_body)}</blockquote>"
        f"<p style='margin:0 0 12px'>To reply, open your ticket under <a href='https://wayly.com.au/support' style='color:#0E4D52;font-weight:600'>Support</a> in Wayly. That keeps everything in one place for you.</p>"
        f"<p style='margin:16px 0 0'>Warm regards,<br>The Wayly Team</p>"
    )
    await _send_email_safe(
        to=to,
        subject=f"There Is a Reply on Your Ticket ({reference})",
        html=_email_shell(heading="There Is a Reply on Your Ticket", body_html=body),
    )


async def _email_resolution_notice(*, to: str, first_name: str, reference: str, resolution_summary: str) -> None:
    body = (
        f"<p style='margin:0 0 12px'>Hi {_html_escape(first_name or 'there')},</p>"
        f"<p style='margin:0 0 12px'>Thanks for your patience. We have looked into your ticket <strong>{_html_escape(reference)}</strong>.</p>"
        f"<blockquote style='margin:12px 0;padding:12px 16px;border-left:3px solid #6B8F71;background:#F4F1EA;color:#0E4D52;font-size:14px;line-height:1.6'>{_html_escape(resolution_summary)}</blockquote>"
        f"<p style='margin:0 0 12px'>You can read the full history any time under <a href='https://wayly.com.au/support' style='color:#0E4D52;font-weight:600'>Support</a>. If you have a moment, you can also let us know whether this helped. It guides what we improve next.</p>"
        f"<p style='margin:16px 0 0'>Warm regards,<br>The Wayly Team</p>"
    )
    await _send_email_safe(
        to=to,
        subject=f"We Have Looked Into Your Ticket ({reference})",
        html=_email_shell(heading="We Have Looked Into Your Ticket", body_html=body),
    )


def _support_inbox_addresses() -> list[str]:
    """Team inbox(es) that receive a heads-up when a new ticket is created.
    Comma-separated so ops can fan out to multiple addresses without a code
    change. Empty / unset → no team notification is sent (safe default)."""
    raw = os.environ.get("SUPPORT_INBOX_EMAIL", "").strip()
    if not raw:
        return []
    return [addr.strip() for addr in raw.split(",") if addr.strip()]


async def _email_new_ticket_to_team(*, ticket: dict, snapshot: Optional[dict]) -> None:
    """Notify the Wayly team inbox that a new support ticket has landed.
    Non-blocking, errors are logged and swallowed so ticket submit never
    fails on an email hiccup."""
    inboxes = _support_inbox_addresses()
    if not inboxes:
        return
    reference = ticket.get("reference") or ticket.get("id") or ""
    user_name = ticket.get("user_name") or "(no name)"
    user_email = ticket.get("user_email") or "(unknown)"
    category = ticket.get("category") or "-"
    tool_name = ticket.get("tool_name") or "-"
    channel = ticket.get("channel") or "-"
    consent = "Yes" if ticket.get("consent_to_share_statement") else "No"
    user_note = ticket.get("user_note") or ""
    # Truncate the user's note to keep the email compact; the full text is
    # always available in the admin console.
    snippet = user_note if len(user_note) <= 800 else (user_note[:800] + "…")

    rows = [
        ("Reference", reference),
        ("Reporter", f"{user_name} &lt;{_html_escape(user_email)}&gt;"),
        ("Channel", channel),
        ("Category", category),
        ("Tool", tool_name),
        ("Statement shared", consent),
    ]
    rows_html = "".join(
        f"<tr>"
        f"<td style='padding:6px 12px 6px 0;color:#6b6b6b;font-size:12px;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap;vertical-align:top'>{_html_escape(k)}</td>"
        f"<td style='padding:6px 0;color:#0E4D52;font-size:14px'>{v if k == 'Reporter' else _html_escape(str(v))}</td>"
        f"</tr>"
        for k, v in rows
    )
    body = (
        f"<p style='margin:0 0 12px;font-size:14px;color:#6b6b6b'>A new support ticket has been submitted.</p>"
        f"<table style='width:100%;border-collapse:collapse;margin:0 0 16px'>{rows_html}</table>"
        f"<div style='font-size:12px;color:#6b6b6b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px'>Reporter's message</div>"
        f"<blockquote style='margin:0 0 16px;padding:12px 16px;border-left:3px solid #A5512B;background:#F4F1EA;color:#0E4D52;font-size:14px;line-height:1.6;white-space:pre-wrap'>{_html_escape(snippet) or '(no message provided)'}</blockquote>"
    )
    if snapshot is not None:
        body += (
            f"<p style='margin:0 0 12px;font-size:12px;color:#6b6b6b'>"
            f"A tool-result snapshot was captured (tool: <strong>{_html_escape(snapshot.get('tool_name') or '-')}</strong>, "
            f"version: {_html_escape(snapshot.get('tool_version') or '-')})."
            f"</p>"
        )
    body += (
        f"<p style='margin:16px 0 0'>"
        f"<a href='https://wayly.com.au/admin/support?ticket={_html_escape(ticket.get('id') or '')}' "
        f"style='display:inline-block;background:#A5512B;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-size:13px;font-weight:600'>"
        f"Open in admin console</a>"
        f"</p>"
    )
    subject = f"[Wayly Support] New ticket {reference}"
    if tool_name and tool_name != "-":
        subject += f" · {tool_name}"
    for addr in inboxes:
        await _send_email_safe(
            to=addr,
            subject=subject,
            html=_email_shell(heading=f"New Ticket · {reference}", body_html=body),
        )


# ---------------------------------------------------------------------------
# Public ticket-shape serialiser
# ---------------------------------------------------------------------------
def _ticket_public(t: dict) -> dict:
    return {
        "id": t["id"],
        "reference": t["reference"],
        "status": t["status"],
        "category": t["category"],
        "channel": t.get("channel", "in_tool"),
        "tool_name": t.get("tool_name"),
        "user_note": t.get("user_note"),
        "user_claimed_answer": t.get("user_claimed_answer"),
        "user_claimed_source": t.get("user_claimed_source"),
        "user_claimed_source_detail": t.get("user_claimed_source_detail"),
        "consent_to_share_statement": t.get("consent_to_share_statement", False),
        "csat_score": t.get("csat_score"),
        "created_at": t["created_at"],
        "updated_at": t["updated_at"],
        "resolved_at": t.get("resolved_at"),
        # v2
        "priority": t.get("priority", "normal"),
        "assignee_id": t.get("assignee_id"),
        "assignee_name": t.get("assignee_name"),
        "tags": t.get("tags", []),
        "last_activity_at": t.get("last_activity_at") or t.get("updated_at"),
        "message_count": t.get("message_count", 0),
        "linked_defect_id": t.get("linked_defect_id"),
    }


# ===========================================================================
# Router builder
# ===========================================================================
def build_support_router():
    """Build the user-side support router. Lazy-binds get_current_user_id and
    the admin auth dep from server modules to avoid a circular import."""
    from server import get_current_user_id  # noqa: WPS433
    from admin_auth import get_current_admin  # noqa: WPS433

    # Fire-and-forget index creation
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(_ensure_indexes())
        else:  # pragma: no cover
            loop.run_until_complete(_ensure_indexes())
    except Exception as exc:
        logger.warning("sup_* index task not scheduled: %s", exc)

    r = APIRouter(tags=["support"])

    # ------------------------------------------------------------------ USER
    @r.post("/support/tickets")
    async def create_ticket(
        body: IntakeRequest,
        user_id: str = Depends(get_current_user_id),
    ):
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user:
            raise HTTPException(404, "User not found")

        # Consent integrity, if they ticked consent, capture the version.
        consent_version = (
            body.consent_text_version
            if body.consent_to_share_statement and body.consent_text_version
            else (CONSENT_TEXT_VERSION if body.consent_to_share_statement else None)
        )
        consent_at = _now() if body.consent_to_share_statement else None

        # Allocate reference + ids
        import secrets
        ticket_id = secrets.token_urlsafe(12)
        reference = await _next_reference("ticket")

        ticket_doc = {
            "id": ticket_id,
            "reference": reference,
            "user_id": user_id,
            "user_email": user.get("email"),
            "user_name": user.get("name"),
            "status": "received",
            "channel": body.channel,
            "category": body.category,
            "user_note": body.user_note,
            "user_claimed_answer": body.user_claimed_answer,
            "user_claimed_source": body.user_claimed_source,
            "user_claimed_source_detail": body.user_claimed_source_detail,
            "consent_to_share_statement": bool(body.consent_to_share_statement),
            "consent_text_version": consent_version,
            "consent_at": consent_at,
            "linked_defect_id": None,
            "csat_score": None,
            "csat_comment": None,
            "tool_name": body.tool_name,
            "created_at": _now(),
            "updated_at": _now(),
            "resolved_at": None,
            # v2 fields
            "priority": "normal",
            "assignee_id": None,
            "assignee_name": None,
            "tags": [],
            "last_activity_at": _now(),
            "message_count": 0,
            "closed_at": None,
        }
        await db.sup_tickets.insert_one(ticket_doc)

        # Immutable snapshot, 1:1 with tool-result tickets. Skipped for manual
        # tickets raised from the Support page (no tool result to capture).
        snapshot = None
        if body.channel == "in_tool":
            snapshot = {
                "id": secrets.token_urlsafe(12),
                "ticket_id": ticket_id,
                "tool_name": body.tool_name,
                "tool_version": body.tool_version,
                "app_version": body.app_version,
                "tool_input": body.tool_input,
                "tool_output": body.tool_output,
                "captured_at": _now(),
            }
            await db.sup_tool_snapshots.insert_one(snapshot)

        # Original statement attachment (only when consented and linked)
        if body.consent_to_share_statement and body.statement_id:
            try:
                stmt = await db.statements.find_one(
                    {"id": body.statement_id, "user_id": user_id},
                    {"_id": 0, "id": 1, "original_filename": 1, "mime_type": 1, "size_bytes": 1},
                )
                if stmt:
                    await _create_attachment(
                        ticket_id=ticket_id,
                        type_="original_statement",
                        storage_path=f"statements://{stmt['id']}",
                        filename=stmt.get("original_filename"),
                        mime_type=stmt.get("mime_type"),
                        size_bytes=stmt.get("size_bytes"),
                    )
            except Exception as exc:
                logger.warning("attaching statement failed (ticket %s): %s", reference, exc)

        await _write_event(
            ticket_id=ticket_id,
            event_type="created",
            actor_type="user",
            actor_id=user_id,
            metadata={"reference": reference, "tool_name": body.tool_name},
        )
        if body.consent_to_share_statement:
            await _write_event(
                ticket_id=ticket_id,
                event_type="consent_recorded",
                actor_type="user",
                actor_id=user_id,
                metadata={"consent_text_version": consent_version},
            )

        # Fire emails + triage in the background, do not block submit.
        try:
            asyncio.create_task(_email_acknowledgement(
                to=user["email"],
                first_name=(user.get("name") or "").split(" ")[0] if user.get("name") else "",
                reference=reference,
            ))
        except Exception:  # pragma: no cover
            pass
        # Notify the Wayly support inbox (SUPPORT_INBOX_EMAIL) so the team
        # sees new tickets in email without having to log in to /admin/support.
        try:
            asyncio.create_task(_email_new_ticket_to_team(
                ticket=ticket_doc,
                snapshot=snapshot,
            ))
        except Exception:  # pragma: no cover
            pass
        if snapshot is not None:
            try:
                asyncio.create_task(_run_triage(ticket_doc, snapshot))
            except Exception:  # pragma: no cover
                pass

        return {
            "ok": True,
            "ticket": _ticket_public(ticket_doc),
        }

    @r.get("/support/tickets")
    async def list_my_tickets(
        user_id: str = Depends(get_current_user_id),
        status: Optional[str] = Query(None),
        tool: Optional[str] = Query(None),
        q: Optional[str] = Query(None, max_length=200),
        sort: str = Query("newest"),
    ):
        query: Dict[str, Any] = {"user_id": user_id}
        if status and status != "all":
            if status == "open":
                query["status"] = {"$in": ["received", "under_review", "awaiting_user"]}
            else:
                query["status"] = status
        if tool:
            query["tool_name"] = tool
        if q:
            # Simple contains match across reference / tool / note (case-insensitive)
            import re as _re
            pat = {"$regex": _re.escape(q.strip()), "$options": "i"}
            query["$or"] = [
                {"reference": pat},
                {"tool_name": pat},
                {"user_note": pat},
                {"user_claimed_answer": pat},
            ]
        sort_map = {
            "newest": [("created_at", -1)],
            "oldest": [("created_at", 1)],
            "activity": [("last_activity_at", -1), ("updated_at", -1)],
            "status": [("status", 1), ("created_at", -1)],
        }
        sort_spec = sort_map.get(sort, sort_map["newest"])
        rows = []
        cursor = db.sup_tickets.find(query, {"_id": 0}).sort(sort_spec)
        async for t in cursor:
            rows.append(_ticket_public(t))
        # Stats summary
        all_query = {"user_id": user_id}
        stats_pipeline = [
            {"$match": all_query},
            {"$group": {"_id": "$status", "n": {"$sum": 1}}},
        ]
        stats = {"received": 0, "under_review": 0, "awaiting_user": 0, "resolved": 0, "closed": 0, "total": 0}
        async for s in db.sup_tickets.aggregate(stats_pipeline):
            stats[s["_id"]] = s["n"]
            stats["total"] += s["n"]
        stats["open"] = stats["received"] + stats["under_review"] + stats["awaiting_user"]
        return {"tickets": rows, "stats": stats}

    @r.get("/support/tickets/{ticket_id}")
    async def my_ticket_detail(
        ticket_id: str,
        user_id: str = Depends(get_current_user_id),
    ):
        t = await db.sup_tickets.find_one({"id": ticket_id, "user_id": user_id}, {"_id": 0})
        if not t:
            raise HTTPException(404, "Ticket not found")
        thread = await get_user_visible_thread(ticket_id)
        snapshot = await db.sup_tool_snapshots.find_one({"ticket_id": ticket_id}, {"_id": 0})
        # Public timeline events, status changes, csat, close/reopen (never internal).
        events = []
        PUBLIC_EVENTS = {"created", "status_changed", "csat_received",
                         "closed_by_user", "reopened_by_user", "edited_by_user",
                         "message_added"}
        async for ev in db.sup_events.find({"ticket_id": ticket_id}, {"_id": 0}).sort("created_at", 1):
            if ev.get("event_type") in PUBLIC_EVENTS:
                events.append(ev)
        # User-visible attachments (not the raw storage path)
        attachments = []
        async for a in db.sup_attachments.find({"ticket_id": ticket_id}, {"_id": 0, "file_b64": 0}):
            attachments.append({
                "id": a.get("id"),
                "type": a.get("type"),
                "filename": a.get("filename"),
                "mime_type": a.get("mime_type"),
                "size_bytes": a.get("size_bytes"),
                "uploaded_at": a.get("uploaded_at"),
                "uploaded_by_type": a.get("uploaded_by_type"),
                "purged_at": a.get("purged_at"),
            })
        return {
            "ticket": _ticket_public(t),
            "thread": thread,
            "snapshot": snapshot,
            "events": events,
            "attachments": attachments,
        }

    @r.post("/support/tickets/{ticket_id}/messages")
    async def reply_to_my_ticket(
        ticket_id: str,
        body: ReplyBody,
        user_id: str = Depends(get_current_user_id),
    ):
        t = await db.sup_tickets.find_one({"id": ticket_id, "user_id": user_id}, {"_id": 0})
        if not t:
            raise HTTPException(404, "Ticket not found")
        if t["status"] not in ("awaiting_user", "under_review", "received"):
            raise HTTPException(409, "This ticket is no longer accepting replies.")
        import secrets
        msg = {
            "id": secrets.token_urlsafe(12),
            "ticket_id": ticket_id,
            "author_type": "user",
            "author_id": user_id,
            "visibility": "public",
            "body": body.body.strip(),
            "created_at": _now(),
        }
        await db.sup_messages.insert_one(msg)
        new_status = "under_review" if t["status"] == "awaiting_user" else t["status"]
        await db.sup_tickets.update_one(
            {"id": ticket_id},
            {"$set": {"status": new_status, "updated_at": _now(), "last_activity_at": _now()},
             "$inc": {"message_count": 1}},
        )
        await _write_event(
            ticket_id=ticket_id,
            event_type="message_added",
            actor_type="user",
            actor_id=user_id,
        )
        return {"ok": True}

    @r.post("/support/tickets/{ticket_id}/attachments")
    async def upload_attachment_to_my_ticket(
        ticket_id: str,
        file: UploadFile = File(...),
        user_id: str = Depends(get_current_user_id),
    ):
        """User attaches a screenshot or PDF to an ongoing ticket. Attachments
        are allowed while the ticket is open (received / under_review / awaiting_user).
        Limits: 10 MB, PNG/JPEG/WebP/PDF only. Files are base64-stored inline like
        the documents vault, no external blob store required."""
        t = await db.sup_tickets.find_one({"id": ticket_id, "user_id": user_id}, {"_id": 0})
        if not t:
            raise HTTPException(404, "Ticket not found")
        if t["status"] not in ("received", "under_review", "awaiting_user"):
            raise HTTPException(409, "This ticket is closed. Reopen it before adding files.")
        att = await _persist_ticket_upload(
            ticket_id=ticket_id,
            file=file,
            actor_type="user",
            actor_id=user_id,
        )
        # Bump activity so admins see the new file at the top of the queue.
        await db.sup_tickets.update_one(
            {"id": ticket_id},
            {"$set": {"updated_at": _now(), "last_activity_at": _now()}},
        )
        return {"ok": True, "attachment": att}

    @r.get("/support/tickets/{ticket_id}/attachments/{attachment_id}/download")
    async def download_my_attachment(
        ticket_id: str,
        attachment_id: str,
        user_id: str = Depends(get_current_user_id),
    ):
        t = await db.sup_tickets.find_one({"id": ticket_id, "user_id": user_id}, {"_id": 0, "id": 1})
        if not t:
            raise HTTPException(404, "Ticket not found")
        return await _stream_ticket_attachment(ticket_id, attachment_id)

    @r.post("/support/tickets/{ticket_id}/csat")
    async def submit_csat(
        ticket_id: str,
        body: CsatBody,
        user_id: str = Depends(get_current_user_id),
    ):
        t = await db.sup_tickets.find_one({"id": ticket_id, "user_id": user_id}, {"_id": 0})
        if not t:
            raise HTTPException(404, "Ticket not found")
        if t["status"] not in ("resolved", "closed"):
            raise HTTPException(409, "CSAT is only available on resolved tickets.")
        if t.get("csat_score"):
            raise HTTPException(409, "CSAT has already been submitted for this ticket.")
        await db.sup_tickets.update_one(
            {"id": ticket_id},
            {"$set": {
                "csat_score": body.csat_score,
                "csat_comment": body.csat_comment,
                "updated_at": _now(),
            }},
        )
        await _write_event(
            ticket_id=ticket_id,
            event_type="csat_received",
            actor_type="user",
            actor_id=user_id,
            metadata={"score": body.csat_score},
        )
        return {"ok": True}

    @r.patch("/support/tickets/{ticket_id}")
    async def edit_my_ticket(
        ticket_id: str,
        body: UserEditTicket,
        user_id: str = Depends(get_current_user_id),
    ):
        """Users can edit their initial report while status is still 'received'
        (no admin has looked at it yet). We keep the original text in an
        audit-log style event so nothing is silently lost."""
        t = await db.sup_tickets.find_one({"id": ticket_id, "user_id": user_id}, {"_id": 0})
        if not t:
            raise HTTPException(404, "Ticket not found")
        if t.get("status") != "received":
            raise HTTPException(409, "This ticket has been picked up. Reply below to add more detail.")
        updates: Dict[str, Any] = {}
        original: Dict[str, Any] = {}
        for field in ("user_note", "user_claimed_answer",
                      "user_claimed_source", "user_claimed_source_detail"):
            val = getattr(body, field)
            if val is not None:
                new_val = val.strip() if isinstance(val, str) else val
                if new_val != t.get(field):
                    original[field] = t.get(field)
                    updates[field] = new_val or None
        if not updates:
            return {"ok": True, "unchanged": True}
        updates["updated_at"] = _now()
        updates["last_activity_at"] = _now()
        await db.sup_tickets.update_one({"id": ticket_id}, {"$set": updates})
        await _write_event(
            ticket_id=ticket_id,
            event_type="edited_by_user",
            actor_type="user",
            actor_id=user_id,
            metadata={"previous": original},
        )
        return {"ok": True}

    @r.post("/support/tickets/{ticket_id}/close")
    async def close_my_ticket(
        ticket_id: str,
        user_id: str = Depends(get_current_user_id),
    ):
        t = await db.sup_tickets.find_one({"id": ticket_id, "user_id": user_id}, {"_id": 0})
        if not t:
            raise HTTPException(404, "Ticket not found")
        if t.get("status") in ("resolved", "closed"):
            raise HTTPException(409, "This ticket is already closed.")
        now = _now()
        await db.sup_tickets.update_one(
            {"id": ticket_id},
            {"$set": {
                "status": "closed",
                "closed_at": now,
                "updated_at": now,
                "last_activity_at": now,
                "closed_by": "user",
            }},
        )
        await _write_event(
            ticket_id=ticket_id,
            event_type="closed_by_user",
            actor_type="user",
            actor_id=user_id,
            metadata={"from": t.get("status")},
        )
        return {"ok": True}

    @r.post("/support/tickets/{ticket_id}/reopen")
    async def reopen_my_ticket(
        ticket_id: str,
        user_id: str = Depends(get_current_user_id),
    ):
        t = await db.sup_tickets.find_one({"id": ticket_id, "user_id": user_id}, {"_id": 0})
        if not t:
            raise HTTPException(404, "Ticket not found")
        if t.get("status") not in ("resolved", "closed"):
            raise HTTPException(409, "This ticket is not closed.")
        # 30-day window from resolved_at or closed_at
        anchor = t.get("resolved_at") or t.get("closed_at") or t.get("updated_at")
        try:
            anchor_dt = datetime.fromisoformat(anchor.replace("Z", "+00:00")) if anchor else None
        except Exception:
            anchor_dt = None
        if anchor_dt and (datetime.now(timezone.utc) - anchor_dt) > timedelta(days=30):
            raise HTTPException(409, "This ticket is more than 30 days old. Please raise a new ticket referencing it.")
        now = _now()
        await db.sup_tickets.update_one(
            {"id": ticket_id},
            {"$set": {
                "status": "under_review",
                "resolved_at": None,
                "closed_at": None,
                "updated_at": now,
                "last_activity_at": now,
            }},
        )
        await _write_event(
            ticket_id=ticket_id,
            event_type="reopened_by_user",
            actor_type="user",
            actor_id=user_id,
            metadata={"from": t.get("status")},
        )
        return {"ok": True}

    # ----------------------------------------------------------------- ADMIN
    @r.get("/admin/support/tickets")
    async def admin_list_tickets(
        status: Optional[str] = Query(None),
        tool: Optional[str] = Query(None),
        category: Optional[str] = Query(None),
        has_statement: Optional[bool] = Query(None),
        priority: Optional[str] = Query(None),
        assignee: Optional[str] = Query(None),
        tag: Optional[str] = Query(None),
        has_defect: Optional[bool] = Query(None),
        csat: Optional[int] = Query(None, ge=1, le=5),
        q: Optional[str] = Query(None, max_length=200),
        date_from: Optional[str] = Query(None),
        date_to: Optional[str] = Query(None),
        sort: str = Query("smart"),  # smart | newest | oldest | activity | priority | age
        page: int = Query(1, ge=1),
        page_size: int = Query(50, ge=1, le=200),
        admin=Depends(get_current_admin),
    ):
        query: Dict[str, Any] = {}
        if status:
            if status == "open":
                query["status"] = {"$in": ["received", "under_review", "awaiting_user"]}
            elif status == "any":
                pass
            else:
                query["status"] = status
        if tool:
            query["tool_name"] = tool
        if category:
            query["category"] = category
        if has_statement is True:
            query["consent_to_share_statement"] = True
        elif has_statement is False:
            query["consent_to_share_statement"] = False
        if priority:
            query["priority"] = priority
        if assignee:
            if assignee == "unassigned":
                query["assignee_id"] = None
            elif assignee == "me":
                query["assignee_id"] = admin.get("id")
            else:
                query["assignee_id"] = assignee
        if tag:
            query["tags"] = tag
        if has_defect is True:
            query["linked_defect_id"] = {"$ne": None}
        elif has_defect is False:
            query["linked_defect_id"] = None
        if csat:
            query["csat_score"] = csat
        if date_from or date_to:
            rng: Dict[str, Any] = {}
            if date_from:
                rng["$gte"] = date_from
            if date_to:
                rng["$lte"] = date_to
            query["created_at"] = rng
        if q:
            import re as _re
            pat = {"$regex": _re.escape(q.strip()), "$options": "i"}
            query["$or"] = [
                {"reference": pat},
                {"user_note": pat},
                {"user_email": pat},
                {"user_name": pat},
                {"tool_name": pat},
                {"user_claimed_answer": pat},
                {"tags": pat},
            ]
        # Priority-first "smart" sort: unresolved by priority desc, then oldest first.
        PRIORITY_WEIGHT = {"urgent": 0, "high": 1, "normal": 2, "low": 3}
        sort_map = {
            "newest": [("created_at", -1)],
            "oldest": [("created_at", 1)],
            "activity": [("last_activity_at", -1)],
            "age": [("created_at", 1)],
            "priority": [("priority", 1), ("created_at", 1)],
            "smart": [("status", 1), ("created_at", 1)],
        }
        sort_spec = sort_map.get(sort, sort_map["smart"])

        total = await db.sup_tickets.count_documents(query)
        cursor = (
            db.sup_tickets.find(query, {"_id": 0})
            .sort(sort_spec)
            .skip((page - 1) * page_size)
            .limit(page_size)
        )
        rows = []
        async for t in cursor:
            row = {
                **_ticket_public(t),
                "user_email": t.get("user_email"),
                "user_name": t.get("user_name"),
            }
            rows.append(row)
        # For the "smart" sort, prefer surfacing urgent tickets, do an in-memory
        # secondary sort so we don't have to store an integer priority.
        if sort == "smart":
            rows.sort(key=lambda r: (
                0 if r["status"] in ("received", "under_review", "awaiting_user") else 1,
                PRIORITY_WEIGHT.get(r.get("priority", "normal"), 2),
                r["created_at"],
            ))
        return {"tickets": rows, "total": total, "page": page, "page_size": page_size}

    @r.get("/admin/support/stats")
    async def admin_support_stats(admin=Depends(get_current_admin)):
        """Overview stats for the admin dashboard header."""
        counts: Dict[str, int] = {"received": 0, "under_review": 0, "awaiting_user": 0,
                                  "resolved": 0, "closed": 0}
        async for row in db.sup_tickets.aggregate([
            {"$group": {"_id": "$status", "n": {"$sum": 1}}},
        ]):
            counts[row["_id"]] = row["n"]
        by_priority: Dict[str, int] = {"urgent": 0, "high": 0, "normal": 0, "low": 0}
        async for row in db.sup_tickets.aggregate([
            {"$match": {"status": {"$in": ["received", "under_review", "awaiting_user"]}}},
            {"$group": {"_id": {"$ifNull": ["$priority", "normal"]}, "n": {"$sum": 1}}},
        ]):
            key = row["_id"] if row["_id"] in by_priority else "normal"
            by_priority[key] = row["n"]
        unassigned = await db.sup_tickets.count_documents({
            "assignee_id": None,
            "status": {"$in": ["received", "under_review", "awaiting_user"]},
        })
        mine = await db.sup_tickets.count_documents({
            "assignee_id": admin.get("id"),
            "status": {"$in": ["received", "under_review", "awaiting_user"]},
        })
        # Average CSAT (last 90 days of resolved tickets with CSAT).
        cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
        avg_csat = None
        pipe = [
            {"$match": {"csat_score": {"$ne": None}, "resolved_at": {"$gte": cutoff}}},
            {"$group": {"_id": None, "avg": {"$avg": "$csat_score"}, "n": {"$sum": 1}}},
        ]
        async for row in db.sup_tickets.aggregate(pipe):
            avg_csat = {"avg": round(row["avg"], 2), "n": row["n"]}
        # SLA breaches, open >7 days
        seven_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        breached = await db.sup_tickets.count_documents({
            "status": {"$in": ["received", "under_review", "awaiting_user"]},
            "created_at": {"$lt": seven_ago},
        })
        return {
            "counts": counts,
            "by_priority": by_priority,
            "unassigned": unassigned,
            "mine": mine,
            "avg_csat": avg_csat,
            "sla_breached": breached,
            "open_total": counts["received"] + counts["under_review"] + counts["awaiting_user"],
        }

    @r.get("/admin/support/admins")
    async def admin_list_assignees(admin=Depends(get_current_admin)):
        """List of admin users available as assignees."""
        rows = []
        async for u in db.users.find(
            {"admin_role": {"$in": ["super_admin", "operations_admin", "support_admin"]}},
            {"_id": 0, "id": 1, "email": 1, "name": 1, "admin_role": 1},
        ).sort("name", 1):
            rows.append(u)
        return {"admins": rows}

    @r.get("/admin/support/export")
    async def admin_export_tickets(admin=Depends(get_current_admin)):
        """CSV export of every ticket. Meant for compliance / offline analysis."""
        import csv, io
        buf = io.StringIO()
        writer = csv.writer(buf)
        # CSV formula-injection guard (SEC audit Feb 2026). Cells beginning
        # with =, +, -, @, tab, or CR are treated as formulas by Excel /
        # Sheets. A malicious user_name or reference would execute on the
        # admin's machine when they open the export. Prefix any such cell
        # with a leading single quote so it renders as literal text.
        def _csv_safe(cell):
            if cell is None:
                return ""
            s = str(cell)
            if s and s[0] in ("=", "+", "-", "@", "\t", "\r"):
                return "'" + s
            return s

        writer.writerow([
            "reference", "status", "priority", "category", "tool_name",
            "user_email", "user_name", "assignee_name", "tags",
            "created_at", "updated_at", "resolved_at", "csat_score", "linked_defect_id",
        ])
        async for t in db.sup_tickets.find({}, {"_id": 0}).sort("created_at", -1):
            writer.writerow([
                _csv_safe(t.get("reference")), _csv_safe(t.get("status")), _csv_safe(t.get("priority", "normal")),
                _csv_safe(t.get("category")), _csv_safe(t.get("tool_name")),
                _csv_safe(t.get("user_email")), _csv_safe(t.get("user_name")),
                _csv_safe(t.get("assignee_name") or ""),
                _csv_safe("|".join(t.get("tags") or [])),
                _csv_safe(t.get("created_at")), _csv_safe(t.get("updated_at")),
                _csv_safe(t.get("resolved_at") or ""),
                _csv_safe(t.get("csat_score") or ""),
                _csv_safe(t.get("linked_defect_id") or ""),
            ])
        from fastapi.responses import Response
        return Response(
            content=buf.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=wayly-support-tickets.csv"},
        )

    @r.patch("/admin/support/tickets/{ticket_id}")
    async def admin_patch_ticket(
        ticket_id: str,
        body: AdminTicketPatch,
        admin=Depends(get_current_admin),
    ):
        t = await db.sup_tickets.find_one({"id": ticket_id}, {"_id": 0})
        if not t:
            raise HTTPException(404, "Ticket not found")
        updates: Dict[str, Any] = {}
        events: List[Dict[str, Any]] = []
        if body.priority and body.priority != t.get("priority"):
            updates["priority"] = body.priority
            events.append({"event_type": "priority_changed",
                           "metadata": {"from": t.get("priority", "normal"), "to": body.priority}})
        if body.assignee_id is not None:
            if body.assignee_id == "":
                if t.get("assignee_id"):
                    updates["assignee_id"] = None
                    updates["assignee_name"] = None
                    events.append({"event_type": "assignee_changed",
                                   "metadata": {"to": None, "from": t.get("assignee_name")}})
            elif body.assignee_id != t.get("assignee_id"):
                assignee = await db.users.find_one(
                    {"id": body.assignee_id, "admin_role": {"$in": [
                        "super_admin", "operations_admin", "support_admin"
                    ]}}, {"_id": 0, "id": 1, "name": 1, "email": 1},
                )
                if not assignee:
                    raise HTTPException(400, "Assignee is not an admin user")
                updates["assignee_id"] = assignee["id"]
                updates["assignee_name"] = assignee.get("name") or assignee.get("email")
                events.append({"event_type": "assignee_changed",
                               "metadata": {"to": updates["assignee_name"],
                                            "from": t.get("assignee_name")}})
        tag_add_ops = []
        for tg in (body.add_tags or []):
            tg = (tg or "").strip().lower()
            if tg and tg not in (t.get("tags") or []):
                tag_add_ops.append(tg)
                events.append({"event_type": "tag_added", "metadata": {"tag": tg}})
        tag_rm_ops = []
        for tg in (body.remove_tags or []):
            tg = (tg or "").strip().lower()
            if tg and tg in (t.get("tags") or []):
                tag_rm_ops.append(tg)
                events.append({"event_type": "tag_removed", "metadata": {"tag": tg}})
        if not updates and not tag_add_ops and not tag_rm_ops:
            return {"ok": True, "unchanged": True}
        updates["updated_at"] = _now()
        updates["last_activity_at"] = _now()
        mongo_ops: Dict[str, Any] = {"$set": updates}
        if tag_add_ops:
            mongo_ops["$addToSet"] = {"tags": {"$each": tag_add_ops}}
        if tag_rm_ops:
            mongo_ops["$pull"] = {"tags": {"$in": tag_rm_ops}}
        await db.sup_tickets.update_one({"id": ticket_id}, mongo_ops)
        for ev in events:
            await _write_event(
                ticket_id=ticket_id,
                event_type=ev["event_type"],
                actor_type="staff",
                actor_id=admin.get("id"),
                metadata=ev.get("metadata", {}),
            )
        return {"ok": True}

    @r.post("/admin/support/tickets/bulk")
    async def admin_bulk_action(body: BulkAction, admin=Depends(get_current_admin)):
        applied = 0
        assignee_meta = None
        if body.action == "set_assignee" and body.value:
            u = await db.users.find_one(
                {"id": body.value, "admin_role": {"$in": [
                    "super_admin", "operations_admin", "support_admin"
                ]}}, {"_id": 0, "id": 1, "name": 1, "email": 1},
            )
            if not u:
                raise HTTPException(400, "Assignee is not an admin user")
            assignee_meta = {"id": u["id"], "name": u.get("name") or u.get("email")}
        for tid in body.ticket_ids:
            t = await db.sup_tickets.find_one({"id": tid}, {"_id": 0})
            if not t:
                continue
            update: Dict[str, Any] = {"updated_at": _now(), "last_activity_at": _now()}
            extras: Dict[str, Any] = {}
            event_type = None
            metadata: Dict[str, Any] = {}
            if body.action == "set_priority":
                if body.value not in TICKET_PRIORITY:
                    raise HTTPException(400, f"Priority must be one of {TICKET_PRIORITY}")
                if t.get("priority") == body.value:
                    continue
                update["priority"] = body.value
                event_type = "priority_changed"
                metadata = {"from": t.get("priority", "normal"), "to": body.value}
            elif body.action == "set_assignee":
                if not body.value:
                    update["assignee_id"] = None
                    update["assignee_name"] = None
                    event_type = "assignee_changed"
                    metadata = {"from": t.get("assignee_name"), "to": None}
                else:
                    update["assignee_id"] = assignee_meta["id"]
                    update["assignee_name"] = assignee_meta["name"]
                    event_type = "assignee_changed"
                    metadata = {"from": t.get("assignee_name"), "to": assignee_meta["name"]}
            elif body.action == "set_status":
                if body.value not in TICKET_STATUS:
                    raise HTTPException(400, f"Status must be one of {TICKET_STATUS}")
                if t.get("status") == body.value:
                    continue
                update["status"] = body.value
                if body.value == "resolved":
                    update["resolved_at"] = _now()
                event_type = "status_changed"
                metadata = {"from": t.get("status"), "to": body.value}
            elif body.action == "add_tag":
                tg = (body.value or "").strip().lower()
                if not tg or tg in (t.get("tags") or []):
                    continue
                extras["$addToSet"] = {"tags": tg}
                event_type = "tag_added"
                metadata = {"tag": tg}
            elif body.action == "remove_tag":
                tg = (body.value or "").strip().lower()
                if not tg or tg not in (t.get("tags") or []):
                    continue
                extras["$pull"] = {"tags": tg}
                event_type = "tag_removed"
                metadata = {"tag": tg}
            mongo_ops = {"$set": update}
            mongo_ops.update(extras)
            await db.sup_tickets.update_one({"id": tid}, mongo_ops)
            if event_type:
                await _write_event(
                    ticket_id=tid, event_type=event_type,
                    actor_type="staff", actor_id=admin.get("id"),
                    metadata=metadata,
                )
            applied += 1
        return {"ok": True, "applied": applied}

    @r.get("/admin/support/tickets/{ticket_id}/timeline")
    async def admin_timeline(ticket_id: str, admin=Depends(get_current_admin)):
        """Combined chronological timeline: messages + events."""
        rows: List[Dict[str, Any]] = []
        async for m in db.sup_messages.find({"ticket_id": ticket_id}, {"_id": 0}).sort("created_at", 1):
            rows.append({
                "kind": "message",
                "author_type": m.get("author_type"),
                "visibility": m.get("visibility"),
                "body": m.get("body"),
                "created_at": m.get("created_at"),
                "id": m.get("id"),
            })
        async for ev in db.sup_events.find({"ticket_id": ticket_id}, {"_id": 0}).sort("created_at", 1):
            if ev.get("event_type") == "message_added":
                continue  # already surfaced as the message itself
            rows.append({
                "kind": "event",
                "event_type": ev.get("event_type"),
                "actor_type": ev.get("actor_type"),
                "metadata": ev.get("metadata", {}),
                "created_at": ev.get("created_at"),
            })
        rows.sort(key=lambda r: r.get("created_at") or "")
        return {"timeline": rows}

    # ----------------------- Macros (canned responses) -----------------------
    @r.get("/admin/support/macros")
    async def admin_list_macros(admin=Depends(get_current_admin)):
        rows = []
        async for m in db.sup_macros.find({}, {"_id": 0}).sort("title", 1):
            rows.append(m)
        return {"macros": rows}

    @r.post("/admin/support/macros")
    async def admin_create_macro(body: MacroCreate, admin=Depends(get_current_admin)):
        import secrets, re as _re
        slug = _re.sub(r"[^a-z0-9]+", "-", body.title.lower()).strip("-")
        if not slug:
            slug = secrets.token_urlsafe(6).lower()
        # If slug exists, append short suffix
        existing = await db.sup_macros.find_one({"slug": slug}, {"_id": 0, "id": 1})
        if existing:
            slug = f"{slug}-{secrets.token_urlsafe(3).lower()}"
        doc = {
            "id": secrets.token_urlsafe(12),
            "slug": slug,
            "title": body.title.strip(),
            "body": body.body,
            "created_at": _now(),
            "created_by": admin.get("id"),
        }
        await db.sup_macros.insert_one(doc)
        return {"ok": True, "macro": _strip(doc)}

    @r.patch("/admin/support/macros/{macro_id}")
    async def admin_update_macro(macro_id: str, body: MacroUpdate,
                                  admin=Depends(get_current_admin)):
        update: Dict[str, Any] = {}
        if body.title is not None:
            update["title"] = body.title.strip()
        if body.body is not None:
            update["body"] = body.body
        if not update:
            return {"ok": True, "unchanged": True}
        res = await db.sup_macros.update_one({"id": macro_id}, {"$set": update})
        if not res.matched_count:
            raise HTTPException(404, "Macro not found")
        return {"ok": True}

    @r.delete("/admin/support/macros/{macro_id}")
    async def admin_delete_macro(macro_id: str, admin=Depends(get_current_admin)):
        res = await db.sup_macros.delete_one({"id": macro_id})
        if not res.deleted_count:
            raise HTTPException(404, "Macro not found")
        return {"ok": True}


    @r.get("/admin/support/tickets/{ticket_id}")
    async def admin_ticket_detail(ticket_id: str, admin=Depends(get_current_admin)):
        t = await db.sup_tickets.find_one({"id": ticket_id}, {"_id": 0})
        if not t:
            raise HTTPException(404, "Ticket not found")
        snapshot = await db.sup_tool_snapshots.find_one({"ticket_id": ticket_id}, {"_id": 0})
        attachments = []
        async for a in db.sup_attachments.find({"ticket_id": ticket_id}, {"_id": 0, "file_b64": 0}):
            attachments.append(a)
        # Admin sees BOTH public and internal, never use get_user_visible_thread here.
        thread = []
        async for m in db.sup_messages.find({"ticket_id": ticket_id}, {"_id": 0}).sort("created_at", 1):
            thread.append(m)
        triage = await db.sup_triage.find_one({"ticket_id": ticket_id}, {"_id": 0})
        defect = None
        if t.get("linked_defect_id"):
            defect = await db.sup_defects.find_one({"id": t["linked_defect_id"]}, {"_id": 0})
        return {
            "ticket": {**_ticket_public(t), "user_email": t.get("user_email"), "user_name": t.get("user_name")},
            "snapshot": snapshot,
            "attachments": attachments,
            "thread": thread,
            "triage": triage,
            "defect": defect,
        }

    @r.post("/admin/support/tickets/{ticket_id}/reply")
    async def admin_reply(
        ticket_id: str,
        body: ReplyBody,
        admin=Depends(get_current_admin),
    ):
        t = await db.sup_tickets.find_one({"id": ticket_id}, {"_id": 0})
        if not t:
            raise HTTPException(404, "Ticket not found")
        import secrets
        msg = {
            "id": secrets.token_urlsafe(12),
            "ticket_id": ticket_id,
            "author_type": "staff",
            "author_id": admin.get("id") if isinstance(admin, dict) else getattr(admin, "id", None),
            "visibility": "public",
            "body": body.body.strip(),
            "created_at": _now(),
        }
        await db.sup_messages.insert_one(msg)
        await db.sup_tickets.update_one(
            {"id": ticket_id},
            {"$set": {"status": "awaiting_user", "updated_at": _now(),
                      "last_activity_at": _now()},
             "$inc": {"message_count": 1}},
        )
        await _write_event(
            ticket_id=ticket_id,
            event_type="message_added",
            actor_type="staff",
            metadata={"visibility": "public"},
        )
        # Email the user
        first = ""
        if t.get("user_name"):
            first = t["user_name"].split(" ")[0]
        try:
            asyncio.create_task(_email_reply_notice(
                to=t["user_email"], first_name=first,
                reference=t["reference"], reply_body=body.body,
            ))
        except Exception:  # pragma: no cover
            pass
        return {"ok": True}

    @r.post("/admin/support/tickets/{ticket_id}/attachments")
    async def admin_upload_attachment(
        ticket_id: str,
        file: UploadFile = File(...),
        admin=Depends(get_current_admin),
    ):
        """Admin attaches a file (screenshot, PDF, reference doc) to a ticket."""
        t = await db.sup_tickets.find_one({"id": ticket_id}, {"_id": 0, "id": 1})
        if not t:
            raise HTTPException(404, "Ticket not found")
        att = await _persist_ticket_upload(
            ticket_id=ticket_id,
            file=file,
            actor_type="staff",
            actor_id=admin.get("id"),
        )
        await db.sup_tickets.update_one(
            {"id": ticket_id},
            {"$set": {"updated_at": _now(), "last_activity_at": _now()}},
        )
        return {"ok": True, "attachment": att}

    @r.get("/admin/support/tickets/{ticket_id}/attachments/{attachment_id}/download")
    async def admin_download_attachment(
        ticket_id: str,
        attachment_id: str,
        admin=Depends(get_current_admin),
    ):
        # Admins can pull any attachment on any ticket (no per-user guard).
        return await _stream_ticket_attachment(ticket_id, attachment_id)

    @r.post("/admin/support/tickets/{ticket_id}/notes")
    async def admin_internal_note(
        ticket_id: str,
        body: ReplyBody,
        admin=Depends(get_current_admin),
    ):
        t = await db.sup_tickets.find_one({"id": ticket_id}, {"_id": 0})
        if not t:
            raise HTTPException(404, "Ticket not found")
        import secrets
        await db.sup_messages.insert_one({
            "id": secrets.token_urlsafe(12),
            "ticket_id": ticket_id,
            "author_type": "staff",
            "author_id": admin.get("id") if isinstance(admin, dict) else getattr(admin, "id", None),
            "visibility": "internal",
            "body": body.body.strip(),
            "created_at": _now(),
        })
        await _write_event(
            ticket_id=ticket_id,
            event_type="message_added",
            actor_type="staff",
            metadata={"visibility": "internal"},
        )
        return {"ok": True}

    @r.post("/admin/support/tickets/{ticket_id}/status")
    async def admin_change_status(
        ticket_id: str,
        body: StatusBody,
        admin=Depends(get_current_admin),
    ):
        t = await db.sup_tickets.find_one({"id": ticket_id}, {"_id": 0})
        if not t:
            raise HTTPException(404, "Ticket not found")
        update = {"status": body.status, "updated_at": _now(), "last_activity_at": _now()}
        if body.status == "resolved":
            update["resolved_at"] = _now()
        if body.status == "closed":
            update["closed_at"] = _now()
        await db.sup_tickets.update_one({"id": ticket_id}, {"$set": update})

        # If transitioning to resolved, mark attachments with a purge deadline
        if body.status == "resolved":
            purge_at = (datetime.now(timezone.utc) + timedelta(days=PURGE_DAYS)).isoformat()
            await db.sup_attachments.update_many(
                {"ticket_id": ticket_id, "purge_after": None, "purged_at": None},
                {"$set": {"purge_after": purge_at}},
            )
            # Resolution message in thread + resolution email
            if body.resolution_summary:
                import secrets
                await db.sup_messages.insert_one({
                    "id": secrets.token_urlsafe(12),
                    "ticket_id": ticket_id,
                    "author_type": "staff",
                    "author_id": admin.get("id") if isinstance(admin, dict) else getattr(admin, "id", None),
                    "visibility": "public",
                    "body": body.resolution_summary.strip(),
                    "created_at": _now(),
                })
            first = (t.get("user_name") or "").split(" ")[0]
            try:
                asyncio.create_task(_email_resolution_notice(
                    to=t["user_email"], first_name=first,
                    reference=t["reference"],
                    resolution_summary=body.resolution_summary or "We have looked into your ticket.",
                ))
            except Exception:  # pragma: no cover
                pass

        await _write_event(
            ticket_id=ticket_id,
            event_type="status_changed",
            actor_type="staff",
            metadata={"from": t["status"], "to": body.status},
        )
        return {"ok": True}

    # ----------------------- Defects -----------------------
    @r.post("/admin/support/defects")
    async def admin_create_defect(body: DefectCreate, admin=Depends(get_current_admin)):
        import secrets
        ref = await _next_reference("defect")
        defect = {
            "id": secrets.token_urlsafe(12),
            "reference": ref,
            "title": body.title,
            "tool_name": body.tool_name,
            "tool_version_affected": body.tool_version_affected,
            "status": "open",
            "severity": body.severity,
            "root_cause": body.root_cause,
            "legislative_reference": body.legislative_reference,
            "resolution_note": None,
            "fixed_in_version": None,
            "created_at": _now(),
            "resolved_at": None,
        }
        await db.sup_defects.insert_one(defect)
        return {"ok": True, "defect": _strip(defect)}

    @r.get("/admin/support/defects")
    async def admin_list_defects(admin=Depends(get_current_admin)):
        rows = []
        async for d in db.sup_defects.find({}, {"_id": 0}).sort("created_at", -1):
            d["_linked_count"] = await db.sup_tickets.count_documents({"linked_defect_id": d["id"]})
            rows.append(d)
        return {"defects": rows}

    @r.post("/admin/support/tickets/{ticket_id}/link-defect")
    async def admin_link_defect(
        ticket_id: str, body: DefectLink, admin=Depends(get_current_admin),
    ):
        d = await db.sup_defects.find_one({"id": body.defect_id}, {"_id": 0, "id": 1, "reference": 1})
        if not d:
            raise HTTPException(404, "Defect not found")
        await db.sup_tickets.update_one(
            {"id": ticket_id}, {"$set": {"linked_defect_id": body.defect_id, "updated_at": _now()}},
        )
        await _write_event(
            ticket_id=ticket_id, event_type="linked_to_defect", actor_type="staff",
            metadata={"defect_id": body.defect_id, "reference": d["reference"]},
        )
        return {"ok": True}

    @r.post("/admin/support/defects/{defect_id}/resolve")
    async def admin_resolve_defect(
        defect_id: str, body: DefectResolve, admin=Depends(get_current_admin),
    ):
        d = await db.sup_defects.find_one({"id": defect_id}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Defect not found")
        await db.sup_defects.update_one(
            {"id": defect_id},
            {"$set": {
                "status": "fixed",
                "resolution_note": body.resolution_note,
                "fixed_in_version": body.fixed_in_version,
                "resolved_at": _now(),
            }},
        )
        # Resolve all linked tickets + notify reporters
        affected = 0
        purge_at = (datetime.now(timezone.utc) + timedelta(days=PURGE_DAYS)).isoformat()
        async for t in db.sup_tickets.find({"linked_defect_id": defect_id, "status": {"$ne": "resolved"}}, {"_id": 0}):
            await db.sup_tickets.update_one(
                {"id": t["id"]},
                {"$set": {"status": "resolved", "resolved_at": _now(), "updated_at": _now()}},
            )
            await db.sup_attachments.update_many(
                {"ticket_id": t["id"], "purge_after": None, "purged_at": None},
                {"$set": {"purge_after": purge_at}},
            )
            import secrets
            await db.sup_messages.insert_one({
                "id": secrets.token_urlsafe(12),
                "ticket_id": t["id"],
                "author_type": "staff",
                "author_id": None,
                "visibility": "public",
                "body": body.resolution_note,
                "created_at": _now(),
            })
            await _write_event(
                ticket_id=t["id"],
                event_type="status_changed",
                actor_type="staff",
                metadata={"from": t["status"], "to": "resolved", "via_defect": d["reference"]},
            )
            if body.notify_reporters and t.get("user_email"):
                first = (t.get("user_name") or "").split(" ")[0]
                try:
                    asyncio.create_task(_email_resolution_notice(
                        to=t["user_email"], first_name=first,
                        reference=t["reference"], resolution_summary=body.resolution_note,
                    ))
                except Exception:  # pragma: no cover
                    pass
            affected += 1
        return {"ok": True, "tickets_resolved": affected}

    # ----------------------- Triage human-agreed feedback -----------------------
    @r.post("/admin/support/tickets/{ticket_id}/triage/agree")
    async def admin_triage_agree(ticket_id: str, body: TriageAgree, admin=Depends(get_current_admin)):
        res = await db.sup_triage.update_one(
            {"ticket_id": ticket_id},
            {"$set": {"human_agreed": body.human_agreed}},
        )
        if not res.matched_count:
            raise HTTPException(404, "No triage row for this ticket.")
        return {"ok": True}

    # ------------------------------------------------------------------
    # ADMIN - retention purge trigger (item 23)
    # ------------------------------------------------------------------
    @r.post("/admin/support/retention/purge")
    async def admin_retention_purge_trigger(admin=Depends(get_current_admin)):  # noqa: ARG001
        """Manually run the sup_attachments retention purge. Wired to the
        Support console 'Purge expired attachments now' button and
        exercised nightly by the trial_scheduler cron in server.py."""
        count = await purge_expired_attachments()
        return {"ok": True, "purged": count}

    @r.get("/admin/support/retention/status")
    async def admin_retention_status(admin=Depends(get_current_admin)):  # noqa: ARG001
        """Retention window and pending-purge counters."""
        now = _now()
        total = await db.sup_attachments.count_documents({})
        pending = await db.sup_attachments.count_documents({
            "purge_after": {"$lt": now}, "purged_at": None,
        })
        purged = await db.sup_attachments.count_documents({
            "purged_at": {"$ne": None},
        })
        return {
            "checked_at": now,
            "attachments_total": total,
            "attachments_pending_purge": pending,
            "attachments_already_purged": purged,
        }

    return r
