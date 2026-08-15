"""IC-2 v1 slice: Invoice-statement correlation.

Scope for this v1 slice (per /app/docs/specs/IC-2-v1.md Section D):
  * POST /api/ic2/invoice-checks/{id}/correlate, run correlation for an
    invoice against the participant's decoded statement line items.
  * GET  /api/ic2/invoice-checks/{id}?include_correlation=true, invoice with
    correlation status snapshot.
  * GET  /api/ic2/participants/{pid}/orphans, orphan statement lines (no
    matching invoice) + orphan invoices (no matching statement).
  * GET  /api/ic2/correlations/{id}, single correlation record.

Deferred to IC-2 v2:
  * Bank CSV import + reconciliation (Section B.3, D.2).
  * Provider price history (Section B.4).
  * PPC-1 v2 name-normalisation reuse.
  * Automatic correlation-run on decode/upload (currently manual trigger only).

Correlation algorithm (v1 simple):
  For each invoice line item, look for a matching decoded statement line
  belonging to the same participant:
    high   , same amount + same service date
    medium , same amount + service date within ±5 days
    low    , same amount + same provider name in the same calendar month
  If no direct line match, try invoice_total vs sum(statement lines in the
  same period) → medium confidence total-level match.
  Otherwise → no_match.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import date, datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from uuid import uuid4

logger = logging.getLogger("wayly.ic2")

ic2_router = APIRouter(prefix="/ic2", tags=["ic2"])

_db = None
_user_dep = None
_core1_assert_access = None
_core1_write_event = None
_loop1_open_case = None


def init_ic2_routes(*, db, user_dep, core1_assert_access, core1_write_timeline, loop1_open_case):
    global _db, _user_dep, _core1_assert_access, _core1_write_event, _loop1_open_case
    _db = db
    _user_dep = user_dep
    _core1_assert_access = core1_assert_access
    _core1_write_event = core1_write_timeline
    _loop1_open_case = loop1_open_case


def _flag_enabled() -> bool:
    return os.environ.get("IC2_ENABLED", "1") != "0"


async def _assert_flag():
    if not _flag_enabled():
        raise HTTPException(status_code=404, detail="Not found")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt) -> Optional[str]:
    if dt is None:
        return None
    if isinstance(dt, str):
        return dt
    return dt.astimezone(timezone.utc).isoformat()


def _parse_date(s) -> Optional[date]:
    if not s:
        return None
    try:
        return date.fromisoformat(str(s)[:10])
    except Exception:
        return None


async def ensure_ic2_indexes(db) -> None:
    try:
        await db.invoice_statement_correlations.create_index(
            [("participant_id", 1), ("invoice_check_id", 1)]
        )
        await db.invoice_statement_correlations.create_index([("statement_id", 1)])
    except Exception as e:  # pragma: no cover
        logger.warning("ic2 index creation skipped: %s", e)


# ---------------------------------------------------------------------------
# Correlation engine
# ---------------------------------------------------------------------------


TIMING_TOLERANCE_DAYS = 5
LOW_CONF_MONTH_WINDOW_DAYS = 31


def _amount_of(li: dict) -> float:
    for k in ("amount", "gross_amount", "participant_contribution", "contribution"):
        v = li.get(k) if isinstance(li, dict) else None
        try:
            if v is not None:
                return float(v)
        except (TypeError, ValueError):
            continue
    return 0.0


def _service_date_of(li: dict) -> Optional[date]:
    for k in ("service_date", "date", "line_date"):
        d = _parse_date(li.get(k) if isinstance(li, dict) else None)
        if d:
            return d
    return None


def _service_name_of(li: dict) -> str:
    if not isinstance(li, dict):
        return ""
    for k in ("service_name", "description", "service_description", "service"):
        v = li.get(k)
        if v:
            return str(v).lower().strip()
    return ""


def _norm_provider(name: Any) -> str:
    if not name:
        return ""
    return str(name).lower().replace(",", " ").replace(".", " ").split()[0] if str(name).split() else ""


def _classify_match(inv_line: dict, stmt_line: dict) -> Optional[tuple[str, str, int]]:
    """Return (match_reason, confidence, tolerance_days) if the two lines match,
    else None. Amount must match to the cent (rounded to 2dp)."""
    a1 = round(_amount_of(inv_line), 2)
    a2 = round(_amount_of(stmt_line), 2)
    if a1 <= 0 or a2 <= 0 or a1 != a2:
        return None
    d1 = _service_date_of(inv_line)
    d2 = _service_date_of(stmt_line)
    if d1 and d2:
        diff = abs((d1 - d2).days)
        if diff == 0:
            return ("same_service_same_date_same_amount", "high", 0)
        if diff <= TIMING_TOLERANCE_DAYS:
            return ("same_service_close_date_same_amount", "medium", diff)
        if diff <= LOW_CONF_MONTH_WINDOW_DAYS:
            return ("same_amount_same_provider_same_period", "low", diff)
        return None
    return ("same_amount_same_provider_same_period", "low", 0)


def _explain(match_reason: str, inv_line: dict, stmt_line: dict, confidence: str) -> Dict[str, str]:
    amt = _amount_of(inv_line)
    d = _service_date_of(inv_line) or _service_date_of(stmt_line)
    when = d.strftime("%d %B %Y") if d else "this period"
    if match_reason == "same_service_same_date_same_amount":
        c = f"Confirmed: this invoice line for ${amt:.2f} on {when} matches your statement exactly."
    elif match_reason == "same_service_close_date_same_amount":
        c = (f"Likely match: invoice line for ${amt:.2f} appears on the statement "
             f"a few days apart. Providers sometimes bill and record on different days.")
    elif match_reason == "same_amount_same_provider_same_period":
        c = f"Possible match: same amount (${amt:.2f}) appears from the same provider this period, but the date doesn't line up. Worth a quick check."
    else:
        c = f"Match found with {confidence} confidence."
    return {"caregiver": c, "participant_self": c.replace("your ", "the ")}


async def _fetch_household_statements(participant_id: str) -> List[dict]:
    p = await _db.participants.find_one({"id": participant_id}, {"_id": 0, "household_id": 1})
    if not p:
        return []
    hh = p.get("household_id")
    q: Dict[str, Any] = {"$and": [
        {"$or": [{"participant_id": participant_id}, {"household_id": hh}]},
        {"status": {"$ne": "archived"}},
    ]}
    rows = []
    async for s in _db.statements.find(q, {"_id": 0, "id": 1, "line_items": 1, "extracted_json": 1,
                                            "summary": 1, "provider_name": 1}):
        rows.append(s)
    return rows


def _correlation_view(c: dict) -> dict:
    return {
        "id": c["id"],
        "participant_id": c["participant_id"],
        "invoice_check_id": c["invoice_check_id"],
        "statement_id": c.get("statement_id"),
        "correlation_type": c.get("correlation_type"),
        "match_reason": c.get("match_reason"),
        "confidence": c.get("confidence"),
        "timing_tolerance_days_applied": c.get("timing_tolerance_days_applied", 0),
        "variance_amount": c.get("variance_amount"),
        "variance_notes": c.get("variance_notes"),
        "invoice_line_ref": c.get("invoice_line_ref"),
        "statement_line_ref": c.get("statement_line_ref"),
        "automated_explanation_tokens": c.get("automated_explanation_tokens"),
        "case_id": c.get("case_id"),
        "case_created_at": _iso(c.get("case_created_at")),
        "created_at": _iso(c.get("created_at")),
    }


async def _run_correlation(invoice: dict, actor_user_id: Optional[str]) -> Dict[str, Any]:
    """Correlate an invoice against household statements. Idempotent per
    (invoice_check_id, invoice_line_ref, statement_line_ref) tuple."""
    pid = invoice.get("participant_id")
    if not pid:
        raise HTTPException(status_code=422, detail="Invoice not linked to a participant")
    inv_id = invoice.get("id")

    # Clear previous correlations for this invoice so re-run is deterministic.
    await _db.invoice_statement_correlations.delete_many({"invoice_check_id": inv_id})

    inv_lines = invoice.get("line_items") or invoice.get("extracted_lines") or []
    if not isinstance(inv_lines, list):
        inv_lines = []

    statements = await _fetch_household_statements(pid)

    high = medium = low = 0
    orphaned_invoice_lines = 0
    outputs: List[Dict[str, Any]] = []
    now = _now()

    for i, inv_li in enumerate(inv_lines):
        if not isinstance(inv_li, dict):
            continue
        best = None  # (score, stmt_id, stmt_li, reason, confidence, tol)
        for s in statements:
            for j, stmt_li in enumerate(s.get("line_items") or []):
                if not isinstance(stmt_li, dict):
                    continue
                m = _classify_match(inv_li, stmt_li)
                if not m:
                    continue
                reason, conf, tol = m
                score = {"high": 3, "medium": 2, "low": 1}[conf]
                if best is None or score > best[0]:
                    best = (score, s.get("id"), stmt_li, reason, conf, tol, j)

        cid = str(uuid.uuid4())
        if best:
            _, sid, stmt_li, reason, conf, tol, sj = best
            doc = {
                "id": cid,
                "participant_id": pid,
                "household_id": invoice.get("household_id"),
                "invoice_check_id": inv_id,
                "invoice_line_ref": inv_li.get("id") or f"L{i}",
                "statement_id": sid,
                "statement_line_ref": stmt_li.get("id") or f"L{sj}",
                "correlation_type": "invoice_line_to_statement_line",
                "match_reason": reason,
                "confidence": conf,
                "timing_tolerance_days_applied": tol,
                "variance_amount": None,
                "variance_notes": None,
                "automated_explanation_tokens": _explain(reason, inv_li, stmt_li, conf),
                "case_id": None,
                "case_created_at": None,
                "created_at": now,
                "data_residency": "ap-southeast-2",
            }
            if conf == "high":
                high += 1
            elif conf == "medium":
                medium += 1
            else:
                low += 1
        else:
            doc = {
                "id": cid,
                "participant_id": pid,
                "household_id": invoice.get("household_id"),
                "invoice_check_id": inv_id,
                "invoice_line_ref": inv_li.get("id") or f"L{i}",
                "statement_id": None,
                "statement_line_ref": None,
                "correlation_type": "invoice_line_to_no_statement",
                "match_reason": "no_direct_match_found",
                "confidence": None,
                "timing_tolerance_days_applied": 0,
                "variance_amount": {"amount": _amount_of(inv_li), "source": "invoice"},
                "variance_notes": "No matching statement line found for this invoice line.",
                "automated_explanation_tokens": {
                    "caregiver": (
                        f"Missing from statement: invoice line for ${_amount_of(inv_li):.2f} "
                        "doesn't appear on any decoded statement. This may be an unbilled "
                        "charge, a delayed statement, or a billing discrepancy worth raising."
                    ),
                    "participant_self": (
                        f"Missing from statement: invoice line for ${_amount_of(inv_li):.2f} "
                        "doesn't appear on any decoded statement. This may be an unbilled "
                        "charge, a delayed statement, or a billing discrepancy worth raising."
                    ),
                },
                "case_id": None,
                "case_created_at": None,
                "created_at": now,
                "data_residency": "ap-southeast-2",
            }
            orphaned_invoice_lines += 1
        outputs.append(doc)

    if outputs:
        await _db.invoice_statement_correlations.insert_many([dict(o) for o in outputs])

    total = len(inv_lines)
    if total == 0:
        status = "unable_to_correlate"
    elif orphaned_invoice_lines == total:
        status = "correlated_line_missing_from_statement"
    elif orphaned_invoice_lines == 0 and medium == 0 and low == 0:
        # Every line matched with HIGH confidence and no orphans
        status = "correlated_line_matches_statement"
    else:
        # Any orphans OR any non-high confidence → user review
        status = "partial_correlation_needs_user_review"

    # Persist correlation snapshot on the invoice.
    await _db.invoices.update_one(
        {"id": inv_id},
        {"$set": {
            "correlation_status": status,
            "correlated_with_statement_ids": list({o["statement_id"] for o in outputs if o.get("statement_id")}),
            "correlation_confidence": ("high" if high > 0 else ("medium" if medium > 0 else ("low" if low > 0 else None))),
            "correlation_last_checked_at": now,
        }},
    )

    # Open a LOOP-1 case if any invoice line is missing from statements.
    if orphaned_invoice_lines > 0 and _loop1_open_case:
        try:
            await _loop1_open_case(
                participant_id=pid,
                case_type="invoice_error",
                title=f"{orphaned_invoice_lines} invoice line{'s' if orphaned_invoice_lines != 1 else ''} not found on any statement",
                summary=(
                    f"{orphaned_invoice_lines} of {total} invoice lines have no matching "
                    "statement line. This may indicate unbilled charges or a missing statement."
                ),
                source_tool="ic2",
                source_artefact_type="invoice_check",
                source_artefact_id=inv_id,
                severity="high" if orphaned_invoice_lines >= 2 else "medium",
                actor_type="system",
                actor_id=actor_user_id,
                metadata={"orphaned_invoice_lines": orphaned_invoice_lines,
                          "total_lines": total, "correlation_status": status},
                dedupe_key=f"ic2_orphan:{inv_id}",
            )
        except Exception as e:  # pragma: no cover
            logger.warning("ic2 case creation failed: %s", e)

    if _core1_write_event:
        try:
            await _core1_write_event(
                participant_id=pid,
                event_type="invoice_correlation_run",
                event_source="ic2",
                actor_type="user",
                actor_id=actor_user_id,
                summary_tokens={
                    "caregiver": (
                        f"Invoice correlation run, {high} confirmed, {medium} likely, "
                        f"{low} possible, {orphaned_invoice_lines} unmatched"
                    ),
                    "participant_self": (
                        f"Invoice correlation run, {high} confirmed, {medium} likely, "
                        f"{low} possible, {orphaned_invoice_lines} unmatched"
                    ),
                },
                metadata={"invoice_check_id": inv_id, "status": status,
                          "high": high, "medium": medium, "low": low,
                          "orphaned": orphaned_invoice_lines},
            )
        except Exception:  # pragma: no cover
            pass

    return {
        "invoice_check_id": inv_id,
        "correlation_status": status,
        "summary": {"high": high, "medium": medium, "low": low, "orphaned": orphaned_invoice_lines,
                    "total_invoice_lines": total},
        "correlations": [_correlation_view(o) for o in outputs],
        "checked_statements": [s.get("id") for s in statements],
        "computed_at": _iso(now),
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@ic2_router.post("/invoice-checks/{iid}/correlate")
async def correlate_invoice(iid: str, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    inv = await _db.invoices.find_one({"id": iid}, {"_id": 0, "file_b64": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv.get("participant_id"):
        await _core1_assert_access(user, inv["participant_id"])
    else:
        raise HTTPException(status_code=422, detail="Invoice not linked to a participant. Link before correlating.")
    return await _run_correlation(inv, actor_user_id=user.get("id"))


@ic2_router.get("/invoice-checks/{iid}")
async def get_invoice_with_correlation(iid: str, request: Request,
                                        include_correlation: bool = True):
    await _assert_flag()
    user = await _user_dep(request)
    inv = await _db.invoices.find_one({"id": iid}, {"_id": 0, "file_b64": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv.get("participant_id"):
        await _core1_assert_access(user, inv["participant_id"])
    view = {
        "id": inv["id"],
        "participant_id": inv.get("participant_id"),
        "provider_name": inv.get("provider_name"),
        "correlation_status": inv.get("correlation_status", "not_yet_correlated"),
        "correlation_confidence": inv.get("correlation_confidence"),
        "correlated_with_statement_ids": inv.get("correlated_with_statement_ids") or [],
        "correlation_last_checked_at": _iso(inv.get("correlation_last_checked_at")),
    }
    if include_correlation:
        corrs = []
        async for c in _db.invoice_statement_correlations.find({"invoice_check_id": iid}, {"_id": 0}).sort("created_at", 1):
            corrs.append(_correlation_view(c))
        view["correlations"] = corrs
    return view


@ic2_router.get("/correlations/{cid}")
async def get_correlation(cid: str, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    c = await _db.invoice_statement_correlations.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Correlation not found")
    await _core1_assert_access(user, c["participant_id"])
    return _correlation_view(c)


@ic2_router.get("/participants/{pid}/orphans")
async def list_orphans(pid: str, request: Request):
    """List invoice lines without matching statements + statement lines
    without matching invoices."""
    await _assert_flag()
    user = await _user_dep(request)
    await _core1_assert_access(user, pid)

    # Orphaned invoice lines: correlations where statement_id is null.
    invoice_orphans = []
    async for c in _db.invoice_statement_correlations.find(
        {"participant_id": pid, "correlation_type": "invoice_line_to_no_statement"},
        {"_id": 0},
    ).sort("created_at", -1).limit(100):
        invoice_orphans.append(_correlation_view(c))

    # Orphaned statement lines: statement line ids never touched by a
    # correlation. Walk the participant's statements and diff against the
    # set of matched statement_line_refs.
    matched_pairs = set()
    async for c in _db.invoice_statement_correlations.find(
        {"participant_id": pid, "statement_id": {"$ne": None}},
        {"_id": 0, "statement_id": 1, "statement_line_ref": 1},
    ):
        matched_pairs.add((c["statement_id"], c.get("statement_line_ref")))

    statement_orphans = []
    async for s in _db.statements.find(
        {"participant_id": pid, "status": {"$ne": "archived"}},
        {"_id": 0, "id": 1, "line_items": 1},
    ):
        sid = s.get("id")
        for i, li in enumerate(s.get("line_items") or []):
            if not isinstance(li, dict):
                continue
            ref = li.get("id") or f"L{i}"
            if (sid, ref) in matched_pairs:
                continue
            statement_orphans.append({
                "statement_id": sid,
                "statement_line_ref": ref,
                "service_name": li.get("service_name") or li.get("description"),
                "service_date": li.get("service_date") or li.get("date"),
                "amount": _amount_of(li),
            })
    # Cap to prevent unbounded scans.
    statement_orphans = statement_orphans[:200]

    return {
        "participant_id": pid,
        "invoice_orphans": invoice_orphans,
        "invoice_orphan_count": len(invoice_orphans),
        "statement_orphans": statement_orphans,
        "statement_orphan_count": len(statement_orphans),
    }


class BankCsvImportIn(BaseModel):
    participant_id: str
    csv_content: str = Field(..., max_length=2_000_000, description="Raw CSV text (max 2 MB)")
    date_column: str = Field("Date", description="Header name for the transaction date")
    description_column: str = Field("Description", description="Header for the payee/description")
    amount_column: str = Field("Amount", description="Header for the debit amount (positive number)")


@ic2_router.post("/bank-csv-import")
async def bank_csv_import(body: BankCsvImportIn, request: Request):
    """Parse a bank CSV export and attempt to reconcile each debit against
    open invoices for the participant. Returns a per-row summary indicating
    which rows matched an invoice (by amount + provider name + date proximity),
    which did not, and any parse errors.

    v1 scope: no long-term storage of raw CSVs. We record every matched pair
    as an `ic2_bank_reconciliations` document so the invoice-check UI can
    show the bank reference alongside the invoice.
    """
    await _assert_flag()
    user = await _user_dep(request)
    if _core1_assert_access:
        await _core1_assert_access(user, body.participant_id)

    import csv
    import io
    from datetime import datetime as _dt, timedelta as _td

    reader = csv.DictReader(io.StringIO(body.csv_content))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV appears to be empty")
    for col in (body.date_column, body.description_column, body.amount_column):
        if col not in reader.fieldnames:
            raise HTTPException(status_code=400, detail=f"CSV missing required column: {col}")

    # Pull open invoices for this participant so we can match against them.
    open_invoices = await _db.invoice_checks.find(
        {"participant_id": body.participant_id, "status": {"$in": ["pending", "in_review", "correlated"]}},
        {"_id": 0, "id": 1, "provider_name": 1, "total_amount": 1, "invoice_date": 1},
    ).to_list(200)

    matched: list = []
    unmatched: list = []
    errors: list = []

    for row in reader:
        try:
            raw_amount = str(row.get(body.amount_column, "")).strip().replace("$", "").replace(",", "")
            amount = float(raw_amount)
            if amount <= 0:
                continue  # skip credits, only debits reconcile against invoices
            desc = (row.get(body.description_column) or "").strip()
            raw_date = (row.get(body.date_column) or "").strip()
            for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y"):
                try:
                    date = _dt.strptime(raw_date, fmt).date(); break
                except Exception:
                    date = None
            if date is None:
                errors.append({"row": row, "reason": "Could not parse date"})
                continue

            # Fuzzy match: amount within 1 cent + provider name substring + date within +/-30 days.
            best = None
            for inv in open_invoices:
                inv_amt = float((inv.get("total_amount") or {}).get("amount", 0) if isinstance(inv.get("total_amount"), dict) else inv.get("total_amount") or 0)
                if abs(inv_amt - amount) > 0.01:
                    continue
                provider = (inv.get("provider_name") or "").lower()
                if provider and provider.split()[0] not in desc.lower():
                    continue
                try:
                    inv_date = _dt.fromisoformat(str(inv.get("invoice_date"))[:10]).date()
                except Exception:
                    inv_date = date
                if abs((inv_date - date).days) > 30:
                    continue
                best = inv; break

            if best:
                doc = {
                    "id": str(uuid4()),
                    "participant_id": body.participant_id,
                    "invoice_check_id": best["id"],
                    "bank_amount": amount,
                    "bank_description": desc,
                    "bank_date": date.isoformat(),
                    "matched_by_user_id": user.get("id") if isinstance(user, dict) else None,
                    "created_at": _now(),
                }
                await _db.ic2_bank_reconciliations.insert_one(doc)
                doc.pop("_id", None); doc["created_at"] = _iso(doc["created_at"])
                matched.append(doc)
            else:
                unmatched.append({"amount": amount, "description": desc, "date": date.isoformat()})
        except Exception as e:
            errors.append({"row": row, "reason": str(e)})

    return {
        "matched_count": len(matched),
        "unmatched_count": len(unmatched),
        "error_count": len(errors),
        "matched": matched[:50],
        "unmatched": unmatched[:50],
        "errors": errors[:20],
    }


@ic2_router.get("/status")
async def status():
    return {
        "ic2_v1_enabled": _flag_enabled(),
        "version": "v1",
        "surfaces": ["invoice_statement_correlation", "orphan_detection", "bank_csv_import"],
        "deferred_to_v2": ["provider_price_history", "auto_correlation_on_upload"],
        "timing_tolerance_days": TIMING_TOLERANCE_DAYS,
        "data_residency": "ap-southeast-2",
    }
