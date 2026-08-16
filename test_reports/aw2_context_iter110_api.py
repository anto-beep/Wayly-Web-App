"""
Focused AW-2 backend/API regression check used alongside the sidebar fix.

Logs in as Cathy, grants Budget projection consent for the primary participant,
starts an Ask Wayly conversation, and verifies the returned assistant message
records budget_projection in context_flags_used or cited_sources.
"""

import json
import sys
from pathlib import Path

import requests


BASE_URL = "https://mobile-exact-parity.preview.emergentagent.com/api"
OUT = Path("/app/test_reports/aw2_context_iter110_api_results.json")


def main():
    s = requests.Session()
    login = s.post(
        f"{BASE_URL}/auth/login",
        json={"email": "cathy@example.com", "password": "testpass123"},
        timeout=30,
    )
    login.raise_for_status()
    token = login.json()["token"]
    s.headers.update({"Authorization": f"Bearer {token}"})

    parts = s.get(f"{BASE_URL}/core/participants", timeout=30)
    parts.raise_for_status()
    participants = parts.json().get("participants") or []
    primary = next((p for p in participants if p.get("is_primary")), participants[0] if participants else None)
    if not primary:
        raise AssertionError("No participant available for Cathy account")
    pid = primary["id"]

    consent = s.post(
        f"{BASE_URL}/aw2/context/consent",
        json={
            "data_source": "budget_projection",
            "participant_context_id": pid,
            "consent_state": "granted",
        },
        timeout=30,
    )
    consent.raise_for_status()

    conv = s.post(
        f"{BASE_URL}/aw2/conversations",
        json={
            "participant_context_id": pid,
            "initial_message": "How much budget do I have left this quarter?",
        },
        timeout=90,
    )
    conv.raise_for_status()
    conversation = conv.json()["conversation"]
    assistant = next((m for m in conversation.get("messages", []) if m.get("role") == "assistant"), {})
    flags = assistant.get("context_flags_used") or []
    cited = [c.get("source_type") for c in (assistant.get("cited_sources") or [])]
    body = assistant.get("content") or ""

    result = {
        "participant_id": pid,
        "participant_first_name": primary.get("first_name"),
        "participant_classification": primary.get("classification"),
        "conversation_id": conversation.get("id"),
        "status": "pass" if ("budget_projection" in flags or "budget_projection" in cited) else "fail",
        "context_flags_used": flags,
        "cited_source_types": cited,
        "assistant_excerpt": body[:500],
        "fallback_text_present": "I have consent but no data available" in body,
    }
    OUT.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    if result["status"] != "pass":
        raise AssertionError("budget_projection not returned in context flags/citations")
    if result["fallback_text_present"]:
        raise AssertionError("Old v1 fallback text still present")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        OUT.write_text(json.dumps({"status": "error", "error": str(exc)}, indent=2), encoding="utf-8")
        print(f"ERROR: {exc}", file=sys.stderr)
        raise