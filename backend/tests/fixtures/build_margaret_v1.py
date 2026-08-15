"""
build_margaret_v1.py

Rebuilds Margaret Wilson's June 2026 statement as a canonical fixture
with schema-level invariants. Also computes the expected decoder output
(golden values) directly from the same source data, so the test key
cannot drift from the fixture.

Design choices (all documented, none hidden):
  * Uses ALL THREE non-hour units seen in real statements: hr, km, session
  * Includes an INTENTIONAL $21.50 arithmetic gap between line-item sum
    ($1,951.00) and provider's declared services total ($1,972.50) —
    exactly as in the real statement — so the decoder is tested against
    catching a real reconciliation defect
  * Uses short-form DD/MM dates (year inferred from statement period)
    to test date parser flexibility
  * Provides ONLY aggregate contribution and government paid figures,
    not per-line values, so the decoder is tested against Invariant 3
    (no fabrication of per-line splits)
  * Care management is 7.22% of declared total (not 10%), matching source
"""
import sys
from decimal import Decimal, ROUND_HALF_UP
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

OUTDIR = "/home/claude/statements"
TEAL = colors.HexColor("#0E4D52")
SAGE = colors.HexColor("#6B8F71")
CREAM = colors.HexColor("#F5F0E8")

styles = getSampleStyleSheet()
def mk(n,p,**k): return ParagraphStyle(n, parent=styles[p], **k)
h1 = mk("h1","Heading1", fontSize=16, spaceAfter=8, textColor=TEAL)
h2 = mk("h2","Heading2", fontSize=12, spaceAfter=6, textColor=TEAL)
small = mk("small","Normal", fontSize=8, leading=11, textColor=colors.grey)

def q(x):
    return float(Decimal(str(x)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

def money(x):
    return f"${x:,.2f}"

# =============================================================================
# SCHEMA — enforced at build time
# =============================================================================
class Line:
    """
    Every service line has explicit quantity, unit, unit_rate, and total.
    Invariant M1: round(quantity * unit_rate, 2) == total for hr/km/session
    where the unit_rate is per-unit; for lump-sum items, unit_rate == total.
    """
    def __init__(self, date, service, description, category, quantity, unit,
                 unit_rate, total, contribution=None, government_paid=None):
        # Invariant: date present and not epoch
        assert date and date != "1970-01-01", f"invalid date {date!r}"
        # Invariant: unit is a known type
        assert unit in ("hr", "km", "session", "ea", "visit", "day"), \
               f"unknown unit {unit!r} on {description!r}"
        # Invariant: computed total matches declared total
        computed = q(quantity * unit_rate)
        assert computed == q(total), (
            f"line arithmetic fail: {service} on {date}: "
            f"{quantity} {unit} x {unit_rate} = {money(computed)}, declared {money(total)}"
        )
        self.date = date
        self.service = service
        self.description = description
        self.category = category
        self.quantity = quantity
        self.unit = unit
        self.unit_rate = unit_rate
        self.total = q(total)
        # These are None unless the source explicitly itemises them
        self.contribution = contribution
        self.government_paid = government_paid

# =============================================================================
# SOURCE OF TRUTH — Margaret Wilson, 1 June 2026 - 30 June 2026
# =============================================================================
# Provider: Better Care at Home Services Pty Ltd
# Participant: Margaret Wilson (SAH-100245)
# Care partner: Sarah Wilson (daughter)
# Classification: not stated on source
# Pension status: not stated on source (decoder should flag as unknown)

lines = [
    # date, service, description, category, qty, unit, unit_rate, total
    Line("02/06", "Personal Care", "Morning shower and dressing support",
         "Independence", 1.0, "hr", 78.00, 78.00),
    Line("03/06", "Domestic Assistance", "Cleaning and laundry",
         "Everyday living", 2.0, "hr", 68.00, 136.00),
    Line("05/06", "Transport", "GP appointment transport",
         "Independence", 18.0, "km", 1.20, 21.60),
    Line("06/06", "Meal Preparation", "Preparation of meals for week",
         "Everyday living", 2.0, "hr", 70.00, 140.00),
    Line("09/06", "Personal Care", "Morning routine support",
         "Independence", 1.0, "hr", 78.00, 78.00),
    Line("10/06", "Domestic Assistance", "House cleaning",
         "Everyday living", 2.0, "hr", 68.00, 136.00),
    Line("12/06", "Social Support", "Community centre visit",
         "Independence", 3.0, "hr", 72.00, 216.00),
    Line("13/06", "Gardening", "Yard maintenance and safety",
         "Everyday living", 2.0, "hr", 75.00, 150.00),
    Line("16/06", "Personal Care", "Showering assistance",
         "Independence", 1.0, "hr", 78.00, 78.00),
    Line("17/06", "Domestic Assistance", "Cleaning and linen change",
         "Everyday living", 2.0, "hr", 68.00, 136.00),
    Line("19/06", "Physiotherapy", "Mobility and balance session",
         "Clinical", 1.0, "session", 185.00, 185.00),
    Line("20/06", "Meal Preparation", "Nutritious meal support",
         "Everyday living", 2.0, "hr", 70.00, 140.00),
    Line("23/06", "Personal Care", "Morning support",
         "Independence", 1.0, "hr", 78.00, 78.00),
    Line("24/06", "Domestic Assistance", "Cleaning support",
         "Everyday living", 2.0, "hr", 68.00, 136.00),
    Line("26/06", "Transport", "Shopping assistance",
         "Independence", 22.0, "km", 1.20, 26.40),
    Line("27/06", "Social Support", "Community outing",
         "Independence", 3.0, "hr", 72.00, 216.00),
]

# =============================================================================
# COMPUTED VALUES (golden output)
# =============================================================================
line_sum = q(sum(l.total for l in lines))    # $1,951.00 — the TRUE sum
declared_services_total = 1972.50             # what the provider STATED
source_arithmetic_gap = q(declared_services_total - line_sum)  # $21.50 — real defect
declared_care_mgmt = 142.50                  # 7.30% of line_sum, 7.22% of declared
declared_participant = 197.25                # 10% of declared_services_total
declared_government = 1775.25                # 90% of declared_services_total
monthly_funding = 3250.00
closing_balance = 1277.50

# Verify source-internal consistency of the aggregate figures
assert q(declared_participant + declared_government) == q(declared_services_total), \
    "source aggregate identity fails"
# ...but sum of line items DOES NOT match declared total — this is the real defect
assert line_sum != declared_services_total, \
    "expected an arithmetic gap between line sum and declared total"

# =============================================================================
# BUILD PDF (short-form dates, aggregate-only contributions, mixed units)
# =============================================================================
def build_pdf():
    out = f"{OUTDIR}/MARGARET_June_2026.pdf"
    story = [
        Paragraph("Better Care at Home Services Pty Ltd", h1),
        Paragraph("Support at Home — Monthly Statement", h2),
        Spacer(1, 6),
        Table([
            ["Participant:", "Margaret Wilson"],
            ["Participant ID:", "SAH-100245"],
            ["Statement period:", "1 June 2026 to 30 June 2026"],
            ["Care partner:", "Sarah Wilson (daughter)"],
        ], colWidths=[4*cm, 12*cm]),
        Spacer(1, 12),
        Paragraph("Account Summary", h2),
        Table([
            ["Opening balance", money(0.00)],
            ["Government funding available this month", money(monthly_funding)],
            ["Total value of services delivered", money(declared_services_total)],
            ["Participant contributions", money(declared_participant)],
            ["Government contribution applied", money(declared_government)],
            ["Unspent budget remaining", money(closing_balance)],
        ], colWidths=[10*cm, 4*cm]),
        Spacer(1, 12),
        Paragraph("Services Delivered", h2),
    ]
    # Service table with SHORT-FORM dates and MIXED units
    header = ["Date", "Service", "Description", "Qty", "Unit rate", "Amount"]
    rows = [header]
    for l in lines:
        qty_display = f"{l.quantity:g} {l.unit}" if l.unit == "hr" else \
                      (f"{l.quantity:g} {l.unit}" if l.unit == "km" else \
                       f"{l.quantity:g} {l.unit}")
        rate_display = money(l.unit_rate) + ("/" + l.unit if l.unit != "hr" else "")
        rows.append([l.date, l.service, l.description, qty_display, rate_display, money(l.total)])
    # NOTE: subtotal deliberately does NOT match line sum (real source defect)
    rows.append(["", "Total services this month", "", "", "", money(declared_services_total)])
    t = Table(rows, colWidths=[1.5*cm, 3.5*cm, 5*cm, 2*cm, 2.5*cm, 2*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,0),TEAL),("TEXTCOLOR",(0,0),(-1,0),colors.white),
        ("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("FONTSIZE",(0,0),(-1,-1),8),
        ("ALIGN",(3,0),(5,-1),"RIGHT"),("GRID",(0,0),(-1,-1),0.3,colors.grey),
        ("FONTNAME",(0,-1),(-1,-1),"Helvetica-Bold"),
        ("BACKGROUND",(0,-1),(-1,-1),CREAM),
        ("SPAN",(1,-1),(4,-1)),
    ]))
    story += [t, Spacer(1, 12),
        Paragraph("Care Management and Administration", h2),
        Paragraph(
            "Care planning review, service coordination, scheduling, provider liaison, "
            "incident monitoring, quality assurance reviews and participant wellbeing "
            "check-ins were completed during the month. Total administration and care "
            f"management costs for the period: {money(declared_care_mgmt)}.",
            styles["Normal"]),
        Spacer(1, 12),
        Paragraph("Budget Position", h2),
        Table([
            ["Current monthly budget", money(monthly_funding)],
            ["Services utilised", money(declared_services_total)],
            ["Remaining budget", money(closing_balance)],
        ], colWidths=[10*cm, 4*cm]),
        Spacer(1, 18),
        Paragraph("Better Care at Home Services Pty Ltd — Phone 1300 000 000 — support@bettercare.example", small),
        Paragraph("Issued in accordance with the Aged Care Act 2024 and the Support at Home program rules.", small),
    ]
    SimpleDocTemplate(out, pagesize=A4, leftMargin=2*cm, rightMargin=2*cm,
                     topMargin=2*cm, bottomMargin=2*cm).build(story)
    return out

# =============================================================================
# GOLDEN OUTPUT (what the decoder MUST produce)
# =============================================================================
def print_golden():
    print("=" * 72)
    print("MARGARET WILSON — JUNE 2026 GOLDEN OUTPUT (Decoder Expected Values)")
    print("=" * 72)
    print(f"\nParticipant: Margaret Wilson")
    print(f"Provider: Better Care at Home Services Pty Ltd")
    print(f"Period: 2026-06-01 to 2026-06-30 (30 days, cadence=monthly)")
    print(f"Pension status: unknown (flag as INFO, single anomaly permitted)")
    print()
    print(f"AGGREGATE FIGURES (from source, decoder must extract exactly):")
    print(f"  Monthly funding available:  {money(monthly_funding)}")
    print(f"  Services declared:          {money(declared_services_total)}")
    print(f"  Participant contribution:   {money(declared_participant)}")
    print(f"  Government paid:            {money(declared_government)}")
    print(f"  Care management fee:        {money(declared_care_mgmt)} (7.22% of declared, not 10%)")
    print(f"  Closing balance:            {money(closing_balance)}")
    print()
    print(f"LINE ITEMS (16 rows, must preserve source order):")
    for i, l in enumerate(lines, 1):
        print(f"  {i:2d}. {l.date}  {l.service:<22} qty={l.quantity:>4}{l.unit:<8} "
              f"rate={money(l.unit_rate)} total={money(l.total)}")
    print()
    print(f"COMPUTED CHECKS the decoder must perform:")
    print(f"  Sum of line items:          {money(line_sum)}")
    print(f"  Declared total:             {money(declared_services_total)}")
    print(f"  Arithmetic gap:             {money(source_arithmetic_gap)}  <-- MUST BE FLAGGED")
    print(f"  Care mgmt as % of declared: {declared_care_mgmt/declared_services_total*100:.2f}%")
    print(f"  Aggregate identity:         {money(declared_participant)} + {money(declared_government)} = "
          f"{money(declared_participant + declared_government)}  (holds)")
    print()
    print(f"MANDATORY ANOMALIES (decoder must raise these):")
    print(f"  1. INFO: pension status unknown")
    print(f"  2. MEDIUM: source arithmetic gap of {money(source_arithmetic_gap)} between "
          f"declared total and sum of line items")
    print()
    print(f"FORBIDDEN OUTPUTS (decoder must NOT do these):")
    print(f"  - Do not fabricate per-line contribution values (source only has aggregate)")
    print(f"  - Do not flatten km or session units into an hours column")
    print(f"  - Do not lose or blank any of the 16 source dates")
    print(f"  - Do not scramble line item order (source is chronological)")
    print(f"  - Do not flag recurring services (weekly personal care, fortnightly cleaning)")
    print(f"  - Do not flag missing service codes (source has none)")
    print(f"  - Do not flag the monthly cadence (30 days is valid)")

# =============================================================================
# RUN
# =============================================================================
try:
    out = build_pdf()
    print(f"Built: {out}\n")
    print_golden()
except AssertionError as e:
    print(f"BUILD FAILED: {e}", file=sys.stderr)
    sys.exit(1)
