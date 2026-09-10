"""Ad-hoc end-to-end check: run the real decode pipeline on the Sam Burke
Aug 2026 statement and print the gate findings + publish state.

Usage: cd /app/backend && python3 scripts/run_sam_burke.py /tmp/sam.pdf
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))


def load_cache():
    import program_reference as pr
    import seed_program_reference as seed
    cache = {}
    for r in seed.get_seed_rows():
        k = r.get("key")
        if not k:
            continue
        cache.setdefault(k, []).append(
            (r.get("effective_from"), r.get("effective_to"), r.get("value"), r.get("key"))
        )
    pr._CACHE = cache
    pr._CACHE_READY = True


async def main(path):
    load_cache()
    from document_extract import extract_document
    from agents import extract_statement, audit_statement

    with open(path, "rb") as f:
        raw = f.read()
    text, method, pages, warns = await extract_document(os.path.basename(path), raw)
    print(f"== extracted text: {len(text)} chars, method={method}, pages={pages}")

    extracted = await extract_statement(text, "public")
    li = extracted.get("line_items") or []
    print("\n== EXTRACTION ==")
    print("classification:", extracted.get("classification"))
    print("statement_period:", extracted.get("statement_period"))
    print("quarterly_budget_total:", extracted.get("quarterly_budget_total"))
    print("quarterly_allocation:", extracted.get("quarterly_allocation"))
    print("budget_remaining_at_quarter_end:", extracted.get("budget_remaining_at_quarter_end"))
    print("reported_total_gross:", extracted.get("reported_total_gross"))
    print("reported_total_participant_contribution:", extracted.get("reported_total_participant_contribution"))
    print("reported_total_government_paid:", extracted.get("reported_total_government_paid"))
    print("line_items count:", len(li))
    for i, x in enumerate(li):
        print(f"  [{i}] {x.get('date')} | {x.get('service_description') or x.get('service_name')} | rate={x.get('unit_rate')} qty={x.get('hours') or x.get('units') or x.get('quantity')} gross={x.get('gross')} cancel={x.get('is_cancellation')} stream={x.get('stream')}")

    audit = await audit_statement(extracted, "public")
    print("\n== AUDIT ==")
    print("publishable:", audit.get("publishable"))
    pb = audit.get("publish_block") or {}
    print("publish_block rules:", pb.get("rules"))
    print("\n== ANOMALIES ==")
    for a in audit.get("anomalies") or []:
        print(f"  [{a.get('severity','?').upper():6}] {a.get('rule')}: {a.get('headline')}")

    # Render the participant-facing summary via the real server function.
    try:
        import server as srv
        print("\n== PLAIN-ENGLISH SUMMARY ==")
        print(srv._render_plain_english_summary(extracted, audit)[:1600])
    except Exception as e:
        print("(summary render skipped:", e, ")")


if __name__ == "__main__":
    p = sys.argv[1] if len(sys.argv) > 1 else "/tmp/sam.pdf"
    asyncio.run(main(p))
