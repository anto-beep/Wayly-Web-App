"""One-off verification: /v2/participants/preview branch per base_plan.

Temporarily flips the owner account's base_plan (cathy) to FREE / SOLO /
ADVISER / FAMILY, calls the real preview endpoint, asserts the branch, then
restores FAMILY. Non-destructive.
"""
import os
import sys
import requests
from pymongo import MongoClient

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://mobile-exact-parity.preview.emergentagent.com"
API = f"{BASE}/api"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

EXPECT = {"FREE": "upgrade_required", "SOLO": "solo_to_family", "FAMILY": "family_addons", "ADVISER": "adviser_included"}

cli = MongoClient(MONGO_URL)
db = cli[DB_NAME]

user = db.users.find_one({"email": "cathy@example.com"})
assert user, "cathy not found"
uid = user["id"]
acct = db.accounts.find_one({"owner_user_id": uid})
assert acct, "account not found"
original = acct.get("base_plan")
print(f"owner={uid} original base_plan={original}")

tok = requests.post(f"{API}/auth/login", json={"email": "cathy@example.com", "password": "testpass123"}, timeout=30).json()["token"]
H = {"Authorization": f"Bearer {tok}"}

results = {}
try:
    for plan, expected in EXPECT.items():
        db.accounts.update_one({"owner_user_id": uid}, {"$set": {"base_plan": plan}})
        r = requests.post(f"{API}/v2/participants/preview?count=1", headers=H, timeout=30)
        data = r.json()
        branch = data.get("branch")
        ok = branch == expected
        results[plan] = (branch, expected, ok, data.get("addons_needed"), data.get("new_monthly_total"))
        print(f"{plan:8} -> branch={branch!r} expected={expected!r} {'OK' if ok else 'MISMATCH'}  addons={data.get('addons_needed')} new_total={data.get('new_monthly_total')}")
finally:
    db.accounts.update_one({"owner_user_id": uid}, {"$set": {"base_plan": original or "FAMILY"}})
    print(f"restored base_plan={original or 'FAMILY'}")

all_ok = all(v[2] for v in results.values())
print("ALL PASS" if all_ok else "SOME FAILED")
sys.exit(0 if all_ok else 1)
