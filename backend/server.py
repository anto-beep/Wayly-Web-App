"""Kindred — backend API."""
import os
import io
import csv
import logging
import statistics
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, status
from fastapi.responses import JSONResponse
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


@api.get("/")
async def root():
    return {"service": "kindred", "ok": True}


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
