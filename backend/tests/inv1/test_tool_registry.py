"""INV-1 · Tool Registry tests (spec §12A)."""
from __future__ import annotations

import sys
from pathlib import Path

_HERE = Path(__file__).resolve()
_BACKEND = _HERE.parents[2]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from routes.tools import (  # noqa: E402
    canonical_tool_count,
    list_active_tools,
)


def test_registry_loads():
    tools = list_active_tools()
    assert len(tools) >= 9


def test_invoice_checker_is_registered():
    tools = list_active_tools()
    slugs = [t["slug"] for t in tools]
    assert "invoice-checker" in slugs


def test_invoice_checker_featured_paired_with_statement_decoder():
    tools = list_active_tools()
    by_slug = {t["slug"]: t for t in tools}
    inv = by_slug["invoice-checker"]
    dec = by_slug["statement-decoder"]
    assert inv["featured"] is True
    # order should be adjacent (10 and 15 per registry)
    assert abs(inv["order"] - dec["order"]) <= 10
    assert inv["badge"] == "new"


def test_canonical_count_matches_active_tools():
    assert canonical_tool_count() == len(list_active_tools())


def test_every_tool_has_required_fields():
    required = {"slug", "name", "route", "tier_entitlement", "featured", "order"}
    for t in list_active_tools():
        missing = required - set(t.keys())
        assert not missing, f"tool {t.get('slug')} missing fields: {missing}"


def test_slugs_are_unique():
    slugs = [t["slug"] for t in list_active_tools()]
    assert len(slugs) == len(set(slugs))
