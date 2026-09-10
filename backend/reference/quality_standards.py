"""National Aged Care Quality Standards (revised 2025).

The revised set of 7 standards that came into effect on 01/07/2026. Each
standard is captured at the top level; per-outcome / per-action citations
may be added in a follow-up iteration once the analysis engine needs the
finer grain.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List


EFFECTIVE_FROM = "2026-07-01"
EFFECTIVE_TO = None


@dataclass(frozen=True)
class Standard:
    number: int
    title: str
    body: str
    citation_source: str
    citation_url: str
    keywords: List[str] = field(default_factory=list)


QUALITY_STANDARDS: List[Standard] = [
    Standard(
        number=1,
        title="The Person",
        body=(
            "Older people receive care and services that are person-centred, "
            "culturally safe, and respect their identity, autonomy, and diversity."
        ),
        citation_source="National Aged Care Quality Standards, Standard 1",
        citation_url="/help/quality-standards-2025#standard-1",
        keywords=["person-centred", "cultural safety", "identity", "autonomy"],
    ),
    Standard(
        number=2,
        title="The Organisation",
        body=(
            "Providers have governance, systems, and workforce arrangements in place "
            "to deliver safe, effective, and quality care."
        ),
        citation_source="National Aged Care Quality Standards, Standard 2",
        citation_url="/help/quality-standards-2025#standard-2",
        keywords=["governance", "workforce", "safety", "quality"],
    ),
    Standard(
        number=3,
        title="Care and Services",
        body=(
            "Older people receive safe, effective, and coordinated clinical and "
            "non-clinical care that supports their well-being, including reablement, "
            "restorative, and palliative care where appropriate."
        ),
        citation_source="National Aged Care Quality Standards, Standard 3",
        citation_url="/help/quality-standards-2025#standard-3",
        keywords=[
            "clinical", "coordinated", "reablement", "restorative", "palliative",
            "medication", "nursing", "allied health",
        ],
    ),
    Standard(
        number=4,
        title="The Environment",
        body=(
            "Older people receive care and services in environments that are safe, "
            "clean, and support their well-being."
        ),
        citation_source="National Aged Care Quality Standards, Standard 4",
        citation_url="/help/quality-standards-2025#standard-4",
        keywords=["environment", "safe", "clean", "home modifications"],
    ),
    Standard(
        number=5,
        title="Clinical Care",
        body=(
            "Clinical care is safe, personalised, and follows best practice, including "
            "for high-risk areas such as falls, medications, pressure injuries, "
            "delirium, dementia, and end of life."
        ),
        citation_source="National Aged Care Quality Standards, Standard 5",
        citation_url="/help/quality-standards-2025#standard-5",
        keywords=[
            "falls", "medication", "pressure injury", "delirium", "dementia",
            "end of life", "wound", "insulin", "diabetes",
        ],
    ),
    Standard(
        number=6,
        title="Feedback and Complaints",
        body=(
            "Older people can raise concerns and complaints and have them addressed "
            "in a timely, fair, and transparent way."
        ),
        citation_source="National Aged Care Quality Standards, Standard 6",
        citation_url="/help/quality-standards-2025#standard-6",
        keywords=["feedback", "complaint", "grievance", "concern"],
    ),
    Standard(
        number=7,
        title="The Workforce",
        body=(
            "Providers have a workforce that is trained, supervised, and matched to "
            "the needs of the older people they support."
        ),
        citation_source="National Aged Care Quality Standards, Standard 7",
        citation_url="/help/quality-standards-2025#standard-7",
        keywords=["workforce", "training", "supervision", "match", "substitution"],
    ),
]


def get_standard(number: int) -> Standard | None:
    for s in QUALITY_STANDARDS:
        if s.number == number:
            return s
    return None


def all_citation_sources() -> List[str]:
    return [s.citation_source for s in QUALITY_STANDARDS]
