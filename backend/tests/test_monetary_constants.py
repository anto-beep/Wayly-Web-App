"""INDEX-1 v1 · Deploy 1a validation tests.

Deploy 1a scope: the registry loads without error, every entry has a source
URL (or explicit PENDING marker), every indexed entry has a future
`next_review_due`, and the get_value() lookup returns the correct value for
the seeded lifetime caps.

These tests do NOT exercise consumer migration — that's Deploy 1b. They only
prove the registry infrastructure is sound.
"""
from __future__ import annotations

import subprocess
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
import monetary_constants as mc


@pytest.fixture(scope="module", autouse=True)
def _loaded_registry():
    reg = mc.MonetaryConstantsRegistry()
    reg.load()
    # Publish onto the module singleton so `mc.get_value` works during tests.
    mc.REGISTRY._by_key = reg._by_key
    mc.REGISTRY._scheduled_changes = reg._scheduled_changes
    mc.REGISTRY._loaded = True
    yield reg


def test_registry_loads_without_error(_loaded_registry):
    """Deploy 1a acceptance criterion 1 — the YAML parses at startup."""
    assert len(_loaded_registry.keys()) > 0
    assert len(_loaded_registry.keys()) == 237, (
        f"Expected 237 unique registry keys, got {len(_loaded_registry.keys())}."
    )


def test_all_indexed_entries_have_future_next_review(_loaded_registry):
    """Deploy 1a acceptance criterion 3 — no `next_review_due` in the past."""
    issues = []
    for e in _loaded_registry.all_entries():
        if e.indexation_schedule and e.next_review_due and e.next_review_due < date.today():
            issues.append(f"{e.key}: next_review_due {e.next_review_due} is in the past.")
    assert not issues, "Stale next_review_due entries:\n" + "\n".join(issues)


def test_no_entry_has_both_value_aud_and_value_percentage(_loaded_registry):
    """Contract test: value_aud XOR value_percentage."""
    for e in _loaded_registry.all_entries():
        if e.value_aud is not None and e.value_percentage is not None:
            pytest.fail(f"{e.key}: both value_aud and value_percentage set.")


def test_lifetime_cap_standard_post_march_2026():
    """The Rev A indexation confirmation — the standard cap is $137,917.01
    from 20 March 2026 onward."""
    v = mc.get_value("lifetime_cap.standard", as_of=date(2026, 3, 20))
    assert v == Decimal("137917.01"), f"Expected 137917.01, got {v!r}"


def test_lifetime_cap_standard_pre_march_2026_from_history():
    """Historical values are preserved via the point-in-time lookup."""
    v = mc.get_value("lifetime_cap.standard", as_of=date(2026, 1, 15))
    assert v == Decimal("135318.69"), f"Expected 135318.69, got {v!r}"


def test_lifetime_cap_no_worse_off_post_march_2026():
    v = mc.get_value("lifetime_cap.no_worse_off", as_of=date(2026, 3, 20))
    assert v == Decimal("86185.23"), f"Expected 86185.23, got {v!r}"


def test_validate_returns_no_structural_issues(_loaded_registry):
    """No malformed entries in the YAML."""
    issues = _loaded_registry.validate()
    assert not issues, "\n".join(issues)


def test_scheduled_changes_include_1_oct_2026(_loaded_registry):
    """Deploy 1a deliverable — the 1 October 2026 personal care funding change is seeded."""
    ids = [c.get("id") for c in _loaded_registry.scheduled_changes()]
    assert "personal_care_funding_1_oct_2026" in ids


def test_source_url_present_or_explicit_pending(_loaded_registry):
    """Deploy 1a acceptance criterion 2 — every entry has a URL or the PENDING marker."""
    missing = [
        e.key for e in _loaded_registry.all_entries()
        if not e.source_url  # None or empty
    ]
    assert not missing, (
        "Entries with no source_url and no PENDING marker:\n" + "\n".join(missing)
    )


def test_deploy_1a_is_a_noop_for_consumers():
    """Consumers still read via program_reference.get_value(). Sanity check
    that the existing seed still resolves. If this fails, Deploy 1a broke
    the no-behavioural-change guarantee."""
    import program_reference as _pr
    import seed_program_reference as _seed
    # Populate the cache the same way conftest does — required in this
    # standalone module run.
    fresh: dict = {}
    for row in _seed.SEED_ROWS:
        key = row.get("key")
        eff_from = row.get("effective_from")
        if not key or eff_from is None or "value" not in row:
            continue
        fresh.setdefault(key, []).append((
            eff_from,
            row.get("effective_to"),
            row["value"],
            row.get("id", f"seed-{key}-{eff_from}"),
        ))
    for k in fresh:
        fresh[k].sort(key=lambda r: r[0])
    _pr._CACHE = fresh
    _pr._CACHE_READY = True

    # Same value as the registry:
    v_pr = _pr.get_value("lifetime_cap.standard", "2026-03-20")
    v_reg = mc.get_value("lifetime_cap.standard", as_of=date(2026, 3, 20))
    assert Decimal(str(v_pr)) == v_reg, (
        f"Behavioural drift! program_reference={v_pr!r} vs registry={v_reg!r}."
    )


def test_yaml_file_can_be_regenerated_deterministically(tmp_path):
    """Running the generator twice produces identical YAML — proof the seed
    → YAML transform is stable and reviewable."""
    script = Path(__file__).resolve().parents[1] / "tools" / "generate_monetary_constants_yaml.py"
    out_path = Path(__file__).resolve().parents[1] / "data" / "monetary_constants.yaml"
    before = out_path.read_text()
    subprocess.run([sys.executable, str(script)], check=True, capture_output=True)
    after = out_path.read_text()
    assert before == after, "generate_monetary_constants_yaml.py is not deterministic."


def test_oxy1_f6_certification_copy_string_appears_once_in_frontend():
    """OXY-1 v1 F6 test O12 — 'medical practitioner has certified' appears
    exactly once in the FRONTEND (single source of truth for UI copy).

    The same substring is expected to appear in the backend advisory rule text
    (`agents.py::RULE_21_OXYGEN_ADVISORY`) because the backend cannot import
    from the frontend content module. The test guards against copy drift in
    the UI layer only."""
    repo_root = Path(__file__).resolve().parents[2]
    needle = "medical practitioner has certified"
    hits: list = []
    for glob in [
        "frontend/src/**/*.js",
        "frontend/src/**/*.jsx",
    ]:
        for path in repo_root.glob(glob):
            if "node_modules" in str(path) or "test_" in path.name:
                continue
            try:
                text = path.read_text()
            except Exception:
                continue
            if needle in text:
                hits.append(str(path))
    assert hits == [str(repo_root / "frontend" / "src" / "content" / "supplements.js")], (
        f"OXY-1 F6 O12: expected exactly one frontend hit in content/supplements.js, got {hits}."
    )
