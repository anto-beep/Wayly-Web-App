"""Phase 3A.2 — seed STARTER Help Centre articles as DRAFTS (never published).

Idempotent by slug: re-running inserts only missing articles and never
overwrites an existing one (so admin edits/approvals survive). Every article
is created with status="draft" — nothing is published automatically. Content
is grounded strictly in verified Wayly facts (plans, tools, privacy posture,
the Support at Home program) and invents no subscription rules, trial terms or
legal interpretations.

Usage:
  python scripts/seed_help_articles.py            # insert missing drafts
  python scripts/seed_help_articles.py --list     # show what exists
"""
from __future__ import annotations

import os
import sys
import uuid
import asyncio
from datetime import datetime, timezone

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# (slug, category, title, summary, tags, tool_keys, body_md)
ARTICLES = [
    (
        "what-is-wayly", "getting-started",
        "What is Wayly and who is it for?",
        "Wayly is independent Australian software that helps families understand and manage aged care at home under Support at Home and CHSP.",
        ["about", "overview"], [],
        "Wayly is independent software built in Australia. It helps older people and "
        "their families make sense of in-home aged care under **Support at Home** and the "
        "**Commonwealth Home Support Programme (CHSP)**.\n\n"
        "Wayly helps you:\n\n"
        "- Read and sanity-check your provider statements and invoices\n"
        "- Keep track of your budget and contributions\n"
        "- Ask plain-English questions about the program\n\n"
        "Wayly does **not** deliver care and is **not** a Support at Home provider. Your "
        "registered provider stays whoever you have chosen — Wayly simply sits alongside "
        "them to make the paperwork clearer.",
    ),
    (
        "is-wayly-a-provider", "getting-started",
        "Is Wayly a Support at Home provider?",
        "No. Wayly is independent software. Your registered provider remains whoever you chose, and Wayly never takes commissions from providers.",
        ["provider", "independence"], [],
        "No. Wayly is **independent software**, not an aged care provider.\n\n"
        "- Your registered Support at Home or CHSP provider stays exactly who you have chosen.\n"
        "- Wayly never takes commissions or referral fees from providers.\n"
        "- Independent features like the Provider Quality Index and Provider Price Checker "
        "are free of commercial influence.\n\n"
        "Wayly is a co-pilot for your paperwork and budget — not a replacement for your "
        "provider or case manager.",
    ),
    (
        "how-the-free-trial-works", "registration-trial",
        "How the 7-day free trial works",
        "Paid plans start with a 7-day free trial for brand-new accounts. You can cancel anytime before it ends.",
        ["trial", "signup", "billing"], [],
        "When you sign up to a paid plan (Solo or Family), you start with a **7-day free "
        "trial**.\n\n"
        "- The trial is for **brand-new accounts**. If you have used Wayly before, "
        "reactivating starts your plan straight away rather than giving another free trial.\n"
        "- You can **cancel anytime** during the trial from **Settings → Plan & Billing**.\n"
        "- The free **Statement Decoder** does not need a trial or an account at all.\n\n"
        "You can always see how many days remain in your trial on your dashboard and in "
        "Settings.",
    ),
    (
        "why-card-details-at-signup", "registration-trial",
        "Why do you ask for card details at sign-up?",
        "Card details let your plan continue smoothly after the free trial. Payments are handled securely by Stripe, and you can cancel before the trial ends.",
        ["card", "stripe", "trial"], [],
        "Collecting card details at sign-up means your plan can continue without "
        "interruption once your 7-day free trial finishes.\n\n"
        "- Payments are processed securely by **Stripe**. Wayly never stores your full "
        "card number.\n"
        "- You are **not charged during the free trial**.\n"
        "- If you cancel before the trial ends, you will not be charged.\n\n"
        "You can review or update your payment details anytime under **Settings → Plan & "
        "Billing**.",
    ),
    (
        "wayly-plans-and-pricing", "billing-subscriptions",
        "Wayly plans and pricing",
        "Solo is $24.50 per fortnight and Family is $49.50 per fortnight, both with a 7-day free trial. The Statement Decoder is free to try without signing up.",
        ["pricing", "plans", "solo", "family"], [],
        "Wayly offers two paid plans, both with a **7-day free trial** and **cancel "
        "anytime**:\n\n"
        "| Plan | Price | Best for |\n"
        "| --- | --- | --- |\n"
        "| **Solo** | $24.50 per fortnight | One person managing care for one recipient |\n"
        "| **Family** | $49.50 per fortnight | Families sharing the load (up to 5 members, each with a role-based view) |\n\n"
        "You can also use the **Statement Decoder for free** without signing up.\n\n"
        "Prices are shown in Australian dollars. For the current details of your own plan, "
        "open **Settings → Plan & Billing**.",
    ),
    (
        "how-to-cancel", "billing-subscriptions",
        "How to cancel your subscription",
        "You can cancel anytime from Settings → Plan & Billing. Your access continues until the end of the current paid period.",
        ["cancel", "billing"], [],
        "You can cancel your Wayly subscription at any time:\n\n"
        "1. Go to **Settings → Plan & Billing**.\n"
        "2. Choose **Cancel auto-renewal**.\n"
        "3. Confirm.\n\n"
        "Your access continues until the end of the period you have already paid for, and "
        "auto-renewal is switched off. You can export your information or request deletion "
        "at any time — see the *Account & privacy* help articles.",
    ),
    (
        "how-statement-decoder-works", "statement-decoder",
        "How the Statement Decoder works",
        "Upload a provider statement and Wayly reads the line items, flags anomalies, and explains the charges in plain English.",
        ["statement", "decoder", "anomalies"], ["statement-decoder"],
        "The **Statement Decoder** turns a confusing provider statement into something you "
        "can actually read.\n\n"
        "1. Upload your statement (PDF or image).\n"
        "2. Wayly extracts the line items and totals.\n"
        "3. It explains each charge in plain English and flags anything that looks unusual, "
        "such as rates above the published rate or unexpected brokered services.\n\n"
        "The Decoder is a co-pilot: it is highly accurate on figures it extracts correctly, "
        "but **always verify dollar amounts with your provider** before acting. Wayly is not "
        "a substitute for your case manager.",
    ),
    (
        "decoder-no-account", "statement-decoder",
        "Do I need an account to use the Statement Decoder?",
        "No. You can try the Statement Decoder for free without signing up. Creating a free account gives you more use and saves your results.",
        ["statement", "decoder", "free"], ["statement-decoder"],
        "No account is needed to try the **Statement Decoder** — it is free to use.\n\n"
        "- Anonymous use is limited to help keep the free tool available to everyone.\n"
        "- Creating an account lets you save and revisit your results and removes that "
        "limit.\n\n"
        "Your uploaded statement is used to produce your result. Wayly never sells your "
        "data and does not use it to train AI without your consent.",
    ),
    (
        "how-invoice-checker-works", "invoice-checker",
        "How the Invoice Checker works",
        "The Invoice Checker reviews a provider invoice line by line, compares charges to what you'd expect, and highlights anything worth querying.",
        ["invoice", "checker"], ["invoice-checker"],
        "The **Invoice Checker** helps you confirm a provider invoice looks right before you "
        "accept it.\n\n"
        "1. Upload or enter the invoice.\n"
        "2. Wayly reviews each line and compares the charges with what you would expect under "
        "your plan and budget.\n"
        "3. It highlights items worth querying with your provider.\n\n"
        "As with all Wayly tools, treat the result as a prompt to ask good questions — "
        "verify any figure with your provider before acting.",
    ),
    (
        "what-is-ask-wayly", "ask-wayly",
        "What is Ask Wayly and what can it answer?",
        "Ask Wayly is a plain-English assistant for questions about Support at Home and using Wayly. Signed-in users can also ask about their own budget and statements.",
        ["ask-wayly", "assistant", "ai"], ["ask-wayly"],
        "**Ask Wayly** answers everyday questions in plain English.\n\n"
        "- **Without signing in**, it answers general questions about the Support at Home "
        "program and how Wayly works, based only on public program rules — never your private "
        "statement.\n"
        "- **Signed in**, it can also answer questions about your own household, such as your "
        "budget burn or your latest statement.\n\n"
        "Answers are AI-generated. They are a helpful starting point, but **verify important "
        "figures** with your provider before acting.",
    ),
    (
        "where-is-my-data-stored", "account-privacy",
        "Where is my data stored and is it safe?",
        "Your data is stored in Australia. Wayly never sells it and never uses it to train AI without your consent.",
        ["privacy", "data", "security"], [],
        "Your information is stored in **Australia**.\n\n"
        "- Wayly **never sells** your data.\n"
        "- Wayly does **not** use your data to train AI without your consent.\n"
        "- Payments are handled securely by Stripe; Wayly does not store your full card "
        "number.\n\n"
        "For the full detail, read the Wayly privacy policy. If you have a specific privacy "
        "question, contact support@wayly.com.au.",
    ),
    (
        "export-or-delete-data", "account-privacy",
        "How to export or delete your data",
        "You can request an export of your information or ask for your data to be deleted at any time.",
        ["privacy", "export", "deletion"], [],
        "You are in control of your information.\n\n"
        "- **Export:** request a copy of your data at any time.\n"
        "- **Deletion:** ask for your data to be deleted at any time.\n\n"
        "You can start these requests from **Settings**, or email **support@wayly.com.au** "
        "and the team will help. Deleting your data is permanent, so you may wish to export "
        "a copy first.",
    ),
    (
        "didnt-get-email", "technical-troubleshooting",
        "I didn't get my verification or reset email",
        "Check your spam or junk folder, confirm the email address, and request the email again. If it still doesn't arrive, contact support.",
        ["email", "verification", "password", "troubleshooting"], [],
        "If a verification or password-reset email hasn't arrived:\n\n"
        "1. Check your **spam / junk** folder.\n"
        "2. Confirm you used the **correct email address**.\n"
        "3. Wait a couple of minutes and **request it again** — only the most recent link "
        "will work.\n"
        "4. Add **wayly.com.au** to your safe senders if your mail provider is strict.\n\n"
        "Still stuck? Email **support@wayly.com.au** and we'll sort it out.",
    ),
    (
        "what-is-support-at-home", "support-at-home-chsp",
        "What is Support at Home?",
        "Support at Home is the federal in-home aged care program that replaced Home Care Packages on 1 November 2025.",
        ["support-at-home", "program", "eligibility"], [],
        "**Support at Home** is the Australian Government's in-home aged care program. It "
        "replaced **Home Care Packages** on **1 November 2025** and funds the help that lets "
        "older Australians stay safely at home.\n\n"
        "- Generally for people aged **65 and over** (50 and over for Aboriginal and Torres "
        "Strait Islander Australians) who have had an ACAT assessment.\n"
        "- To apply, call **My Aged Care on 1800 200 422** or visit myagedcare.gov.au.\n\n"
        "Wayly can't change your classification or budget, but it helps you understand your "
        "statements, contributions and budget under the program.",
    ),
    (
        "wayly-tools-overview", "other-tools",
        "Wayly tools at a glance",
        "A quick tour of Wayly's tools: Statement Decoder, Invoice Checker, Ask Wayly, and the independent Provider Quality Index and Price Checker.",
        ["tools", "overview"], [],
        "Here's what each Wayly tool does:\n\n"
        "- **Statement Decoder** — reads a provider statement and flags anomalies (free to "
        "try).\n"
        "- **Invoice Checker** — reviews an invoice line by line before you accept it.\n"
        "- **Ask Wayly** — plain-English answers about the program and your account.\n"
        "- **Provider Quality Index** — an independent provider score, never paid for by "
        "providers.\n"
        "- **Provider Price Checker** — compare provider pricing independently.\n\n"
        "All tools are decision-support aids. Always verify dollar figures with your "
        "provider before acting.",
    ),
]


async def main(list_only: bool = False) -> None:
    if list_only:
        total = await db.help_articles.count_documents({})
        print(f"help_articles total: {total}")
        async for a in db.help_articles.find({}, {"_id": 0, "slug": 1, "status": 1, "category": 1}).sort("category", 1):
            print(f"  [{a.get('status'):10}] {a.get('category'):22} {a.get('slug')}")
        return

    inserted, skipped = [], []
    for slug, category, title, summary, tags, tool_keys, body_md in ARTICLES:
        if await db.help_articles.find_one({"slug": slug}, {"_id": 1}):
            skipped.append(slug)
            continue
        await db.help_articles.insert_one({
            "id": uuid.uuid4().hex,
            "slug": slug,
            "title": title,
            "summary": summary,
            "body_md": body_md,
            "category": category,
            "tags": tags,
            "meta_title": None,
            "meta_description": None,
            "tool_keys": tool_keys,
            "related_slugs": [],
            "status": "draft",
            "version": 1,
            "is_outdated": False,
            "last_reviewed_at": None,
            "helpful_count": 0,
            "not_helpful_count": 0,
            "view_count": 0,
            "approved_by": None,
            "approved_at": None,
            "published_at": None,
            "created_at": _now(),
            "created_by": "system_seed",
            "updated_at": _now(),
            "updated_by": "system_seed",
        })
        inserted.append(slug)

    import json
    print(json.dumps({
        "inserted_count": len(inserted),
        "skipped_count": len(skipped),
        "inserted": inserted,
        "skipped": skipped,
        "note": "All inserted as status=draft. Nothing is published. Review and approve in the admin Help Centre.",
    }, indent=2))


if __name__ == "__main__":
    asyncio.run(main(list_only="--list" in sys.argv))
