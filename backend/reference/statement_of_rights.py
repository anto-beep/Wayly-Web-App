"""Statement of Rights, Aged Care Act 2024.

Structured reference of the 10 rights as enacted by the Aged Care Act 2024,
each with a citation source, deep-link URL, and matcher heuristics used by
the CPR-1 analysis engine to identify plans that under-address a given
right.

Effective from 01/07/2026, when the Support at Home transition landed.

Citation URLs prefer internal Wayly help-centre pages that quote the source
verbatim over external legislation.gov.au links, per CPR-1 spec §D.2.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List


EFFECTIVE_FROM = "2026-07-01"
EFFECTIVE_TO = None


@dataclass(frozen=True)
class Right:
    number: int
    title: str
    body: str
    citation_source: str
    citation_url: str
    keywords: List[str] = field(default_factory=list)


STATEMENT_OF_RIGHTS: List[Right] = [
    Right(
        number=1,
        title="Right to be treated with dignity and respect",
        body=(
            "Older people have the right to be treated with dignity and respect at all "
            "times, and to have their identity, culture, beliefs, and diversity valued "
            "and supported."
        ),
        citation_source="Statement of Rights, Right 1 (Aged Care Act 2024)",
        citation_url="/help/aged-care-act-2024/statement-of-rights#right-1",
        keywords=["dignity", "respect", "identity", "culture", "beliefs"],
    ),
    Right(
        number=2,
        title="Right to independence, autonomy, and empowerment",
        body=(
            "Older people have the right to make their own decisions and to be "
            "supported to live as independently as possible."
        ),
        citation_source="Statement of Rights, Right 2 (Aged Care Act 2024)",
        citation_url="/help/aged-care-act-2024/statement-of-rights#right-2",
        keywords=["autonomy", "independence", "decision", "empowerment", "choice"],
    ),
    Right(
        number=3,
        title="Right to be free from abuse and neglect",
        body=(
            "Older people have the right to be free from all forms of violence, "
            "abuse, and neglect, including from staff, other older people, and family "
            "members."
        ),
        citation_source="Statement of Rights, Right 3 (Aged Care Act 2024)",
        citation_url="/help/aged-care-act-2024/statement-of-rights#right-3",
        keywords=["abuse", "neglect", "violence", "safeguarding", "harm"],
    ),
    Right(
        number=4,
        title="Right to fair, equitable, and non-discriminatory treatment",
        body=(
            "Older people have the right to receive care and services that are fair, "
            "equitable, and free from discrimination. Cultural and linguistic "
            "diversity, sexuality, and disability must be recognised."
        ),
        citation_source="Statement of Rights, Right 4 (Aged Care Act 2024)",
        citation_url="/help/aged-care-act-2024/statement-of-rights#right-4",
        keywords=[
            "equitable", "discrimination", "cultural", "linguistic", "cald",
            "aboriginal", "torres strait", "lgbti", "disability", "veterans",
            "isolation", "isolated",
        ],
    ),
    Right(
        number=5,
        title="Right to informed choice about services",
        body=(
            "Older people have the right to information about services in a form "
            "they can understand, and to make informed decisions about their care."
        ),
        citation_source="Statement of Rights, Right 5 (Aged Care Act 2024)",
        citation_url="/help/aged-care-act-2024/statement-of-rights#right-5",
        keywords=["informed", "information", "consent", "decision", "explain"],
    ),
    Right(
        number=6,
        title="Right to advocacy",
        body=(
            "Older people have the right to have an advocate of their choosing, "
            "including a family member, friend, or independent advocate."
        ),
        citation_source="Statement of Rights, Right 6 (Aged Care Act 2024)",
        citation_url="/help/aged-care-act-2024/statement-of-rights#right-6",
        keywords=["advocate", "advocacy", "supporter", "representative"],
    ),
    Right(
        number=7,
        title="Right to privacy and confidentiality",
        body=(
            "Older people have the right to have their personal information kept "
            "private and used only for the purposes for which it was provided."
        ),
        citation_source="Statement of Rights, Right 7 (Aged Care Act 2024)",
        citation_url="/help/aged-care-act-2024/statement-of-rights#right-7",
        keywords=["privacy", "confidentiality", "personal information"],
    ),
    Right(
        number=8,
        title="Right to complain and to seek review",
        body=(
            "Older people have the right to make a complaint about their care, and "
            "to have the complaint addressed without fear of retribution."
        ),
        citation_source="Statement of Rights, Right 8 (Aged Care Act 2024)",
        citation_url="/help/aged-care-act-2024/statement-of-rights#right-8",
        keywords=["complaint", "complain", "review", "grievance", "feedback"],
    ),
    Right(
        number=9,
        title="Right to services that support well-being",
        body=(
            "Older people have the right to services that maintain and improve their "
            "physical, mental, social, and spiritual well-being, including reablement, "
            "restorative care, and palliative care where appropriate."
        ),
        citation_source="Statement of Rights, Right 9 (Aged Care Act 2024)",
        citation_url="/help/aged-care-act-2024/statement-of-rights#right-9",
        keywords=[
            "well-being", "wellbeing", "reablement", "restorative", "palliative",
            "mental", "social", "spiritual",
        ],
    ),
    Right(
        number=10,
        title="Right to have the plan reflect the older person",
        body=(
            "Older people have the right to have a care plan that reflects their "
            "individual goals, preferences, and cultural background."
        ),
        citation_source="Statement of Rights, Right 10 (Aged Care Act 2024)",
        citation_url="/help/aged-care-act-2024/statement-of-rights#right-10",
        keywords=["goals", "preferences", "individual", "person-centred", "voice"],
    ),
]


def get_right(number: int) -> Right | None:
    """Return the Right matching the given number or None if out of range."""
    for r in STATEMENT_OF_RIGHTS:
        if r.number == number:
            return r
    return None


def all_citation_sources() -> List[str]:
    """List every citation string emitted by this reference (used by the
    anti-fabrication check that a review's citation exists in the snapshot)."""
    return [r.citation_source for r in STATEMENT_OF_RIGHTS]
