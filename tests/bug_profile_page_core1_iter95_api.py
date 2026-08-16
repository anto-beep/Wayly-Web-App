"""Focused CORE-1 profile bug verification for iteration 95.

Checks the reported /app/participants/<id> 500/profile-error path from the API
side using the Cathy caregiver fixture, plus a temporary legacy statement whose
summary is a string (the reported backend root cause).
"""
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

try:
    from pymongo import MongoClient
except Exception:  # pragma: no cover - environment diagnostic
    MongoClient = None


ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / "frontend" / ".env")
load_dotenv(ROOT / "backend" / ".env")

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://mobile-parity-sweep.preview.emergentagent.com").rstrip("/")
MONGO_URL = (os.environ.get("MONGO_URL") or "mongodb://localhost:27017").strip('"')
DB_NAME = (os.environ.get("DB_NAME") or "test_database").strip('"')
EMAIL = "cathy@example.com"
PASSWORD = "testpass123"


def get_json(resp):
    try:
        return resp.json()
    except Exception:
        return {"raw": resp.text[:500]}


def main():
    result = {
        "base": BASE,
        "login_status": None,
        "core_participant_count": 0,
        "account_participant_count": 0,
        "core_scope_counts": None,
        "core_profile_statuses": [],
        "account_profile_statuses": [],
        "profile_500s": [],
        "invalid_profile_status": None,
        "summary_string_temp_profile": None,
        "summary_string_temp_id": None,
        "errors": [],
    }

    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    login = s.post(f"{BASE}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    result["login_status"] = login.status_code
    if login.status_code != 200:
        result["errors"].append({"step": "login", "status": login.status_code, "body": get_json(login)})
        print(json.dumps(result, indent=2, default=str))
        return 2
    token = get_json(login).get("token") or get_json(login).get("access_token")
    s.headers.update({"Authorization": f"Bearer {token}"})

    # CORE-1 source-of-truth participant list.
    core_list = s.get(f"{BASE}/api/core/participants", timeout=30)
    if core_list.status_code != 200:
        result["errors"].append({"step": "core_list", "status": core_list.status_code, "body": get_json(core_list)})
        print(json.dumps(result, indent=2, default=str))
        return 2
    core_parts = get_json(core_list).get("participants", [])
    result["core_participant_count"] = len(core_parts)

    # Inspect returned CORE participants against DB scope fields to prove the
    # union contains account-scoped and household-scoped records.
    cathy_user = None
    cathy_account_id = None
    cathy_household_id = None
    if MongoClient is not None:
        try:
            scope_client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
            scope_db = scope_client[DB_NAME]
            cathy_user = scope_db.users.find_one({"email": EMAIL}, {"_id": 0}) or {}
            user_id = cathy_user.get("id")
            cathy_household_id = cathy_user.get("household_id")
            if user_id:
                member = scope_db.account_members.find_one({"user_id": user_id, "status": "ACTIVE"}, {"_id": 0, "account_id": 1})
                cathy_account_id = (member or {}).get("account_id")
            if not cathy_account_id and user_id:
                acct_doc = scope_db.accounts.find_one({"owner_user_id": user_id}, {"_id": 0, "id": 1})
                cathy_account_id = (acct_doc or {}).get("id")
            ids = [p.get("id") for p in core_parts]
            docs = list(scope_db.participants.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "account_id": 1, "household_id": 1}))
            counts = {"account_and_household": 0, "account_only": 0, "household_only": 0, "unknown": 0}
            for d in docs:
                acct_match = cathy_account_id and d.get("account_id") == cathy_account_id
                hid_match = cathy_household_id and d.get("household_id") == cathy_household_id
                if acct_match and hid_match:
                    counts["account_and_household"] += 1
                elif acct_match:
                    counts["account_only"] += 1
                elif hid_match:
                    counts["household_only"] += 1
                else:
                    counts["unknown"] += 1
            result["core_scope_counts"] = {"account_id": cathy_account_id, "household_id": cathy_household_id, **counts}
            scope_client.close()
        except Exception as exc:
            result["core_scope_counts"] = {"error": repr(exc)}

    for p in core_parts:
        pid = p.get("id")
        r = s.get(f"{BASE}/api/core/participants/{pid}/profile", timeout=30)
        body = get_json(r)
        record = {
            "id": pid,
            "name": p.get("display_name") or p.get("name") or p.get("first_name"),
            "status": r.status_code,
            "has_sections": all(k in body for k in ["participant", "financial_position", "latest_artefacts", "household", "timeline"]),
        }
        result["core_profile_statuses"].append(record)
        if r.status_code >= 500:
            result["profile_500s"].append(record)
        if r.status_code != 200:
            result["errors"].append({"step": "core_profile", **record, "body": body})

    # ParticipantSwitcher source (/api/account); every visible active option must have a CORE-1 profile.
    acct = s.get(f"{BASE}/api/account", timeout=30)
    if acct.status_code == 200:
        account_parts = get_json(acct).get("participants", [])
        result["account_participant_count"] = len(account_parts)
        for p in account_parts:
            pid = p.get("id")
            r = s.get(f"{BASE}/api/core/participants/{pid}/profile", timeout=30)
            rec = {
                "id": pid,
                "name": ((p.get("first_name") or "") + " " + (p.get("last_name") or "")).strip() or p.get("name"),
                "participant_status": p.get("status"),
                "profile_status": r.status_code,
            }
            result["account_profile_statuses"].append(rec)
            if r.status_code >= 500:
                result["profile_500s"].append(rec)
            if r.status_code != 200:
                result["errors"].append({"step": "account_visible_profile", **rec, "body": get_json(r)})
    else:
        result["errors"].append({"step": "account_list", "status": acct.status_code, "body": get_json(acct)})

    inv = s.get(f"{BASE}/api/core/participants/not-a-real-participant-iter95/profile", timeout=30)
    result["invalid_profile_status"] = inv.status_code
    if inv.status_code != 404:
        result["errors"].append({"step": "invalid_profile", "status": inv.status_code, "body": get_json(inv)})

    # Temporary legacy fixture: latest decoded statement has summary as a string.
    if MongoClient is None:
        result["errors"].append({"step": "summary_string_fixture", "error": "pymongo unavailable"})
    else:
        client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
        db = client[DB_NAME]
        temp_pid = f"qa-core1-summary-string-{uuid.uuid4()}"
        temp_stmt = f"qa-core1-statement-{uuid.uuid4()}"
        result["summary_string_temp_id"] = temp_pid
        inserted = False
        try:
            user = cathy_user or db.users.find_one({"email": EMAIL}, {"_id": 0}) or {}
            user_id = user.get("id")
            account_id = cathy_account_id
            if not account_id and user_id:
                member = db.account_members.find_one({"user_id": user_id, "status": "ACTIVE"}, {"_id": 0, "account_id": 1})
                account_id = (member or {}).get("account_id")
            if not account_id and user_id:
                acct_doc = db.accounts.find_one({"owner_user_id": user_id}, {"_id": 0, "id": 1})
                account_id = (acct_doc or {}).get("id")
            if not account_id:
                raise RuntimeError("Could not resolve Cathy account_id")

            temp_hid = f"qa-core1-hid-{uuid.uuid4()}"
            now = datetime.now(timezone.utc)
            db.participants.insert_one({
                "id": temp_pid,
                "account_id": account_id,
                "household_id": temp_hid,
                "first_name": "QA",
                "last_name": "SummaryString",
                "name": "QA SummaryString",
                "preferred_name": "QA",
                "classification": 3,
                "provider_name": "QA Provider",
                "status": "ACTIVE",
                "is_archived": False,
                "is_primary": False,
                "created_at": now,
                "updated_at": now,
            })
            db.statements.insert_one({
                "id": temp_stmt,
                "participant_id": temp_pid,
                "household_id": temp_hid,
                "period_label": "QA Legacy Summary String",
                "summary": "legacy summary stored as string, not dict",
                "uploaded_at": now,
                "anomalies": [],
            })
            inserted = True
            r = s.get(f"{BASE}/api/core/participants/{temp_pid}/profile", timeout=30)
            result["summary_string_temp_profile"] = {
                "status": r.status_code,
                "financial_position_present": "financial_position" in get_json(r),
                "body_excerpt": get_json(r) if r.status_code != 200 else None,
            }
            if r.status_code >= 500:
                result["profile_500s"].append({"id": temp_pid, "profile_status": r.status_code, "summary": "string"})
            if r.status_code != 200:
                result["errors"].append({"step": "summary_string_profile", "status": r.status_code, "body": get_json(r)})
        except Exception as exc:
            result["errors"].append({"step": "summary_string_fixture", "error": repr(exc)})
        finally:
            if inserted:
                db.participants.delete_one({"id": temp_pid})
                db.statements.delete_one({"id": temp_stmt})
            try:
                client.close()
            except Exception:
                pass

    print(json.dumps(result, indent=2, default=str))
    # Hard fail on any 500 or non-200 profile for accessible/visible participants; invalid id must 404.
    if result["profile_500s"] or result["errors"]:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())