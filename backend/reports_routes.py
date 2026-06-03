"""Reports — 8 PDF reports with in-app preview.

Architecture:
- Two Mongo collections: `generated_reports` (one doc per report), `report_sections` (per-section computed JSON).
- Each report type has a builder that gathers the data + writes pre-computed sections,
  then renders an HTML template (Jinja2) and prints to PDF via headless Chrome.
- PDFs stored on local disk at /app/backend/storage/reports/{report_id}.pdf
  served back via a token-signed download endpoint (mocks S3 presigned URLs).
- Plain-English executive summary generated once via Claude Haiku and cached
  in the EXEC_SUMMARY section.
"""
import os
import uuid
import json
import asyncio
import subprocess
import logging
from datetime import datetime, timezone, date, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel

import jinja2

from auth import get_current_user_id
import budget as budget_lib

logger = logging.getLogger("wayly.reports")

# ----- Mongo handle (re-uses the same env vars as server.py) --------------
_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]

# ----- Storage ------------------------------------------------------------
STORAGE_DIR = Path("/app/backend/storage/reports")
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

# Optional S3 upload — activates when REPORTS_S3_BUCKET is set in the env.
# When inactive, the existing token-signed local endpoint serves the PDF.
S3_BUCKET = os.environ.get("REPORTS_S3_BUCKET")
S3_REGION = os.environ.get("AWS_REGION") or os.environ.get("REPORTS_S3_REGION")
S3_PREFIX = os.environ.get("REPORTS_S3_PREFIX", "reports/")
_s3_client = None


def _get_s3():
    """Lazy boto3 client. Returns None if boto3 is not installed or env not set."""
    global _s3_client
    if not S3_BUCKET:
        return None
    if _s3_client is not None:
        return _s3_client
    try:
        import boto3  # type: ignore
        _s3_client = boto3.client("s3", region_name=S3_REGION) if S3_REGION else boto3.client("s3")
        return _s3_client
    except Exception as e:
        logger.warning(f"S3 client unavailable, falling back to local storage: {e}")
        return None


def _upload_to_s3(pdf_path: Path, key: str) -> Optional[str]:
    """Upload the local PDF to S3 and return the S3 URI (s3://bucket/key) or None on failure."""
    s3 = _get_s3()
    if not s3:
        return None
    try:
        s3.upload_file(str(pdf_path), S3_BUCKET, key, ExtraArgs={"ContentType": "application/pdf"})
        return f"s3://{S3_BUCKET}/{key}"
    except Exception as e:
        logger.warning(f"S3 upload failed: {e}")
        return None


def _presign_s3(key: str, expires_in: int = 900) -> Optional[str]:
    s3 = _get_s3()
    if not s3:
        return None
    try:
        return s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": S3_BUCKET, "Key": key},
            ExpiresIn=expires_in,
        )
    except Exception as e:
        logger.warning(f"S3 presign failed: {e}")
        return None

REPORT_TYPES = {
    "HOUSEHOLD_SUMMARY": "Household Summary",
    "QUARTERLY_BUDGET": "Quarterly Budget Report",
    "ANNUAL_FINANCIAL": "Annual Financial Summary",
    "ANOMALY_SAVINGS": "Anomaly & Savings Report",
    "PROVIDER_PERFORMANCE": "Provider Performance Report",
    "COMPLAINT_DOSSIER": "Complaint & Correspondence Dossier",
    "CARE_TIMELINE": "Care Timeline",
    "STATEMENT_DIGEST": "Statement Digest",
}

# Templates directory (created below).
TEMPLATES_DIR = Path(__file__).parent / "report_templates"
TEMPLATES_DIR.mkdir(exist_ok=True)

_jinja = jinja2.Environment(
    loader=jinja2.FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=True,
)


# ----- Helpers ------------------------------------------------------------
def _fmt_money(v: Any) -> str:
    try:
        n = float(v or 0)
        return f"${n:,.2f}"
    except (TypeError, ValueError):
        return "$0.00"


def _fmt_int(v: Any) -> str:
    try:
        return f"{int(v or 0):,}"
    except (TypeError, ValueError):
        return "0"


def _fmt_date(v: Any) -> str:
    if not v:
        return "—"
    try:
        if isinstance(v, str):
            d = datetime.fromisoformat(v.replace("Z", "+00:00"))
        elif isinstance(v, datetime):
            d = v
        else:
            return str(v)
        return d.strftime("%-d %b %Y")
    except Exception:
        return str(v)


_jinja.filters["money"] = _fmt_money
_jinja.filters["intf"] = _fmt_int
_jinja.filters["niceDate"] = _fmt_date


def _traffic(pct: float, kind: str = "budget") -> str:
    """Traffic light colour based on the percentage and the metric kind.
    Returns one of: 'green', 'amber', 'red'.
    """
    p = float(pct or 0)
    if kind == "budget":
        if p < 80:
            return "green"
        if p <= 95:
            return "amber"
        return "red"
    if kind == "care_mgmt":
        if p < 85:
            return "green"
        if p < 100:
            return "amber"
        return "red"
    return "green"


def _quarter_for(d: date) -> Tuple[str, int, date, date]:
    """Australian financial year quarters (Jul-start)."""
    y = d.year
    # FY runs Jul (year-1 if month<7) to Jun.
    fy = y if d.month >= 7 else y
    # Map calendar month -> Q1=Jul-Sep, Q2=Oct-Dec, Q3=Jan-Mar, Q4=Apr-Jun
    if d.month in (7, 8, 9):
        return "Q1", fy + 1, date(fy, 7, 1), date(fy, 9, 30)
    if d.month in (10, 11, 12):
        return "Q2", fy + 1, date(fy, 10, 1), date(fy, 12, 31)
    if d.month in (1, 2, 3):
        return "Q3", fy, date(fy, 1, 1), date(fy, 3, 31)
    return "Q4", fy, date(fy, 4, 1), date(fy, 6, 30)


def _new_id() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ----- AI summary (Claude Haiku via emergentintegrations) -----------------
async def _ai_summary(prompt_facts: str) -> str:
    """Generate a 3-5 sentence plain-English summary. Falls back gracefully if LLM is unavailable."""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        key = os.environ.get("EMERGENT_LLM_KEY")
        if not key:
            return ""
        chat = LlmChat(
            api_key=key,
            session_id=f"report-summary-{_new_id()[:8]}",
            system_message=(
                "You are writing a plain-English executive summary for an "
                "Australian family caregiver managing their elderly parent's "
                "Support at Home care. The summary must be warm, direct and "
                "free of jargon. Write 3 to 5 sentences only. Do not use bullet "
                "points. Do not start with 'This report'. Do not repeat the "
                "report title. Interpret the data — say what it means for the "
                "family, not just what the numbers are. Flag the most important "
                "thing they should pay attention to. Do not use em-dashes or "
                "markdown formatting. Write as a kind, well-informed family friend."
            ),
        ).with_model("anthropic", "claude-haiku-4-5-20251001")
        reply = await chat.send_message(UserMessage(text=prompt_facts))
        return (reply or "").strip()
    except Exception as e:
        logger.warning(f"AI summary failed, using fallback: {e}")
        return ""


# ----- Data gathering ------------------------------------------------------
async def _get_household(participant_id: str) -> Optional[dict]:
    p = await db.participants.find_one({"id": participant_id}, {"_id": 0})
    if not p:
        return None
    hid = p.get("household_id")
    if not hid:
        return p
    h = await db.households.find_one({"id": hid}, {"_id": 0})
    if h:
        # Merge participant + household snapshot (participant wins on conflicts).
        merged = {**h, **{k: v for k, v in p.items() if v}}
        merged["household"] = h
        merged["participant"] = p
        return merged
    return p


async def _statements_for(participant_id: str, household_id: Optional[str], start: Optional[date] = None, end: Optional[date] = None) -> List[dict]:
    q: Dict[str, Any] = {}
    if household_id:
        q["household_id"] = household_id
    # Statements pre-participant rows live with the household; isolate primary's view.
    cursor = db.statements.find(q, {"_id": 0, "file_b64": 0}).sort("uploaded_at", -1)
    docs = await cursor.to_list(500)
    out: List[dict] = []
    for s in docs:
        if not isinstance(s, dict):
            continue
        # Sanitize: enforce dict shape on line_items + anomalies (legacy docs
        # occasionally store stringified payloads).
        s["line_items"] = [li for li in (s.get("line_items") or []) if isinstance(li, dict)]
        s["anomalies"] = [a for a in (s.get("anomalies") or []) if isinstance(a, dict)]
        # Filter by participant_id if explicitly set
        sp = s.get("participant_id")
        if sp and sp != participant_id:
            continue
        if start or end:
            # Use uploaded_at as a proxy when statement_period is missing.
            try:
                up = s.get("uploaded_at")
                if isinstance(up, str):
                    d = datetime.fromisoformat(up.replace("Z", "+00:00")).date()
                elif isinstance(up, datetime):
                    d = up.date()
                else:
                    continue
                if start and d < start:
                    continue
                if end and d > end:
                    continue
            except Exception:
                pass
        out.append(s)
    return out


def _classify_anomaly_status(a: dict) -> str:
    """Resolved | pending | escalated | informational"""
    s = (a.get("status") or "").lower()
    if s in ("resolved", "credited", "closed"):
        return "resolved"
    if s in ("escalated", "opan", "acqsc"):
        return "escalated"
    if (a.get("severity") or "").upper() == "LOW" and not (a.get("dollar_impact") or 0):
        return "informational"
    return "pending"


# ----- PDF rendering -------------------------------------------------------
async def _render_pdf(html_path: Path, pdf_path: Path, *, landscape: bool = False) -> None:
    """Run headless Chrome to print the HTML to PDF. Equivalent to Puppeteer."""
    chrome = os.environ.get("CHROME_BIN") or "/usr/bin/google-chrome"
    if not Path(chrome).exists():
        chrome = "/root/bin/chromium"
    args = [
        chrome,
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--no-pdf-header-footer",
        "--hide-scrollbars",
        f"--print-to-pdf={pdf_path}",
    ]
    if landscape:
        args.append("--print-to-pdf-no-header")
        args.append("--landscape")
    args.append(f"file://{html_path}")
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        await asyncio.wait_for(proc.communicate(), timeout=45)
    except asyncio.TimeoutError:
        proc.kill()
        raise HTTPException(status_code=500, detail="PDF rendering timed out")
    if not pdf_path.exists():
        raise HTTPException(status_code=500, detail="PDF rendering failed")


# ----- Builders ------------------------------------------------------------
async def _build_household_summary(report: dict, params: dict) -> Dict[str, Any]:
    p_id = report["participant_id"]
    ctx = await _get_household(p_id) or {}
    p = ctx.get("participant", {}) or ctx
    h = ctx.get("household", {}) or ctx

    classification = h.get("classification") or 4
    _, _, q_start, q_end = _quarter_for(date.today())
    stmts = await _statements_for(p_id, h.get("id"), q_start, q_end)

    # Burn this quarter
    line_items: List[dict] = []
    for s in stmts:
        line_items.extend(s.get("line_items") or [])
    burn = budget_lib.compute_burn(line_items, q_start, q_end)
    total_spent = sum(burn.values())
    q_total = budget_lib.quarterly_budget(classification)
    pct = (total_spent / q_total * 100) if q_total else 0

    # Anomalies this quarter
    anomalies: List[dict] = []
    for s in stmts:
        anomalies.extend(s.get("anomalies") or [])
    highest_sev = "LOW"
    for a in anomalies:
        sev = (a.get("severity") or "LOW").upper()
        if sev == "HIGH":
            highest_sev = "HIGH"
            break
        if sev == "MEDIUM" and highest_sev != "HIGH":
            highest_sev = "MEDIUM"

    # Care team
    care_team = await db.care_team_members.find({"household_id": h.get("id")}, {"_id": 0}).to_list(20) if h.get("id") else []

    # Concerns
    concerns_q = {"household_id": h.get("id")} if h.get("id") else {}
    concerns = await db.concern_log.find(concerns_q, {"_id": 0}).sort("created_at", -1).to_list(3)
    open_concerns_count = await db.concern_log.count_documents({**concerns_q, "status": {"$nin": ["resolved", "closed"]}}) if h.get("id") else 0

    # Hospital admissions (last 12 months)
    cutoff = _now() - timedelta(days=365)
    hospital_q = {"household_id": h.get("id"), "admitted_at": {"$gte": cutoff.isoformat()}} if h.get("id") else {}
    hospitalisations = await db.hospital_admissions.find(hospital_q, {"_id": 0}).sort("admitted_at", -1).to_list(10)

    # AT-HM commitments
    athm = await db.athm_commitments.find({"household_id": h.get("id")} if h.get("id") else {}, {"_id": 0}).sort("expires_at", 1).to_list(20)
    active_athm = [a for a in athm if (a.get("status") or "").upper() != "EXPIRED"][:1]
    next_athm = active_athm[0] if active_athm else None

    # Calendar (next visit)
    next_visit = None
    if h.get("id"):
        future_visits = await db.visits.find(
            {"household_id": h["id"], "starts_at": {"$gte": _now().isoformat()}},
            {"_id": 0},
        ).sort("starts_at", 1).to_list(1)
        if future_visits:
            next_visit = future_visits[0]

    # Active services (derive from latest statement line items, top 8 by frequency)
    freq: Dict[str, dict] = {}
    if stmts:
        latest = stmts[0]
        for li in (latest.get("line_items") or []):
            key = (li.get("service_code") or li.get("description") or "").strip()
            if not key:
                continue
            d = freq.setdefault(key, {"service": key, "count": 0, "worker": li.get("worker"), "stream": li.get("stream"), "rate": li.get("unit_rate")})
            d["count"] += 1
            if not d["worker"]:
                d["worker"] = li.get("worker")
    active_services = sorted(freq.values(), key=lambda x: -x["count"])[:8]

    facts = (
        f"Participant: {p.get('first_name','')} {p.get('last_name','')}. "
        f"Classification {classification}. Provider {h.get('provider_name','—')}. "
        f"Quarter budget {_fmt_money(q_total)}, spent {_fmt_money(total_spent)} ({pct:.0f}%). "
        f"Services received this quarter: {sum(1 for _ in line_items)}. "
        f"Anomalies flagged: {len(anomalies)} ({highest_sev} highest). "
        f"Open concerns: {open_concerns_count}. "
        f"Hospitalisations last 12 months: {len(hospitalisations)}."
    )
    exec_summary = await _ai_summary(facts)

    return {
        "participant": p,
        "household": h,
        "classification": classification,
        "quarter": {
            "label": f"{q_start.strftime('%b')}–{q_end.strftime('%b %Y')}",
            "spent": round(total_spent, 2),
            "budget": q_total,
            "remaining": round(q_total - total_spent, 2),
            "pct": round(pct, 1),
            "traffic": _traffic(pct, "budget"),
        },
        "stats": {
            "services_count": len(line_items),
            "anomalies_count": len(anomalies),
            "anomalies_severity": highest_sev,
            "open_concerns": open_concerns_count,
        },
        "exec_summary": exec_summary,
        "active_services": active_services,
        "care_team": care_team,
        "next_visit": next_visit,
        "next_athm": next_athm,
        "recent_concerns": concerns,
        "hospitalisations": hospitalisations,
        "generated_at": _now().isoformat(),
    }


async def _build_quarterly_budget(report: dict, params: dict) -> Dict[str, Any]:
    p_id = report["participant_id"]
    ctx = await _get_household(p_id) or {}
    p = ctx.get("participant", {}) or ctx
    h = ctx.get("household", {}) or ctx
    classification = h.get("classification") or 4

    # Parse quarter param (defaults to current quarter)
    today = date.today()
    q_label, fy_label, q_start, q_end = _quarter_for(today)
    if params.get("quarter") and params.get("financial_year"):
        # Q1=Jul-Sep, Q2=Oct-Dec, Q3=Jan-Mar, Q4=Apr-Jun (FY = year ending June)
        fy = int(params["financial_year"])
        q = params["quarter"].upper()
        q_label = q
        fy_label = fy
        mapping = {
            "Q1": (date(fy - 1, 7, 1), date(fy - 1, 9, 30)),
            "Q2": (date(fy - 1, 10, 1), date(fy - 1, 12, 31)),
            "Q3": (date(fy, 1, 1), date(fy, 3, 31)),
            "Q4": (date(fy, 4, 1), date(fy, 6, 30)),
        }
        if q in mapping:
            q_start, q_end = mapping[q]

    stmts = await _statements_for(p_id, h.get("id"), q_start, q_end)
    line_items: List[dict] = []
    anomalies: List[dict] = []
    for s in stmts:
        line_items.extend(s.get("line_items") or [])
        anomalies.extend(s.get("anomalies") or [])

    burn = budget_lib.compute_burn(line_items, q_start, q_end)
    streams_data = []
    allocs = budget_lib.stream_allocations(classification)
    for stream_name, cap in allocs.items():
        spent = burn.get(stream_name, 0)
        contrib = sum(float(li.get("contribution_paid", 0) or 0) for li in line_items if li.get("stream") == stream_name)
        govt = max(0.0, spent - contrib)
        pct = (spent / cap * 100) if cap else 0
        streams_data.append({
            "name": stream_name,
            "spent": round(spent, 2),
            "cap": cap,
            "pct": round(pct, 1),
            "contribution": round(contrib, 2),
            "government": round(govt, 2),
            "traffic": _traffic(pct, "budget"),
        })

    q_total = budget_lib.quarterly_budget(classification)
    total_spent = sum(burn.values())
    pct = (total_spent / q_total * 100) if q_total else 0

    # Month-by-month
    months: List[Dict[str, Any]] = []
    cur = q_start.replace(day=1)
    while cur <= q_end:
        m_end = (cur.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
        m_burn = budget_lib.compute_burn(line_items, cur, m_end)
        m_total = sum(m_burn.values())
        months.append({
            "label": cur.strftime("%b"),
            "by_stream": m_burn,
            "total": round(m_total, 2),
        })
        cur = (m_end + timedelta(days=1))

    # Care management
    annual = budget_lib.CLASSIFICATIONS.get(classification, {}).get("annual", 0)
    cm_cap_real = round((annual / 4.0) * 0.10, 2)
    cm_used = sum(float(s.get("care_management_deducted", 0) or 0) for s in stmts)
    cm_pct = (cm_used / cm_cap_real * 100) if cm_cap_real else 0

    # AT-HM
    athm = await db.athm_commitments.find({"household_id": h.get("id")} if h.get("id") else {}, {"_id": 0}).to_list(50)

    # Rollover projection
    days_elapsed = max(1, (date.today() - q_start).days + 1)
    days_total = (q_end - q_start).days + 1
    days_left = max(0, days_total - days_elapsed)
    daily_burn = total_spent / days_elapsed if days_elapsed else 0
    projected_total = daily_burn * days_total
    projected_unspent = max(0.0, q_total - projected_total)
    rollover_cap = budget_lib.rollover_cap(classification)
    above_cap = max(0.0, projected_unspent - rollover_cap)
    rollover_traffic = "green" if above_cap == 0 else ("amber" if above_cap < 500 else "red")

    facts = (
        f"Participant: {p.get('first_name','')} {p.get('last_name','')}, Level {classification}. "
        f"Quarter: {q_label} FY{fy_label} ({q_start} to {q_end}). "
        f"Budget {_fmt_money(q_total)}, spent {_fmt_money(total_spent)} ({pct:.0f}%). "
        f"Remaining {_fmt_money(q_total - total_spent)}. "
        f"Days left: {days_left}. Projected unspent: {_fmt_money(projected_unspent)}. "
        f"Anomalies: {len(anomalies)}. "
        f"Care management cap used: {cm_pct:.1f}%."
    )
    exec_summary = await _ai_summary(facts)

    return {
        "participant": p,
        "household": h,
        "classification": classification,
        "quarter": {"label": q_label, "fy": fy_label, "start": q_start.isoformat(), "end": q_end.isoformat()},
        "overview": {"spent": round(total_spent, 2), "budget": q_total, "remaining": round(q_total - total_spent, 2), "pct": round(pct, 1), "traffic": _traffic(pct, "budget")},
        "streams": streams_data,
        "months": months,
        "care_management": {"cap": cm_cap_real, "used": round(cm_used, 2), "pct": round(cm_pct, 1), "traffic": _traffic(cm_pct, "care_mgmt")},
        "athm": athm,
        "anomalies": anomalies,
        "rollover": {
            "projected_unspent": round(projected_unspent, 2),
            "above_cap": round(above_cap, 2),
            "rollover_cap": rollover_cap,
            "days_left": days_left,
            "traffic": rollover_traffic,
            "q_end": q_end.isoformat(),
        },
        "exec_summary": exec_summary,
        "generated_at": _now().isoformat(),
    }


async def _build_anomaly_savings(report: dict, params: dict) -> Dict[str, Any]:
    p_id = report["participant_id"]
    ctx = await _get_household(p_id) or {}
    p = ctx.get("participant", {}) or ctx
    h = ctx.get("household", {}) or ctx

    end = date.today()
    start = end - timedelta(days=int(params.get("days", 365)))
    stmts = await _statements_for(p_id, h.get("id"), start, end)

    by_type: Dict[str, Dict[str, Any]] = {}
    timeline: List[Dict[str, Any]] = []
    total_value = 0.0
    resolved_value = 0.0
    total_count = 0
    resolved_count = 0
    outstanding_value = 0.0

    for s in stmts:
        for a in (s.get("anomalies") or []):
            total_count += 1
            sev = (a.get("severity") or "LOW").upper()
            dollar = float(a.get("dollar_impact") or 0)
            total_value += dollar
            status = _classify_anomaly_status(a)
            if status == "resolved":
                resolved_value += dollar
                resolved_count += 1
            elif status in ("pending", "escalated"):
                outstanding_value += dollar
            t = a.get("rule_key") or a.get("type") or a.get("headline") or "Other"
            t = (t or "Other")[:80]
            bt = by_type.setdefault(t, {"type": t, "count": 0, "value": 0.0, "resolved": 0.0, "outstanding": 0.0})
            bt["count"] += 1
            bt["value"] += dollar
            if status == "resolved":
                bt["resolved"] += dollar
            else:
                bt["outstanding"] += dollar
            timeline.append({
                "date": s.get("period_label") or s.get("uploaded_at"),
                "statement": s.get("filename") or s.get("period_label"),
                "severity": sev,
                "headline": a.get("headline") or "Anomaly",
                "value": dollar,
                "status": status,
            })

    by_type_list = sorted(by_type.values(), key=lambda x: -x["value"])

    # Subscription value
    acct = await db.accounts.find_one({"owner_user_id": p.get("created_by") or h.get("primary_user_id")}, {"_id": 0}) if h else None
    # Fallback monthly cost based on plan
    plan = (acct or {}).get("base_plan") or "FAMILY"
    monthly_cost = {"FREE": 0, "SOLO": 19, "FAMILY": 39, "ADVISER": 299, "ADVISER_PRO": 999}.get(plan, 39)
    months_count = max(1, int(params.get("days", 365)) // 30)
    subscription_total = monthly_cost * months_count
    roi = (resolved_value / subscription_total) if subscription_total else 0

    # Monthly trend (per-month anomaly counts)
    months_trend: List[Dict[str, Any]] = []
    cursor_date = start.replace(day=1)
    while cursor_date <= end:
        m_end = (cursor_date.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
        m_flag = sum(1 for t in timeline if t["status"] != "informational")
        months_trend.append({"label": cursor_date.strftime("%b %y"), "flagged": m_flag})
        cursor_date = m_end + timedelta(days=1)

    facts = (
        f"Wayly decoded {len(stmts)} statements over the last {months_count} months "
        f"and flagged {total_count} potential billing errors totalling {_fmt_money(total_value)}. "
        f"{resolved_count} have been resolved ({_fmt_money(resolved_value)}). "
        f"Outstanding: {_fmt_money(outstanding_value)}. "
        f"Wayly subscription cost over the period: {_fmt_money(subscription_total)}."
    )
    exec_summary = await _ai_summary(facts)

    return {
        "participant": p,
        "household": h,
        "date_range": {"start": start.isoformat(), "end": end.isoformat(), "months": months_count},
        "hero": {
            "total_value": round(total_value, 2),
            "statements_count": len(stmts),
            "anomalies_count": total_count,
            "resolved_count": resolved_count,
            "resolved_value": round(resolved_value, 2),
            "outstanding_value": round(outstanding_value, 2),
        },
        "by_type": by_type_list,
        "timeline": timeline[:50],
        "outstanding_items": [t for t in timeline if t["status"] in ("pending", "escalated")][:20],
        "subscription": {"plan": plan, "monthly_cost": monthly_cost, "total": subscription_total, "roi": round(roi, 1)},
        "monthly_trend": months_trend,
        "exec_summary": exec_summary,
        "generated_at": _now().isoformat(),
    }


async def _build_annual_financial(report: dict, params: dict) -> Dict[str, Any]:
    p_id = report["participant_id"]
    ctx = await _get_household(p_id) or {}
    p = ctx.get("participant", {}) or ctx
    h = ctx.get("household", {}) or ctx
    classification = h.get("classification") or 4

    today = date.today()
    fy = int(params.get("financial_year") or (today.year if today.month < 7 else today.year + 1))
    fy_start = date(fy - 1, 7, 1)
    fy_end = date(fy, 6, 30)

    stmts = await _statements_for(p_id, h.get("id"), fy_start, fy_end)
    line_items: List[dict] = []
    for s in stmts:
        line_items.extend(s.get("line_items") or [])

    annual = budget_lib.CLASSIFICATIONS.get(classification, {}).get("annual", 0)
    gross = sum(float(li.get("total", 0) or 0) for li in line_items)
    contribution = sum(float(li.get("contribution_paid", 0) or 0) for li in line_items)
    govt = max(0.0, gross - contribution)

    # By stream
    by_stream: Dict[str, Dict[str, float]] = {}
    for li in line_items:
        s = li.get("stream") or "Everyday Living"
        bs = by_stream.setdefault(s, {"total": 0.0, "contribution": 0.0, "government": 0.0})
        t = float(li.get("total", 0) or 0)
        c = float(li.get("contribution_paid", 0) or 0)
        bs["total"] += t
        bs["contribution"] += c
        bs["government"] += max(0.0, t - c)

    # Monthly contributions
    monthly: Dict[str, float] = {}
    monthly_streams: Dict[str, Dict[str, float]] = {}
    for li in line_items:
        try:
            d = datetime.fromisoformat(str(li.get("date"))).date()
        except Exception:
            continue
        if not (fy_start <= d <= fy_end):
            continue
        key = d.strftime("%b %Y")
        monthly[key] = monthly.get(key, 0) + float(li.get("contribution_paid", 0) or 0)
        ms = monthly_streams.setdefault(key, {})
        sname = li.get("stream") or "Everyday Living"
        ms[sname] = ms.get(sname, 0) + float(li.get("contribution_paid", 0) or 0)

    # Lifetime cap
    is_grandfathered = bool(h.get("is_grandfathered"))
    lc = budget_lib.lifetime_cap(is_grandfathered)
    lc_used = float(p.get("lifetime_cap_used") or 0) + contribution
    lc_pct = (lc_used / lc * 100) if lc else 0

    facts = (
        f"FY{fy} for {p.get('first_name','')}: total gross {_fmt_money(gross)}, "
        f"participant paid {_fmt_money(contribution)}, government paid {_fmt_money(govt)}. "
        f"Lifetime cap {_fmt_money(lc)}, {lc_pct:.1f}% used. "
        f"Classification {classification}, annual entitlement {_fmt_money(annual)}."
    )
    exec_summary = await _ai_summary(facts)

    return {
        "participant": p,
        "household": h,
        "fy": fy,
        "fy_start": fy_start.isoformat(),
        "fy_end": fy_end.isoformat(),
        "stats": {
            "annual_entitlement": annual,
            "gross": round(gross, 2),
            "contribution": round(contribution, 2),
            "government": round(govt, 2),
            "lifetime_cap": lc,
            "lifetime_cap_used": round(lc_used, 2),
            "lifetime_cap_remaining": round(lc - lc_used, 2),
            "lifetime_cap_pct": round(lc_pct, 1),
        },
        "by_stream": [{"name": k, **v} for k, v in by_stream.items()],
        "monthly": [{"label": k, "contribution": v} for k, v in monthly.items()],
        "exec_summary": exec_summary,
        "generated_at": _now().isoformat(),
    }


async def _build_provider_performance(report: dict, params: dict) -> Dict[str, Any]:
    p_id = report["participant_id"]
    ctx = await _get_household(p_id) or {}
    p = ctx.get("participant", {}) or ctx
    h = ctx.get("household", {}) or ctx

    provider = params.get("provider_name") or h.get("provider_name")
    end = date.today()
    start = end - timedelta(days=int(params.get("days", 365)))
    stmts = await _statements_for(p_id, h.get("id"), start, end)
    if len(stmts) < 3:
        return {
            "locked": True,
            "statements_available": len(stmts),
            "statements_needed": 3,
            "participant": p,
            "household": h,
            "provider": provider,
            "exec_summary": "",
            "generated_at": _now().isoformat(),
        }

    visits = await db.visits.find({"household_id": h.get("id"), "starts_at": {"$gte": start.isoformat()}} if h.get("id") else {}, {"_id": 0}).to_list(500)
    total_visits = len(visits)
    delivered = sum(1 for v in visits if (v.get("status") or "").lower() in ("delivered", "completed"))
    substituted = sum(1 for v in visits if v.get("substitute_worker"))
    cancelled_provider = sum(1 for v in visits if (v.get("status") or "").lower() == "cancelled_provider")
    cancelled_participant = sum(1 for v in visits if (v.get("status") or "").lower() == "cancelled_participant")
    not_delivered = total_visits - delivered - cancelled_provider - cancelled_participant

    anomalies_with_stmts: List[Dict[str, Any]] = []
    statement_with_anomaly = 0
    total_anomaly_value = 0.0
    resolved_anomalies = 0
    for s in stmts:
        anoms = s.get("anomalies") or []
        if anoms:
            statement_with_anomaly += 1
        statement_value = sum(float(a.get("dollar_impact") or 0) for a in anoms)
        total_anomaly_value += statement_value
        for a in anoms:
            if _classify_anomaly_status(a) == "resolved":
                resolved_anomalies += 1
        anomalies_with_stmts.append({
            "statement": s.get("period_label") or s.get("filename"),
            "anomaly_count": len(anoms),
            "value": round(statement_value, 2),
            "resolved_count": sum(1 for a in anoms if _classify_anomaly_status(a) == "resolved"),
        })
    anomaly_free_pct = ((len(stmts) - statement_with_anomaly) / len(stmts) * 100) if stmts else 0

    # Correspondence
    corr_q = {"household_id": h.get("id")} if h.get("id") else {}
    corr = await db.correspondence.find(corr_q, {"_id": 0}).to_list(50)
    corr_total = len(corr)
    corr_responded = sum(1 for c in corr if c.get("response_received_at"))

    # Ratings
    ratings = await db.provider_ratings.find(corr_q, {"_id": 0}).sort("created_at", -1).to_list(50)

    # Grade calculation
    delivery_pct = (delivered / total_visits * 100) if total_visits else 100
    notice_pct = 80  # placeholder when no notice data is tracked
    anomalies_per_3 = (sum(1 for s in stmts if s.get("anomalies")) / max(1, len(stmts))) * 3

    if delivery_pct >= 90 and anomalies_per_3 <= 1 and notice_pct >= 80 and corr_total > 0 and corr_responded == corr_total:
        grade = "A"
        grade_label = "Performing well"
    elif delivery_pct >= 80 and anomalies_per_3 <= 2 and notice_pct >= 60:
        grade = "B"
        grade_label = "Performing adequately"
    elif delivery_pct >= 70 or anomalies_per_3 >= 3 or notice_pct <= 50:
        grade = "C"
        grade_label = "Some concerns to address"
    else:
        grade = "D"
        grade_label = "Significant concerns — consider your options"

    facts = (
        f"Provider {provider} for {p.get('first_name','')}: {len(stmts)} statements analysed. "
        f"Service delivery {delivery_pct:.0f}%. Statements with anomalies: {statement_with_anomaly}. "
        f"Anomaly value total {_fmt_money(total_anomaly_value)}. "
        f"Correspondence: {corr_responded}/{corr_total} responded. Grade {grade}."
    )
    exec_summary = await _ai_summary(facts)

    return {
        "participant": p,
        "household": h,
        "provider": provider,
        "date_range": {"start": start.isoformat(), "end": end.isoformat()},
        "grade": grade,
        "grade_label": grade_label,
        "delivery": {
            "total": total_visits,
            "delivered": delivered,
            "substituted": substituted,
            "cancelled_provider": cancelled_provider,
            "cancelled_participant": cancelled_participant,
            "not_delivered": not_delivered,
            "pct": round(delivery_pct, 1),
        },
        "billing": {
            "statements_count": len(stmts),
            "with_anomaly": statement_with_anomaly,
            "anomaly_free_pct": round(anomaly_free_pct, 1),
            "per_statement": anomalies_with_stmts,
            "avg_value": round(total_anomaly_value / max(1, len(stmts)), 2),
        },
        "correspondence": {"total": corr_total, "responded": corr_responded, "items": corr},
        "ratings": ratings,
        "exec_summary": exec_summary,
        "generated_at": _now().isoformat(),
    }


async def _build_complaint_dossier(report: dict, params: dict) -> Dict[str, Any]:
    p_id = report["participant_id"]
    ctx = await _get_household(p_id) or {}
    p = ctx.get("participant", {}) or ctx
    h = ctx.get("household", {}) or ctx

    end = date.today()
    start = end - timedelta(days=int(params.get("days", 365)))
    addressed_to = params.get("addressed_to") or "Provider"

    concerns = await db.concern_log.find({"household_id": h.get("id")} if h.get("id") else {}, {"_id": 0}).sort("created_at", 1).to_list(100)
    corr = await db.correspondence.find({"household_id": h.get("id")} if h.get("id") else {}, {"_id": 0}).sort("sent_at", 1).to_list(100)

    stmts = await _statements_for(p_id, h.get("id"), start, end)
    anomalies: List[dict] = []
    for s in stmts:
        for a in (s.get("anomalies") or []):
            if (a.get("severity") or "").upper() in ("HIGH", "MEDIUM"):
                a = {**a, "statement": s.get("period_label") or s.get("filename")}
                anomalies.append(a)

    non_deliveries: List[dict] = []
    if h.get("id"):
        non_deliveries = await db.visits.find(
            {"household_id": h["id"], "status": "not_delivered"},
            {"_id": 0},
        ).to_list(100)

    return {
        "participant": p,
        "household": h,
        "addressed_to": addressed_to,
        "date_range": {"start": start.isoformat(), "end": end.isoformat()},
        "concerns": concerns,
        "correspondence": corr,
        "anomalies": anomalies,
        "non_deliveries": non_deliveries,
        "exec_summary": "",
        "generated_at": _now().isoformat(),
    }


async def _build_care_timeline(report: dict, params: dict) -> Dict[str, Any]:
    p_id = report["participant_id"]
    ctx = await _get_household(p_id) or {}
    p = ctx.get("participant", {}) or ctx
    h = ctx.get("household", {}) or ctx

    events: List[Dict[str, Any]] = []

    # Hospital admissions
    if h.get("id"):
        hospitalisations = await db.hospital_admissions.find({"household_id": h["id"]}, {"_id": 0}).to_list(100)
        for ev in hospitalisations:
            events.append({
                "date": ev.get("admitted_at"),
                "color": "purple",
                "icon": "HeartPulse",
                "headline": f"Hospitalisation — {ev.get('hospital_name','—')}",
                "detail": f"{ev.get('reason','')} · {ev.get('duration_days','—')} days · RCP: {'yes' if ev.get('rcp_requested') else 'no'}",
            })

        # AT-HM installations
        athm = await db.athm_commitments.find({"household_id": h["id"]}, {"_id": 0}).to_list(100)
        for ev in athm:
            events.append({
                "date": ev.get("approval_date") or ev.get("created_at"),
                "color": "gold",
                "icon": "Wrench",
                "headline": f"AT-HM: {ev.get('item_description','—')}",
                "detail": f"Approved {_fmt_money(ev.get('amount_approved'))} · expires {_fmt_date(ev.get('expires_at'))}",
            })

        # Concerns (HIGH)
        high_concerns = await db.concern_log.find({"household_id": h["id"], "severity": "HIGH"}, {"_id": 0}).to_list(100)
        for ev in high_concerns:
            events.append({
                "date": ev.get("created_at"),
                "color": "red",
                "icon": "AlertTriangle",
                "headline": ev.get("title") or "Concern raised",
                "detail": ev.get("status") or "Open",
            })

        # Amendments
        amendments = await db.amendments.find({"household_id": h["id"]}, {"_id": 0}).to_list(100)
        for ev in amendments:
            events.append({
                "date": ev.get("created_at"),
                "color": "teal",
                "icon": "FilePenLine",
                "headline": f"Care plan: {ev.get('change_summary','amendment')}",
                "detail": ev.get("status") or "",
            })

    # Sort newest first
    def _key(e):
        try:
            return datetime.fromisoformat(str(e.get("date") or "").replace("Z", "+00:00"))
        except Exception:
            return datetime.min
    events.sort(key=_key, reverse=True)

    return {
        "participant": p,
        "household": h,
        "events": events,
        "exec_summary": "",
        "generated_at": _now().isoformat(),
    }


async def _build_statement_digest(report: dict, params: dict) -> Dict[str, Any]:
    p_id = report["participant_id"]
    ctx = await _get_household(p_id) or {}
    p = ctx.get("participant", {}) or ctx
    h = ctx.get("household", {}) or ctx

    end = date.today()
    days = int(params.get("days", 365))
    start = end - timedelta(days=days)
    stmts = await _statements_for(p_id, h.get("id"), start, end)
    detail_level = params.get("detail_level") or "summary"

    rows: List[Dict[str, Any]] = []
    grand_gross = 0.0
    grand_contribution = 0.0
    grand_anomalies = 0
    for s in stmts:
        summary = s.get("summary") or {}
        if not isinstance(summary, dict):
            summary = {}
        gross = float(summary.get("total_gross") or 0)
        contribution = float(summary.get("total_participant_contribution") or 0)
        govt = float(summary.get("total_government_paid") or 0)
        anoms = s.get("anomalies") or []
        anoms = [a for a in anoms if isinstance(a, dict)]
        sev_counts = {"HIGH": 0, "MEDIUM": 0, "LOW": 0}
        for a in anoms:
            sev_counts[(a.get("severity") or "LOW").upper()] = sev_counts.get((a.get("severity") or "LOW").upper(), 0) + 1
        line_items_raw = s.get("line_items") or []
        line_items_clean = [li for li in line_items_raw if isinstance(li, dict)]
        row = {
            "id": s.get("id"),
            "period": s.get("period_label") or "—",
            "uploaded_at": s.get("uploaded_at"),
            "provider": h.get("provider_name") or "—",
            "gross": round(gross, 2),
            "contribution": round(contribution, 2),
            "government": round(govt, 2),
            "anomaly_counts": sev_counts,
            "anomaly_headlines": [a.get("headline") for a in anoms],
            "anomalies": anoms if detail_level == "full" else [],
            "line_items": line_items_clean if detail_level == "full" else [],
        }
        grand_gross += gross
        grand_contribution += contribution
        grand_anomalies += len(anoms)
        rows.append(row)

    return {
        "participant": p,
        "household": h,
        "date_range": {"start": start.isoformat(), "end": end.isoformat()},
        "detail_level": detail_level,
        "rows": rows,
        "totals": {
            "statements": len(rows),
            "gross": round(grand_gross, 2),
            "contribution": round(grand_contribution, 2),
            "anomalies": grand_anomalies,
        },
        "exec_summary": "",
        "generated_at": _now().isoformat(),
    }


_BUILDERS = {
    "HOUSEHOLD_SUMMARY": _build_household_summary,
    "QUARTERLY_BUDGET": _build_quarterly_budget,
    "ANNUAL_FINANCIAL": _build_annual_financial,
    "ANOMALY_SAVINGS": _build_anomaly_savings,
    "PROVIDER_PERFORMANCE": _build_provider_performance,
    "COMPLAINT_DOSSIER": _build_complaint_dossier,
    "CARE_TIMELINE": _build_care_timeline,
    "STATEMENT_DIGEST": _build_statement_digest,
}

_TEMPLATES = {
    "HOUSEHOLD_SUMMARY": "household_summary.html",
    "QUARTERLY_BUDGET": "quarterly_budget.html",
    "ANNUAL_FINANCIAL": "annual_financial.html",
    "ANOMALY_SAVINGS": "anomaly_savings.html",
    "PROVIDER_PERFORMANCE": "provider_performance.html",
    "COMPLAINT_DOSSIER": "complaint_dossier.html",
    "CARE_TIMELINE": "care_timeline.html",
    "STATEMENT_DIGEST": "statement_digest.html",
}


# ----- Async generation pipeline ------------------------------------------
async def _generate_report(report_id: str) -> None:
    """Background job: build data, render PDF, persist."""
    try:
        report = await db.generated_reports.find_one({"id": report_id}, {"_id": 0})
        if not report:
            return
        rtype = report["report_type"]
        builder = _BUILDERS.get(rtype)
        if not builder:
            await db.generated_reports.update_one({"id": report_id}, {"$set": {"status": "FAILED", "error_message": "Unknown report type"}})
            return
        params = report.get("parameters_json") or {}

        data = await builder(report, params)

        # Save sections (single doc per section_key for in-app preview)
        await db.report_sections.delete_many({"report_id": report_id})
        await db.report_sections.insert_one({
            "id": _new_id(),
            "report_id": report_id,
            "section_key": "all",
            "section_data_json": data,
            "computed_at": _now().isoformat(),
        })

        # Render HTML -> PDF
        template_name = _TEMPLATES.get(rtype)
        landscape = rtype == "CARE_TIMELINE"
        try:
            template = _jinja.get_template(template_name)
        except jinja2.TemplateNotFound:
            template = _jinja.get_template("generic.html")
        html = template.render(
            data=data,
            report_title=REPORT_TYPES[rtype],
            report_id=report_id,
            generated_at=_fmt_date(_now()),
        )
        html_path = STORAGE_DIR / f"{report_id}.html"
        pdf_path = STORAGE_DIR / f"{report_id}.pdf"
        html_path.write_text(html, encoding="utf-8")
        await _render_pdf(html_path, pdf_path, landscape=landscape)

        size = pdf_path.stat().st_size
        # Optionally upload to S3 (no-op when REPORTS_S3_BUCKET is unset)
        s3_key = f"{S3_PREFIX}{report_id}.pdf"
        s3_uri = _upload_to_s3(pdf_path, s3_key)
        storage_path = s3_uri or str(pdf_path)

        await db.generated_reports.update_one(
            {"id": report_id},
            {"$set": {
                "status": "READY",
                "storage_path": storage_path,
                "s3_key": s3_key if s3_uri else None,
                "file_size_bytes": size,
                "updated_at": _now().isoformat(),
            }},
        )

        # Notify
        try:
            user_id = report.get("generated_by")
            if user_id:
                await db.notifications.insert_one({
                    "id": _new_id(),
                    "user_id": user_id,
                    "category": "report_ready",
                    "title": f"Your {REPORT_TYPES[rtype]} is ready",
                    "body": "Tap to view and download.",
                    "url": f"/app/reports?report_id={report_id}",
                    "read": False,
                    "created_at": _now().isoformat(),
                })
        except Exception:
            pass
    except Exception as e:
        logger.exception(f"Report generation failed: {e}")
        try:
            await db.generated_reports.update_one(
                {"id": report_id},
                {"$set": {"status": "FAILED", "error_message": str(e)[:500]}},
            )
        except Exception:
            pass


# ----- Router --------------------------------------------------------------
router = APIRouter(prefix="/reports")


class GenerateBody(BaseModel):
    report_type: str
    participant_id: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None


@router.post("/generate")
async def generate_report(body: GenerateBody, request: Request, user_id: str = Depends(get_current_user_id)):
    if body.report_type not in REPORT_TYPES:
        raise HTTPException(status_code=400, detail="Unknown report type")

    # Resolve participant
    participant_id = body.participant_id
    if not participant_id:
        hdr = request.headers.get("x-participant-id")
        if hdr:
            participant_id = hdr
    if not participant_id:
        # Fall back to first participant on this user's account
        acct = await db.accounts.find_one({"owner_user_id": user_id}, {"_id": 0, "id": 1})
        if acct:
            first = await db.participants.find_one({"account_id": acct["id"], "status": "ACTIVE"}, {"_id": 0, "id": 1})
            if first:
                participant_id = first["id"]
    if not participant_id:
        # Last resort — look up via household
        u = await db.users.find_one({"id": user_id}, {"_id": 0, "household_id": 1})
        if u and u.get("household_id"):
            p = await db.participants.find_one({"household_id": u["household_id"]}, {"_id": 0, "id": 1})
            if p:
                participant_id = p["id"]
    if not participant_id:
        raise HTTPException(status_code=400, detail="No participant available")

    # Ownership check (must belong to this user's account or household)
    p = await db.participants.find_one({"id": participant_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")
    u = await db.users.find_one({"id": user_id}, {"_id": 0})
    if u and u.get("household_id") != p.get("household_id"):
        acct = await db.accounts.find_one({"owner_user_id": user_id}, {"_id": 0, "id": 1})
        if not acct or p.get("account_id") != acct.get("id"):
            raise HTTPException(status_code=403, detail="Not your participant")

    rid = _new_id()
    p_name = f"{p.get('first_name','')} {p.get('last_name','')}".strip() or "Participant"
    params = body.parameters or {}
    name_suffix = ""
    if body.report_type == "QUARTERLY_BUDGET" and params.get("quarter"):
        name_suffix = f" · {params['quarter']} FY{params.get('financial_year','')}"
    elif body.report_type == "ANNUAL_FINANCIAL" and params.get("financial_year"):
        name_suffix = f" · FY{params['financial_year']}"
    report = {
        "id": rid,
        "account_id": p.get("account_id"),
        "participant_id": participant_id,
        "report_type": body.report_type,
        "report_name": f"{REPORT_TYPES[body.report_type]} · {p_name}{name_suffix}",
        "parameters_json": params,
        "status": "GENERATING",
        "generated_by": user_id,
        "is_adviser_branded": False,
        "created_at": _now().isoformat(),
        "updated_at": _now().isoformat(),
    }
    await db.generated_reports.insert_one(report.copy())

    # Kick off background generation
    asyncio.create_task(_generate_report(rid))

    return {"report_id": rid, "status": "GENERATING"}


@router.get("")
async def list_reports(participant_id: Optional[str] = None, request: Request = None, user_id: str = Depends(get_current_user_id)):
    # Identify participant scope
    if not participant_id and request is not None:
        participant_id = request.headers.get("x-participant-id")
    q: Dict[str, Any] = {"generated_by": user_id}
    if participant_id:
        q["participant_id"] = participant_id
    items = await db.generated_reports.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"items": items}


@router.get("/{rid}")
async def get_report(rid: str, user_id: str = Depends(get_current_user_id)):
    r = await db.generated_reports.find_one({"id": rid, "generated_by": user_id}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    return r


@router.get("/{rid}/data")
async def get_report_data(rid: str, user_id: str = Depends(get_current_user_id)):
    r = await db.generated_reports.find_one({"id": rid, "generated_by": user_id}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    sec = await db.report_sections.find_one({"report_id": rid, "section_key": "all"}, {"_id": 0})
    return {"report": r, "data": (sec or {}).get("section_data_json") or {}}


@router.get("/{rid}/download")
async def download_report(rid: str, user_id: str = Depends(get_current_user_id)):
    r = await db.generated_reports.find_one({"id": rid, "generated_by": user_id}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    if r.get("status") != "READY":
        raise HTTPException(status_code=409, detail=f"Report {r.get('status')}")
    # If the PDF lives in S3, return a real presigned URL directly to the client.
    if r.get("s3_key"):
        url = _presign_s3(r["s3_key"], expires_in=900)
        if url:
            return {"url": url, "expires_in_seconds": 900}
    # Fallback: local disk via short-lived token (mocks S3 presigned URLs).
    token = _new_id()
    await db.report_download_tokens.insert_one({
        "token": token,
        "report_id": rid,
        "user_id": user_id,
        "expires_at": (_now() + timedelta(minutes=15)).isoformat(),
    })
    return {"url": f"/api/reports/file/{token}", "expires_in_seconds": 900}


@router.get("/file/{token}")
async def download_file(token: str):
    """Public file download via short-lived token (15-minute expiry)."""
    from fastapi.responses import FileResponse
    tok = await db.report_download_tokens.find_one({"token": token}, {"_id": 0})
    if not tok:
        raise HTTPException(status_code=404, detail="Invalid or expired token")
    try:
        exp = datetime.fromisoformat(tok["expires_at"].replace("Z", "+00:00"))
        if exp < _now():
            raise HTTPException(status_code=410, detail="Token expired")
    except KeyError:
        pass
    r = await db.generated_reports.find_one({"id": tok["report_id"]}, {"_id": 0})
    if not r or not r.get("storage_path"):
        raise HTTPException(status_code=404, detail="File not found")
    path = Path(r["storage_path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="File missing on disk")
    return FileResponse(str(path), media_type="application/pdf", filename=f"{r['report_name']}.pdf")


@router.delete("/{rid}")
async def delete_report(rid: str, user_id: str = Depends(get_current_user_id)):
    r = await db.generated_reports.find_one({"id": rid, "generated_by": user_id}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    # Soft delete + schedule purge
    await db.generated_reports.update_one(
        {"id": rid},
        {"$set": {"status": "DELETED", "deleted_at": _now().isoformat(), "purge_at": (_now() + timedelta(hours=24)).isoformat()}},
    )
    # Best-effort: remove file immediately (local + S3)
    try:
        if r.get("s3_key"):
            s3 = _get_s3()
            if s3:
                try:
                    s3.delete_object(Bucket=S3_BUCKET, Key=r["s3_key"])
                except Exception:
                    pass
        local = STORAGE_DIR / f"{rid}.pdf"
        local.unlink(missing_ok=True)
        html_path = STORAGE_DIR / f"{rid}.html"
        html_path.unlink(missing_ok=True)
    except Exception:
        pass
    return {"ok": True}
