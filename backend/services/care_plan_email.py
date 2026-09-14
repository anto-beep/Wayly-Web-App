"""CPR-1 · Follow-up email drafter.

Produces a (subject, body) tuple summarising the questions the family
plans to raise and asking the provider for written responses. Not sent
by Wayly, surfaced to the user to copy into their email client.

Editorial rules (mirror CPR-1 §E spec):
  * Australian English.
  * Warm, not adversarial. First-name tone.
  * No apostrophes anywhere.
  * No em dashes.
"""
from __future__ import annotations

from typing import Any, Dict, List, Tuple


def draft_follow_up_email(
    *, plan: Dict[str, Any], extraction: Dict[str, Any], findings: List[Dict[str, Any]],
) -> Tuple[str, str]:
    provider = plan.get("provider_name") or extraction.get("provider_name") or "the care team"
    participant = extraction.get("participant_first_name") or "the participant"

    # Grab the top 5 questions by severity
    order = {"compliance": 0, "choice": 1, "efficiency": 2, "info": 3}
    ranked = sorted(
        (f for f in findings if f.get("suggested_question")),
        key=lambda f: (order.get(f.get("severity", "info"), 99), f.get("category", "")),
    )
    top = ranked[:6]

    subject = f"Follow-up on {participant} care plan review"

    lines = [
        f"Hello {provider} team,",
        "",
        f"Thank you for taking the time to walk us through the care plan for {participant}.",
        "We used the Wayly Support Plan Reviewer to check the plan against the Statement of Rights, the National Aged Care Quality Standards, and the Aged Care Rules 2025. A few points came up that we would like written responses on so we can update our records.",
        "",
    ]

    if top:
        lines.append("Questions we would like formal answers to:")
        lines.append("")
        for i, f in enumerate(top, start=1):
            q = f.get("suggested_question", "").strip()
            cite = f.get("citation_source") or "Verification required"
            lines.append(f"{i}. {q}")
            lines.append(f"   (Reference: {cite})")
            lines.append("")
    else:
        lines.append("We do not have any specific written questions right now, but would appreciate a copy of the current plan and any related documents for our records.")
        lines.append("")

    lines.extend([
        "If it is easier, we are happy to book a short follow-up call to work through these together.",
        "",
        "Thanks again,",
        "",
        "[Your name here]",
        "on behalf of the family",
    ])
    body = "\n".join(lines)
    return subject, body


__all__ = ["draft_follow_up_email"]
