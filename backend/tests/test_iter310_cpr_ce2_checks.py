"""Iter310 tests:
- CPR verification checks 6-8 (AT-HM tier cap, Restorative, End-of-Life budgets)
- CE2 category_breakdown structure (per-category budget/gov/you and totals)
"""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mobile-parity-6.preview.emergentagent.com").rstrip("/")

# ============================================================
# CPR checks 6-8 (unit-level via lib.cpr_rules)
# ============================================================
from lib import cpr_rules  # noqa: E402


PLAN_TEXT_ALL_OVER = """Support at Home Care Plan Q3 2026
Participant: Test Person
Classification: Class 6
Quarterly budget: $12,341.32
Care management fee: $1,234.13
Care services base (excludes AT-HM): $11,107.19
AT-HM allocation (high tier): $18,500.00
Restorative Care Pathway budget: $13,000.00
End-of-Life Pathway budget: $30,000.00
Rollover cap: $1,234.13"""

PLAN_TEXT_NONE = """Support at Home Care Plan Q3 2026
Participant: Test Person
Classification: Class 6
Quarterly budget: $12,341.32
Care management fee: $1,234.13
Care services base (excludes AT-HM): $11,107.19
Rollover cap: $1,234.13"""


def _facts(plan_text: str, cls: int = 6, q: float = 12341.32):
    return cpr_rules.build_facts(
        extraction=None, plan_text=plan_text, classification=cls, quarterly_budget=q
    )


def test_cpr_checks_6_8_flag_when_over_cap():
    facts = _facts(PLAN_TEXT_ALL_OVER)
    panel = cpr_rules.run_verification_panel(facts)
    checks = panel.get("checks") if isinstance(panel, dict) else panel
    by_id = {c.get("check") or c.get("id"): c for c in checks}
    assert "at_hm_budget" in by_id, f"Missing at_hm_budget in {list(by_id)}"
    assert "restorative_budget" in by_id
    assert "end_of_life_budget" in by_id
    assert by_id["at_hm_budget"]["status"] == "flag", by_id["at_hm_budget"]
    assert by_id["restorative_budget"]["status"] == "flag"
    assert by_id["end_of_life_budget"]["status"] == "flag"


def test_cpr_checks_6_8_absent_when_amounts_not_mentioned():
    facts = _facts(PLAN_TEXT_NONE)
    panel = cpr_rules.run_verification_panel(facts)
    checks = panel.get("checks") if isinstance(panel, dict) else panel
    ids = {c.get("check") or c.get("id") for c in checks}
    assert "at_hm_budget" not in ids
    assert "restorative_budget" not in ids
    assert "end_of_life_budget" not in ids


# ============================================================
# CE2 category_breakdown via HTTP
# ============================================================
def test_ce2_category_breakdown_default_class5():
    payload = {
        "classification": "class_5",
        "pension_status": "full_pension",
        "relationship": "single",
        "entry_path": "post_nov_2025",
        "assessment_status": "have_classification",
        "homeowner": True,
    }
    r = requests.post(f"{BASE_URL}/api/ce2/calculate", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    cb = data.get("category_breakdown")
    assert isinstance(cb, list) and len(cb) == 3, f"Bad category_breakdown: {cb!r}"
    by_key = {row["key"]: row for row in cb}
    for key in ("clinical", "independence", "everyday"):
        assert key in by_key, f"Missing {key}: {list(by_key)}"
        row = by_key[key]
        for f in ("budget_quarterly", "you_quarterly", "govt_quarterly",
                  "budget_annual", "you_annual", "govt_annual"):
            assert f in row and isinstance(row[f], (int, float)), row
    # Clinical you = $0
    assert by_key["clinical"]["you_quarterly"] == 0
    assert by_key["clinical"]["you_annual"] == 0
    # Sum of you_quarterly == quarterly contribution
    total_you_q = sum(by_key[k]["you_quarterly"] for k in ("clinical", "independence", "everyday"))
    quarterly = data["contribution_quarterly"]
    assert abs(total_you_q - quarterly) < 1.0, f"sum={total_you_q} vs quarterly={quarterly}"
    # Budget sums positive
    assert sum(by_key[k]["budget_quarterly"] for k in ("clinical","independence","everyday")) > 0
    # Row internal consistency: budget = you + govt (approx)
    for k in ("clinical","independence","everyday"):
        row = by_key[k]
        assert abs(row["budget_quarterly"] - (row["you_quarterly"] + row["govt_quarterly"])) < 0.5, row

