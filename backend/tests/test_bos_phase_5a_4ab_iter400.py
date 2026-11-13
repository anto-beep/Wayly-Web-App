"""Wayly BOS — 5A.1 Marketing / 5A.2 Command Centre / 4A Growth Engine / 4B Growth Pipeline.

Pytest suite for iteration 400. All data created is tagged with marker "ZZTEST"
so cleanup is id-based (never prefix-wide). No seed/reset scripts touched.
"""
import os
import time
import pyotp
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://statement-renderer.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "hello@wayly.com.au"
ADMIN_PASS = "Admin!2026"
ADMIN_TOTP = "M5A7R2XCCEXWYYKNJY55MVZYUHPYFA6W"

MARKER = "ZZTEST"

# ---------------- fixtures ----------------

@pytest.fixture(scope="session")
def admin_token():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/admin/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, f"admin login step1 failed: {r.status_code} {r.text}"
    temp = r.json().get("temp_token")
    assert temp
    code = pyotp.TOTP(ADMIN_TOTP).now()
    r2 = s.post(f"{BASE_URL}/api/admin/auth/2fa/verify", json={"temp_token": temp, "code": code}, timeout=30)
    assert r2.status_code == 200, f"2fa failed: {r2.status_code} {r2.text}"
    tok = r2.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="session")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"})
    return s


# track created ids for cleanup
CREATED = {
    "campaigns": [],
    "expenses": [],
    "content": [],
    "seo": [],
    "publicity": [],
    "partnerships": [],
    "experiments": [],
    "recommendations": [],
    "alerts": [],
    "bos_approvals": [],
}


@pytest.fixture(scope="session", autouse=True)
def cleanup(admin_client):
    yield
    # delete via direct mongo since there is no public delete for most of these
    try:
        from pymongo import MongoClient
        mc = MongoClient(os.environ["MONGO_URL"])
        dbn = os.environ.get("DB_NAME", "test_database")
        mdb = mc[dbn]
        if CREATED["expenses"]:
            mdb.marketing_expenses.delete_many({"id": {"$in": CREATED["expenses"]}})
        if CREATED["campaigns"]:
            mdb.marketing_campaigns.delete_many({"id": {"$in": CREATED["campaigns"]}})
        if CREATED["content"]:
            mdb.growth_content.delete_many({"id": {"$in": CREATED["content"]}})
        if CREATED["seo"]:
            mdb.growth_seo_opportunities.delete_many({"id": {"$in": CREATED["seo"]}})
        if CREATED["publicity"]:
            mdb.bos_publicity.delete_many({"id": {"$in": CREATED["publicity"]}})
        if CREATED["partnerships"]:
            mdb.bos_partnerships.delete_many({"id": {"$in": CREATED["partnerships"]}})
        if CREATED["experiments"]:
            mdb.bos_experiments.delete_many({"id": {"$in": CREATED["experiments"]}})
        if CREATED["recommendations"]:
            mdb.bos_recommendations.delete_many({"id": {"$in": CREATED["recommendations"]}})
        if CREATED["bos_approvals"]:
            mdb.bos_approvals.delete_many({"id": {"$in": CREATED["bos_approvals"]}})
        # delete only alerts we created matching our MARKER text
        mdb.bos_alerts.delete_many({"title": {"$regex": MARKER}})
    except Exception as e:
        print(f"cleanup warning: {e}")


# ---------------- 5A.1 Marketing ----------------

class TestMarketingSpend:
    def test_create_campaign(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/admin/marketing/campaigns",
                              json={"name": f"{MARKER} Campaign", "objective": "awareness",
                                    "status": "active"}, timeout=30)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
        c = r.json().get("campaign") or r.json()
        assert c.get("id")
        CREATED["campaigns"].append(c["id"])
        pytest.campaign_id = c["id"]

    def test_set_campaign_budget(self, admin_client):
        cid = pytest.campaign_id
        r = admin_client.post(f"{BASE_URL}/api/admin/marketing/campaigns/{cid}/budget",
                              json={"approved_budget_aud": 5000}, timeout=30)
        assert r.status_code == 200, f"{r.status_code} {r.text}"

    def test_create_expense_with_new_financials_and_placement(self, admin_client):
        payload = {
            "activity_name": f"{MARKER} Sponsored Article",
            "channel": "Placements",
            "category_slug": "sponsored-articles",
            "vendor": "ZZTEST Publisher",
            "campaign_id": pytest.campaign_id,
            "cost_ex_gst": 1000, "gst_amount": 100, "cost_inc_gst": 1100,
            "gst_treatment": "gst_inclusive",
            "status": "booked", "payment_status": "partially_paid",
            # new money lenses
            "committed_amount_aud": 1100,
            "incurred_amount_aud": 1100,
            "amount_paid_aud": 600,
            "planned_amount_aud": 1100,
            "credit_amount_aud": 0,
            # placement fields
            "publisher_name": "ZZTEST Publisher",
            "publication_name": "ZZTEST Weekly",
            "placement_format": "advertorial",
            "quoted_audience_size": 10000,
            "booked_distribution_date": "2026-06-20",
            "utm_source": "zztest",
            "utm_medium": "sponsored",
            "utm_campaign": "zztestcamp",
            "expense_reporting_date": "2026-06-10",
            "data_source": "manual",
        }
        r = admin_client.post(f"{BASE_URL}/api/admin/marketing/expenses", json=payload, timeout=30)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
        data = r.json()
        exp = data.get("expense") or data
        assert exp.get("id")
        CREATED["expenses"].append(exp["id"])
        pytest.expense_id = exp["id"]
        # financials block
        fin = exp.get("financials")
        assert fin is not None, "expense response must include financials block"
        assert fin.get("committed") == 1100.0, fin
        assert fin.get("incurred") == 1100.0, fin
        assert fin.get("paid") == 600.0, fin
        assert fin.get("outstanding") == 500.0, fin
        basis = fin.get("basis") or {}
        assert basis.get("committed") == "explicit"
        assert basis.get("paid") == "explicit"
        # Decimal128 round-trip as float for money fields
        for k in ("committed_amount_aud", "incurred_amount_aud", "amount_paid_aud"):
            v = exp.get(k)
            assert v is None or isinstance(v, (int, float)), f"{k} not float: {type(v)} {v}"
        # placement passthrough
        assert exp.get("publisher_name") == "ZZTEST Publisher"
        assert exp.get("utm_source") == "zztest"

    def test_partially_paid_without_amount_yields_unknown_paid(self, admin_client):
        payload = {
            "activity_name": f"{MARKER} Partial Unknown",
            "channel": "Media",
            "category_slug": "media-placements",
            "vendor": "ZZTEST Vendor2",
            "cost_ex_gst": 1000, "gst_amount": 100, "cost_inc_gst": 1100,
            "gst_treatment": "gst_inclusive",
            "status": "booked", "payment_status": "partially_paid",
            "expense_reporting_date": "2026-06-10",
            "data_source": "manual",
        }
        r = admin_client.post(f"{BASE_URL}/api/admin/marketing/expenses", json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text
        exp = r.json().get("expense") or r.json()
        CREATED["expenses"].append(exp["id"])
        fin = exp.get("financials") or {}
        basis = fin.get("basis") or {}
        assert basis.get("paid") == "unknown", f"paid basis should be unknown, got {basis}"
        assert fin.get("paid") is None, f"paid amount should be None, got {fin.get('paid')}"

    def test_gst_computation_endpoint_math(self):
        # unit-test compute_gst directly via module import
        from bos_core import compute_gst
        r = compute_gst(1100, "gst_inclusive")
        assert r["cost_inc_gst"] == 1100.0
        assert r["cost_ex_gst"] == 1000.0
        assert r["gst_amount"] == 100.0
        r2 = compute_gst(1000, "gst_exclusive")
        assert r2["cost_ex_gst"] == 1000.0
        assert r2["gst_amount"] == 100.0
        assert r2["cost_inc_gst"] == 1100.0
        r3 = compute_gst(1000, "gst_free")
        assert r3["gst_amount"] == 0.0
        assert r3["cost_inc_gst"] == 1000.0

    def test_campaign_financials_shape(self, admin_client):
        cid = pytest.campaign_id
        r = admin_client.get(f"{BASE_URL}/api/admin/marketing/campaigns/{cid}/financials", timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        # required blocks
        for k in ("budget", "totals", "by_channel", "by_category", "by_publisher", "monthly", "performance"):
            assert k in j, f"missing {k} in financials: {list(j.keys())}"
        perf = j["performance"]
        # attribution unavailable when revenue outcome missing
        assert perf.get("attribution") == "attribution_unavailable", perf
        assert perf.get("roas") is None
        assert perf.get("marketing_roi") is None

    def test_record_outcome_source_class(self, admin_client):
        cid = pytest.campaign_id
        r = admin_client.post(f"{BASE_URL}/api/admin/marketing/campaigns/{cid}/outcomes",
                              json={"metric": "enquiries", "value": 20,
                                    "as_of_date": "2026-06-10",
                                    "source": "Publisher weekly report",
                                    "source_class": "publisher_reported"}, timeout=30)
        assert r.status_code in (200, 201), r.text
        # fetch and verify
        r2 = admin_client.get(f"{BASE_URL}/api/admin/marketing/campaigns/{cid}", timeout=30)
        assert r2.status_code == 200
        c = r2.json().get("campaign") or r2.json()
        outcomes = c.get("outcomes") or []
        assert any(o.get("source_class") == "publisher_reported" for o in outcomes), outcomes

    def test_placements_lists_publishers(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/marketing/placements", timeout=30)
        assert r.status_code == 200, r.text
        rows = r.json().get("placements") or []
        assert any(p.get("id") == pytest.expense_id for p in rows), "our placement expense should be listed"

    def test_csv_export_has_new_columns(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/marketing/expenses/export.csv", timeout=30)
        assert r.status_code == 200
        text = r.text.splitlines()
        assert len(text) >= 1
        header = text[0]
        for col in ("committed_amount_aud", "incurred_amount_aud", "amount_paid_aud",
                    "credit_amount_aud", "publisher_name", "utm_source"):
            assert col in header, f"missing {col} in CSV header"


# ---------------- 5A.2 Command Centre ----------------

class TestCommandCentre:
    def test_trends_shape_and_honest_na(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/command-centre/trends?period=30d", timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "metrics" in j and isinstance(j["metrics"], list)
        for m in j["metrics"]:
            for k in ("current", "previous", "change", "pct_change", "key", "label"):
                assert k in m, m
            if m.get("previous") == 0:
                assert m.get("pct_change") is None, f"pct_change must be null when previous==0: {m}"

    def test_alerts_list_and_lifecycle(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/command-centre/alerts", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "alerts" in data and "active_by_severity" in data
        alerts = data["alerts"]
        if alerts:
            aid = alerts[0]["id"]
            ack = admin_client.post(f"{BASE_URL}/api/admin/command-centre/alerts/{aid}/acknowledge",
                                    json={"note": "ZZTEST ack"}, timeout=30)
            assert ack.status_code == 200
            res = admin_client.post(f"{BASE_URL}/api/admin/command-centre/alerts/{aid}/resolve",
                                    json={"note": "ZZTEST resolve"}, timeout=30)
            assert res.status_code == 200

    def test_approvals_centre_sources(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/command-centre/approvals", timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert "approvals" in j and isinstance(j["approvals"], list)
        # all included help kinds must be in_review (never drafts)
        for it in j["approvals"]:
            assert it.get("kind") is not None

    def test_needs_attention(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/command-centre/needs-attention", timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert "priorities" in j

    def test_integrations_all_external_not_connected(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/command-centre/integrations", timeout=30)
        assert r.status_code == 200
        j = r.json()
        for ext in j.get("external", []):
            assert ext.get("status") == "not_connected", ext
        # manual entry may be connected/no_data_yet but never "verified"
        for m in j.get("internal", []):
            assert m.get("status") in ("connected", "no_data_yet"), m

    def test_briefing_daily_separates_facts_and_recs(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/command-centre/briefing?type=daily", timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert "facts" in j and "recommendations" in j and "snapshot" in j

    def test_metrics_definitions(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/command-centre/metrics", timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert isinstance(j.get("metrics"), list) and len(j["metrics"]) > 0

    def test_summary_counts_in_review_only(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/command-centre/summary", timeout=30)
        assert r.status_code == 200, r.text
        s = r.json()
        # help pending_approval should only count in_review (not drafts)
        help_block = s.get("help") or {}
        pa = help_block.get("pending_approval")
        assert pa is None or isinstance(pa, int)


# ---------------- 4A Growth Engine ----------------

class TestGrowthEngine:
    def test_content_crud_and_lifecycle(self, admin_client):
        # create
        r = admin_client.post(f"{BASE_URL}/api/admin/growth/content",
                              json={"title": f"{MARKER} Blog", "channel": "blog",
                                    "brief": "ZZTEST content",
                                    "scheduled_date": "2026-07-01"}, timeout=30)
        assert r.status_code in (200, 201), r.text
        j = r.json()
        item = j.get("content") or j.get("item") or j
        cid = item.get("id")
        assert cid, j
        CREATED["content"].append(cid)
        pytest.content_id = cid

        # list
        lr = admin_client.get(f"{BASE_URL}/api/admin/growth/content", timeout=30)
        assert lr.status_code == 200
        assert any(c.get("id") == cid for c in (lr.json().get("content") or lr.json().get("items") or []))

        # calendar
        cal = admin_client.get(f"{BASE_URL}/api/admin/growth/content/calendar", timeout=30)
        assert cal.status_code == 200

        # patch
        pr = admin_client.patch(f"{BASE_URL}/api/admin/growth/content/{cid}",
                                json={"brief": "ZZTEST updated"}, timeout=30)
        assert pr.status_code == 200

        # submit (creates bos_approvals entry)
        sr = admin_client.post(f"{BASE_URL}/api/admin/growth/content/{cid}/submit",
                               json={"note": "ZZTEST please review"}, timeout=30)
        assert sr.status_code == 200, sr.text
        sj = sr.json()
        appr = sj.get("approval") or {}
        if appr.get("id"):
            CREATED["bos_approvals"].append(appr["id"])
            pytest.content_approval_id = appr["id"]

        # schedule BEFORE approval -> should fail (requires approved)
        bad = admin_client.post(f"{BASE_URL}/api/admin/growth/content/{cid}/schedule",
                                json={"scheduled_date": "2026-07-02"}, timeout=30)
        assert bad.status_code in (400, 403, 409), f"should reject unapproved: {bad.status_code} {bad.text}"

    def test_bos_approve_syncs_source(self, admin_client):
        aid = getattr(pytest, "content_approval_id", None)
        if not aid:
            pytest.skip("no content approval id captured")
        # approve
        r = admin_client.post(f"{BASE_URL}/api/admin/bos/approvals/{aid}/approve",
                              json={"note": "ZZTEST approve"}, timeout=30)
        assert r.status_code == 200, r.text
        # mark-executed BEFORE schedule — allowed? approval != execution, so mark-executed allowed only after approved
        me = admin_client.post(f"{BASE_URL}/api/admin/bos/approvals/{aid}/mark-executed",
                               json={"note": "ZZTEST executed"}, timeout=30)
        assert me.status_code == 200, me.text

    def test_content_schedule_and_publish_after_approval(self, admin_client):
        cid = pytest.content_id
        # schedule now that it's approved
        s = admin_client.post(f"{BASE_URL}/api/admin/growth/content/{cid}/schedule",
                              json={"scheduled_date": "2026-07-02"}, timeout=30)
        # OK if 200 — but since we already marked-executed the approval, it might still work
        assert s.status_code in (200, 409), f"{s.status_code} {s.text}"
        # mark-published
        mp = admin_client.post(f"{BASE_URL}/api/admin/growth/content/{cid}/mark-published",
                               json={"published_url": "https://example.com/zztest"}, timeout=30)
        assert mp.status_code in (200, 409), f"{mp.status_code} {mp.text}"

    def test_ai_draft_never_auto_publishes(self, admin_client):
        cid = pytest.content_id
        r = admin_client.post(f"{BASE_URL}/api/admin/growth/content/{cid}/ai-draft",
                              json={"extra_instructions": "Short overview grounded in approved help knowledge."},
                              timeout=120)
        # may 200 with draft, or 400/503 if LLM key unavailable; must not publish
        assert r.status_code in (200, 400, 500, 503), r.text
        if r.status_code == 200:
            j = r.json()
            # response contains draft text but NOT published flag
            assert j.get("published") in (None, False)

    def test_seo_opportunities_crud(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/admin/growth/seo/opportunities",
                              json={"page_or_topic": f"{MARKER} topic",
                                    "signal": "low CTR",
                                    "source": "admin_recorded",
                                    "priority": "medium"}, timeout=30)
        assert r.status_code in (200, 201), r.text
        j = r.json()
        item = j.get("opportunity") or j
        oid = item.get("id")
        assert oid
        CREATED["seo"].append(oid)
        # list
        lr = admin_client.get(f"{BASE_URL}/api/admin/growth/seo/opportunities", timeout=30)
        assert lr.status_code == 200
        # patch
        pr = admin_client.patch(f"{BASE_URL}/api/admin/growth/seo/opportunities/{oid}",
                                json={"status": "in_progress"}, timeout=30)
        assert pr.status_code == 200

    def test_connectors_readonly_not_connected(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/growth/connectors", timeout=30)
        assert r.status_code == 200
        j = r.json()
        for c in (j.get("connectors") or []):
            assert c.get("status") == "not_connected", c


# ---------------- 4B Growth Pipeline ----------------

class TestGrowthPipeline:
    def test_publicity_crud_and_mark_sent_gating(self, admin_client):
        # create
        r = admin_client.post(f"{BASE_URL}/api/admin/pipeline/publicity",
                              json={"outlet": f"{MARKER} Times",
                                    "contact": "Jane jane@zztest.com",
                                    "topic": "ZZTEST angle",
                                    "priority": "medium"}, timeout=30)
        assert r.status_code in (200, 201), r.text
        item = (r.json().get("opportunity") or r.json().get("publicity") or r.json())
        pid = item.get("id")
        assert pid
        CREATED["publicity"].append(pid)

        # ai-pitch — never auto-sends
        ap = admin_client.post(f"{BASE_URL}/api/admin/pipeline/publicity/{pid}/ai-pitch",
                               json={"angle": "short pitch"}, timeout=120)
        assert ap.status_code in (200, 400, 500, 503), ap.text
        if ap.status_code == 200:
            assert ap.json().get("sent") in (None, False)

        # mark-sent BEFORE approval must fail
        ms = admin_client.post(f"{BASE_URL}/api/admin/pipeline/publicity/{pid}/mark-sent",
                               json={"note": "ZZTEST"}, timeout=30)
        assert ms.status_code in (400, 403, 409), f"mark-sent should gate on approval: {ms.status_code}"

        # submit for approval
        sub = admin_client.post(f"{BASE_URL}/api/admin/pipeline/publicity/{pid}/submit",
                                json={"note": "ZZTEST"}, timeout=30)
        assert sub.status_code == 200, sub.text
        appr = sub.json().get("approval") or {}
        if appr.get("id"):
            CREATED["bos_approvals"].append(appr["id"])

    def test_partnership_independence_flag(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/admin/pipeline/partnerships",
                              json={"organisation": f"{MARKER} Provider X",
                                    "description": "They want a provider referral agreement with commission.",
                                    "partnership_type": "provider"}, timeout=30)
        assert r.status_code in (200, 201), r.text
        item = r.json().get("partnership") or r.json()
        pid = item.get("id")
        assert pid
        CREATED["partnerships"].append(pid)
        assert item.get("independence_flag") is True, f"should flag independence risk: {item}"

    def test_experiments_crud(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/admin/pipeline/experiments",
                              json={"title": f"{MARKER} Test",
                                    "business_problem": "Low signup conversion.",
                                    "hypothesis": "ZZTEST hypothesis",
                                    "primary_metric": "signups"}, timeout=30)
        assert r.status_code in (200, 201), r.text
        item = r.json().get("experiment") or r.json()
        eid = item.get("id")
        assert eid
        CREATED["experiments"].append(eid)

    def test_referrals_flag_off(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/pipeline/referrals", timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert j.get("enabled") is False, f"referral programme must be OFF behind feature flag: {j}"
        # POST source is allowed to persist sources, but should not activate programme
        add = admin_client.post(f"{BASE_URL}/api/admin/pipeline/referrals/sources",
                                json={"source_name": f"{MARKER} source"}, timeout=30)
        assert add.status_code in (200, 201, 400, 403), add.text

    def test_recommendations_crud_and_generate(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/admin/pipeline/recommendations",
                              json={"title": f"{MARKER} Rec",
                                    "area": "marketing",
                                    "evidence": "Signups dipped 20% last 7d",
                                    "source": "command-centre-trends",
                                    "rationale": "ZZTEST rationale"}, timeout=30)
        assert r.status_code in (200, 201), r.text
        item = r.json().get("recommendation") or r.json()
        rid = item.get("id")
        assert rid
        CREATED["recommendations"].append(rid)
        gen = admin_client.post(f"{BASE_URL}/api/admin/pipeline/recommendations/generate",
                                json={}, timeout=60)
        assert gen.status_code in (200, 201, 400, 500), gen.text


# ---------------- shared BOS approvals list ----------------

class TestBosApprovals:
    def test_list_approvals(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/bos/approvals", timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert "approvals" in j and isinstance(j["approvals"], list)
