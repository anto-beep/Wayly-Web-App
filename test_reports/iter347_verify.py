"""Iter347 - verify Wayly 7-item UX batch via API for timeline + letters + share panel + provider prefill."""
import os, json, re
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://final-verify-web.preview.emergentagent.com").rstrip("/")

def login(email, password):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} failed {r.status_code} {r.text[:200]}"
    return r.json()["token"]

def hdr(t): return {"Authorization": f"Bearer {t}"}

results = {}

# --- Family caregiver (cathy) ---
t_cathy = login("cathy@example.com", "testpass123")
results["cathy_login"] = "OK"

# 1. TIMELINE humanised - look for classification self-check entries on cathy
r = requests.get(f"{BASE}/api/participant/timeline", headers=hdr(t_cathy), timeout=30)
tl = r.json() if r.status_code == 200 else {"status": r.status_code, "err": r.text[:200]}
entries = tl.get("entries", tl if isinstance(tl, list) else [])
results["timeline_status"] = r.status_code
results["timeline_count"] = len(entries) if isinstance(entries, list) else "n/a"

csc = []
raw_dict_entries = []
for e in (entries if isinstance(entries, list) else []):
    title = (e.get("title") or "").lower()
    summary = e.get("summary") or ""
    if "classification" in title or "csc" in title:
        csc.append({"title": e.get("title"), "summary": summary[:200]})
    if summary.startswith("{") or "'primary'" in summary:
        raw_dict_entries.append({"title": e.get("title"), "summary": summary[:120]})
results["csc_entries"] = csc[:3]
results["raw_dict_entries"] = raw_dict_entries[:3]

# 2. LETTERS share panel / provider prefill data
# LF1 intake pre-fill: /api/lf1/... or the letter draft flow
r = requests.get(f"{BASE}/api/lf1/recipients", headers=hdr(t_cathy), timeout=30)
results["cathy_recipients_status"] = r.status_code
if r.status_code == 200:
    recs = r.json()
    results["cathy_recipients"] = [ {"id": x.get("id"), "name": x.get("name"), "email": x.get("email")} for x in (recs.get("recipients", recs) if isinstance(recs, (list,dict)) else [])][:5]

# Active participant
r = requests.get(f"{BASE}/api/participants", headers=hdr(t_cathy), timeout=30)
if r.status_code == 200:
    ps = r.json()
    plist = ps.get("participants", []) if isinstance(ps, dict) else (ps if isinstance(ps, list) else [])
    results["cathy_participants"] = [ {"id": p.get("id"), "name": p.get("name") or p.get("full_name"), "provider": p.get("provider") or p.get("primary_provider")} for p in plist if isinstance(p, dict) ][:5]
    results["cathy_participants_raw_type"] = type(ps).__name__

# Household members (share panel labels)
r = requests.get(f"{BASE}/api/household/members", headers=hdr(t_cathy), timeout=30)
results["cathy_household_status"] = r.status_code
if r.status_code == 200:
    hh = r.json()
    members = hh.get("members", hh) if isinstance(hh, (list,dict)) else []
    results["cathy_household_roles"] = [m.get("role") for m in members]
    results["cathy_household_role_labels"] = [m.get("role_label") or m.get("display_role") or m.get("label") for m in members]

# Access state for cathy (should be family plan)
r = requests.get(f"{BASE}/api/auth/me", headers=hdr(t_cathy), timeout=30)
if r.status_code == 200:
    me = r.json()
    results["cathy_plan"] = me.get("plan") or me.get("subscription", {}).get("plan")
    results["cathy_base_plan"] = me.get("base_plan")

# --- Solo test user ---
try:
    t_solo = login("test+1777810269@example.com", "SoloTest1!")
    results["solo_login"] = "OK"
    r = requests.get(f"{BASE}/api/auth/me", headers=hdr(t_solo), timeout=30)
    if r.status_code == 200:
        m = r.json()
        results["solo_plan"] = m.get("plan") or m.get("subscription", {}).get("plan")
        results["solo_base_plan"] = m.get("base_plan")
    # Share panel visibility signal - possibly plan flag exposed via household or feature-flag endpoint
    r = requests.get(f"{BASE}/api/household/members", headers=hdr(t_solo), timeout=30)
    results["solo_household_status"] = r.status_code
    if r.status_code == 200:
        hh = r.json()
        results["solo_household"] = hh if isinstance(hh, dict) else {"members": hh}
except Exception as e:
    results["solo_login"] = f"FAIL: {e}"

# 3. Try generating a letter with cathy for body-voice check
try:
    r = requests.post(f"{BASE}/api/lf1/draft", headers=hdr(t_cathy), json={
        "topic": "billing_query",
        "issue_summary": "There is a charge on the September statement I don't recognise.",
        "tone": "friendly"
    }, timeout=90)
    results["lf1_draft_status"] = r.status_code
    if r.status_code < 400:
        j = r.json()
        body = j.get("body") or j.get("letter") or j.get("draft") or ""
        results["lf1_draft_body_snippet"] = body[:800]
        results["lf1_draft_has_emdash"] = ("—" in body or "–" in body)
        results["lf1_draft_has_coaching"] = any(p in body.lower() for p in ["ask the provider to explain", "you should request"])
    else:
        results["lf1_draft_err"] = r.text[:300]
except Exception as e:
    results["lf1_draft_exc"] = str(e)

print(json.dumps(results, indent=2, default=str))
