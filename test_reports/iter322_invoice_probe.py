"""Iter322 backend probe: verify C10-only invoice classifies findings under 'low/info'
and rich invoice has T4/high-priority findings. Also verifies GET /api/tools."""
import os, requests, json, sys

BASE = os.environ["BASE_URL"].rstrip("/")
EMAIL = os.environ.get("EMAIL", "cathy@example.com")
PW = os.environ.get("PW", "testpass123")

s = requests.Session()

def login():
    r = s.post(f"{BASE}/api/auth/login", json={"email": EMAIL, "password": PW}, timeout=15)
    r.raise_for_status()
    tok = r.json().get("token") or r.json().get("access_token")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return tok

def test_tools():
    r = s.get(f"{BASE}/api/tools", timeout=15)
    print("TOOLS status", r.status_code)
    assert r.status_code == 200
    data = r.json()
    print("tools count:", len(data) if isinstance(data, list) else "keyed", "keys:", list(data)[:5] if isinstance(data, dict) else None)

def dump_invoice(iid, label):
    r = s.get(f"{BASE}/api/invoices/{iid}", timeout=30)
    print(f"\n=== {label} {iid} status={r.status_code} ===")
    if r.status_code != 200:
        print("body:", r.text[:400]); return
    j = r.json()
    rec = j.get("reconciliation") or j.get("audit_json") or {}
    findings = rec.get("findings") or []
    print(f"findings: {len(findings)}")
    tiers = {}
    for f in findings:
        t = f.get("tier")
        tiers[t] = tiers.get(t, 0) + 1
        print(f"  - check_id={f.get('check_id')} tier={t} sev={f.get('severity')} title={f.get('title','')[:80]}")
    print("tier histogram:", tiers)
    return findings

try:
    login()
    test_tools()
    c10 = dump_invoice("37fb5b99-4c5b-4720-9051-b3a54685cc9f", "C10-only")
    rich = dump_invoice("db513099-8f5d-4175-987d-9f8b3c090c03", "Rich Meridian")
    # sanity: C10-only invoice should NOT contain any T4 findings
    if c10:
        t4 = [f for f in c10 if int(f.get("tier") or 0) >= 4]
        print(f"\nC10 invoice tier>=4 count: {len(t4)} (expected 0)")
    if rich:
        t4 = [f for f in rich if int(f.get("tier") or 0) >= 4]
        print(f"Rich invoice tier>=4 count: {len(t4)}")
except Exception as e:
    print("ERROR", type(e).__name__, e)
    sys.exit(1)
