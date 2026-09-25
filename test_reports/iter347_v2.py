"""Iter347 v2 - verify timeline humanisation + letter body voice + prefill via correct endpoints."""
import os, json, requests
BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://final-verify-web.preview.emergentagent.com").rstrip("/")
def login(e,p):
    r=requests.post(f"{BASE}/api/auth/login", json={"email":e,"password":p}, timeout=30); r.raise_for_status(); return r.json()["token"]
def H(t): return {"Authorization":f"Bearer {t}"}
R={}
tc = login("cathy@example.com","testpass123"); R["cathy_login"]="OK"

# participants
r = requests.get(f"{BASE}/api/participants", headers=H(tc), timeout=30)
plist = r.json().get("participants",[])
R["participants"] = [{"id":p.get("id"),"name":p.get("name") or p.get("display_name"), "provider":p.get("provider") or p.get("primary_provider") or p.get("provider_name")} for p in plist]

# pick primary/Dorothy
pid = None
for p in plist:
    nm = (p.get("name") or p.get("display_name") or "").lower()
    if "dorothy" in nm or "mum" in nm:
        pid = p.get("id"); break
if not pid and plist: pid = plist[0].get("id")
R["chosen_participant"] = pid

# timeline
if pid:
    r = requests.get(f"{BASE}/api/participants/{pid}/timeline", headers=H(tc), timeout=30)
    R["timeline_status"]=r.status_code
    tl = r.json() if r.status_code==200 else {}
    ev = tl.get("events") or tl.get("entries") or (tl if isinstance(tl,list) else [])
    R["timeline_count"]=len(ev)
    csc=[]; raws=[]; titles=[]
    for e in ev:
        title = e.get("title") or ""
        summary = e.get("summary") or e.get("description") or ""
        titles.append(title)
        if "classification" in title.lower() or "csc" in title.lower():
            csc.append({"title":title, "summary":summary[:250]})
        if summary.strip().startswith("{") or "'primary'" in summary or "Csc Completed" in title:
            raws.append({"title":title, "summary":summary[:150]})
    R["timeline_titles_sample"] = titles[:15]
    R["csc_entries"] = csc[:4]
    R["raw_dict_or_bad_title_entries"] = raws[:4]

# --- LF1 correspondence: create → prefill → generate ---
try:
    r = requests.post(f"{BASE}/api/lf1/correspondence", headers=H(tc), json={
        "participant_id": pid,
        "topic": "billing_query",
        "channel":"email"
    }, timeout=45)
    R["lf1_create_status"]=r.status_code
    if r.status_code<400:
        entry = r.json()
        eid = entry.get("id") or entry.get("entry_id")
        R["lf1_entry_id"]=eid
        R["lf1_entry_recipient"] = {"name":entry.get("recipient_name"), "prefilled": entry.get("recipient_prefilled")}

        # Prefill call
        rp = requests.post(f"{BASE}/api/lf1/correspondence/{eid}/prefill", headers=H(tc), json={}, timeout=45)
        R["lf1_prefill_status"]=rp.status_code
        if rp.status_code<400:
            pj = rp.json()
            R["lf1_prefill_keys"]=list(pj.keys())[:20]
            R["lf1_prefill_recipient"] = pj.get("recipient_name") or pj.get("prefill",{}).get("recipient_name")
            R["lf1_prefill_provider"] = pj.get("provider") or pj.get("prefill",{}).get("provider_name")
        else:
            R["lf1_prefill_err"]=rp.text[:200]

        # Generate
        rg = requests.post(f"{BASE}/api/lf1/correspondence/{eid}/generate", headers=H(tc), json={
            "tone":"friendly",
            "issue_summary":"There is a charge on the September statement I don't recognise."
        }, timeout=120)
        R["lf1_gen_status"]=rg.status_code
        if rg.status_code<400:
            gj = rg.json()
            body = gj.get("body") or gj.get("letter_body") or gj.get("draft",{}).get("body") or ""
            if not body and isinstance(gj.get("draft"), dict):
                body = gj["draft"].get("body","")
            R["lf1_body_len"]=len(body)
            R["lf1_body_snippet"]=body[:900]
            R["lf1_body_has_emdash"] = "—" in body
            R["lf1_body_has_endash"] = "–" in body
            low = body.lower()
            R["lf1_body_coaching_phrases"] = [p for p in [
                "ask the provider to explain", "you should request", "you should ask",
                "what to ask", "consider asking", "make sure to ask"
            ] if p in low]
        else:
            R["lf1_gen_err"]=rg.text[:400]
except Exception as e:
    R["lf1_exception"]=str(e)

# --- Solo user share panel check ---
try:
    ts = login("test+1777810269@example.com","SoloTest1!"); R["solo_login"]="OK"
    r = requests.get(f"{BASE}/api/auth/me", headers=H(ts), timeout=30)
    m = r.json() if r.status_code==200 else {}
    R["solo_plan"]=m.get("plan") or m.get("subscription",{}).get("plan")
    R["solo_features"] = m.get("features") or m.get("plan_features")
except Exception as e:
    R["solo_err"]=str(e)

print(json.dumps(R, indent=2, default=str))
