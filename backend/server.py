"""Kindred — backend API."""
import os
import io
import csv
import logging
import statistics
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional

from collections import defaultdict
from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pypdf import PdfReader

from auth import (
    hash_password,
    verify_password,
    create_token,
    get_current_user_id,
)
from models import (
    SignupRequest,
    LoginRequest,
    TokenResponse,
    UserPublic,
    PlanUpdate,
    HouseholdCreate,
    Household,
    Statement,
    StatementLineItem,
    Anomaly,
    FamilyMessageCreate,
    FamilyMessage,
    AuditEvent,
    ChatRequest,
    ChatTurn,
    ConcernCreate,
    new_id,
    now_iso,
)
import budget as budget_lib
from agents import parse_statement, explain_anomalies, chat_with_kindred
from wrapper import run_wrapper
import email_service

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("kindred")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="Kindred API")
api = APIRouter(prefix="/api")


# ----------------- helpers -----------------
async def _get_user(user_id: str) -> dict:
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


async def _get_user_household(user_id: str) -> Optional[dict]:
    user = await _get_user(user_id)
    hid = user.get("household_id")
    if not hid:
        return None
    return await db.households.find_one({"id": hid}, {"_id": 0})


async def _require_household(user_id: str) -> dict:
    h = await _get_user_household(user_id)
    if not h:
        raise HTTPException(status_code=400, detail="No household configured. Complete onboarding first.")
    return h


async def _audit(household_id: str, actor_id: str, actor_name: str, action: str, detail: str) -> None:
    evt = AuditEvent(
        household_id=household_id,
        actor_id=actor_id,
        actor_name=actor_name,
        action=action,
        detail=detail,
    )
    await db.audit_events.insert_one(evt.model_dump())


def _user_public(u: dict) -> UserPublic:
    return UserPublic(
        id=u["id"],
        email=u["email"],
        name=u["name"],
        role=u["role"],
        plan=u.get("plan", "free"),
        household_id=u.get("household_id"),
        created_at=u["created_at"],
    )


# ----------------- auth -----------------
@api.post("/auth/signup", response_model=TokenResponse)
async def signup(payload: SignupRequest):
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    user_doc = {
        "id": new_id(),
        "email": payload.email.lower(),
        "password_hash": hash_password(payload.password),
        "name": payload.name,
        "role": payload.role,
        "plan": payload.plan,
        "household_id": None,
        "created_at": now_iso(),
    }
    await db.users.insert_one(user_doc)
    token = create_token(user_doc["id"])
    return TokenResponse(token=token, user=_user_public(user_doc))


@api.post("/auth/login", response_model=TokenResponse)
async def login(payload: LoginRequest):
    user = await db.users.find_one({"email": payload.email.lower()}, {"_id": 0})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(user["id"])
    return TokenResponse(token=token, user=_user_public(user))


@api.get("/auth/me", response_model=UserPublic)
async def me(user_id: str = Depends(get_current_user_id)):
    u = await _get_user(user_id)
    return _user_public(u)


@api.put("/auth/plan", response_model=UserPublic)
async def update_plan(payload: PlanUpdate, user_id: str = Depends(get_current_user_id)):
    await db.users.update_one({"id": user_id}, {"$set": {"plan": payload.plan}})
    u = await _get_user(user_id)
    return _user_public(u)


# ----------------- household -----------------
@api.post("/household", response_model=Household)
async def create_household(payload: HouseholdCreate, user_id: str = Depends(get_current_user_id)):
    user = await _get_user(user_id)
    if user.get("household_id"):
        raise HTTPException(status_code=409, detail="Household already exists for this user")
    h = Household(owner_id=user_id, **payload.model_dump())
    await db.households.insert_one(h.model_dump())
    await db.users.update_one({"id": user_id}, {"$set": {"household_id": h.id}})
    await _audit(h.id, user_id, user["name"], "HOUSEHOLD_CREATED",
                 f"Set up household for {payload.participant_name} (Classification {payload.classification})")
    return h


@api.get("/household", response_model=Optional[Household])
async def get_household(user_id: str = Depends(get_current_user_id)):
    h = await _get_user_household(user_id)
    return h


# ----------------- statements -----------------
def _extract_text(filename: str, raw: bytes) -> str:
    name = filename.lower()
    if name.endswith(".pdf"):
        try:
            reader = PdfReader(io.BytesIO(raw))
            return "\n".join((p.extract_text() or "") for p in reader.pages)
        except Exception as e:
            logger.warning("PDF extract failed: %s", e)
            return ""
    if name.endswith(".csv"):
        try:
            text = raw.decode("utf-8", errors="replace")
            # also normalize a bit
            return text
        except Exception:
            return ""
    # txt or other
    try:
        return raw.decode("utf-8", errors="replace")
    except Exception:
        return ""


def _detect_anomalies(
    new_items: List[dict],
    historical_items: List[dict],
    provider_published: dict,
) -> List[dict]:
    """Rule-based anomaly stubs. LLM later turns these into plain-English alerts."""
    alerts: List[dict] = []
    # Build historical median price per service_name
    hist_by_name: dict[str, list[float]] = {}
    for it in historical_items:
        name = (it.get("service_name") or "").lower()
        if not name or not it.get("unit_price"):
            continue
        hist_by_name.setdefault(name, []).append(float(it["unit_price"]))

    seen = set()
    for it in new_items:
        name = (it.get("service_name") or "").lower()
        # 1) duplicate detection within this statement
        key = (it.get("date"), name, it.get("units"), it.get("total"))
        if key in seen:
            alerts.append({
                "id": new_id(),
                "severity": "warning",
                "title": "Possible duplicate charge",
                "detail": f"Same service ({it.get('service_name')}) appears twice on {it.get('date')}.",
                "suggested_action": "Ask the provider to confirm whether this is a real duplicate.",
                "line_item_id": it.get("id"),
            })
        seen.add(key)

        # 2) rate spike vs historical median
        prices = hist_by_name.get(name)
        if prices and len(prices) >= 2:
            med = statistics.median(prices)
            up = float(it.get("unit_price", 0) or 0)
            if med > 0 and up > med * 1.2:
                alerts.append({
                    "id": new_id(),
                    "severity": "warning",
                    "title": "Rate higher than usual",
                    "detail": (
                        f"{it.get('service_name')} on {it.get('date')} was charged at "
                        f"${up:.2f}/unit; the typical rate has been ${med:.2f}/unit."
                    ),
                    "suggested_action": "Ask the provider why the rate increased.",
                    "line_item_id": it.get("id"),
                })

        # 3) above provider's published price
        pub = provider_published.get(name)
        if pub and float(it.get("unit_price", 0) or 0) > float(pub) * 1.05:
            alerts.append({
                "id": new_id(),
                "severity": "alert",
                "title": "Above published price",
                "detail": (
                    f"{it.get('service_name')} was charged above the provider's published rate."
                ),
                "suggested_action": "Request a corrected statement.",
                "line_item_id": it.get("id"),
            })
    return alerts


@api.post("/statements/upload", response_model=Statement)
async def upload_statement(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    h = await _require_household(user_id)
    user = await _get_user(user_id)
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(raw) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10 MB)")

    text = _extract_text(file.filename, raw)
    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from file")

    parsed = await parse_statement(text, h["id"])

    # Coerce line items into model
    line_items: List[StatementLineItem] = []
    for li in parsed.get("line_items", []) or []:
        try:
            li_obj = StatementLineItem(
                date=str(li.get("date", "1970-01-01"))[:10],
                service_code=li.get("service_code"),
                service_name=str(li.get("service_name") or "Service"),
                stream=li.get("stream") if li.get("stream") in ("Clinical", "Independence", "Everyday Living") else "Everyday Living",
                units=float(li.get("units") or 0),
                unit_price=float(li.get("unit_price") or 0),
                total=float(li.get("total") or 0),
                contribution_paid=float(li.get("contribution_paid") or 0),
                government_paid=float(li.get("government_paid") or 0),
                confidence=float(li.get("confidence") or 0.8),
            )
            line_items.append(li_obj)
        except Exception as e:
            logger.warning("Skipping bad line item: %s — %s", li, e)

    # Historical line items for anomaly baseline
    prior_statements = await db.statements.find({"household_id": h["id"]}, {"_id": 0}).to_list(50)
    historical_items: List[dict] = []
    for s in prior_statements:
        historical_items.extend(s.get("line_items", []))

    new_items_dicts = [li.model_dump() for li in line_items]
    raw_anoms = _detect_anomalies(new_items_dicts, historical_items, provider_published={})
    explained = await explain_anomalies(raw_anoms, h["id"])
    anomalies = [Anomaly(**a) for a in explained]

    statement = Statement(
        household_id=h["id"],
        filename=file.filename,
        period_label=parsed.get("period_label"),
        line_items=line_items,
        summary=parsed.get("summary"),
        anomalies=anomalies,
        raw_text_preview=text[:1500],
    )
    await db.statements.insert_one(statement.model_dump())
    await _audit(
        h["id"], user_id, user["name"], "STATEMENT_UPLOADED",
        f"Uploaded {file.filename} — {len(line_items)} line items, {len(anomalies)} alerts",
    )
    return statement


@api.get("/statements", response_model=List[Statement])
async def list_statements(user_id: str = Depends(get_current_user_id)):
    h = await _require_household(user_id)
    docs = (
        await db.statements
        .find({"household_id": h["id"]}, {"_id": 0})
        .sort("uploaded_at", -1)
        .to_list(100)
    )
    return [Statement(**d) for d in docs]


@api.get("/statements/{statement_id}", response_model=Statement)
async def get_statement(statement_id: str, user_id: str = Depends(get_current_user_id)):
    h = await _require_household(user_id)
    doc = await db.statements.find_one({"id": statement_id, "household_id": h["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Statement not found")
    return Statement(**doc)


# ----------------- budget -----------------
@api.get("/budget/current")
async def current_budget(user_id: str = Depends(get_current_user_id)):
    h = await _require_household(user_id)
    classification = h["classification"]
    q_start, q_end, q_label = budget_lib.get_quarter_window()
    allocations = budget_lib.stream_allocations(classification)
    quarterly_total = budget_lib.quarterly_budget(classification)

    docs = await db.statements.find({"household_id": h["id"]}, {"_id": 0}).to_list(200)
    all_items: List[dict] = []
    for s in docs:
        all_items.extend(s.get("line_items", []))
    burn = budget_lib.compute_burn(all_items, q_start, q_end)
    contributions_total = budget_lib.compute_contributions(all_items)

    streams = []
    for s in budget_lib.STREAMS:
        spent = burn.get(s, 0.0)
        cap = allocations[s]
        streams.append({
            "stream": s,
            "allocated": cap,
            "spent": spent,
            "remaining": round(cap - spent, 2),
            "pct": round((spent / cap * 100) if cap else 0, 1),
        })

    cap_amount = budget_lib.lifetime_cap(h.get("is_grandfathered", False))
    return {
        "classification": classification,
        "classification_label": budget_lib.CLASSIFICATIONS[classification]["label"],
        "annual_total": budget_lib.CLASSIFICATIONS[classification]["annual"],
        "quarter_label": q_label,
        "quarter_start": q_start.isoformat(),
        "quarter_end": q_end.isoformat(),
        "quarterly_total": quarterly_total,
        "rollover_cap": budget_lib.rollover_cap(classification),
        "streams": streams,
        "lifetime_cap": cap_amount,
        "lifetime_contributions": contributions_total,
        "lifetime_pct": round((contributions_total / cap_amount * 100) if cap_amount else 0, 2),
        "is_grandfathered": h.get("is_grandfathered", False),
    }


# ----------------- chat -----------------
@api.post("/chat")
async def chat(payload: ChatRequest, user_id: str = Depends(get_current_user_id)):
    h = await _require_household(user_id)
    user = await _get_user(user_id)
    classification = h["classification"]
    q_start, q_end, q_label = budget_lib.get_quarter_window()

    # Latest statement summary
    latest = await db.statements.find({"household_id": h["id"]}, {"_id": 0}) \
        .sort("uploaded_at", -1).limit(1).to_list(1)
    latest_summary = latest[0].get("summary") if latest else "No statements uploaded yet."

    docs = await db.statements.find({"household_id": h["id"]}, {"_id": 0}).to_list(200)
    items: List[dict] = []
    for s in docs:
        items.extend(s.get("line_items", []))
    burn = budget_lib.compute_burn(items, q_start, q_end)
    contributions_total = budget_lib.compute_contributions(items)
    cap_amount = budget_lib.lifetime_cap(h.get("is_grandfathered", False))

    burn_str = ", ".join(f"{k}: ${v:,.2f}" for k, v in burn.items())
    context = {
        "caregiver_name": user["name"],
        "participant_name": h["participant_name"],
        "classification": budget_lib.CLASSIFICATIONS[classification]["label"],
        "annual": budget_lib.CLASSIFICATIONS[classification]["annual"],
        "quarterly": budget_lib.quarterly_budget(classification),
        "provider": h["provider_name"],
        "quarter_label": q_label,
        "burn": burn_str or "no spend recorded yet",
        "contributions_total": contributions_total,
        "cap": cap_amount,
        "statement_summary": latest_summary or "No statements uploaded yet.",
    }
    session_id = payload.session_id or f"chat-{h['id']}"
    reply_text = await chat_with_kindred(payload.message, session_id, context)

    # persist
    user_turn = ChatTurn(household_id=h["id"], role="user", content=payload.message)
    asst_turn = ChatTurn(household_id=h["id"], role="assistant", content=reply_text)
    await db.chat_turns.insert_many([user_turn.model_dump(), asst_turn.model_dump()])
    return {"reply": reply_text, "session_id": session_id}


@api.get("/chat/history")
async def chat_history(user_id: str = Depends(get_current_user_id)):
    h = await _require_household(user_id)
    docs = await db.chat_turns.find({"household_id": h["id"]}, {"_id": 0}) \
        .sort("created_at", 1).to_list(500)
    return docs


# ----------------- family thread -----------------
@api.post("/family-thread", response_model=FamilyMessage)
async def post_family_message(payload: FamilyMessageCreate, user_id: str = Depends(get_current_user_id)):
    h = await _require_household(user_id)
    user = await _get_user(user_id)
    msg = FamilyMessage(
        household_id=h["id"],
        author_id=user_id,
        author_name=user["name"],
        body=payload.body,
        related_statement_id=payload.related_statement_id,
    )
    await db.family_messages.insert_one(msg.model_dump())
    await _audit(h["id"], user_id, user["name"], "FAMILY_MESSAGE_POSTED", payload.body[:120])
    return msg


@api.get("/family-thread", response_model=List[FamilyMessage])
async def list_family_messages(user_id: str = Depends(get_current_user_id)):
    h = await _require_household(user_id)
    docs = await db.family_messages.find({"household_id": h["id"]}, {"_id": 0}) \
        .sort("created_at", 1).to_list(500)
    return [FamilyMessage(**d) for d in docs]


# ----------------- audit log -----------------
@api.get("/audit-log", response_model=List[AuditEvent])
async def list_audit(user_id: str = Depends(get_current_user_id)):
    h = await _require_household(user_id)
    docs = await db.audit_events.find({"household_id": h["id"]}, {"_id": 0}) \
        .sort("created_at", -1).to_list(500)
    return [AuditEvent(**d) for d in docs]


# ----------------- participant view -----------------
@api.get("/participant/today")
async def participant_today(user_id: str = Depends(get_current_user_id)):
    h = await _require_household(user_id)
    classification = h["classification"]
    q_start, q_end, q_label = budget_lib.get_quarter_window()
    quarterly_total = budget_lib.quarterly_budget(classification)
    docs = await db.statements.find({"household_id": h["id"]}, {"_id": 0}).to_list(200)
    items: List[dict] = []
    for s in docs:
        items.extend(s.get("line_items", []))
    burn = budget_lib.compute_burn(items, q_start, q_end)
    spent = sum(burn.values())
    remaining = max(0.0, quarterly_total - spent)

    today = datetime.now(timezone.utc).date()
    days_left = (q_end - today).days + 1

    # Static sample appointment for MVP — calendar agent comes later.
    appt = {
        "time": "10:00 AM",
        "name": "Sarah",
        "service": "Personal care",
        "duration": "1 hour",
    }

    return {
        "participant_name": h["participant_name"],
        "today_label": today.strftime("%A %d %B"),
        "appointment": appt,
        "quarter_remaining": round(remaining, 2),
        "quarter_remaining_sentence": (
            f"That's plenty for the {days_left} days left in this quarter."
            if remaining > spent * 0.2 or days_left < 30
            else f"Just keep an eye on it — {days_left} days to go this quarter."
        ),
        "caregiver_name": (await _get_user(h["owner_id"]))["name"],
    }


@api.post("/participant/concern")
async def flag_concern(payload: ConcernCreate, user_id: str = Depends(get_current_user_id)):
    h = await _require_household(user_id)
    user = await _get_user(user_id)
    note = payload.note or "Something doesn't feel right."
    await _audit(h["id"], user_id, user["name"], "CONCERN_FLAGGED", note)
    # also drop into family thread for visibility
    msg = FamilyMessage(
        household_id=h["id"],
        author_id=user_id,
        author_name=user["name"],
        body=f"⚠ Concern flagged: {note}",
    )
    await db.family_messages.insert_one(msg.model_dump())
    return {"ok": True}


# ----------------- public AI tools (no auth, IP rate-limited) -----------------
RATE_LIMIT_BUCKET: dict[str, list[datetime]] = defaultdict(list)
RATE_LIMIT_WINDOW = timedelta(days=30)
RATE_LIMIT_MAX = 5


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check_rate_limit(ip: str) -> None:
    now = datetime.now(timezone.utc)
    RATE_LIMIT_BUCKET[ip] = [t for t in RATE_LIMIT_BUCKET[ip] if now - t < RATE_LIMIT_WINDOW]
    if len(RATE_LIMIT_BUCKET[ip]) >= RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=429,
            detail="You've reached the free-tool limit (5 uses per month). Sign up to keep going.",
        )
    RATE_LIMIT_BUCKET[ip].append(now)


class PublicTextBody(BaseModel):
    text: str = Field(min_length=10, max_length=40000)


class PublicBudgetBody(BaseModel):
    classification: int = Field(ge=1, le=8)
    is_grandfathered: bool = False
    current_lifetime_balance: float = 0.0
    expected_annual_burn: float | None = None


class PublicPriceBody(BaseModel):
    service: str
    rate: float = Field(gt=0)
    postcode: str | None = None
    provider: str | None = None


# Indicative network-median rates (AUD/hour or per-visit) — derived from public provider price lists.
# These are placeholder benchmarks for MVP; real medians come from accumulated user data over time.
PRICE_BENCHMARKS = {
    "Domestic assistance — cleaning": {"median": 76.0, "cap": 82.0},
    "Personal care": {"median": 84.0, "cap": 90.0},
    "Occupational therapy": {"median": 155.0, "cap": 165.0},
    "Physiotherapy": {"median": 145.0, "cap": 158.0},
    "Social support": {"median": 70.0, "cap": 78.0},
    "Transport — community access": {"median": 35.0, "cap": 38.0},
    "Home maintenance / gardening": {"median": 75.0, "cap": 82.0},
    "Meal preparation": {"median": 68.0, "cap": 74.0},
    "Nursing — registered": {"median": 165.0, "cap": 178.0},
    "Allied health — podiatry": {"median": 130.0, "cap": 140.0},
}


async def _run_public_decode(text: str) -> dict:
    parsed = await parse_statement(text, household_id="public")
    line_items_in: List[dict] = parsed.get("line_items", []) or []
    coerced: List[dict] = []
    for li in line_items_in:
        try:
            obj = StatementLineItem(
                date=str(li.get("date", "1970-01-01"))[:10],
                service_code=li.get("service_code"),
                service_name=str(li.get("service_name") or "Service"),
                stream=li.get("stream") if li.get("stream") in ("Clinical", "Independence", "Everyday Living") else "Everyday Living",
                units=float(li.get("units") or 0),
                unit_price=float(li.get("unit_price") or 0),
                total=float(li.get("total") or 0),
                contribution_paid=float(li.get("contribution_paid") or 0),
                government_paid=float(li.get("government_paid") or 0),
                confidence=float(li.get("confidence") or 0.8),
            )
            coerced.append(obj.model_dump())
        except Exception as e:
            logger.warning("public decode skipped line: %s", e)
    raw_anoms = _detect_anomalies(coerced, [], provider_published={})
    explained = await explain_anomalies(raw_anoms, "public")
    return {
        "summary": parsed.get("summary"),
        "period_label": parsed.get("period_label"),
        "line_items": coerced,
        "anomalies": explained,
    }


@api.post("/public/decode-statement-text")
async def public_decode_text(body: PublicTextBody, request: Request):
    _check_rate_limit(_client_ip(request))
    return await _run_public_decode(body.text)


@api.post("/public/decode-statement")
async def public_decode_file(request: Request, file: UploadFile = File(...)):
    _check_rate_limit(_client_ip(request))
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(raw) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10 MB)")
    text = _extract_text(file.filename, raw)
    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from file")
    return await _run_public_decode(text)


@api.post("/public/budget-calc")
async def public_budget_calc(body: PublicBudgetBody, request: Request):
    _check_rate_limit(_client_ip(request))
    classification = body.classification
    annual = budget_lib.CLASSIFICATIONS[classification]["annual"]
    quarterly = budget_lib.quarterly_budget(classification)
    allocations = budget_lib.stream_allocations(classification)
    rollover = budget_lib.rollover_cap(classification)
    cap_amount = budget_lib.lifetime_cap(body.is_grandfathered)
    contributions = max(0.0, body.current_lifetime_balance)
    pct = (contributions / cap_amount * 100) if cap_amount else 0.0
    years_to_cap = None
    if body.expected_annual_burn and body.expected_annual_burn > 0:
        remaining = max(0.0, cap_amount - contributions)
        years_to_cap = round(remaining / body.expected_annual_burn, 2)
    return {
        "classification": classification,
        "classification_label": budget_lib.CLASSIFICATIONS[classification]["label"],
        "annual_total": annual,
        "quarterly_total": quarterly,
        "rollover_cap": rollover,
        "streams": [
            {"stream": s, "allocated": allocations[s]} for s in budget_lib.STREAMS
        ],
        "lifetime_cap": cap_amount,
        "lifetime_contributions": contributions,
        "lifetime_pct": round(pct, 2),
        "years_to_cap": years_to_cap,
        "is_grandfathered": body.is_grandfathered,
    }


@api.post("/public/price-check")
async def public_price_check(body: PublicPriceBody, request: Request):
    _check_rate_limit(_client_ip(request))
    bench = PRICE_BENCHMARKS.get(body.service, {"median": body.rate, "cap": body.rate})
    median = bench["median"]
    cap = bench["cap"]
    delta_pct = ((body.rate - median) / median * 100) if median else 0.0
    if body.rate > cap:
        verdict, label = "high", "Above the 1 July 2026 cap"
        assessment = (
            f"At ${body.rate:.2f}/unit, this is above the published 1 July 2026 cap of "
            f"${cap:.2f}. From that date, providers cannot exceed the cap."
        )
        suggested = "Ask the provider for a corrected rate, or raise it with the Aged Care Quality and Safety Commission."
    elif body.rate > median * 1.10:
        verdict, label = "high", "Higher than the typical rate"
        assessment = (
            f"At ${body.rate:.2f}/unit, this is about {delta_pct:.0f}% above the network median "
            f"of ${median:.2f}. Worth asking the provider why."
        )
        suggested = "Email the provider asking for a written explanation of the rate."
    elif body.rate < median * 0.85:
        verdict, label = "low", "Below the typical rate"
        assessment = (
            f"At ${body.rate:.2f}/unit, this is below the network median of ${median:.2f}. "
            "That's likely a good outcome — confirm the service quality is what you'd expect."
        )
        suggested = None
    else:
        verdict, label = "fair", "About what you'd expect"
        assessment = (
            f"At ${body.rate:.2f}/unit, you're within typical range for {body.service.lower()} "
            f"(network median ${median:.2f}, 1 Jul 2026 cap ${cap:.2f})."
        )
        suggested = None

    return {
        "service": body.service,
        "charged": body.rate,
        "median": median,
        "cap": cap,
        "delta_pct": round(delta_pct, 2),
        "verdict": verdict,
        "verdict_label": label,
        "assessment": assessment,
        "suggested_action": suggested,
    }


# ---- Tool 4: Classification self-check (12-question quiz) ----
class PublicClassificationBody(BaseModel):
    answers: List[int] = Field(min_length=12, max_length=12)  # each 0-4
    current_classification: int | None = None


@api.post("/public/classification-check")
async def public_classification_check(body: PublicClassificationBody, request: Request):
    _check_rate_limit(_client_ip(request))
    if not all(0 <= a <= 4 for a in body.answers):
        raise HTTPException(status_code=400, detail="Each answer must be 0–4")
    score = sum(body.answers)  # 0..48
    # Map to classification range
    if score <= 6:
        low, high = 1, 2
    elif score <= 12:
        low, high = 2, 3
    elif score <= 18:
        low, high = 3, 4
    elif score <= 24:
        low, high = 4, 5
    elif score <= 30:
        low, high = 5, 6
    elif score <= 36:
        low, high = 6, 7
    else:
        low, high = 7, 8
    annual_low = budget_lib.CLASSIFICATIONS[low]["annual"]
    annual_high = budget_lib.CLASSIFICATIONS[high]["annual"]
    suggest_reassess = body.current_classification is not None and (
        body.current_classification < low or body.current_classification > high + 1
    )
    return {
        "score": score,
        "score_max": 48,
        "likely_low": low,
        "likely_high": high,
        "likely_label": f"Classification {low}" if low == high else f"Classification {low}–{high}",
        "annual_range": [annual_low, annual_high],
        "current_classification": body.current_classification,
        "suggest_reassessment": suggest_reassess,
        "caveat": "This is informational only. Only the My Aged Care Independent Assessment Tool (IAT) determines the actual classification.",
    }


# ---- Tool 5: Reassessment letter drafter ----
class PublicReassessmentBody(BaseModel):
    participant_name: str = Field(min_length=1, max_length=120)
    current_classification: int = Field(ge=1, le=8)
    changes_summary: str = Field(min_length=10, max_length=4000)
    recent_events: str | None = None
    sender_name: str = Field(min_length=1, max_length=120)
    relationship: str | None = "family caregiver"


@api.post("/public/reassessment-letter")
async def public_reassessment_letter(body: PublicReassessmentBody, request: Request):
    _check_rate_limit(_client_ip(request))
    key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not key:
        raise HTTPException(status_code=503, detail="LLM unavailable")
    # Wrapper redacts PII from the free-text fields
    free_text = f"{body.changes_summary}\n{body.recent_events or ''}"
    wrapped = await run_wrapper(free_text)
    if wrapped["abuse_flag"]:
        return {"abuse_flag": wrapped["abuse_flag"], "abuse_response": wrapped["abuse_response"]}
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    system = (
        "You are a paperwork drafter for Australian Support at Home. Draft a polite, factual "
        "reassessment request letter to My Aged Care. Australian English. 250–400 words. "
        "Plain professional tone. Use the participant's name and the sender's name. Use "
        "gender‑neutral language unless the user has supplied otherwise — never default to "
        "'Mum'. Reference Aged Care Act 2024 framework where relevant. End with a specific "
        "request and a 14‑day response timeframe. Output ONLY the letter body — no preamble, "
        "no markdown. NEVER claim a specific reassessment outcome ('they should be on L7') — "
        "frame as 'we'd like the assessor to consider whether the current classification still "
        "fits'."
    )
    chat = LlmChat(
        api_key=key, session_id=f"reassess-{datetime.now(timezone.utc).timestamp()}",
        system_message=system,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    prompt = (
        f"Participant: {body.participant_name}\n"
        f"Current classification: Classification {body.current_classification}\n"
        f"What's changed: {wrapped['redacted_input']}\n"
        f"Letter sender: {body.sender_name} ({body.relationship or 'family caregiver'})"
    )
    letter = await chat.send_message(UserMessage(text=prompt))
    out = {"letter": letter.strip(), "word_count": len(letter.split())}
    if wrapped["redaction_notice"]:
        out["redaction_notice"] = wrapped["redaction_notice"]
    return out


# ---- Tool 6: Contribution estimator ----
PENSION_RATES = {
    "full":      {"clinical": 0.0, "independence": 0.05, "everyday_living": 0.175},
    "part":      {"clinical": 0.0, "independence": 0.175, "everyday_living": 0.50},
    "self":      {"clinical": 0.0, "independence": 0.50, "everyday_living": 0.80},
}


class PublicContributionBody(BaseModel):
    classification: int = Field(ge=1, le=8)
    pension_status: str = Field(pattern="^(full|part|self)$")
    is_grandfathered: bool = False
    expected_mix_clinical_pct: float = Field(ge=0, le=100, default=30)
    expected_mix_independence_pct: float = Field(ge=0, le=100, default=45)
    expected_mix_everyday_pct: float = Field(ge=0, le=100, default=25)


@api.post("/public/contribution-estimator")
async def public_contribution_estimator(body: PublicContributionBody, request: Request):
    _check_rate_limit(_client_ip(request))
    total_pct = body.expected_mix_clinical_pct + body.expected_mix_independence_pct + body.expected_mix_everyday_pct
    if total_pct < 95 or total_pct > 105:
        raise HTTPException(status_code=400, detail="Service mix percentages should sum to 100")
    rates = PENSION_RATES[body.pension_status]
    quarterly = budget_lib.quarterly_budget(body.classification)
    annual_service = quarterly * 4
    clin = annual_service * (body.expected_mix_clinical_pct / 100)
    ind = annual_service * (body.expected_mix_independence_pct / 100)
    ev = annual_service * (body.expected_mix_everyday_pct / 100)
    contrib_clin = clin * rates["clinical"]
    contrib_ind = ind * rates["independence"]
    contrib_ev = ev * rates["everyday_living"]
    annual_contrib = round(contrib_clin + contrib_ind + contrib_ev, 2)
    quarterly_contrib = round(annual_contrib / 4, 2)
    cap = budget_lib.lifetime_cap(body.is_grandfathered)
    years_to_cap = round(cap / annual_contrib, 1) if annual_contrib > 0 else None
    return {
        "annual_service_total": round(annual_service, 2),
        "annual_contribution": annual_contrib,
        "quarterly_contribution": quarterly_contrib,
        "per_stream": [
            {"stream": "Clinical", "annual_charged": round(clin, 2), "annual_contribution": round(contrib_clin, 2), "rate_pct": rates["clinical"] * 100},
            {"stream": "Independence", "annual_charged": round(ind, 2), "annual_contribution": round(contrib_ind, 2), "rate_pct": rates["independence"] * 100},
            {"stream": "Everyday Living", "annual_charged": round(ev, 2), "annual_contribution": round(contrib_ev, 2), "rate_pct": rates["everyday_living"] * 100},
        ],
        "lifetime_cap": cap,
        "years_to_cap": years_to_cap,
        "pension_status": body.pension_status,
    }


# ---- Tool 7: Care plan reviewer ----
class PublicCarePlanBody(BaseModel):
    text: str = Field(min_length=50, max_length=20000)


@api.post("/public/care-plan-review")
async def public_care_plan_review(body: PublicCarePlanBody, request: Request):
    _check_rate_limit(_client_ip(request))
    key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not key:
        raise HTTPException(status_code=503, detail="LLM unavailable")
    wrapped = await run_wrapper(body.text)
    if wrapped["abuse_flag"]:
        return {"abuse_flag": wrapped["abuse_flag"], "abuse_response": wrapped["abuse_response"]}
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    system = (
        "You review Australian Support at Home care plans. Check coverage against the "
        "Statement of Rights (Aged Care Act 2024) and the National Quality Standards. "
        "Use gender‑neutral language — never default to 'Mum'. "
        "Output STRICT JSON: {\"summary\":\"1 paragraph\",\"coverage\":[{\"item\":\"...\","
        "\"present\":true/false,\"note\":\"...\"}],\"gaps\":[\"...\"],"
        "\"questions_to_raise\":[\"...\"]}. Coverage items: goals stated, services listed "
        "with frequency, review date set, restorative focus, cultural/language preferences, "
        "advance care directive referenced, named worker preferences, complaint pathway, "
        "contribution amounts, rights statement. No markdown."
    )
    chat = LlmChat(
        api_key=key, session_id=f"careplan-{datetime.now(timezone.utc).timestamp()}",
        system_message=system,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    raw = await chat.send_message(UserMessage(text=f"Care plan:\n\n{wrapped['redacted_input'][:18000]}"))
    import json as _json
    try:
        from agents import _strip_json
        out = _json.loads(_strip_json(raw))
    except Exception:
        out = {"summary": raw[:500], "coverage": [], "gaps": [], "questions_to_raise": []}
    if wrapped["redaction_notice"]:
        out["redaction_notice"] = wrapped["redaction_notice"]
    return out


# ---- Tool 8: Family Care Coordinator chat (public) ----
class PublicChatBody(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    session_id: str | None = None


@api.post("/public/family-coordinator-chat")
async def public_family_coordinator(body: PublicChatBody, request: Request):
    _check_rate_limit(_client_ip(request))
    key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not key:
        raise HTTPException(status_code=503, detail="LLM unavailable")
    wrapped = await run_wrapper(body.message)
    if wrapped["abuse_flag"]:
        return {
            "reply": wrapped["abuse_response"],
            "session_id": body.session_id or f"public-chat-{_client_ip(request)}",
            "abuse_flag": wrapped["abuse_flag"],
        }
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    system = (
        "You are Kindred's Family Care Coordinator — a friendly, expert chat assistant for "
        "Australian families navigating the Support at Home program. Tone: the friendliest, "
        "most patient, most well‑informed niece in Australia — calm, specific, never "
        "breathless. Ground answers in: Aged Care Act 2024, Support at Home program manual, "
        "National Quality Standards. Australian English. Use gender‑neutral language; refer "
        "to 'the person you care for' or 'the participant', never default to 'Mum'. Lead "
        "with the answer (1‑2 sentences), then one paragraph of context, then cite sources "
        "where you can ('Aged Care Act 2024, section X'). NEVER invent dollar figures, "
        "dates, or section numbers — say 'I don't have a current figure for that — the "
        "authoritative source is My Aged Care on 1800 200 422'. NEVER give clinical or "
        "financial‑product advice; redirect to the GP / a FAAA‑registered advisor. NEVER "
        "recommend a specific provider. If asked, you are Kindred's AI; offer human handoff "
        "with 'type human and I'll connect you'. Keep responses 50–150 words by default, "
        "up to 250 only if needed. End with one soft next step (a relevant tool or guide)."
    )
    sid = body.session_id or f"public-chat-{_client_ip(request)}"
    chat = LlmChat(api_key=key, session_id=sid, system_message=system).with_model(
        "anthropic", "claude-sonnet-4-5-20250929"
    )
    reply = await chat.send_message(UserMessage(text=wrapped["redacted_input"]))
    out: dict = {"reply": reply, "session_id": sid}
    if wrapped["redaction_notice"]:
        out["redaction_notice"] = wrapped["redaction_notice"]
    return out


@api.get("/")
async def root():
    return {"service": "kindred", "ok": True}


# ---------------------------------------------------------------------------
# Contact / Book a demo
# ---------------------------------------------------------------------------
class ContactBody(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    role: str
    intent: str = "general"        # "general" | "demo"
    context: Optional[str] = None
    size: Optional[str] = None
    biggest_pain: Optional[str] = None
    success_in_six_months: Optional[str] = None
    preferred_time: Optional[str] = None


@api.post("/contact")
async def contact_submit(body: ContactBody):
    doc = body.model_dump()
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.contact_requests.insert_one(doc)
    doc.pop("_id", None)
    # Notify the team — graceful no-op if Resend isn't configured
    try:
        await email_service.notify_team_contact(doc)
    except Exception as e:
        logger.warning("Contact notification failed: %s", e)
    return {"ok": True, "intent": body.intent}


# ---------------------------------------------------------------------------
# Email my result (public tools)
# ---------------------------------------------------------------------------
class EmailResultBody(BaseModel):
    email: EmailStr
    tool: str = Field(min_length=2, max_length=80)
    headline: str = Field(min_length=1, max_length=240)
    body_html: str = Field(min_length=1, max_length=80000)


@api.post("/public/email-result")
async def public_email_result(body: EmailResultBody, request: Request):
    _check_rate_limit(_client_ip(request))
    # Light HTML safety: forbid script/iframe tags in body_html
    cleaned = body.body_html
    for bad in ("<script", "</script>", "<iframe", "</iframe>", "javascript:"):
        cleaned = cleaned.replace(bad, "")
    res = await email_service.email_tool_result(
        to=body.email,
        tool_name=body.tool,
        headline=body.headline,
        body_html=cleaned,
    )
    # Persist for audit (24h TTL conceptually — we keep simple here)
    await db.tool_email_log.insert_one({
        "email": body.email,
        "tool": body.tool,
        "ok": bool(res.get("ok")),
        "mocked": bool(res.get("mocked")),
        "ts": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": bool(res.get("ok")), "mocked": bool(res.get("mocked"))}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
