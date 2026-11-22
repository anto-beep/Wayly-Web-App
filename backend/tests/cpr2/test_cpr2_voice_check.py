"""CPR-2 v1 iteration 105 acceptance tests: participant voice check (Section H)."""
import os
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent.parent / "frontend" / ".env")
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": "cathy@example.com", "password": "testpass123"})
    assert r.status_code == 200
    token = r.json().get("token") or r.json().get("access_token")
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def pid(session):
    r = session.get(f"{BASE}/api/core/participants")
    return next((p["id"] for p in r.json()["participants"] if p["is_primary"]),
                r.json()["participants"][0]["id"])


def _mk_review(goal_id, answer, note=None):
    return {"goal_id": goal_id, "goal_text_shown": "Test goal", "participant_answer": answer,
            "participant_notes": note}


def _cleanup_vc(vc_id, pid):
    from pymongo import MongoClient
    load_dotenv("/app/backend/.env")
    m = MongoClient(os.environ["MONGO_URL"])
    m[os.environ["DB_NAME"]].participant_voice_checks.delete_one({"id": vc_id})
    m[os.environ["DB_NAME"]].timeline_events.delete_many({"metadata.voice_check_id": vc_id})


def test_status_reports_voice_check(session):
    r = session.get(f"{BASE}/api/cpr2/status")
    assert r.status_code == 200
    assert "voice_check" in r.json()["surfaces"]


def test_participant_led_finding(session, pid):
    reviews = [_mk_review(str(uuid.uuid4()), "yes_i_wanted_this") for _ in range(4)]
    reviews.append(_mk_review(str(uuid.uuid4()), "yes_but_not_exactly"))
    r = session.post(f"{BASE}/api/cpr2/participants/{pid}/voice-checks",
                     json={"goal_reviews": reviews})
    assert r.status_code == 200
    body = r.json()
    assert body["overall_finding"] == "participant_led"
    assert body["follow_up_suggestions"]["headline_tokens"]["caregiver"].startswith("Sounds like")
    assert body["contains_sensitive_content_flag"] is False
    _cleanup_vc(body["id"], pid)


def test_provider_led_finding_and_follow_up(session, pid):
    reviews = [_mk_review(str(uuid.uuid4()), "no_this_was_the_providers_idea") for _ in range(3)]
    reviews.extend([_mk_review(str(uuid.uuid4()), "i_dont_remember_discussing_this") for _ in range(2)])
    r = session.post(f"{BASE}/api/cpr2/participants/{pid}/voice-checks",
                     json={"goal_reviews": reviews})
    assert r.status_code == 200
    body = r.json()
    assert body["overall_finding"] == "provider_led"
    actions = [a["key"] for a in body["follow_up_suggestions"]["suggested_actions"]]
    assert "draft_revision_letter" in actions
    assert "create_voice_note" in actions
    _cleanup_vc(body["id"], pid)


def test_participant_absent_when_mostly_skipped(session, pid):
    reviews = [_mk_review(str(uuid.uuid4()), "skipped") for _ in range(4)]
    reviews.append(_mk_review(str(uuid.uuid4()), "yes_i_wanted_this"))
    r = session.post(f"{BASE}/api/cpr2/participants/{pid}/voice-checks",
                     json={"goal_reviews": reviews})
    assert r.status_code == 200
    assert r.json()["overall_finding"] == "participant_absent"
    _cleanup_vc(r.json()["id"], pid)


def test_mixed_collaborative(session, pid):
    reviews = [
        _mk_review(str(uuid.uuid4()), "yes_i_wanted_this"),
        _mk_review(str(uuid.uuid4()), "yes_but_not_exactly"),
        _mk_review(str(uuid.uuid4()), "no_this_was_the_providers_idea"),
        _mk_review(str(uuid.uuid4()), "yes_i_wanted_this"),
    ]
    r = session.post(f"{BASE}/api/cpr2/participants/{pid}/voice-checks",
                     json={"goal_reviews": reviews})
    assert r.status_code == 200
    assert r.json()["overall_finding"] == "mixed_collaborative"
    _cleanup_vc(r.json()["id"], pid)


def test_bad_answer_rejected(session, pid):
    r = session.post(f"{BASE}/api/cpr2/participants/{pid}/voice-checks",
                     json={"goal_reviews": [_mk_review(str(uuid.uuid4()), "no_such_answer")]})
    assert r.status_code == 422


def test_authored_on_behalf_flag_persists(session, pid):
    r = session.post(f"{BASE}/api/cpr2/participants/{pid}/voice-checks",
                     json={"authored_on_behalf": True,
                           "goal_reviews": [_mk_review(str(uuid.uuid4()), "yes_i_wanted_this")]})
    assert r.status_code == 200
    body = r.json()
    assert body["authored_on_behalf"] is True
    assert body["participant_confirmed_by_user_id"] is None
    _cleanup_vc(body["id"], pid)


def test_sensitive_content_flag_set_by_keyword(session, pid):
    reviews = [_mk_review(str(uuid.uuid4()), "yes_but_not_exactly",
                          note="I'm scared to say no to my provider — they said they'd stop coming.")]
    r = session.post(f"{BASE}/api/cpr2/participants/{pid}/voice-checks",
                     json={"goal_reviews": reviews})
    assert r.status_code == 200
    assert r.json()["contains_sensitive_content_flag"] is True
    _cleanup_vc(r.json()["id"], pid)


def test_patch_recomputes_finding(session, pid):
    r = session.post(f"{BASE}/api/cpr2/participants/{pid}/voice-checks",
                     json={"goal_reviews": [_mk_review(str(uuid.uuid4()), "yes_i_wanted_this")]})
    vcid = r.json()["id"]
    # Patch with mostly-no reviews
    new_reviews = [_mk_review(str(uuid.uuid4()), "no_this_was_the_providers_idea") for _ in range(3)]
    r = session.patch(f"{BASE}/api/cpr2/voice-checks/{vcid}", json={"goal_reviews": new_reviews})
    assert r.status_code == 200
    assert r.json()["overall_finding"] == "provider_led"
    _cleanup_vc(vcid, pid)


def test_user_can_override_overall_finding(session, pid):
    r = session.post(f"{BASE}/api/cpr2/participants/{pid}/voice-checks",
                     json={"goal_reviews": [_mk_review(str(uuid.uuid4()), "yes_i_wanted_this")]})
    vcid = r.json()["id"]
    r = session.patch(f"{BASE}/api/cpr2/voice-checks/{vcid}",
                      json={"overall_finding": "mixed_collaborative", "overall_notes": "I want to be careful about goal 3."})
    assert r.status_code == 200
    assert r.json()["overall_finding"] == "mixed_collaborative"
    assert r.json()["overall_notes"] == "I want to be careful about goal 3."
    _cleanup_vc(vcid, pid)


def test_mark_follow_up_actions(session, pid):
    r = session.post(f"{BASE}/api/cpr2/participants/{pid}/voice-checks",
                     json={"goal_reviews": [_mk_review(str(uuid.uuid4()), "no_this_was_the_providers_idea")]})
    vcid = r.json()["id"]
    for action in ("letter_drafted", "voice_note_created", "plan_re_review_requested"):
        r = session.post(f"{BASE}/api/cpr2/voice-checks/{vcid}/mark-follow-up",
                         json={"action": action, "reference_id": str(uuid.uuid4()) if action != "plan_re_review_requested" else None})
        assert r.status_code == 200
    fresh = session.get(f"{BASE}/api/cpr2/participants/{pid}/voice-checks").json()["voice_checks"][0]
    taken = fresh["suggested_actions_taken"]
    assert taken["letter_drafted"] and taken["voice_note_created"] and taken["plan_re_review_requested"]
    _cleanup_vc(vcid, pid)


def test_list_scoped_by_plan_review(session, pid):
    plan_id_a = str(uuid.uuid4())
    plan_id_b = str(uuid.uuid4())
    ra = session.post(f"{BASE}/api/cpr2/participants/{pid}/voice-checks",
                      json={"plan_review_id": plan_id_a,
                            "goal_reviews": [_mk_review(str(uuid.uuid4()), "yes_i_wanted_this")]})
    rb = session.post(f"{BASE}/api/cpr2/participants/{pid}/voice-checks",
                      json={"plan_review_id": plan_id_b,
                            "goal_reviews": [_mk_review(str(uuid.uuid4()), "yes_i_wanted_this")]})
    la = session.get(f"{BASE}/api/cpr2/participants/{pid}/voice-checks?plan_review_id={plan_id_a}")
    assert la.status_code == 200
    ids = [vc["id"] for vc in la.json()["voice_checks"]]
    assert ra.json()["id"] in ids
    assert rb.json()["id"] not in ids
    _cleanup_vc(ra.json()["id"], pid)
    _cleanup_vc(rb.json()["id"], pid)
