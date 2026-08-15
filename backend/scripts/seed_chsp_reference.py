"""CHSP reference data, seeded into program_reference so Ask Wayly
(and the public tools that consult ref data) have structured facts to
quote rather than hard-coded prose.

Run idempotently at startup or via the admin seed CLI.
"""
from __future__ import annotations
import asyncio
import os
from datetime import datetime
from dotenv import load_dotenv

# Allow running standalone
if __name__ == "__main__":
    load_dotenv("/app/backend/.env")

from motor.motor_asyncio import AsyncIOMotorClient

CHSP_REFERENCE: list[tuple[str, str, str, str]] = [
    ("program.name", "Commonwealth Home Support Programme", "health.gov.au", "2025-11-01"),
    ("program.type", "entry-level home support, block-funded", "health.gov.au", "2025-11-01"),
    ("eligibility.age_general", "65", "myagedcare.gov.au", "2025-11-01"),
    ("eligibility.age_atsi", "50", "myagedcare.gov.au", "2025-11-01"),
    ("eligibility.means_test", "none", "health.gov.au Appendix E", "2025-11-01"),
    ("assessment.system", "Single Assessment System (replaced RAS and ACAT 9 Dec 2024)", "health.gov.au", "2024-12-09"),
    ("contribution.legal_basis", "section 286 Aged Care Act 2024; capacity-to-pay s286-25 Aged Care Rules 2025", "health.gov.au Appendix E", "2025-11-01"),
    ("contribution.domestic_assistance", "7.06-13.40 per hour", "health.gov.au Appendix E 2025-26", "2025-07-01"),
    ("contribution.personal_care", "7.06-13.40 per hour", "health.gov.au Appendix E 2025-26", "2025-07-01"),
    ("contribution.meals_delivery", "4.71-13.40 per meal", "health.gov.au Appendix E 2025-26", "2025-07-01"),
    ("contribution.transport", "2.35-13.50", "health.gov.au Appendix E 2025-26", "2025-07-01"),
    ("contribution.home_maintenance", "9.41-22.30", "health.gov.au Appendix E 2025-26", "2025-07-01"),
    ("contribution.nursing", "4.71-11.15", "health.gov.au Appendix E 2025-26", "2025-07-01"),
    ("contribution.allied_health", "5.83-16.78", "health.gov.au Appendix E 2025-26", "2025-07-01"),
    ("remote.mmm_loading", "MMM5 up to 20%, MMM6/7 up to 40%", "health.gov.au Appendix E", "2025-11-01"),
    ("services.list",
     "domestic assistance; personal care; meals; transport; social support; home maintenance; home modifications; allied health; nursing; respite",
     "health.gov.au", "2025-11-01"),
    ("transition.date", "no earlier than 2027-07-01", "health.gov.au CHSP reforms", "2025-06-04"),
    ("transition.grant_extension_end", "2027-06-30", "health.gov.au CHSP reforms", "2025-07-01"),
    ("stats.clients_2024_25", "838694", "ANAO Effectiveness of the CHSP", "2025-06-30"),
    ("stats.providers_2024_25", "1273", "ANAO Effectiveness of the CHSP", "2025-06-30"),
    ("stats.funding_2024_25", "3.1 billion (8% of 38.87bn aged care spend)", "ANAO Effectiveness of the CHSP", "2025-06-30"),
]

NAMESPACE = "chsp"


async def seed_chsp_reference(db) -> int:
    """Idempotent upsert. Returns count of rows touched."""
    n = 0
    now = datetime.utcnow().isoformat()
    for key, value, source, effective_date in CHSP_REFERENCE:
        await db.program_reference.update_one(
            {"namespace": NAMESPACE, "key": key},
            {"$set": {
                "namespace": NAMESPACE,
                "key": key,
                "value": value,
                "source": source,
                "effective_from": effective_date,
                "updated_at": now,
            }},
            upsert=True,
        )
        n += 1
    return n


if __name__ == "__main__":
    async def _main():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        n = await seed_chsp_reference(db)
        print(f"Seeded {n} CHSP reference rows")
    asyncio.run(_main())
