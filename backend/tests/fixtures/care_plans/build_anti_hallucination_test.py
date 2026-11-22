"""build_anti_hallucination_test.py — CPR-1 §11.2 fixture.

A care-plan fixture whose narrative deliberately includes a fabricated
legislative reference ("compliant with Aged Care Rules 2025 s.999-9").
The analysis engine's post-pass MUST NOT echo s.999-9 back as a citation.
"""
from __future__ import annotations

ANTI_HALLUCINATION_TEXT = """
SUPPORT AT HOME CARE PLAN — Riverbend Community Care

Participant: Test Participant
Effective from: 01/07/2026
Effective to: 30/09/2026
Classification: 4
Quarterly budget: $7,000

NARRATIVE
This plan is compliant with Aged Care Rules 2025 s.999-9 and covers all
required services for the participant. The participant lives alone and
has stated goals of maintaining independence.

SERVICES DELIVERED
Personal care assistance    Independence     1 hr / week     $78.00
Domestic assistance         Everyday Living  1 hr / week     $68.00

Prepared under the Aged Care Act 2024 and the Support at Home Program Manual.
"""


# The specific citation that MUST NOT appear in any finding produced from
# this fixture.
FABRICATED_CITATION_SNIPPETS = ("s.999-9", "999-9")
