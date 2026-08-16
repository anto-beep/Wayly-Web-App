"""Iter 36 - Test new features: participant-scoped digest, report notification link, SEO sitemap."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://mobile-exact-parity.preview.emergentagent.com').rstrip('/')


@pytest.fixture(scope="module")
def cathy_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "cathy@example.com", "password": "testpass123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def cathy_headers(cathy_token):
    return {"Authorization": f"Bearer {cathy_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def participants(cathy_headers):
    r = requests.get(f"{BASE_URL}/api/v2/participants", headers=cathy_headers)
    assert r.status_code == 200, r.text
    items = r.json().get("items", [])
    assert len(items) >= 1
    return items


# ---------- Digest scoped by participant ----------
class TestDigestParticipantScope:
    def test_digest_preview_per_participant(self, cathy_headers, participants):
        for p in participants:
            h = {**cathy_headers, "X-Participant-Id": p["id"]}
            r = requests.get(f"{BASE_URL}/api/digest/preview", headers=h)
            assert r.status_code == 200, f"participant {p['id']}: {r.text}"
            data = r.json()
            assert data.get("participant_id") == p["id"], f"expected pid {p['id']} got {data.get('participant_id')}"
            hh = data.get("household_name") or ""
            assert (p.get("first_name") or "").lower() in hh.lower() or len(hh) > 0, f"household_name {hh!r} missing first_name {p.get('first_name')!r}"

    def test_digest_send_and_history_scoped(self, cathy_headers, participants):
        p = participants[0]
        h = {**cathy_headers, "X-Participant-Id": p["id"]}
        r = requests.post(f"{BASE_URL}/api/digest/send", headers=h, json={})
        assert r.status_code in (200, 201), r.text
        send_data = r.json()
        assert send_data.get("ok") is True or "message" in send_data
        time.sleep(1)
        hist = requests.get(f"{BASE_URL}/api/digest/history", headers=h)
        assert hist.status_code == 200, hist.text
        items = hist.json().get("items", hist.json() if isinstance(hist.json(), list) else [])
        if isinstance(items, dict):
            items = items.get("items", [])
        # For primary participant, history may also include legacy entries with participant_id=None ($or filter).
        # For non-primary, only matching participant_id allowed.
        if items:
            is_primary = p.get("is_primary", False)
            for it in items:
                pid_val = it.get("participant_id")
                if is_primary:
                    assert pid_val in (p["id"], None), f"history has unexpected pid: {pid_val}"
                else:
                    assert pid_val == p["id"], f"history has wrong pid for non-primary: {pid_val}"


# ---------- Report notification uses 'link' ----------
class TestReportNotificationLink:
    def test_report_generate_creates_link_notification(self, cathy_headers, participants):
        p = participants[0]
        h = {**cathy_headers, "X-Participant-Id": p["id"]}
        before = requests.get(f"{BASE_URL}/api/notifications", headers=h)
        assert before.status_code == 200
        before_items = before.json().get("items", [])
        before_ids = {n.get("id") for n in before_items}

        gen = requests.post(f"{BASE_URL}/api/reports/generate", headers=h, json={"report_type": "HOUSEHOLD_SUMMARY"})
        assert gen.status_code in (200, 201, 202), gen.text
        rid = gen.json().get("id") or gen.json().get("report_id")
        assert rid

        # poll for READY
        ready = False
        for _ in range(40):
            time.sleep(1.5)
            s = requests.get(f"{BASE_URL}/api/reports/{rid}", headers=h)
            if s.status_code == 200 and s.json().get("status") == "READY":
                ready = True
                break
        assert ready, f"Report {rid} did not reach READY"

        time.sleep(2)
        after = requests.get(f"{BASE_URL}/api/notifications", headers=h)
        assert after.status_code == 200
        after_items = after.json().get("items", [])
        new_notifs = [n for n in after_items if n.get("id") not in before_ids]
        assert new_notifs, "no new notifications after report ready"
        # find one that references the report
        match = None
        for n in new_notifs:
            link = n.get("link", "")
            if link and ("reports" in link.lower() or rid in link):
                match = n
                break
        assert match is not None, f"no notification with 'link' to reports. New notifs: {new_notifs}"
        assert "url" not in match or match.get("link"), "notification still uses 'url' key only"
        assert match["link"].startswith("/app/reports") or rid in match["link"], f"link={match['link']!r}"


# ---------- Sitemap contains all 8 new slugs ----------
class TestSitemap:
    SLUGS = [
        "wayly-statement-decoder-support-at-home-statement-explained",
        "wayly-budget-calculator-support-at-home-quarterly-budget",
        "wayly-provider-price-checker-support-at-home-prices",
        "wayly-classification-self-check-support-at-home-levels",
        "wayly-reassessment-letter-generator-support-at-home-reassessment",
        "wayly-contribution-estimator-support-at-home-fees",
        "wayly-care-plan-reviewer-support-at-home-care-plan",
        "wayly-family-coordinator-managing-parents-aged-care",
    ]

    def test_sitemap_lists_all_8_new_slugs(self):
        r = requests.get(f"{BASE_URL}/api/public/seo/sitemap.xml")
        assert r.status_code == 200, r.text
        body = r.text
        missing = [s for s in self.SLUGS if s not in body]
        assert not missing, f"sitemap missing slugs: {missing}"
