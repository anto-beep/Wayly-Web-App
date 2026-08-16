"""INV-1 · Summariser tests. Uses the deterministic fallback path only
(so tests don't call the LLM)."""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

_HERE = Path(__file__).resolve()
_BACKEND = _HERE.parents[2]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from lib.inv1.summariser import _fallback_summary, generate_summary  # noqa: E402


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_fallback_all_clear():
    recon = {"overall_verdict": "all_clear", "findings": [], "lines": [{"gross_cost": 100}]}
    s = _fallback_summary(recon)
    assert "did not find" in s.lower()


def test_fallback_check_before_paying_mentions_acqsc():
    recon = {
        "overall_verdict": "check_before_paying",
        "findings": [{"tier": 4, "escalation": "acqsc"}],
        "lines": [{"gross_cost": 100}],
    }
    s = _fallback_summary(recon)
    assert "1800 951 822" in s


def test_generate_summary_uses_fallback_when_no_key(monkeypatch):
    monkeypatch.setenv("EMERGENT_LLM_KEY", "")
    recon = {"overall_verdict": "all_clear", "findings": [], "lines": []}
    result = _run(generate_summary(recon))
    assert isinstance(result, str) and len(result) > 20
