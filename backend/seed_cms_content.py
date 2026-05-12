"""Seed two draft bridging articles + key glossary terms + placeholder reviewer.

Idempotent — checks for existing entries before insert.
Run: python -m seed_cms_content
"""
from __future__ import annotations
import asyncio
import os
import secrets
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# Placeholder reviewer record — replace with a real expert once recruited
PLACEHOLDER_REVIEWER = {
    "id": "wayly-editorial-placeholder",
    "name": "Wayly Editorial Team",
    "role": "Editorial — Pending external clinical/financial review",
    "qualifications": "Awaiting credentialed reviewer onboarding (target Q2 2026).",
    "bio": "Until Wayly onboards named, credentialed clinical and financial reviewers, "
           "all articles are clearly marked DRAFT — NEEDS REVIEW and treated as starting "
           "points only. Verify against health.gov.au and Services Australia before acting.",
    "sameAs": [],
    "is_author": True,
    "is_reviewer": False,  # not credentialed yet — cannot serve as reviewer
}


ARTICLE_BRIDGING = {
    "slug": "home-care-package-to-support-at-home-what-changes-2025",
    "title": "Home Care Package to Support at Home: what actually changes for families",
    "excerpt": "The Australian aged-care system replaced Home Care Packages with Support at Home on 1 November 2025. Here's what's the same, what's different, and what families need to do.",
    "body_md": """## The short version

On **1 November 2025**, the Australian Government replaced **Home Care Packages (HCP)** with a new program called **Support at Home**. If you or a family member was already receiving a Home Care Package, you've been automatically transitioned — you don't need to re-apply. But the way budgets, classifications and statements work has changed, and you'll see new terms on your invoices.

This article maps the old world to the new world so you can read your first Support at Home statement without panicking.

## What stayed the same

- **You keep your current provider** unless you choose to switch.
- **Your care continues uninterrupted** — services don't pause during the transition.
- **No-one is worse off than under their old HCP** (the government's "no detriment" rule for transitioned recipients).
- **OPAN's advocacy line is still 1800 700 600** — free, independent and confidential.

## What changed

### Levels → Classifications

Where HCP had four **levels** (1–4) by complexity of care needs, Support at Home has **eight classifications** (1–8). Higher classification = more annual funding. Levels do not map 1:1 — your old level 2 HCP is not automatically a Support at Home classification 2.

You'll see your assigned classification on your statement.

### Annual budget → Quarterly budget with rollover

Under HCP, you had a single annual budget. Under Support at Home, your funding is split into **quarterly budgets**. Unused funds **roll over** — up to whichever is higher of **$1,000 or 10% of the quarterly budget**. Care-management funds have no quarterly cap but are still capped annually.

If you spent very little under HCP and built up a big unspent balance, the transitional rules let you keep using that balance — ask your provider how it appears on your new statements.

### Statement format

Your Support at Home statement looks different. The biggest changes:

- Charges are now grouped by **service type** rather than by date.
- There's a clearer **rollover** line showing what carried over from last quarter.
- **Care management** is broken out as its own category.
- Provider price caps will start appearing from **1 July 2026** (see below).

Wayly's Statement Decoder reads both old HCP statements and new Support at Home statements — drop yours in to see the new format explained in plain English.

## Important dates to mark on the calendar

| Date | What happens |
|---|---|
| **1 November 2025** | HCP → Support at Home transition (done) |
| **1 July 2026** | National **price caps** start. Providers can't charge above the cap for capped services. |
| **1 October 2026** | **Personal care becomes free** for everyone on Support at Home (no individual contribution for showering, dressing, mobility help). |
| **Not before 1 July 2027** | CHSP (Commonwealth Home Support Program) folds into Support at Home. |

## What you should do this week

1. **Check your most recent statement** against your previous HCP statement. Are the totals you expect there? Wayly can decode it.
2. **Confirm your classification** matches what your assessor told you. If it looks wrong, you can request a reassessment.
3. **Look at your rollover balance.** Spending plans now work in 3-month windows, not 12.
4. **Don't switch providers in a panic.** The "no detriment" rule protects you under the transition — you can wait and decide deliberately.

## Where to verify everything in this article

- The **My Aged Care** website (`myagedcare.gov.au`) is the authoritative source for program rules.
- The **Department of Health** publishes the program manual at `health.gov.au/our-work/support-at-home`.
- **OPAN** (`opan.org.au`, 1800 700 600) gives free advocacy if you disagree with a decision.

If anything in this article doesn't match your statement, your statement is the truth — providers occasionally make errors. Ask Wayly's Statement Decoder or call OPAN.
""",
    "tags": ["support-at-home", "home-care-package", "transition", "bridging"],
    "is_draft": True,
}


ARTICLE_PRICE_CAPS = {
    "slug": "support-at-home-price-caps-july-2026",
    "title": "Support at Home price caps: what families need to know before 1 July 2026",
    "excerpt": "From 1 July 2026 the Australian Government caps what aged-care providers can charge for Support at Home services. Here's how to check your provider's prices and what to do if they're over the cap.",
    "body_md": """## The short version

From **1 July 2026**, the Australian Government will publish **national price caps** for most Support at Home services. Your provider will not be able to charge above the cap for capped services. This is the biggest billing change since the program launched in November 2025, and it's designed to stop the wide price variation between providers that families have been reporting.

This article explains how the caps work, how to check whether your provider is currently above the (draft) cap, and what to do if they are.

## What's actually being capped

The caps will cover the **most common Support at Home services**, including:

- **Personal care** (showering, dressing, mobility help) — note this also becomes **free to recipients** from 1 October 2026.
- **Domestic assistance** (cleaning, laundry, meal prep).
- **Allied health** (physio, occupational therapy, podiatry).
- **Nursing** (wound care, medication management).
- **Transport** (per kilometre and per hour rates).
- **Social support** (group and individual).

Not all services are capped — some specialised services and care-management fees follow separate rules. Your statement will mark capped and uncapped lines once 1 July 2026 hits.

## How the caps are set

The Department of Health publishes the cap schedule based on data from the Australian Bureau of Statistics and provider cost surveys. Caps are set by **service type** and may differ between **metro, regional and remote** areas (acknowledging that delivering care in remote Australia genuinely costs more).

You can check the live cap schedule at `health.gov.au/our-work/support-at-home/pricing` once published.

## How to check your provider now

You don't have to wait until July. Wayly's **Provider Price Checker** tool already loads the draft caps published in the late-2025 consultation papers. Enter the rates from your last statement and you'll see:

- Which services are currently **above** the draft cap (you'll likely see a reduction on your July statement)
- Which services are currently **below** the cap (no change expected)
- An estimated **annual saving** if your provider has to drop prices

If your provider is well above the cap on multiple lines, it's worth asking them now whether they plan to keep charging at the cap when it lands. Some providers may negotiate down in advance.

## What to do if you think the cap was breached after 1 July

1. **Cross-check your statement** line-by-line against the published cap schedule.
2. **Ask your provider in writing** for an explanation of any line above the cap. (Wayly's Statement Decoder can draft this letter for you.)
3. If the provider can't justify it, **complain to the Aged Care Quality and Safety Commission** (`agedcarequality.gov.au`, 1800 951 822).
4. **OPAN** (`opan.org.au`, 1800 700 600) can advocate on your behalf for free.

## What providers can still charge for

The cap is a maximum — providers can charge less. Many will, especially if competing for clients. The cap also doesn't stop providers passing on legitimate **third-party costs** (e.g. equipment, consumables) at cost. Watch for those lines on your statement.

Providers also keep **their own management and overhead margin** built into the capped rate — they're not being asked to deliver care below cost.

## What this doesn't change

- Your **classification** and **budget** are unchanged by the cap.
- **Care management fees** are governed separately.
- Your **out-of-pocket contribution** (means-tested) is unchanged by the cap — but the *amount* you contribute will fall because the price is lower.

## Where to verify everything in this article

- Department of Health Support at Home pricing page: `health.gov.au/our-work/support-at-home`
- Aged Care Quality and Safety Commission: `agedcarequality.gov.au`
- OPAN: `opan.org.au` · 1800 700 600
""",
    "tags": ["support-at-home", "price-caps", "billing", "july-2026"],
    "is_draft": True,
}


KEY_GLOSSARY = [
    ("Support at Home", "Australia's in-home aged-care program that replaced the Home Care Package program on 1 November 2025. Provides funded care services to older Australians who want to stay living at home. Funding levels run from classification 1 (lowest needs) to classification 8 (highest needs)."),
    ("Home Care Package", "The previous in-home aged-care program (HCP). Had four levels (1–4) by complexity. Replaced by Support at Home on 1 November 2025 — existing recipients were automatically transitioned with a 'no detriment' guarantee."),
    ("Classification", "Your Support at Home funding tier (1–8) assigned after an aged-care assessment by an Aged Care Assessment Team (ACAT). Higher classification = more annual funding."),
    ("ACAT", "Aged Care Assessment Team. The team that conducts your aged-care assessment and assigns your Support at Home classification."),
    ("Quarterly budget", "Support at Home funding is split into 3-month windows rather than annually. Unused funds carry over within limits (up to $1,000 or 10% of the quarterly budget, whichever is higher)."),
    ("Rollover", "The amount of unspent quarterly budget that carries into the next quarter. Capped at the higher of $1,000 or 10%."),
    ("Care management", "Support at Home funds for coordinating your care — case manager time, scheduling, paperwork. Has its own annual cap; rolls over without quarterly limits."),
    ("Price cap", "From 1 July 2026, the maximum hourly or per-service amount a provider can charge for capped Support at Home services. Set by service type and region by the Department of Health."),
    ("Personal care", "Help with daily living tasks (showering, dressing, mobility, toileting). Becomes free at the point of service from 1 October 2026 — your contribution drops to zero for this category."),
    ("Means-tested contribution", "The amount you personally contribute to your care, calculated by Services Australia based on your income and assets. Capped lifetime amount applies."),
    ("OPAN", "Older Persons Advocacy Network. Free, independent advocacy if you disagree with an assessment, complaint, or provider issue. 1800 700 600. opan.org.au."),
    ("Aged Care Quality and Safety Commission", "The federal regulator for aged-care providers. Handle complaints about service quality, billing, or provider conduct. 1800 951 822. agedcarequality.gov.au."),
    ("No detriment rule", "The Government's guarantee that no-one transitioning from HCP to Support at Home is worse off financially or in terms of services."),
    ("CHSP", "Commonwealth Home Support Programme. The 'entry-level' in-home program for lower needs. Currently separate from Support at Home; folding in not before 1 July 2027."),
    ("Reassessment", "A formal review of your aged-care needs, usually triggered by changes in health. Can move you up or down a classification."),
    ("Statement", "Your monthly or quarterly invoice from your aged-care provider, showing services delivered, charges, contributions and budget used."),
]


async def main():
    # Reviewer
    existing_rev = await db.cms_reviewers.find_one({"id": PLACEHOLDER_REVIEWER["id"]}, {"_id": 0, "id": 1})
    if not existing_rev:
        rec = {**PLACEHOLDER_REVIEWER, "created_at": _now(), "updated_at": _now(),
               "created_by": "seed-script"}
        await db.cms_reviewers.insert_one(rec)
        print(f"✓ Created reviewer: {PLACEHOLDER_REVIEWER['name']}")
    else:
        print(f"- Reviewer exists: {PLACEHOLDER_REVIEWER['name']}")

    # Articles
    for art in [ARTICLE_BRIDGING, ARTICLE_PRICE_CAPS]:
        existing = await db.cms_articles.find_one({"slug": art["slug"]}, {"_id": 0, "slug": 1})
        if existing:
            print(f"- Article exists: {art['slug']}")
            continue
        rec = {
            "slug": art["slug"],
            "title": art["title"],
            "excerpt": art["excerpt"],
            "body_md": art["body_md"],
            "tags": art["tags"],
            "published": True,
            "published_at": _now(),
            "author_id": PLACEHOLDER_REVIEWER["id"],
            "reviewer_id": None,
            "reviewed_at": None,
            "citations": [
                {"title": "Support at Home program", "url": "https://www.health.gov.au/our-work/support-at-home",
                 "publisher": "Department of Health, Aged Care and Sport"},
                {"title": "My Aged Care", "url": "https://www.myagedcare.gov.au",
                 "publisher": "Australian Government"},
                {"title": "OPAN — Older Persons Advocacy Network", "url": "https://www.opan.org.au",
                 "publisher": "OPAN"},
            ],
            "is_draft_needs_review": art["is_draft"],
            "created_at": _now(),
            "updated_at": _now(),
            "created_by": "seed-script",
        }
        await db.cms_articles.insert_one(rec)
        print(f"✓ Created article: {art['slug']} (DRAFT)")

    # Glossary
    added, skipped = 0, 0
    for term, definition in KEY_GLOSSARY:
        import re as _re
        existing = await db.cms_glossary.find_one(
            {"term": {"$regex": f"^{_re.escape(term)}$", "$options": "i"}},
            {"_id": 0, "id": 1},
        )
        if existing:
            skipped += 1
            continue
        await db.cms_glossary.insert_one({
            "id": secrets.token_urlsafe(6),
            "term": term,
            "definition": definition,
            "published": True,
            "created_at": _now(),
            "updated_at": _now(),
            "created_by": "seed-script",
            "import_source": "seed",
        })
        added += 1
    print(f"✓ Glossary: {added} added, {skipped} skipped (already exist)")


if __name__ == "__main__":
    asyncio.run(main())
