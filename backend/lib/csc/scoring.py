"""CSC-1 scoring engine (§5 of the spec).

Pure functions. No IO, no side effects. Given a set of 16 answers,
produce a ``CSCPayload`` (per ``lib.csc.schema``).

Algorithm summary:
  1. Normalise each answer to [0, 1] on a per-scale basis (§5.1).
  2. Compute per-domain scores as the mean of non-null normalised answers,
     using the domain groupings and weights from ``thresholds.yaml``.
  3. Renormalise domain weights across domains that survive the "all null"
     exclusion rule.
  4. Compute the composite score in [0, 1].
  5. Map composite → primary classification via the thresholds table.
  6. Compute vignette distance to every reference vector; derive confidence
     from d1/d2 (§5.4) with the "high-weight Not sure" override (§5.5).
  7. Determine the classification range around ``primary`` per confidence.
  8. Pick the top-3 drivers (highest normalised answers).
  9. Determine the Branch (A/B/C) and gap detection per §6.2.
"""
from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from lib.csc.registry import (
    budget_source_version,
    load_iat_domains,   # noqa: F401 (importable via engine)
    load_thresholds,
    load_vignettes,
)
from lib.csc.schema import (
    CSCAnswers,
    CSCClassification,
    CSCPayload,
    CSCRunRequest,
    CSCTopDriver,
    Confidence,
)


# --- Normalisation constants (§5.1) -----------------------------------------

_DIFFICULTY = {
    "no_difficulty": 0.0,
    "slight": 1.0,
    "moderate": 2.0,
    "significant": 3.0,
    "cannot_alone": 4.0,
}
_FREQUENCY = {
    "never": 0.0,
    "rarely": 1.0,
    "sometimes": 2.0,
    "often": 3.0,
    "every_day": 4.0,
}
_COUNT = {
    "zero": 0.0,
    "one": 1.3,
    "two_to_three": 2.7,
    "more_than_three": 4.0,
}
_AMOUNT_INVERSE = {   # more informal support → less need
    "full_time": 0.0,
    "a_lot": 1.0,
    "some": 2.0,
    "a_little": 3.0,
    "none": 4.0,
}

_SCALE_BY_QUESTION: Dict[str, Dict[str, float]] = {
    # Q1..Q11 use difficulty. Q15 also difficulty.
    "Q1_self_care_shower": _DIFFICULTY,
    "Q2_self_care_dress": _DIFFICULTY,
    "Q3_self_care_mobility": _DIFFICULTY,
    "Q4_self_care_continence": _DIFFICULTY,
    "Q5_iadl_meals": _DIFFICULTY,
    "Q6_iadl_cleaning_laundry": _DIFFICULTY,
    "Q7_iadl_medication": _DIFFICULTY,
    "Q8_iadl_shopping": _DIFFICULTY,
    "Q9_iadl_transport": _DIFFICULTY,
    "Q10_cognition": _DIFFICULTY,
    "Q11_mood": _DIFFICULTY,
    "Q15_home_environment": _DIFFICULTY,
    # Q12 frequency
    "Q12_behaviour": _FREQUENCY,
    # Q13, Q14 count
    "Q13_falls_6mo": _COUNT,
    "Q14_hospital_12mo": _COUNT,
    # Q16 amount inverse
    "Q16_informal_support": _AMOUNT_INVERSE,
}

# Human-readable echo used in top_drivers.answer + the results screen.
_LABEL_MAP: Dict[str, Dict[str, str]] = {
    "difficulty": {
        "no_difficulty": "No difficulty",
        "slight": "Slight",
        "moderate": "Moderate",
        "significant": "Significant",
        "cannot_alone": "Cannot do alone",
        "not_sure": "Not sure",
    },
    "frequency": {
        "never": "Never",
        "rarely": "Rarely",
        "sometimes": "Sometimes",
        "often": "Often",
        "every_day": "Every day",
        "not_sure": "Not sure",
    },
    "count": {
        "zero": "0",
        "one": "1",
        "two_to_three": "2 to 3",
        "more_than_three": "More than 3",
        "not_sure": "Not sure",
    },
    "amount": {
        "none": "None",
        "a_little": "A little",
        "some": "Some",
        "a_lot": "A lot",
        "full_time": "Full-time",
        "not_sure": "Not sure",
    },
}

_QUESTION_SCALE_KIND: Dict[str, str] = {
    **{q: "difficulty" for q in _SCALE_BY_QUESTION if _SCALE_BY_QUESTION[q] is _DIFFICULTY},
    "Q12_behaviour": "frequency",
    "Q13_falls_6mo": "count",
    "Q14_hospital_12mo": "count",
    "Q16_informal_support": "amount",
}


# --- Core scoring -----------------------------------------------------------

def _normalise(question_id: str, raw: str) -> Optional[float]:
    """Return the [0, 1] normalised value for ``raw`` on ``question_id``'s
    scale, or ``None`` if the answer is 'not_sure'."""
    if raw == "not_sure":
        return None
    scale = _SCALE_BY_QUESTION[question_id]
    return scale[raw] / 4.0


def _budget_lookup(classification: int) -> int:
    """Return annual $ for the classification, using the same INDEX-1
    resolver as the rest of the app."""
    try:
        # Import inside function to keep this module import-safe when the
        # backend isn't fully initialised (e.g. in unit tests).
        from program_reference import get_value
        v = get_value(f"classification_annual.{classification}")
        return int(round(float(v)))
    except Exception:
        # Fallback matches budget.py's _FALLBACK_ANNUAL. This should never
        # fire in production; if it does, the payload's
        # budget_source_version will be marked as "fallback".
        _FALLBACK = {1: 11036, 2: 15570, 3: 22254, 4: 29696, 5: 39697,
                     6: 51027, 7: 62690, 8: 77874}
        return _FALLBACK.get(classification, 0)


def _quarterly_from_annual(annual: int) -> int:
    """Post-CM quarterly base individual amount (10% CM slice removed)."""
    return int(round(annual * 0.90 / 4.0))


def _vignette_vector(vig: Dict[str, str]) -> Dict[str, Optional[float]]:
    """Convert a vignette's raw string answers into a normalised vector.
    Vignettes must NOT contain 'not_sure'."""
    out: Dict[str, Optional[float]] = {}
    for q, raw in vig.items():
        out[q] = _normalise(q, raw)
    return out


def _weighted_euclidean(a: Dict[str, Optional[float]],
                        b: Dict[str, Optional[float]],
                        domain_weights_per_q: Dict[str, float]) -> float:
    """Euclidean distance across shared, non-null dimensions, weighted per
    question using domain weight ÷ questions-in-domain. Only dimensions
    where BOTH have a value contribute."""
    total = 0.0
    for q, va in a.items():
        vb = b.get(q)
        if va is None or vb is None:
            continue
        w = domain_weights_per_q.get(q, 1.0)
        total += w * (va - vb) ** 2
    return math.sqrt(total)


def _compute_confidence(user_vec: Dict[str, Optional[float]],
                        answers: CSCAnswers,
                        domain_weights_per_q: Dict[str, float],
                        threshold_cfg: Dict[str, Any]) -> Tuple[Confidence, int, str]:
    """Return (confidence, closest_classification, profile_summary)."""
    vignettes = load_vignettes()["vignettes"]
    distances: List[Tuple[float, int, str]] = []
    for v in vignettes:
        vec = _vignette_vector(v["vector"])
        d = _weighted_euclidean(user_vec, vec, domain_weights_per_q)
        distances.append((d, v["classification"], v["profile_summary"].strip()))
    distances.sort(key=lambda t: t[0])
    d1, closest_class, profile = distances[0]
    d2 = distances[1][0] if len(distances) > 1 else d1 + 1e-9
    ratio = (d1 / d2) if d2 > 0 else 0.0

    conf_cfg = threshold_cfg["confidence"]
    high_weight_qs = set(conf_cfg["high_weight_questions"])
    unanswered_count = sum(1 for v in answers.model_dump().values() if v == "not_sure")

    # High-weight "Not sure" override → force Low.
    high_weight_not_sure = sum(
        1 for q, v in answers.model_dump().items()
        if q in high_weight_qs and v == "not_sure"
    )
    if high_weight_not_sure >= conf_cfg["low_high_weight_notsure_min"]:
        return "low", closest_class, profile

    if unanswered_count >= 2:
        return "low", closest_class, profile
    if ratio <= conf_cfg["high_ratio_max"]:
        return "high", closest_class, profile
    if ratio <= conf_cfg["medium_ratio_max"]:
        return "medium", closest_class, profile
    return "low", closest_class, profile


def _range_for(primary: int, confidence: Confidence) -> Tuple[int, int]:
    """Range per §5.6."""
    if confidence == "high":
        return primary, primary
    if confidence == "medium":
        return max(1, primary - 1), min(8, primary + 1)
    # low: ± 2, capped
    return max(1, primary - 2), min(8, primary + 2)


def _top_drivers(user_vec: Dict[str, Optional[float]],
                 answers: CSCAnswers) -> List[CSCTopDriver]:
    """Three questions with the highest normalised scores (i.e. biggest
    reported need). Ties broken by declaration order in the schema."""
    domain_map = _question_to_domain_map()
    ranked: List[Tuple[float, str]] = []
    ans = answers.model_dump()
    for q, norm in user_vec.items():
        if norm is None:
            continue
        ranked.append((norm, q))
    ranked.sort(key=lambda t: (-t[0], t[1]))
    out: List[CSCTopDriver] = []
    for norm, q in ranked[:3]:
        kind = _QUESTION_SCALE_KIND[q]
        label = _LABEL_MAP[kind][ans[q]]
        out.append(CSCTopDriver(question_id=q, answer=label, domain=domain_map[q]))
    return out


def _question_to_domain_map() -> Dict[str, str]:
    cfg = load_thresholds()
    out: Dict[str, str] = {}
    for domain, spec in cfg["domains"].items():
        for q in spec["questions"]:
            out[q] = domain
    return out


def _domain_weights_per_question() -> Dict[str, float]:
    """Weight each question with (domain_weight ÷ questions_in_domain)."""
    cfg = load_thresholds()
    out: Dict[str, float] = {}
    for _, spec in cfg["domains"].items():
        qs = spec["questions"]
        w = spec["weight"] / max(1, len(qs))
        for q in qs:
            out[q] = w
    return out


def _map_primary(composite: float, thresholds: List[Dict[str, Any]]) -> int:
    for row in sorted(thresholds, key=lambda r: r["max_score"]):
        if composite <= row["max_score"]:
            return int(row["primary"])
    return 8


def _decide_branch(current: Optional[int], primary: int) -> Tuple[str, bool, Optional[str]]:
    """Branch A: gap detected upward (primary > current) → LF-1 CTA.
    Branch B: current provided AND primary <= current → save-to-account CTA.
    Branch C: no current classification → MAC 1800 CTA."""
    if current is None:
        return "C", False, None
    if primary > current:
        return "A", True, "up"
    if primary < current:
        return "B", True, "down"
    return "B", False, None


# --- Public entry point -----------------------------------------------------

def score(req: CSCRunRequest) -> CSCPayload:
    cfg = load_thresholds()
    ans_dict = req.answers.model_dump()

    # 1. Normalise
    user_vec: Dict[str, Optional[float]] = {
        q: _normalise(q, v) for q, v in ans_dict.items()
    }

    # 2/3. Per-domain scores with "all-null" exclusion + weight renormalisation
    domain_scores: Dict[str, float] = {}
    excluded: List[str] = []
    active_weights: Dict[str, float] = {}
    for domain, spec in cfg["domains"].items():
        qs = spec["questions"]
        weight = spec["weight"]
        inverse = spec.get("inverse", False)
        norms = [user_vec[q] for q in qs if user_vec.get(q) is not None]
        if not norms:
            excluded.append(domain)
            continue
        mean = sum(norms) / len(norms)
        # Note on inverse (informal_support): normalisation of the AMOUNT
        # scale already uses the inverse map, so the domain mean is directly
        # comparable, no sign flip needed here.
        _ = inverse
        domain_scores[domain] = mean
        active_weights[domain] = weight

    # Renormalise weights to sum to 1 over active domains
    weight_total = sum(active_weights.values()) or 1.0
    composite = sum(
        (domain_scores[d] * (w / weight_total)) for d, w in active_weights.items()
    )
    composite = max(0.0, min(1.0, composite))

    # 4. Primary classification
    primary = _map_primary(composite, cfg["thresholds"])

    # 5. Confidence (weighted vignette distance)
    dw = _domain_weights_per_question()
    confidence, _closest_class, profile_summary = _compute_confidence(
        user_vec, req.answers, dw, cfg
    )

    # 6. Range
    range_low, range_high = _range_for(primary, confidence)

    # 7. Budgets
    ann_low = _budget_lookup(range_low)
    ann_high = _budget_lookup(range_high)
    q_low = _quarterly_from_annual(ann_low)
    q_high = _quarterly_from_annual(ann_high)

    # 8. Top drivers
    drivers = _top_drivers(user_vec, req.answers)

    # 9. Branch + gap
    branch, gap_detected, gap_direction = _decide_branch(req.current_classification, primary)

    # 10. Housekeeping
    unanswered = sum(1 for v in ans_dict.values() if v == "not_sure")
    run_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    return CSCPayload(
        csc_run_id=run_id,
        run_at=now_iso,
        persona=req.persona,
        classification=CSCClassification(
            primary=primary,
            range_low=range_low,
            range_high=range_high,
            confidence=confidence,
            annual_budget_low=ann_low,
            annual_budget_high=ann_high,
            quarterly_budget_low=q_low,
            quarterly_budget_high=q_high,
            budget_source_version=budget_source_version(),
        ),
        domain_scores={k: round(v, 4) for k, v in domain_scores.items()},
        composite_score=round(composite, 4),
        top_drivers=drivers,
        current_classification=req.current_classification,
        gap_detected=gap_detected,
        gap_direction=gap_direction,
        unanswered_count=unanswered,
        excluded_domains=excluded,
        branch=branch,
        profile_summary=profile_summary,
    )
