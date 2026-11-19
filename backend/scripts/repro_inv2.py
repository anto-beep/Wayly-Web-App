"""Repro: run the REAL invoice-checker pipeline on the SAMBURKE-INV-2 fixture
and print extraction + findings + the frontend-equivalent refund.

Usage: /root/.venv/bin/python3 scripts/repro_inv2.py /tmp/samburke2.pdf
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))


def _front_impact(f):
    obs = f.get("observed") or {}
    fi = f.get("financial_impact") or {}
    for v in (fi.get("amount"), obs.get("overcharge_amount"), obs.get("refund_amount"),
              obs.get("excess_amount"), obs.get("difference"), obs.get("gst_amount"),
              obs.get("contribution_amount")):
        if v is not None:
            try:
                return float(v)
            except (TypeError, ValueError):
                return 0.0
    return 0.0


async def main(path):
    from document_extract import extract_document
    from lib.inv1 import classify_document, extract_line_items, run_checks, split_combined_document
    from lib.inv1.extractor import extract_invoice_header, extract_invoice_totals
    from lib.inv1.schema import SituationProfile

    with open(path, "rb") as f:
        raw = f.read()
    text, method, pages, warns = await extract_document(os.path.basename(path), raw)
    print(f"== extract method={method} pages={pages} chars={len(text)} warns={warns}")
    print("---- RAW TEXT (first 2500) ----")
    print(text[:2500])
    print("---- END RAW ----\n")

    header = extract_invoice_header(text)
    print("HEADER:", header)
    sub, gst, total = extract_invoice_totals(text)
    print(f"TOTALS extract_invoice_totals -> subtotal={sub} gst={gst} total={total}")

    lines = extract_line_items(text)
    print(f"\n== LINES ({len(lines)}) ==")
    tot_contrib = 0.0
    for ln in lines:
        c = ln.contribution_amount or 0
        tot_contrib += c
        print(f"  {ln.line_id} | {ln.service_date} | {ln.service_category.value:16} | {ln.service_type[:34]:34} | u={ln.units_or_hours} rate={ln.unit_price} gross={ln.gross_cost} contrib={c}")
    print(f"  SUM contribution column = {round(tot_contrib,2)}")
    print(f"  SUM gross = {round(sum((l.gross_cost or 0) for l in lines),2)}")

    recon = run_checks(
        lines=lines,
        situation=SituationProfile(),
        invoice_date=header.get("invoice_date"),
        period_end=header.get("period_end"),
        quarterly_budget=header.get("quarterly_budget"),
        printed_total_payable=total,
    )
    d = recon.to_dict()
    findings = d["findings"]
    from lib.inv1.checks import refund_total
    print(f"\n== FINDINGS ({len(findings)}) ==")
    for f in findings:
        fi = (f.get("financial_impact") or {}).get("amount")
        print(f"  {f['check_id']:4} tier={f['tier']} lines={len(f.get('line_ids') or [])} IMPACT={fi} title={f.get('title')}")
    rt = refund_total(findings, total)
    print(f"\n== refund_total (capped) = {rt}")
    print(f"== printed total payable = {total}")


if __name__ == "__main__":
    p = sys.argv[1] if len(sys.argv) > 1 else "/tmp/samburke2.pdf"
    asyncio.run(main(p))
