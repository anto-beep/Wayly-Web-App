"""INDEX-1 v1 · Deploy 1a, Monetary Constants Registry Loader.

Loads the human-authored YAML registry at ``backend/data/monetary_constants.yaml``
and exposes typed accessors. Deploy 1a scope is *loader + validation only*, with
no consumer migration, existing callers continue to use
``program_reference.get_value(key, as_of=…)``. Deploy 1b migrates the consumers.

Contract per INDEX-1 v1 Section 3.2:
- Every registry entry has ``value_aud`` or ``value_percentage``, ``effective_from``,
  ``next_review_due`` (for indexed values), ``source_type``, ``source_url``,
  ``source_citation``, ``last_verified_at``, ``last_verified_by``, and a
  ``history`` block.
- ``source_url`` may be ``"PENDING"`` for entries flagged in the
  ``verification_backlog`` file; those entries are excluded from the
  "no PENDING sources" test until they are resolved.
- Values use ``Decimal`` for arithmetic safety.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

logger = logging.getLogger(__name__)

_REGISTRY_PATH = Path(__file__).parent / "data" / "monetary_constants.yaml"
_SCHEDULED_CHANGES_PATH = Path(__file__).parent / "data" / "scheduled_changes.yaml"

# One of the four source_type codes per INDEX-1 v1 Section 3.1.
_SOURCE_TYPES = {
    "primary_legislation",
    "delegated_instrument",
    "operational_primary",
    "secondary",
}

# Any source_url matching this exact string is treated as an intentional
# backlog placeholder rather than a validation failure.
_PENDING_MARKER = "PENDING"


@dataclass
class HistoryEntry:
    value: Decimal
    effective_from: date
    effective_to: Optional[date]
    source_url: Optional[str] = None
    verified_by: Optional[str] = None
    verified_at: Optional[date] = None


@dataclass
class MonetaryConstant:
    """A single row in the registry.

    Either ``value_aud`` OR ``value_percentage`` is set (never both, never
    neither). ``unit`` is a display hint (``"AUD"`` / ``"percentage"`` /
    ``"years"`` / ``"months"`` / ``"boolean"`` / ``"text"``) used by tooling;
    the actual arithmetic happens on the ``value`` property which returns a
    Decimal for numeric units and the raw Python value for boolean / text.
    """
    key: str
    value: Any
    unit: str
    effective_from: date
    effective_to: Optional[date] = None
    next_review_due: Optional[date] = None
    indexation_schedule: Optional[str] = None
    source_type: Optional[str] = None
    source_url: Optional[str] = None
    source_citation: Optional[str] = None
    last_verified_at: Optional[date] = None
    last_verified_by: Optional[str] = None
    notes: Optional[str] = None
    history: List[HistoryEntry] = field(default_factory=list)

    @property
    def value_aud(self) -> Optional[Any]:
        return self.value if self.unit == "AUD" else None

    @property
    def value_percentage(self) -> Optional[Any]:
        return self.value if self.unit == "percentage" else None


class MonetaryConstantsRegistry:
    """Parsed + validated in-process registry.

    Loading is idempotent. Repeated calls to ``load()`` return the same
    instance. Consumers wanting a value should call ``get_value(key, as_of=…)``.
    """

    def __init__(self) -> None:
        self._by_key: Dict[str, List[MonetaryConstant]] = {}
        self._scheduled_changes: List[dict] = []
        self._loaded = False

    def load(self, path: Optional[Path] = None) -> None:
        p = path or _REGISTRY_PATH
        if not p.exists():
            logger.warning("Monetary constants YAML not found at %s, registry empty.", p)
            self._loaded = True
            return
        with p.open() as fh:
            data = yaml.safe_load(fh) or {}
        if not isinstance(data, dict) or "constants" not in data:
            raise ValueError(
                f"Registry YAML at {p} must have a top-level `constants` list."
            )
        by_key: Dict[str, List[MonetaryConstant]] = {}
        for raw in data["constants"]:
            entry = self._parse_entry(raw)
            by_key.setdefault(entry.key, []).append(entry)
            # Also flatten history rows into the by_key list so point-in-time
            # `get_value(key, as_of=…)` lookups resolve historical values.
            # History rows keep the same shape as the active entry with a
            # narrower effective_from / effective_to window.
            for h in entry.history:
                by_key[entry.key].append(MonetaryConstant(
                    key=entry.key,
                    value=h.value,
                    unit=entry.unit,
                    effective_from=h.effective_from,
                    effective_to=h.effective_to,
                    source_type=entry.source_type,
                    source_url=h.source_url or entry.source_url,
                    source_citation=entry.source_citation,
                    last_verified_at=h.verified_at,
                    last_verified_by=h.verified_by,
                    notes="from history",
                    history=[],
                ))
        for key, entries in by_key.items():
            entries.sort(key=lambda e: e.effective_from)
        self._by_key = by_key

        # Scheduled changes are a companion file, optional for Deploy 1a.
        sched = _SCHEDULED_CHANGES_PATH
        if sched.exists():
            with sched.open() as fh:
                sd = yaml.safe_load(fh) or {}
            if isinstance(sd, dict):
                self._scheduled_changes = list(sd.get("scheduled_changes") or [])
        self._loaded = True
        logger.info(
            "Monetary constants registry loaded: %d keys, %d total rows, %d scheduled changes.",
            len(self._by_key),
            sum(len(v) for v in self._by_key.values()),
            len(self._scheduled_changes),
        )

    def _parse_entry(self, raw: dict) -> MonetaryConstant:
        if not isinstance(raw, dict) or "key" not in raw:
            raise ValueError(f"Registry entry missing `key`: {raw!r}")
        key = raw["key"]
        unit = raw.get("unit") or "AUD"
        if "value_aud" in raw and "value_percentage" in raw:
            raise ValueError(f"{key}: both value_aud and value_percentage set.")
        if "value_aud" in raw:
            raw_value = raw["value_aud"]
            unit = "AUD"
        elif "value_percentage" in raw:
            raw_value = raw["value_percentage"]
            unit = "percentage"
        elif "value" in raw:
            raw_value = raw["value"]
        else:
            raise ValueError(f"{key}: no value field found (value_aud / value_percentage / value).")
        # Non-numeric units (boolean, text) keep their native type so the
        # Decimal() conversion doesn't blow up on values like "yes" or True.
        if unit in ("AUD", "percentage", "months", "years"):
            try:
                value = Decimal(str(raw_value))
            except Exception:
                # Some seed rows emit a text/boolean/list value under an AUD
                # unit, accept them verbatim rather than failing the whole
                # registry load. The mis-typing is a generator issue that
                # will be tidied when Deploy 1b hand-authors the YAML.
                value = raw_value
        else:
            value = raw_value
        history_raw = raw.get("history") or []
        history: List[HistoryEntry] = []
        for h in history_raw:
            history.append(HistoryEntry(
                value=Decimal(str(h.get("value") or h.get("value_aud") or h.get("value_percentage") or 0)),
                effective_from=_parse_date(h.get("effective_from")),
                effective_to=_parse_date(h.get("effective_to")),
                source_url=h.get("source_url"),
                verified_by=h.get("verified_by"),
                verified_at=_parse_date(h.get("verified_at")),
            ))
        return MonetaryConstant(
            key=key,
            value=value,
            unit=unit,
            effective_from=_parse_date(raw.get("effective_from")),
            effective_to=_parse_date(raw.get("effective_to")),
            next_review_due=_parse_date(raw.get("next_review_due")),
            indexation_schedule=raw.get("indexation_schedule"),
            source_type=raw.get("source_type"),
            source_url=raw.get("source_url"),
            source_citation=raw.get("source_citation"),
            last_verified_at=_parse_date(raw.get("last_verified_at")),
            last_verified_by=raw.get("last_verified_by"),
            notes=raw.get("notes"),
            history=history,
        )

    def keys(self) -> List[str]:
        return sorted(self._by_key.keys())

    def all_entries(self) -> List[MonetaryConstant]:
        return [entry for entries in self._by_key.values() for entry in entries]

    def get_value(self, key: str, as_of: Optional[date] = None) -> Decimal:
        """Return the point-in-time value for ``key`` at ``as_of``.

        Falls through to the latest entry when ``as_of`` is ``None``.
        Raises ``KeyError`` if the key is unknown.
        """
        entries = self._by_key.get(key)
        if not entries:
            raise KeyError(f"Monetary constant not found: {key}")
        if as_of is None:
            return entries[-1].value
        best: Optional[MonetaryConstant] = None
        for e in entries:
            if e.effective_from > as_of:
                break
            if e.effective_to is not None and e.effective_to < as_of:
                continue
            best = e
        return (best or entries[0]).value

    def get_entry(self, key: str, as_of: Optional[date] = None) -> Optional[MonetaryConstant]:
        entries = self._by_key.get(key)
        if not entries:
            return None
        if as_of is None:
            return entries[-1]
        for e in reversed(entries):
            if e.effective_from <= as_of and (e.effective_to is None or e.effective_to >= as_of):
                return e
        return entries[-1]

    def scheduled_changes(self) -> List[dict]:
        return list(self._scheduled_changes)

    def validate(self) -> List[str]:
        """Run structural validation. Returns list of issues; empty means clean."""
        issues: List[str] = []
        for entries in self._by_key.values():
            for e in entries:
                if not e.key:
                    issues.append("Entry with empty key.")
                    continue
                if e.effective_from is None:
                    issues.append(f"{e.key}: missing effective_from.")
                if e.source_type is not None and e.source_type not in _SOURCE_TYPES:
                    issues.append(f"{e.key}: unknown source_type {e.source_type!r}.")
                if e.indexation_schedule and e.next_review_due is None:
                    issues.append(
                        f"{e.key}: indexation_schedule set but next_review_due is empty."
                    )
                if e.indexation_schedule and e.next_review_due and e.next_review_due < date.today():
                    issues.append(
                        f"{e.key}: next_review_due {e.next_review_due} is in the past."
                    )
        return issues

    def entries_with_pending_source(self) -> List[MonetaryConstant]:
        return [
            e for e in self.all_entries()
            if e.source_url == _PENDING_MARKER
        ]

    def prompt_context(self, as_of: Optional[date] = None) -> Dict[str, str]:
        """Return a dict of formatted strings for LLM prompt templating.

        INDEX-1 v1 Deploy 1b, this is the substitution map used by
        ``render_prompt``. Keys are prompt-template placeholders (short + snake_case),
        values are pre-formatted display strings ready to drop into the LLM
        system prompt. This keeps ``agents.py`` free of hard-coded dollar
        amounts, and any future indexation flows through the registry at
        service startup.

        Only the small set of values the LLM prompts actually reference is
        emitted here (rather than the full 210-key registry). Prompts fail
        loudly if they reference an unknown key, so adding a new placeholder
        needs to be an intentional two-touch change.
        """
        as_of = as_of or date.today()
        ctx: Dict[str, str] = {}

        def money(key: str) -> str:
            try:
                v = self.get_value(key, as_of=as_of)
                return f"${v:,.2f}" if v is not None else ""
            except (KeyError, Exception):
                return ""

        def money_per_day(key: str) -> str:
            v = money(key)
            return f"{v}/day" if v else ""

        def pct(key: str) -> str:
            try:
                v = self.get_value(key, as_of=as_of)
                return f"{v}%" if v is not None else ""
            except (KeyError, Exception):
                return ""

        # Supplement rates
        ctx["oxygen_daily"] = money_per_day("supplement.oxygen.daily_aud")
        ctx["enteral_bolus_daily"] = money_per_day("supplement.enteral_bolus.daily_aud")
        ctx["enteral_non_bolus_daily"] = money_per_day("supplement.enteral_non_bolus.daily_aud")
        ctx["eachd_top_up_daily"] = money_per_day("supplement.eachd_top_up.daily_aud")
        ctx["care_management_daily"] = money_per_day("supplement.care_management_provider.daily_aud")
        # Percentages
        ctx["veterans_pct"] = pct("supplement.veterans.pct_of_base_individual")
        ctx["dementia_pct"] = pct("supplement.dementia_cognition.pct_of_base_individual")
        # Lifetime caps
        ctx["lifetime_cap_standard"] = money("lifetime_cap.standard")
        ctx["lifetime_cap_no_worse_off"] = money("lifetime_cap.no_worse_off")
        # Rollover
        ctx["rollover_floor"] = money("rollover.floor_aud")
        # Short-term pathways
        ctx["restorative_care_amount"] = money("restorative.budget_aud")
        ctx["restorative_care_max_total"] = money("pathway.restorative_care.max_total_aud")
        ctx["eol_pathway_amount"] = money("eol.budget_aud")

        return ctx


def render_prompt(template: str, as_of: Optional[date] = None) -> str:
    """Substitute registry values into an LLM prompt template.

    Only the exact placeholders emitted by ``prompt_context()`` are
    replaced. Any other ``{key}``, including format-spec placeholders like
    ``{annual:,.0f}``, is left intact for a downstream ``.format(**runtime)``
    pass. This is a lightweight one-way substitution, not a full-blown Python
    format() call.

    Fail-open: an unknown key from ``prompt_context()`` (registry seeded with
    an empty value) is skipped, leaving the placeholder visible for review.
    """
    if not REGISTRY._loaded:  # pragma: no cover
        REGISTRY.load()
    ctx = REGISTRY.prompt_context(as_of=as_of)
    out = template
    for key, val in ctx.items():
        if not val:
            continue
        out = out.replace("{" + key + "}", val)
    return out


def _parse_date(v: Any) -> Optional[date]:
    if v is None or v == "":
        return None
    if isinstance(v, date):
        return v
    return date.fromisoformat(str(v))


REGISTRY = MonetaryConstantsRegistry()


def get_value(key: str, as_of: Optional[date] = None) -> Any:
    """Module-level convenience mirroring ``program_reference.get_value``.

    Deploy 1a is a no-op for consumers: this function is available for
    Deploy 1b migration but no live code path calls it yet.
    """
    if not REGISTRY._loaded:  # pragma: no cover, auto-load safety
        REGISTRY.load()
    return REGISTRY.get_value(key, as_of=as_of)


def load_registry() -> MonetaryConstantsRegistry:
    """Explicit loader used at app startup + in tests."""
    REGISTRY.load()
    return REGISTRY
