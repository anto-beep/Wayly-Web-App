"""Generate a realistic (fictional) Support at Home monthly statement PDF
for the App Store review recording + reply. All data is sample/fictional."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfgen import canvas

OUT = "/app/frontend/public/appstore/wayly-sample-support-at-home-statement.pdf"
TEAL = colors.HexColor("#0E4D52")
CLAY = colors.HexColor("#A5512B")
MUT = colors.HexColor("#6E7670")
LINE = colors.HexColor("#D9D4CC")

c = canvas.Canvas(OUT, pagesize=A4)
W, H = A4

def text(x, y, s, font="Helvetica", size=10, color=colors.black):
    c.setFont(font, size); c.setFillColor(color); c.drawString(x, y, s)

def rtext(x, y, s, font="Helvetica", size=10, color=colors.black):
    c.setFont(font, size); c.setFillColor(color); c.drawRightString(x, y, s)

M = 18 * mm
y = H - 20 * mm

# Header band
c.setFillColor(TEAL); c.rect(0, H - 16 * mm, W, 16 * mm, fill=1, stroke=0)
text(M, H - 11 * mm, "BlueBerry Care Services", "Helvetica-Bold", 14, colors.white)
rtext(W - M, H - 11 * mm, "Support at Home — Monthly Statement", "Helvetica", 10, colors.white)

y = H - 26 * mm
text(M, y, "SAMPLE STATEMENT (fictional data for demonstration)", "Helvetica-Oblique", 9, CLAY)
y -= 10 * mm

# Participant / period block
for label, val in [
    ("Participant", "Dorothy Hughes"),
    ("My Aged Care ID", "AC 1234 5678"),
    ("Registered provider", "BlueBerry Care Services (NAPS 9F4A2)"),
    ("Classification level", "Level 4"),
    ("Statement period", "1 November 2026 to 30 November 2026"),
    ("Issued", "3 December 2026"),
]:
    text(M, y, label, "Helvetica", 9, MUT)
    text(M + 48 * mm, y, val, "Helvetica-Bold", 10)
    y -= 6.2 * mm

y -= 4 * mm
c.setStrokeColor(LINE); c.line(M, y, W - M, y); y -= 8 * mm

# Budget summary
text(M, y, "Quarterly budget summary", "Helvetica-Bold", 11, TEAL); y -= 7 * mm
for label, val in [
    ("Quarterly budget (gross)", "$5,760.00"),
    ("Care management (10%)", "$576.00"),
    ("Available for services this quarter", "$5,184.00"),
    ("Spent this quarter to date", "$3,218.40"),
    ("Remaining this quarter", "$1,965.60"),
]:
    text(M, y, label, "Helvetica", 10); rtext(W - M, y, val, "Helvetica", 10); y -= 6 * mm

y -= 4 * mm
c.setStrokeColor(LINE); c.line(M, y, W - M, y); y -= 8 * mm

# Itemised services
text(M, y, "Services delivered this month", "Helvetica-Bold", 11, TEAL); y -= 7 * mm
cols = [M, M + 24 * mm, M + 92 * mm, M + 120 * mm, W - M]
text(cols[0], y, "Date", "Helvetica-Bold", 9, MUT)
text(cols[1], y, "Service", "Helvetica-Bold", 9, MUT)
rtext(cols[2] + 14 * mm, y, "Hours", "Helvetica-Bold", 9, MUT)
rtext(cols[3] + 14 * mm, y, "Rate", "Helvetica-Bold", 9, MUT)
rtext(cols[4], y, "Amount", "Helvetica-Bold", 9, MUT)
y -= 2 * mm
c.setStrokeColor(LINE); c.line(M, y, W - M, y); y -= 6 * mm

rows = [
    ("04 Nov", "Personal care", "1.5", "$72.05", "$108.08"),
    ("06 Nov", "Domestic assistance", "2.0", "$68.40", "$136.80"),
    ("11 Nov", "Nursing (clinical)", "1.0", "$128.90", "$128.90"),
    ("13 Nov", "Personal care", "1.5", "$72.05", "$108.08"),
    ("18 Nov", "Social support (individual)", "2.0", "$66.20", "$132.40"),
    ("20 Nov", "Domestic assistance", "2.0", "$68.40", "$136.80"),
    ("25 Nov", "Transport to appointment", "1.0", "$61.75", "$61.75"),
    ("27 Nov", "Personal care", "1.5", "$72.05", "$108.08"),
]
for d, s, hrs, rate, amt in rows:
    text(cols[0], y, d, "Helvetica", 9)
    text(cols[1], y, s, "Helvetica", 9)
    rtext(cols[2] + 14 * mm, y, hrs, "Helvetica", 9)
    rtext(cols[3] + 14 * mm, y, rate, "Helvetica", 9)
    rtext(cols[4], y, amt, "Helvetica", 9)
    y -= 6 * mm

y -= 2 * mm
c.setStrokeColor(LINE); c.line(M, y, W - M, y); y -= 7 * mm

# Totals
for label, val, bold in [
    ("Total services this month", "$920.89", False),
    ("Care management fee this month", "$92.09", False),
    ("Package management fee this month", "$46.04", False),
    ("Government (Support at Home) contribution", "-$878.14", False),
    ("Your contribution (payable)", "$180.88", True),
]:
    f = "Helvetica-Bold" if bold else "Helvetica"
    col = CLAY if bold else colors.black
    text(M, y, label, f, 10, col); rtext(W - M, y, val, f, 10, col); y -= 6.4 * mm

y -= 4 * mm
text(M, y, "Questions about this statement? Contact BlueBerry Care on 1800 000 000.", "Helvetica-Oblique", 8, MUT)
y -= 5 * mm
text(M, y, "This is a fictional sample created for App Store review of the Wayly app. Not a real account.", "Helvetica-Oblique", 8, MUT)

c.showPage(); c.save()
print("WROTE", OUT)
