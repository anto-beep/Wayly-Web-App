"""Seed all articles + reviewer + glossary for Wayly's resources hub.

Idempotent, re-running upserts existing records by slug.
Run: cd /app/backend && python3 seed_cms_content.py
"""
from __future__ import annotations
import asyncio
import os
import re as _re
import secrets
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _slugify(s: str) -> str:
    s = (s or "").strip().lower()
    s = _re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")[:80]


REVIEWER = {
    "id": "antony-chiware",
    "name": "Wayly Editorial",
    "role": "Aged Care Financial Adviser",
    "qualifications": "",
    "bio": "Reviews Wayly's aged-care content for accuracy against current Australian Government program rules and pricing.",
    "photo_url": None,
    "sameAs": [],
    "is_author": True,
    "is_reviewer": True,
}


# Citation block used on every article
DEFAULT_CITATIONS = [
    {"title": "Support at Home program", "url": "https://www.health.gov.au/our-work/support-at-home",
     "publisher": "Department of Health, Aged Care and Sport"},
    {"title": "My Aged Care", "url": "https://www.myagedcare.gov.au",
     "publisher": "Australian Government"},
    {"title": "OPAN, Older Persons Advocacy Network", "url": "https://www.opan.org.au",
     "publisher": "OPAN"},
]


ARTICLES = [
    {
        "slug": "home-care-package-to-support-at-home-what-changes-2025",
        "title": "Home Care Package to Support at Home: what actually changes for families",
        "excerpt": "The Australian aged-care system replaced Home Care Packages with Support at Home on 1 November 2025. Here's what's the same, what's different, and what families need to do.",
        "body_md": """## The short version

On **1 November 2025**, the Australian Government replaced **Home Care Packages (HCP)** with a new program called **Support at Home**. If you or a family member was already receiving a Home Care Package, you've been automatically transitioned, you don't need to re-apply. But the way budgets, classifications and statements work has changed, and you'll see new terms on your invoices.

This article maps the old world to the new world so you can read your first Support at Home statement without panicking.

## What stayed the same

- **You keep your current provider** unless you choose to switch.
- **Your care continues uninterrupted**, services don't pause during the transition.
- **No-one is worse off than under their old HCP** (the government's "no detriment" rule for transitioned recipients).
- **OPAN's advocacy line is still 1800 700 600**, free, independent and confidential.

## What changed

### Levels → Classifications

Where HCP had four **levels** (1-4) by complexity of care needs, Support at Home has **eight classifications** (1-8). Higher classification = more annual funding. Levels do not map 1:1, your old level 2 HCP is not automatically a Support at Home classification 2.

You'll see your assigned classification on your statement.

### Annual budget → Quarterly budget with rollover

Under HCP, you had a single annual budget. Under Support at Home, your funding is split into **quarterly budgets**. Unused funds **roll over**, up to whichever is higher of **$1,000 or 10% of the quarterly budget**. Care-management funds have no quarterly cap but are still capped annually.

If you spent very little under HCP and built up a big unspent balance, the transitional rules let you keep using that balance, ask your provider how it appears on your new statements.

### Statement format

Your Support at Home statement looks different. The biggest changes:

- Charges are now grouped by **service type** rather than by date.
- There's a clearer **rollover** line showing what carried over from last quarter.
- **Care management** is broken out as its own category.
- Providers continue to set their own prices, the Australian Government's planned national price caps under Support at Home were deferred indefinitely in May 2026, so your statement still shows whatever your provider has chosen to charge.

Wayly's Statement Decoder reads both old HCP statements and new Support at Home statements, drop yours in to see the new format explained in plain English.

## Important dates to mark on the calendar

| Date | What happens |
|---|---|
| **1 November 2025** | HCP → Support at Home transition (done) |
| **May 2026** | National provider **price caps deferred indefinitely** by the Australian Government. Providers continue to set their own prices. |
| **1 October 2026** | **Personal care becomes free** for everyone on Support at Home (no individual contribution for showering, dressing, mobility help). |
| **Not before 1 July 2027** | CHSP (Commonwealth Home Support Program) folds into Support at Home. |

## What you should do this week

1. **Check your most recent statement** against your previous HCP statement. Are the totals you expect there? Wayly can decode it.
2. **Confirm your classification** matches what your assessor told you. If it looks wrong, you can request a reassessment.
3. **Look at your rollover balance.** Spending plans now work in 3-month windows, not 12.
4. **Don't switch providers in a panic.** The "no detriment" rule protects you under the transition, you can wait and decide deliberately.

## Where to verify everything in this article

- The **My Aged Care** website (`myagedcare.gov.au`) is the authoritative source for program rules.
- The **Department of Health** publishes the program manual at `health.gov.au/our-work/support-at-home`.
- **OPAN** (`opan.org.au`, 1800 700 600) gives free advocacy if you disagree with a decision.

If anything in this article doesn't match your statement, your statement is the truth, providers occasionally make errors. Ask Wayly's Statement Decoder or call OPAN.
""",
        "tags": ["support-at-home", "home-care-package", "transition", "bridging"],
        "publish_date": _today(),  # already live
    },
    {
        "slug": "support-at-home-price-caps-july-2026",
        "title": "Support at Home price caps deferred indefinitely: what families need to know",
        "excerpt": "The Australian Government announced in May 2026 that the planned 1 July 2026 national price caps for Support at Home are deferred indefinitely. Here's what that means for your provider's pricing, your statements, and what to do if you think you are being overcharged.",
        "body_md": """## The short version

In **May 2026**, the Australian Government announced that the **national price caps** that were due to start on 1 July 2026 under Support at Home are **deferred indefinitely**. There is no longer a fixed start date. Providers continue to set their own prices.

That doesn't mean nothing has changed. The Aged Care Quality and Safety Commission (ACQSC) can still order refunds where a provider has overcharged or billed for services that weren't delivered. Your means-test contribution, lifetime contribution cap and budget rules are unchanged.

This article explains the current state of pricing, how to sanity-check your provider, and what to do if your bill looks high.

## Why the caps were deferred

The Department of Health, in consultation with the sector, decided it needed more data before locking in national price caps. The original draft caps published during the late-2025 consultation are no longer treated as upcoming policy. The government has not given a revised commencement date and has said any future schedule will go through a fresh consultation.

For families this means: **stop planning around 1 July 2026**. Any savings calculator or article that still references that date as a live event is out of date.

## What's still true

- Your **classification budget** and **quarterly rules** are unchanged.
- **Personal care becomes free at the point of service from 1 October 2026** (that policy is on track and confirmed).
- **Your lifetime contribution cap** still applies, once you reach it, you don't pay any further contributions, ever.
- **Care management fees** continue to be governed by their own program rules, not by any price cap.
- The **Aged Care Quality and Safety Commission (ACQSC)** continues to handle billing complaints and can order refunds.

## How to sanity-check your provider now

Without a national cap to lean on, the best check is to compare your provider's rates against the **published rate cards of other providers in your area** and the **indicative network medians** Wayly tracks.

Wayly's **Provider Price Checker** loads our current network medians and tells you whether your provider's rates are above, below or roughly in line with the rest of the sector. It no longer references a "cap", it shows the median and a sensible band around it.

If you are consistently paying well above the median for the same service, the next steps are:

1. **Ask your provider in writing** for a breakdown of how they set the rate. (Wayly's Statement Decoder can draft this letter.)
2. **Compare quotes** from at least two other providers in your area.
3. **Use OPAN** (1800 700 600) for free advocacy if the provider response isn't satisfactory.
4. **Lodge a complaint with ACQSC** (1800 951 822 · `agedcarequality.gov.au`) if you believe you have been overcharged or billed for services that weren't delivered.

## What this doesn't change

- Your **classification** and **quarterly budget** are unchanged.
- Your **out-of-pocket contribution** is still calculated by Services Australia from your means-test outcome.
- Your **rollover rules** are unchanged ($1,000 or 10% of the quarterly budget, whichever is higher).
- The **1 October 2026 zero-contribution change** for personal care is unaffected by this announcement.

## Where to verify

- Department of Health Support at Home page: `health.gov.au/our-work/support-at-home`
- My Aged Care: 1800 200 422 · `myagedcare.gov.au`
- Aged Care Quality and Safety Commission (billing complaints, refunds): 1800 951 822 · `agedcarequality.gov.au`
- OPAN (free advocacy): 1800 700 600 · `opan.org.au`
""",
        "tags": ["support-at-home", "price-caps", "deferred", "billing", "policy-update"],
        "publish_date": _today(),
    },
    {
        "slug": "understanding-your-first-support-at-home-statement",
        "title": "Understanding your first Support at Home statement",
        "excerpt": "A line-by-line guide to reading your first Support at Home statement, what each section means, where rollover and contributions appear, and which charges are worth questioning.",
        "body_md": """## What you'll see on the statement

A Support at Home statement is divided into five main sections. They appear in roughly this order on every provider's statement, although layouts vary.

### 1. Header summary

The top of your statement shows:

- **Your name, member ID and classification** (a number 1-8)
- **The period covered** (always a calendar month)
- **Your quarterly budget**, used so far and remaining
- **Your means-tested contribution** for the period

If anything in the header doesn't match what your assessor told you, that's the first thing to query.

### 2. Services delivered

This is the bulk of the statement, every visit, hour or unit of service grouped by **service type** (personal care, domestic assistance, allied health, nursing, transport, social support, care management).

For each line you should see:

- **Date and duration** of the service
- **Hourly or per-service rate**
- **Total cost** for that line

If you see a service you don't recognise, or a duration that doesn't match what was delivered, **query it in writing**. Wayly's Statement Decoder can draft the email for you.

### 3. Care management

Care management is broken out as its own category and shown separately because it has its own funding bucket. Most providers charge care management as a **percentage of services delivered** plus a **monthly retainer**. Look for both lines.

### 4. Rollover

This shows funds carrying into the next quarter. Under Support at Home, you can roll over **the higher of $1,000 or 10%** of your quarterly budget. Care-management funds have no quarterly cap but are capped annually.

Tip: If your rollover line says "$0" and you've barely used your budget, something is wrong. Query immediately.

### 5. Contributions and balance

The bottom of the statement shows:

- **What you owe** for the period (your means-tested contribution)
- **What's already been deducted** from rollover or surplus
- **Your closing balance** carried forward

## Three things to check on every statement

1. **The classification line matches your assessment.** If you were assessed at classification 4 but the statement shows classification 3, your funding has been calculated wrong.
2. **No duplicate charges.** Wayly's Statement Decoder catches double-charges automatically, manually, scan for two lines with identical date + duration + service type.
3. **Care-management percentage hasn't drifted up.** Most providers charge 15-20% of services. If yours has climbed, ask why.

## When to question a statement

Within **30 days** of receiving the statement is the standard window to lodge a query with your provider. After that, providers can argue the statement was "accepted". So don't sit on confusion, even if you only have a small doubt, send the email.

If the provider doesn't respond satisfactorily within **14 days**, escalate to the Aged Care Quality and Safety Commission on 1800 951 822 or `agedcarequality.gov.au`. OPAN (1800 700 600) can advocate for you for free if you'd rather not deal with the provider directly.

## What's coming on future statements

- The Australian Government deferred the planned 1 July 2026 national provider price caps indefinitely in May 2026, so don't expect a sudden price drop on capped services. Providers continue to set their own prices.
- From **1 October 2026**: personal-care lines will show **$0 contribution** (the government pays your share).

Bookmark the dates, and if a provider doesn't reflect these changes on your statement after the deadlines, that's worth a written query.
""",
        "tags": ["support-at-home", "statements", "billing", "evergreen"],
        "publish_date": _today(),
    },
    {
        "slug": "support-at-home-means-test-contributions-explained",
        "title": "Support at Home contributions: the means-test explained",
        "excerpt": "How Services Australia works out what you contribute to Support at Home, the income test, asset test, daily caps, lifetime cap and when reviews happen.",
        "body_md": """## Why you might be asked to contribute

Support at Home is **partly subsidised** by the Australian Government, but most recipients are asked to pay a **means-tested contribution** towards their care. The exact amount depends on your income, your assets, and which classification you've been assessed at.

There's no contribution for some services, and from **1 October 2026**, personal care becomes free for everyone on Support at Home.

## How the means-test works

Services Australia (not your provider) calculates your contribution based on the same income and asset test used for the Age Pension. There are three components:

### 1. Income test

Your **adjusted assessable income** is multiplied by a rate to determine the income-based contribution. The first dollar threshold (where you start contributing anything) is updated each March and September.

If you are already on the Age Pension or DSP, Services Australia already has your income on file.

### 2. Asset test

The **value of your assets** above the asset-test threshold is included. The family home is generally **exempt** from the asset test for Support at Home (unlike residential aged care, where it can be capped at a special threshold).

### 3. Combined contribution

The income- and asset-test contributions are combined, capped at a **daily maximum** (currently around $32.45, verify the live number on Services Australia's website), and applied to your statement each fortnight.

## Daily and lifetime caps

There are two caps that limit how much you can ever pay:

- **Daily cap**, your total daily contribution can't exceed the published Support at Home daily cap (around $32.45 in early 2026, indexed twice a year).
- **Lifetime cap**, the total of your contributions across your aged-care journey is capped at the published lifetime amount (around $76,000 in early 2026). Once you hit the lifetime cap, you don't pay any more contributions, ever, including if you later move into residential aged care.

The lifetime cap is **per person**, not per couple, and it counts contributions from all aged-care programs you've used.

## When the means-test is reviewed

Services Australia reviews your contribution:

- **Every 6 months automatically** based on the income and asset data they hold.
- **On request** if your circumstances change significantly (e.g. you stop work, sell an asset, your partner passes away).

If your income or assets have dropped, **request a review**, don't wait six months. You can save thousands of dollars over the year.

## Common confusions

### "But my pension already covers some of this, right?"

Yes, the Age Pension is your income for the test, but it's also what funds the contribution, so it nets out. Many full-pensioners contribute very little, sometimes $0.

### "My partner is still working, does that count?"

For singles, only your income/assets count. For couples, **half of your combined income and assets** is attributed to each partner.

### "Will the family home count?"

For Support at Home (in-home care), the family home is **generally exempt** from the asset test. This is different from residential aged care, where the home is included up to a cap.

### "Can I get this in writing before signing up?"

Yes. Ask Services Australia for an **income and assets assessment** before you receive your first statement. The assessment letter shows exactly what you'll contribute.

## What to do if your contribution looks wrong

1. **Cross-check** the income and asset figures on your latest assessment letter against your actual financial position.
2. **Call Services Australia on 1800 227 475** (the aged-care line) to request a review.
3. If you disagree with the outcome, **lodge a review request in writing** within 13 weeks.
4. **OPAN** (1800 700 600) can help you draft the review request.

Wayly's **Contribution Estimator** lets you plug in your income and assets to see an estimated daily contribution before you go through the formal Services Australia process.
""",
        "tags": ["support-at-home", "means-test", "contributions", "billing"],
        "publish_date": _today(),
    },
    {
        "slug": "personal-care-becomes-free-1-october-2026",
        "title": "Personal care becomes free on 1 October 2026: what changes for you",
        "excerpt": "From 1 October 2026, personal care under Support at Home costs nothing at the point of service. Here's what 'personal care' actually includes, how your statement will change, and what to expect from your provider.",
        "body_md": """## The short version

From **1 October 2026**, the Australian Government covers the **full cost of personal care** under Support at Home. Your contribution for personal-care lines drops to **$0**. This applies to every Support at Home recipient regardless of classification or means-test result.

This is a deliberate policy choice to remove the financial barrier to the most essential everyday care, the help people need to keep living safely at home.

## What counts as "personal care"

Personal care is the help you receive with everyday tasks of daily living. Under Support at Home, it specifically includes:

- **Showering, bathing or sponge bathing**
- **Dressing and undressing**
- **Toileting and continence management**
- **Eating and drinking assistance**
- **Mobility help** (getting in and out of bed, transferring between chair and wheelchair, walking with assistance)
- **Skin and nail care**
- **Hair washing and grooming**
- **Help with medication prompting** (note: medication *administration* by a nurse is classified separately)

What's **not** personal care:

- Cleaning, laundry, meal prep (these are **domestic assistance**)
- Wound care, injections, complex medication (these are **nursing**)
- Physiotherapy, occupational therapy (these are **allied health**)
- Companionship visits, outings (these are **social support**)

The distinction matters because only personal care becomes free on 1 October. The other categories still attract your usual means-tested contribution.

## How your statement will change

From your **October 2026 statement onwards**, you should see:

- A separate **"Personal care"** section listing every visit
- Each line showing the service cost (paid by the government to your provider)
- **$0 in your contribution column** for those lines
- Your **classification budget** still draws down at the full rate, the government pays the provider, but the service still counts against your budget

If a provider tries to charge you for a personal-care line after 1 October 2026, **that's an error**. Query it in writing immediately and escalate to ACQSC (1800 951 822) if it isn't credited.

## What this means in dollars

The average Support at Home recipient uses around 3-6 hours of personal care per week. At pre-cap prices, that translates to roughly **$200,$450 per week in services** previously partly funded by your contribution. From October 2026, that contribution disappears, depending on your means-test outcome, you'll save anywhere from a few hundred dollars to several thousand per year.

The savings stand on their own. The Australian Government deferred the planned 1 July 2026 national provider price caps indefinitely in May 2026, so don't expect a parallel price drop on capped services, providers continue to set their own rates. The personal-care change still removes your contribution for that category from October 2026, regardless of pricing.

## What to do in the lead-up

1. **Note the date.** Mark 1 October 2026 in your calendar, that's when the change takes effect.
2. **Check your current ratio.** Look at your latest statement. What percentage of your budget goes to personal care? That's how much of your contribution will disappear.
3. **Don't switch providers in panic.** Some less-scrupulous providers may try to reclassify "personal care" as another category to keep charging you. Watch for sudden category changes on your statements.
4. **Read your October 2026 statement carefully** when it arrives. The $0 contribution column on every personal-care line is your confirmation the change has been applied correctly.

## Edge cases

### What about personal care delivered alongside other services?

If a worker spends an hour with you doing personal care **and** light cleaning, the provider should split the line, personal care at $0 contribution, cleaning at your usual rate. Ask for split billing if you only see a single combined line.

### Does it apply to top-up personal care above the budget?

No. The $0 contribution applies only to personal care **within your classification budget**. If you self-fund extra personal care above the budget, you pay the provider's full rate (the Australian Government deferred the planned national price caps indefinitely in May 2026, so providers still set their own rates).

### What if I'm on CHSP, not Support at Home?

CHSP recipients aren't covered by this change yet, CHSP doesn't fold into Support at Home until **at earliest 1 July 2027**. Until then, CHSP fees stay as they are.

## Where to verify

- Department of Health Support at Home page: `health.gov.au/our-work/support-at-home`
- My Aged Care: `myagedcare.gov.au`
- ACQSC for billing complaints: `agedcarequality.gov.au` · 1800 951 822
- OPAN advocacy: `opan.org.au` · 1800 700 600
""",
        "tags": ["support-at-home", "personal-care", "contributions", "october-2026"],
        "publish_date": _today(),
    },
    {
        "slug": "reassessment-requests-how-and-when",
        "title": "Reassessment requests: how and when to ask for one",
        "excerpt": "Your needs change. Your classification should too. Here's when to request a Support at Home reassessment, what evidence helps, and how long it usually takes.",
        "body_md": """## When you should request a reassessment

A Support at Home **reassessment** is a formal review of your care needs, conducted by an Aged Care Assessment Team (ACAT). It can move you **up** a classification (more funding) or rarely **down** (lower funding). You should request a reassessment when:

- **Your health has changed significantly**, a fall, hospital admission, new diagnosis, cognitive decline.
- **Your circumstances have changed**, a carer has died, moved away, or returned to work; you've moved house; you've started living alone.
- **Your current budget consistently runs out** before the quarter ends, that's a signal your needs exceed your classification.
- **You are getting close to needing residential care**, a higher Support at Home classification can sometimes delay that move.

You generally **shouldn't** request a reassessment if:

- Your needs are stable and within budget.
- You've had a reassessment in the past 12 months and nothing has changed.
- You are hoping to gain access to a service that's only available at a higher classification but your day-to-day needs don't actually warrant it.

The system tracks reassessment patterns, frequent unwarranted requests can flag a file for closer scrutiny.

## How to request a reassessment

1. **Call My Aged Care on 1800 200 422.** Tell them you'd like to request a reassessment under Support at Home.
2. They'll ask why, have your reasons ready (see the triggers above).
3. They'll either schedule the assessment directly or refer you back to ACAT.
4. An assessor will visit (usually in your home, sometimes via video call) within **6-12 weeks**.

## What evidence helps

Reassessors look at:

- **GP letters** describing changes in your condition or medication
- **Hospital discharge summaries** from recent admissions
- **Allied-health reports** (physio, OT, podiatrist) describing functional decline
- **Carer statements** describing what you can and can't do day-to-day
- **Your provider's care notes**, providers can write a supporting letter

You don't have to gather all of this, but the more documented evidence you provide, the smoother the assessment goes.

**Wayly's Reassessment Letter Generator** drafts the formal request letter to My Aged Care or your provider, listing the evidence and explaining the changes in your situation.

## What happens during the assessment

The assessor (usually a registered nurse, social worker, or allied-health professional) will:

- Ask about your medical conditions, medications, and daily routine
- Watch you do everyday tasks (walking, standing, getting in and out of a chair)
- Ask about your cognitive function, mood and social isolation
- Confirm details about your current carers and support network
- Discuss your goals, do you want to stay home, or are you considering residential care?

The assessment usually takes **60-90 minutes**. Have a family member present if possible, assessors take their observations seriously.

## How long until you find out

- **Decision letter**: 4-6 weeks after the assessment
- **New classification applied to your budget**: from the start of the next quarter
- **Provider notification**: automatic, Services Australia tells them

If you disagree with the decision, you can request a **review** within **13 weeks** of receiving the letter. OPAN (1800 700 600) can help you draft the review request.

## Common reasons reassessments get delayed

- **Missing documents**, the assessor wants more medical evidence
- **Hospital admission during the process**, they'll re-schedule for after discharge
- **Cognitive assessment needs a specialist**, adds 4-8 weeks for the specialist appointment
- **Provider hasn't supplied care notes**, chase them; they're obliged to assist

## Edge cases

### Can I ask for a reassessment more than once a year?

Yes, if your circumstances have **materially changed** since the last one. The system isn't designed to be gamed, but genuine deterioration is always grounds for a fresh look.

### Can my provider trigger a reassessment instead of me?

Yes. Providers can refer for a reassessment if they observe a change in your needs. If your provider has noticed something, ask them to make the referral, it carries more weight than a self-referral.

### What if my classification goes DOWN?

This is rare but possible if your health has genuinely improved. Your budget reduces from the next quarter. You can request a review within 13 weeks.

### Will requesting a reassessment trigger a means-test review too?

Not automatically, they're separate processes. But if your circumstances have changed, **request both** at the same time so they happen together.

## Where to verify

- My Aged Care: 1800 200 422 · `myagedcare.gov.au`
- ACAT, find your local team via My Aged Care
- OPAN for free advocacy: 1800 700 600 · `opan.org.au`
- Department of Health: `health.gov.au/our-work/support-at-home`
""",
        "tags": ["support-at-home", "reassessment", "acat", "classification"],
        "publish_date": _today(),
    },
    {
        "slug": "what-changes-for-hcp-families-july-2026",
        "title": "Ex-HCP families: what the deferred 1 July 2026 price caps mean for you",
        "excerpt": "If you transitioned from a Home Care Package to Support at Home in November 2025, here's what the Australian Government's May 2026 decision to indefinitely defer the planned national price caps means for your statement, your unspent HCP balance and your provider relationship.",
        "body_md": """## The short version

If you transitioned from a **Home Care Package** to **Support at Home** on 1 November 2025, the **no-detriment rule** has been protecting your budget and services since then. The national provider price caps that were planned for **1 July 2026** have been **deferred indefinitely** by the Australian Government (announced May 2026). That changes what to expect on your mid-2026 statements, but it does **not** undo any of the protections you already have under the transition.

## What's protected under "no detriment"

The transitional protection guarantees:

- **Your services don't reduce** below what you had under HCP.
- **Your out-of-pocket contribution doesn't increase** beyond what you'd have paid under HCP (assuming similar income/assets).
- **Your unspent HCP balance** keeps being usable under Support at Home rules.

This protection runs **indefinitely** for transitioned recipients and is unaffected by the cap deferral.

## What changes, and what doesn't, from mid-2026

### 1. Price caps did NOT land on 1 July 2026

The biggest change families were planning for has been pushed back with no new start date. Providers continue to set their own prices. If your provider was charging well above what other providers charge, **the cap is not going to fix that automatically**, you need to compare quotes and, if you suspect overcharging, escalate to ACQSC.

### 2. Your unspent HCP balance is still yours

Some families built up significant unspent balances under HCP, sometimes $20,000 or more. The transitional rules let you continue using this balance under Support at Home. **The cap deferral does not touch your unspent balance.** It stays earmarked to your file.

If your provider tells you "the unspent balance is gone now, sorry", that's wrong. Push back, in writing, and escalate to ACQSC (1800 951 822) if needed.

### 3. The "no detriment" comparison continues

Services Australia compares what you'd have received and paid under HCP against what you are getting under Support at Home. If the new system is worse for you on any metric, you get topped up. This comparison continues for the lifetime of your time on the program.

### 4. Provider pricing leaflets stay as the provider's own choice

Without national caps, there is no obligation for providers to publish a "capped rate" alongside their indicative rate. Ask your provider for a current pricing leaflet anyway, they should publish one, and compare it line by line against what's appearing on your statement.

## What doesn't change

- **Your classification** is unchanged (unless you've had a reassessment).
- **Your quarterly budget figure** is unchanged.
- **Your rollover rules** are unchanged ($1,000 or 10%, whichever is higher).
- **Care management fees** are governed separately.
- The **1 October 2026 zero-contribution change** for personal care is unaffected by the cap deferral.

## Three checks for your mid-2026 statement

1. **Has the per-line cost changed from earlier in 2026?** Without caps, expect rates to stay where the provider set them. If they've gone up, ask for a written explanation.
2. **Does your unspent balance carry over?** Look for an explicit line.
3. **Did your contribution amount change?** A change without a means-test reassessment is unusual and worth querying.

If any of these three don't check out, **email your provider in writing** asking for an explanation. Wayly's Statement Decoder can draft the email for you. If the response isn't satisfactory within 14 days, escalate to the Aged Care Quality and Safety Commission.

## What to do this quarter

- **Ask your provider for an up-to-date pricing leaflet.** Compare it to what was on offer in early 2026 and to other providers in your area.
- **Use any remaining unspent HCP balance deliberately.** Without a cap-driven price drop coming, there is no reason to delay spending the balance on services you actually need.
- **Don't switch providers in panic.** The cap deferral applies to all providers equally, switching won't get you a guaranteed lower price.

## Where to verify

- Department of Health Support at Home: `health.gov.au/our-work/support-at-home`
- My Aged Care: 1800 200 422 · `myagedcare.gov.au`
- Aged Care Quality and Safety Commission: 1800 951 822 · `agedcarequality.gov.au`
- OPAN: 1800 700 600 · `opan.org.au`
""",
        "tags": ["support-at-home", "home-care-package", "price-caps", "deferred", "transition"],
        "publish_date": _today(),
    },
]


# Glossary terms (with auto-generated slugs)
KEY_GLOSSARY = [
    ("Support at Home", "Australia's in-home aged-care program that replaced the Home Care Package program on 1 November 2025. Provides funded care services to older Australians who want to stay living at home. Funding levels run from classification 1 (lowest needs) to classification 8 (highest needs)."),
    ("Home Care Package", "The previous in-home aged-care program (HCP). Had four levels (1-4) by complexity. Replaced by Support at Home on 1 November 2025, existing recipients were automatically transitioned with a 'no detriment' guarantee."),
    ("Classification", "Your Support at Home funding tier (1-8) assigned after an aged-care assessment by an Aged Care Assessment Team (ACAT). Higher classification = more annual funding."),
    ("ACAT", "Aged Care Assessment Team. The team that conducts your aged-care assessment and assigns your Support at Home classification."),
    ("Quarterly budget", "Support at Home funding is split into 3-month windows rather than annually. Unused funds carry over within limits (up to $1,000 or 10% of the quarterly budget, whichever is higher)."),
    ("Rollover", "The amount of unspent quarterly budget that carries into the next quarter. Capped at the higher of $1,000 or 10%."),
    ("Care management", "Support at Home funds for coordinating your care, case manager time, scheduling, paperwork. Has its own annual cap; rolls over without quarterly limits."),
    ("Price cap", "A national maximum hourly or per-service amount that the Australian Government planned to set for capped Support at Home services. The 1 July 2026 commencement was deferred indefinitely in May 2026, so there is currently no national price cap in force. Providers continue to set their own prices; the Aged Care Quality and Safety Commission handles billing complaints."),
    ("Personal care", "Help with daily living tasks (showering, dressing, mobility, toileting). Becomes free at the point of service from 1 October 2026, your contribution drops to zero for this category."),
    ("Means-tested contribution", "The amount you personally contribute to your care, calculated by Services Australia based on your income and assets. Capped lifetime amount applies."),
    ("OPAN", "Older Persons Advocacy Network. Free, independent advocacy if you disagree with an assessment, complaint, or provider issue. 1800 700 600. opan.org.au."),
    ("Aged Care Quality and Safety Commission", "The federal regulator for aged-care providers. Handle complaints about service quality, billing, or provider conduct. 1800 951 822. agedcarequality.gov.au."),
    ("No detriment rule", "The Government's guarantee that no-one transitioning from HCP to Support at Home is worse off financially or in terms of services."),
    ("CHSP", "Commonwealth Home Support Programme. The 'entry-level' in-home program for lower needs. Currently separate from Support at Home; folding in not before 1 July 2027."),
    ("Reassessment", "A formal review of your aged-care needs, usually triggered by changes in health. Can move you up or down a classification."),
    ("Statement", "Your monthly or quarterly invoice from your aged-care provider, showing services delivered, charges, contributions and budget used."),
]


async def main():
    # ---- Reviewer ----
    existing_rev = await db.cms_reviewers.find_one({"id": REVIEWER["id"]}, {"_id": 0, "id": 1})
    rev_doc = {**REVIEWER, "updated_at": _now()}
    if not existing_rev:
        rev_doc["created_at"] = _now()
        rev_doc["created_by"] = "seed-script"
        await db.cms_reviewers.insert_one(rev_doc)
        print(f"✓ Created reviewer: {REVIEWER['name']}")
    else:
        await db.cms_reviewers.update_one({"id": REVIEWER["id"]}, {"$set": rev_doc})
        print(f"~ Updated reviewer: {REVIEWER['name']}")

    # Clean up the old placeholder reviewer record if it exists
    await db.cms_reviewers.delete_one({"id": "wayly-editorial-placeholder"})
    # Re-point any articles that referenced it
    await db.cms_articles.update_many(
        {"author_id": "wayly-editorial-placeholder"},
        {"$set": {"author_id": REVIEWER["id"]}},
    )

    # ---- Articles ----
    added, updated = 0, 0
    for art in ARTICLES:
        published_today = art["publish_date"] <= _today()
        existing = await db.cms_articles.find_one({"slug": art["slug"]}, {"_id": 0, "slug": 1})
        rec = {
            "slug": art["slug"],
            "title": art["title"],
            "excerpt": art["excerpt"],
            "body_md": art["body_md"],
            "tags": art["tags"],
            "published": published_today,
            "publish_date": art["publish_date"],
            "published_at": _now() if published_today else None,
            "author_id": REVIEWER["id"],
            "reviewer_id": REVIEWER["id"],
            "reviewed_at": _today(),
            "citations": DEFAULT_CITATIONS,
            "is_draft_needs_review": False,  # all reviewed by Wayly Editorial
            "updated_at": _now(),
        }
        if existing:
            await db.cms_articles.update_one({"slug": art["slug"]}, {"$set": rec})
            updated += 1
        else:
            rec["created_at"] = _now()
            rec["created_by"] = "seed-script"
            await db.cms_articles.insert_one(rec)
            added += 1
    print(f"✓ Articles: {added} created, {updated} updated")

    # ---- Glossary (backfill slug on existing entries + add missing) ----
    added_g, updated_g = 0, 0
    for term, definition in KEY_GLOSSARY:
        slug = _slugify(term)
        existing = await db.cms_glossary.find_one(
            {"term": {"$regex": f"^{_re.escape(term)}$", "$options": "i"}},
            {"_id": 0, "id": 1},
        )
        if existing:
            await db.cms_glossary.update_one(
                {"id": existing["id"]},
                {"$set": {
                    "slug": slug, "term": term, "definition": definition,
                    "published": True, "updated_at": _now(),
                }},
            )
            updated_g += 1
            continue
        await db.cms_glossary.insert_one({
            "id": secrets.token_urlsafe(6),
            "slug": slug,
            "term": term,
            "definition": definition,
            "published": True,
            "created_at": _now(),
            "updated_at": _now(),
            "created_by": "seed-script",
            "import_source": "seed",
        })
        added_g += 1
    print(f"✓ Glossary: {added_g} added, {updated_g} updated with slugs")


if __name__ == "__main__":
    asyncio.run(main())
