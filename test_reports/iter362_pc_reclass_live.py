"""
Live decode test for PC_RECLASS_CONTRIB - uploads the November 2026 fixture via Statement Decoder API,
polls the upload-job endpoint, then fetches the saved statement and verifies RULE_PC_RECLASS_CONTRIB appears.
"""
import os, sys, time, json, requests, uuid

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL missing"
API = f"{BASE}/api"
EMAIL = "cathy@example.com"
PASSWORD = "testpass123"
FIXTURE = "/app/backend/tests/fixtures/POST_OCT_2026_November_2026.pdf"

s = requests.Session()

def login():
    r = s.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    r.raise_for_status()
    j = r.json()
    tok = j.get("access_token") or j.get("token")
    assert tok, f"no token in response: {r.text[:200]}"
    s.headers.update({"Authorization": f"Bearer {tok}"})
    print(f"[OK] logged in as {EMAIL}")

def upload():
    with open(FIXTURE, "rb") as f:
        files = {"file": ("POST_OCT_2026_November_2026.pdf", f, "application/pdf")}
        headers = {"Idempotency-Key": f"iter362-{uuid.uuid4().hex[:12]}"}
        r = s.post(f"{API}/statements/upload", files=files, headers=headers, timeout=90)
    print(f"[upload] {r.status_code}")
    if r.status_code >= 400:
        print(f"body: {r.text[:800]}")
        return None
    j = r.json()
    print(f"upload response: {json.dumps(j)[:400]}")
    return j

def poll_job(job_id, timeout=240):
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = s.get(f"{API}/statements/upload-job/{job_id}", timeout=30)
        if r.status_code != 200:
            print(f"[poll] {r.status_code}: {r.text[:200]}")
            time.sleep(5); continue
        j = r.json()
        st = j.get("status"); ph = j.get("phase")
        print(f"[poll] status={st} phase={ph}")
        if st == "done":
            return j
        if st in ("error", "duplicate"):
            print(f"[poll] final payload: {json.dumps(j)[:400]}")
            return j
        time.sleep(4)
    print("[poll] TIMEOUT")
    return None

def check_rule(payload, label):
    anomalies = (payload.get("audit") or {}).get("anomalies") or payload.get("anomalies") or []
    hit = []
    for a in anomalies:
        rid = str(a.get("rule") or a.get("code") or a.get("rule_id") or "")
        if "PC_RECLASS" in rid:
            hit.append(a)
    print(f"[{label}] anomalies={len(anomalies)} PC_RECLASS matches={len(hit)}")
    if hit:
        print(f"[{label}] first: {json.dumps(hit[0])[:500]}")
    else:
        rids = sorted({str(a.get('rule') or a.get('code') or a.get('rule_id') or '') for a in anomalies})
        print(f"[{label}] rule ids seen: {rids[:20]}")
    return bool(hit)

def main():
    login()
    up = upload()
    if not up: return 2
    job_id = up.get("job_id") or up.get("id")
    if not job_id:
        print(f"[FAIL] no job_id; got: {up}")
        return 2
    final = poll_job(job_id)
    if not final or final.get("status") != "done":
        print(f"[FAIL] job not done, final={final}")
        return 1
    sid = final.get("statement_id")
    print(f"[OK] decode done, statement_id={sid}")
    # Fetch saved statement
    r = s.get(f"{API}/statements/{sid}", timeout=30)
    print(f"[saved GET] {r.status_code}")
    saved = r.json() if r.status_code == 200 else {}
    ok_saved = check_rule(saved, "saved")
    print(f"\nRESULT saved_hit_PC_RECLASS={ok_saved}")
    return 0 if ok_saved else 1

if __name__ == "__main__":
    sys.exit(main())
