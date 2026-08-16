"""Aged Care Rules 2025 (F2025L01173).

Care-plan-relevant sections captured here. Additional sections can be added
by follow-up iterations as the analysis engine needs the finer grain.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List


EFFECTIVE_FROM = "2026-07-01"
EFFECTIVE_TO = None


@dataclass(frozen=True)
class RuleSection:
    section: str
    title: str
    body: str
    citation_source: str
    citation_url: str
    keywords: List[str] = field(default_factory=list)


AGED_CARE_RULES_2025_CARE_PLAN_SECTIONS: List[RuleSection] = [
    RuleSection(
        section="s.194-3",
        title="Care plan content requirements",
        body=(
            "A care plan for a Support at Home participant must include: the "
            "participant's goals and preferences; the services to be delivered; the "
            "provider or providers responsible for each service; the frequency, "
            "duration, and intensity of each service; the review cadence for the plan; "
            "and any advance care planning documents referenced."
        ),
        citation_source="Aged Care Rules 2025 (F2025L01173) s.194-3",
        citation_url="/help/aged-care-rules-2025#s194-3",
        keywords=[
            "goals", "preferences", "frequency", "duration", "intensity", "review",
            "cadence", "advance care", "provider",
        ],
    ),
    RuleSection(
        section="s.194-4",
        title="Care plan development consultation",
        body=(
            "A care plan must be developed in consultation with the participant and, "
            "where consent is given, with their advocate, informal carer, and family. "
            "The consultation process must be documented in the plan."
        ),
        citation_source="Aged Care Rules 2025 (F2025L01173) s.194-4",
        citation_url="/help/aged-care-rules-2025#s194-4",
        keywords=[
            "consultation", "advocate", "informal carer", "family", "consent",
            "development",
        ],
    ),
    RuleSection(
        section="s.194-5",
        title="Clinical adequacy of the care plan",
        body=(
            "A care plan must include services and hours that are proportionate to "
            "the participant's assessed clinical and functional needs. Where the "
            "participant has a stated clinical condition requiring active management "
            "(including diabetes, wound care, medication management, dementia, or "
            "palliative-stage care), the plan must include the appropriate clinical "
            "services and hours to manage those conditions safely."
        ),
        citation_source="Aged Care Rules 2025 (F2025L01173) s.194-5(1)(c)",
        citation_url="/help/aged-care-rules-2025#s194-5",
        keywords=[
            "clinical", "proportionate", "diabetes", "insulin", "wound", "medication",
            "dementia", "palliative", "adequate hours",
        ],
    ),
]


def get_section(section: str) -> RuleSection | None:
    for s in AGED_CARE_RULES_2025_CARE_PLAN_SECTIONS:
        if s.section == section:
            return s
    return None


def all_citation_sources() -> List[str]:
    return [s.citation_source for s in AGED_CARE_RULES_2025_CARE_PLAN_SECTIONS]
