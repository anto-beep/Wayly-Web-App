"""Shared HTML-PDF theme for every Wayly tool export.

One brand layer (palette, embedded fonts, official logo, reusable blocks) so
every tool's PDF matches the in-app screens exactly when rendered to a
pixel-faithful PDF via headless Chromium (see ``lib.html_pdf``). Backgrounds
are white and components are compact, per brand direction.

Per-tool renderers build a small HTML ``body`` and wrap it with ``document()``.
"""
from __future__ import annotations

import base64
import functools
import html as _html
import re
from datetime import datetime, timezone
from pathlib import Path

from .pdf_fonts import font_face_css

_BACKEND = Path(__file__).resolve().parent.parent
_FRONTEND = _BACKEND.parent / "frontend" / "public" / "branding" / "png"

# ---------------------------------------------------------------------------
# Brand palette (mirrors frontend/src/index.css --kindred-* tokens)
# ---------------------------------------------------------------------------
INK = "#0E4D52"          # teal-ink, primary
INK_DEEP = "#0A3B3F"
TEXT = "#1C2B2D"         # warm ink body
CLAY = "#A5512B"         # clay accent
SAGE = "#425F47"
SAGE_SOFT = "#6B8F71"
GOV_GREEN = "#8FBF95"    # donut: government
YOU_GOLD = "#F0B267"     # donut: you paid
SEV_HIGH = "#F0857A"
SEV_MED = "#F0B267"
SEV_LOW = "#A8C7AB"
GOLD = "#B27A25"
TERRACOTTA = "#C0392B"
MUTED = "#6B6B6B"
BORDER = "#E7E2D8"
SURFACE = "#FBF9F5"      # subtle cream card
SURFACE_2 = "#F4EFE7"
WHITE = "#FFFFFF"


# ---------------------------------------------------------------------------
# Logo assets (official Wayly artwork, base64-embedded, cached)
# ---------------------------------------------------------------------------
def _first_existing(*cands: Path) -> Path | None:
    for c in cands:
        if c and c.exists():
            return c
    return None


@functools.lru_cache(maxsize=4)
def _data_uri(kind: str) -> str:
    paths = {
        "lockup": (_FRONTEND / "wayly-lockup-navy-1024.png",
                   _FRONTEND / "wayly-lockup-navy-512.png",
                   _BACKEND / "services" / "branding" / "wayly-lockup-navy.png"),
        "lockup_white": (_FRONTEND / "wayly-lockup-white-1024.png",
                         _FRONTEND / "wayly-lockup-white-512.png"),
        "mark": (_FRONTEND / "wayly-mark-512.png",
                 _BACKEND / "services" / "branding" / "wayly-mark.png"),
    }[kind]
    p = _first_existing(*paths)
    if not p:
        return ""
    b64 = base64.b64encode(p.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def logo_lockup_img(*, height: int = 34, white: bool = False) -> str:
    uri = _data_uri("lockup_white" if white else "lockup")
    if not uri:
        return '<span class="brand-fallback">Wayly</span>'
    return f'<img class="brand-logo" src="{uri}" alt="Wayly" style="height:{height}px"/>'


def logo_mark_img(*, size: int = 22) -> str:
    uri = _data_uri("mark")
    if not uri:
        return ""
    return f'<img src="{uri}" alt="Wayly" style="width:{size}px;height:{size}px;border-radius:6px;vertical-align:middle"/>'


# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------
def esc(s) -> str:
    return "" if s is None else _html.escape(str(s), quote=True)


def num(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def money(v) -> str:
    try:
        return f"${float(v or 0):,.2f}"
    except (TypeError, ValueError):
        return "$0.00"


def money0(v) -> str:
    try:
        return f"${int(round(float(v or 0))):,}"
    except (TypeError, ValueError):
        return "$0"


def pct(v, dp: int = 0) -> str:
    try:
        return f"{float(v or 0):.{dp}f}%"
    except (TypeError, ValueError):
        return "0%"


# Small words kept lowercase mid-title; tokens already ALL-CAPS / known
# acronyms are preserved so "GST", "AT-HM", "HCP" don't become "Gst".
_SMALL = {"a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on",
          "or", "per", "the", "to", "vs", "via", "with"}
_KEEP = {"GST", "ABN", "HCP", "SAH", "AT-HM", "ATHM", "ACQSC", "OPAN", "IAT",
         "CHSP", "DoH", "IADLs", "PDF", "CSV", "AEST", "OK", "ID", "CC"}


def title_case(s: str) -> str:
    if not s:
        return s
    words = re.split(r"(\s+)", str(s).strip())
    out = []
    first = True
    for w in words:
        if not w.strip():
            out.append(w)
            continue
        token = w
        if token in _KEEP or (token.isupper() and len(token) >= 2):
            out.append(token)
        elif "-" in token:
            out.append("-".join(
                p if (p in _KEEP or (p.isupper() and len(p) >= 2))
                else p.capitalize() for p in token.split("-")))
        else:
            low = token.lower()
            if (not first) and low in _SMALL:
                out.append(low)
            else:
                out.append(token[:1].upper() + token[1:].lower()
                           if token[:1].isalpha() else token)
        first = False
    return "".join(out)


# ---------------------------------------------------------------------------
# Base CSS
# ---------------------------------------------------------------------------
_BASE_CSS = f"""
  *,*::before,*::after{{box-sizing:border-box}}
  html,body{{margin:0;padding:0;background:{WHITE};color:{TEXT}}}
  body{{
    font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    font-size:10.5pt; line-height:1.55;
    padding:30px 40px 26px; margin:0 auto;
    -webkit-print-color-adjust:exact; print-color-adjust:exact;
  }}
  .num{{font-family:'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;letter-spacing:-0.01em}}

  .brand{{display:flex;align-items:center;justify-content:space-between;gap:16px;
    padding-bottom:14px;border-bottom:1px solid {BORDER};margin-bottom:22px}}
  .brand-logo{{display:block}}
  .brand-fallback{{font-family:'Fraunces',Georgia,serif;font-weight:600;font-size:20pt;color:{INK}}}
  .brand-tag{{font-family:'Inter',sans-serif;font-size:8.5pt;text-transform:uppercase;
    letter-spacing:0.16em;color:{MUTED};text-align:right}}

  h1.hd{{font-family:'Fraunces',Georgia,serif;font-size:26pt;font-weight:600;color:{INK};
    margin:0 0 6px;letter-spacing:-0.015em;line-height:1.12}}
  h1.hd em{{font-style:normal;color:{CLAY}}}
  .sub{{color:{MUTED};font-size:10.5pt;margin:0 0 18px}}
  h2.sec{{font-family:'Fraunces',Georgia,serif;font-size:14pt;font-weight:600;color:{INK};
    margin:22px 0 10px;letter-spacing:-0.005em}}
  .overline{{font-size:8.5pt;text-transform:uppercase;letter-spacing:0.14em;color:{MUTED};font-weight:600}}

  /* KPI tiles */
  .kpi-grid{{display:grid;gap:12px;margin:12px 0 18px}}
  .kpi{{background:{SURFACE};border:1px solid {BORDER};border-radius:12px;padding:13px 15px}}
  .kpi.hero{{background:{INK};border-color:{INK};color:#fff}}
  .kpi .lbl{{display:block;font-size:8pt;text-transform:uppercase;letter-spacing:0.12em;color:{MUTED};margin-bottom:5px}}
  .kpi.hero .lbl{{color:rgba(255,255,255,0.78)}}
  .kpi .val{{display:block;font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;
    font-size:18pt;color:{INK};font-weight:500;letter-spacing:-0.01em;line-height:1.1}}
  .kpi.hero .val{{color:#fff}}
  .kpi .cap{{display:block;color:{MUTED};font-size:8.5pt;margin-top:5px}}
  .kpi.hero .cap{{color:rgba(255,255,255,0.7)}}

  /* Teal summary banner */
  .banner{{background:{INK};color:#fff;border-radius:16px;padding:20px 22px;margin:14px 0 18px}}
  .banner .b-head{{font-size:8.5pt;text-transform:uppercase;letter-spacing:0.16em;color:rgba(255,255,255,0.75);margin-bottom:12px}}
  .banner .b-grid{{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}}
  .banner .b-tile .lbl{{display:block;font-size:8pt;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.72);margin-bottom:4px}}
  .banner .b-tile .val{{display:block;font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;font-size:15pt;font-weight:500}}
  .banner .b-tile .val.gold{{color:{YOU_GOLD}}}
  .banner .b-meta{{margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.16);
    display:flex;flex-wrap:wrap;gap:4px 18px;font-size:8.5pt;color:rgba(255,255,255,0.78)}}
  .banner .b-meta b{{color:#fff;font-weight:600}}

  /* Who-paid split bar */
  .splitwrap{{margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.16)}}
  .splitbar{{display:flex;height:30px;border-radius:9px;overflow:hidden}}
  .splitbar span{{display:flex;align-items:center;justify-content:center;font-size:9pt;font-weight:600}}
  .split-legend{{display:flex;flex-wrap:wrap;gap:4px 18px;margin-top:9px;font-size:8.5pt;color:rgba(255,255,255,0.9)}}
  .split-legend .dot{{width:9px;height:9px;border-radius:50%;display:inline-block;margin-right:5px;vertical-align:middle}}
  .split-note{{font-size:8.5pt;color:rgba(255,255,255,0.8);margin-top:8px}}

  /* Insight donut cards */
  .insight-grid{{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:14px 0 18px}}
  .insight-card{{border:1px solid {BORDER};border-radius:16px;padding:16px}}
  .insight-card.teal{{background:{SURFACE}}}
  .insight-card.clay{{background:#FBF4EF}}
  .insight-card .ic-head{{font-size:8.5pt;text-transform:uppercase;letter-spacing:0.14em;color:{MUTED};margin-bottom:10px}}
  .ic-body{{display:flex;align-items:center;gap:16px}}
  .donut{{width:118px;height:118px;border-radius:50%;position:relative;flex:0 0 auto}}
  .donut .hole{{position:absolute;inset:19px;background:#fff;border-radius:50%;
    display:flex;flex-direction:column;align-items:center;justify-content:center}}
  .donut .d-val{{font-family:'Fraunces',serif;font-size:16pt;font-weight:600;color:{INK};line-height:1}}
  .donut .d-sub{{font-size:7.5pt;text-transform:uppercase;letter-spacing:0.08em;color:{MUTED};margin-top:3px}}
  .legend{{flex:1;display:flex;flex-direction:column;gap:7px}}
  .legend-row{{display:flex;align-items:center;justify-content:space-between;gap:8px;
    border:1px solid {BORDER};border-radius:9px;padding:7px 10px;background:#fff}}
  .legend-row .l-name{{font-size:9.5pt;color:{INK};display:flex;align-items:center;gap:7px}}
  .legend-row .l-name .dot{{width:11px;height:11px;border-radius:50%;display:inline-block}}
  .legend-row .l-val{{font-weight:600;color:{INK};font-variant-numeric:tabular-nums;font-size:9.5pt}}

  /* Fee breakdown */
  .fee{{border:1px solid {BORDER};border-radius:16px;overflow:hidden;margin:4px 0 18px}}
  .fee-head{{background:{INK};color:#fff;padding:13px 18px}}
  .fee-head .t{{font-family:'Fraunces',serif;font-size:13pt;font-weight:600;line-height:1.1}}
  .fee-head .s{{font-size:8.5pt;color:rgba(255,255,255,0.72);margin-top:2px}}
  .fee-row{{padding:10px 18px;border-top:1px solid {BORDER}}}
  .fee-row:first-of-type{{border-top:0}}
  .fee-row .r1{{display:flex;align-items:center;justify-content:space-between;font-size:10pt}}
  .fee-row .r1 .k{{font-weight:500;color:{INK}}}
  .fee-row .r1 .v{{font-weight:600;color:{INK};font-variant-numeric:tabular-nums}}
  .fee-row .r1 .v.neg{{color:{SAGE}}}
  .fee-bar-wrap{{display:flex;align-items:center;gap:8px;margin-top:7px}}
  .fee-bar{{flex:1;height:6px;border-radius:999px;background:{SURFACE_2};overflow:hidden}}
  .fee-bar i{{display:block;height:100%;border-radius:999px;background:{INK}}}
  .fee-bar i.neg{{background:{SAGE}}}
  .fee-bar-pct{{width:34px;text-align:right;font-size:8pt;color:{MUTED};font-variant-numeric:tabular-nums}}
  .fee-total{{display:flex;align-items:center;justify-content:space-between;
    padding:13px 18px;background:{SURFACE_2};border-top:2px solid rgba(14,77,82,0.15)}}
  .fee-total .k{{font-family:'Fraunces',serif;font-size:12pt;color:{INK}}}
  .fee-total .v{{font-family:'Fraunces',serif;font-size:14pt;color:{INK};font-variant-numeric:tabular-nums}}
  .fee-note{{margin:0;padding:12px 18px;display:flex;align-items:center;gap:9px;font-size:9pt;font-weight:600}}
  .fee-note.ok{{background:rgba(107,143,113,0.12);color:#0F5648}}
  .fee-note.bad{{background:rgba(192,57,43,0.08);color:{TERRACOTTA}}}

  /* Verdict banner */
  .verdict{{display:flex;align-items:center;gap:13px;border:1px solid {BORDER};border-radius:14px;padding:14px 18px;margin:8px 0 18px}}
  .verdict .dot{{width:34px;height:34px;border-radius:999px;color:#fff;display:inline-flex;align-items:center;
    justify-content:center;font-family:'Fraunces',serif;font-size:15pt;font-weight:700;flex:0 0 auto}}
  .verdict .txt{{font-size:11pt;color:{INK};font-weight:500;line-height:1.4}}
  .verdict .txt em{{font-style:normal;color:{CLAY};font-weight:600}}

  /* Top severity banner */
  .topban{{display:flex;align-items:center;gap:12px;border-left:4px solid;border-radius:12px;
    padding:13px 16px;margin:4px 0 12px;font-size:11pt;font-weight:600}}
  .topban .ic{{width:30px;height:30px;border-radius:999px;display:inline-flex;align-items:center;
    justify-content:center;color:#fff;font-family:'Fraunces',serif;font-weight:700;flex:0 0 auto}}

  /* Flag / finding cards */
  .flag{{background:#fff;border:1px solid {BORDER};border-left:4px solid {CLAY};border-radius:11px;
    padding:12px 15px;margin-bottom:9px}}
  .flag .row{{display:flex;align-items:baseline;justify-content:space-between;gap:12px}}
  .flag .ttl{{font-weight:600;color:{INK};font-size:10.5pt}}
  .flag .imp{{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;font-size:9.5pt;color:{CLAY};white-space:nowrap}}
  .flag .det{{color:{TEXT};font-size:9.5pt;line-height:1.5;margin:6px 0 0}}
  .flag .act{{margin:8px 0 0;padding:8px 11px;background:{SURFACE_2};border-radius:8px;color:{INK};font-size:9pt}}

  .band-hd{{display:flex;align-items:center;gap:8px;margin:14px 0 8px;font-weight:600;color:{INK};font-size:10pt}}
  .band-hd .pill{{width:22px;height:22px;border-radius:999px;color:#fff;display:inline-flex;align-items:center;
    justify-content:center;font-size:9pt;font-weight:700;flex:0 0 auto}}
  .band-hd .ct{{color:{MUTED};font-weight:400;font-size:9pt}}

  .chip{{display:inline-block;padding:2px 9px;border-radius:999px;font-size:7.5pt;text-transform:uppercase;
    letter-spacing:0.1em;font-weight:600;color:#fff}}

  /* Stream cards */
  .stream-grid{{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:4px 0 18px}}
  .stream-card{{border-radius:12px;padding:13px 15px;color:#fff}}
  .stream-card .s-lbl{{font-size:8pt;text-transform:uppercase;letter-spacing:0.14em;color:rgba(255,255,255,0.72)}}
  .stream-card .s-val{{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;font-size:15pt;margin-top:5px}}
  .stream-card .s-meta{{font-size:8.5pt;color:rgba(255,255,255,0.78);margin-top:3px}}

  /* Generic cards + meta */
  .card{{background:{SURFACE};border:1px solid {BORDER};border-radius:12px;padding:14px 16px;margin:4px 0 14px}}
  .card.accent{{border-left:4px solid {INK}}}
  .meta{{display:grid;grid-template-columns:auto 1fr;gap:7px 16px;margin:10px 0 14px;font-size:10pt}}
  .meta dt{{color:{MUTED};text-transform:uppercase;letter-spacing:0.08em;font-size:8pt;padding-top:3px}}
  .meta dd{{margin:0;color:{INK}}}

  /* Tables */
  table{{width:100%;border-collapse:collapse;margin:6px 0 14px;font-size:9pt;background:#fff;
    border:1px solid {BORDER};border-radius:11px;overflow:hidden}}
  thead th{{background:{INK};color:#fff;text-align:left;padding:8px 10px;font-weight:600;font-size:8pt;
    text-transform:uppercase;letter-spacing:0.07em}}
  tbody td{{padding:7px 10px;border-top:1px solid {BORDER};vertical-align:top;color:{TEXT}}}
  tbody tr:nth-child(even) td{{background:{SURFACE}}}
  td.r,th.r{{text-align:right}}

  ul.steps{{margin:4px 0 14px;padding:0;list-style:none}}
  ul.steps li{{position:relative;padding:4px 0 4px 18px;font-size:10pt;color:{INK}}}
  ul.steps li:before{{content:'';position:absolute;left:2px;top:11px;width:6px;height:6px;border-radius:50%;background:{CLAY}}}

  .letter-body p{{margin:0 0 11px;font-size:11pt;line-height:1.6;color:{TEXT}}}
  .notes-lines{{margin-top:6px}}
  .notes-lines .line{{border-bottom:1px solid {BORDER};height:22px}}

  /* Hero card (big headline figure) */
  .hero-card{{border-radius:16px;padding:20px 24px;margin:12px 0 16px;color:#fff}}
  .hero-card .eyebrow{{font-size:8.5pt;text-transform:uppercase;letter-spacing:0.14em;color:rgba(255,255,255,0.8);margin-bottom:6px}}
  .hero-card .big{{font-family:'Fraunces',Georgia,serif;font-size:26pt;font-weight:600;line-height:1.1;letter-spacing:-0.01em}}
  .hero-card .hsub{{font-size:10pt;color:rgba(255,255,255,0.9);margin-top:8px;line-height:1.5}}

  /* Generic labelled bars */
  .bars{{margin:4px 0 14px}}
  .bar-row{{padding:9px 0;border-top:1px solid {BORDER}}}
  .bar-row:first-child{{border-top:0}}
  .bar-row .b1{{display:flex;justify-content:space-between;align-items:baseline;font-size:10pt;margin-bottom:6px}}
  .bar-row .b1 .k{{color:{INK};font-weight:500}}
  .bar-row .b1 .v{{color:{INK};font-weight:600;font-variant-numeric:tabular-nums}}
  .bar-track{{height:8px;border-radius:999px;background:{SURFACE_2};overflow:hidden}}
  .bar-track i{{display:block;height:100%;border-radius:999px;background:{INK}}}
  .bar-sub{{font-size:8pt;color:{MUTED};margin-top:4px}}

  /* Progress (e.g. lifetime cap) */
  .progress{{margin:6px 0 14px}}
  .progress .ptrack{{height:14px;border-radius:999px;background:{SURFACE_2};overflow:hidden}}
  .progress .ptrack i{{display:block;height:100%;border-radius:999px;background:{CLAY}}}
  .progress .plabel{{display:flex;justify-content:space-between;font-size:9pt;color:{MUTED};margin-top:6px}}

  /* Split bar on light background */
  .lsplit{{display:flex;height:28px;border-radius:9px;overflow:hidden;margin:6px 0}}
  .lsplit span{{display:flex;align-items:center;justify-content:center;font-size:9pt;font-weight:600;color:#fff}}
  .lsplit-legend{{display:flex;flex-wrap:wrap;gap:4px 18px;margin-top:9px;font-size:9pt;color:{INK}}}
  .lsplit-legend .dot{{width:10px;height:10px;border-radius:50%;display:inline-block;margin-right:6px;vertical-align:middle}}

  .foot{{margin-top:22px;padding-top:13px;border-top:1px solid {BORDER};
    display:flex;align-items:center;justify-content:space-between;gap:14px;color:{MUTED};font-size:8pt;line-height:1.5}}
  .foot .lock{{display:flex;align-items:center;gap:7px;color:{INK};font-weight:600;white-space:nowrap}}
  .foot .disc{{flex:1}}

  @page{{margin:11mm}}
"""


def document(title: str, body: str, *, max_width: int = 760, extra_css: str = "") -> str:
    return (
        f'<!doctype html><html lang="en-AU"><head><meta charset="utf-8"/>'
        f"<title>{esc(title)}</title>"
        f"<style>{font_face_css()}{_BASE_CSS}body{{max-width:{max_width}px}}{extra_css}</style>"
        f"</head><body>{body}</body></html>"
    )


# ---------------------------------------------------------------------------
# Reusable HTML blocks
# ---------------------------------------------------------------------------
def brand_header(tag: str) -> str:
    return (f'<div class="brand">{logo_lockup_img(height=34)}'
            f'<div class="brand-tag">{esc(tag)}</div></div>')


def footer(disclaimer: str) -> str:
    return (f'<div class="foot"><div class="lock">{logo_mark_img(size=20)}'
            f'<span>Wayly</span></div>'
            f'<div class="disc">{esc(disclaimer)}</div></div>')


def h1(text_html: str) -> str:
    return f'<h1 class="hd">{text_html}</h1>'


def subtitle(text: str) -> str:
    return f'<p class="sub">{esc(text)}</p>'


def section(title: str) -> str:
    return f'<h2 class="sec">{esc(title_case(title))}</h2>'


def kpi_grid(items, *, hero_first: bool = False, cols: int | None = None) -> str:
    cols = cols or len(items)
    tiles = []
    for i, it in enumerate(items):
        label, value = it[0], it[1]
        cap = it[2] if len(it) > 2 else None
        cls = "kpi hero" if (hero_first and i == 0) else "kpi"
        cap_html = f'<span class="cap">{esc(cap)}</span>' if cap else ""
        tiles.append(f'<div class="{cls}"><span class="lbl">{esc(title_case(label))}</span>'
                     f'<span class="val">{esc(value)}</span>{cap_html}</div>')
    return (f'<div class="kpi-grid" style="grid-template-columns:repeat({cols},1fr)">'
            + "".join(tiles) + "</div>")


def _conic(segments) -> str:
    total = sum(max(0.0, num(v)) for v, _ in segments) or 1.0
    stops, acc = [], 0.0
    for v, color in segments:
        start = acc / total
        acc += max(0.0, num(v))
        end = acc / total
        stops.append(f"{color} {start*100:.3f}% {end*100:.3f}%")
    return "conic-gradient(" + ",".join(stops) + ")"


def donut(segments, center_val: str, center_sub: str, *, legend_rows: str = "",
          head: str = "", card_class: str = "teal") -> str:
    """segments: list of (value, color). legend_rows: pre-built HTML."""
    grad = _conic(segments)
    head_html = f'<div class="ic-head">{esc(title_case(head))}</div>' if head else ""
    return (f'<div class="insight-card {card_class}">{head_html}'
            f'<div class="ic-body">'
            f'<div class="donut" style="background:{grad}">'
            f'<div class="hole"><span class="d-val">{esc(center_val)}</span>'
            f'<span class="d-sub">{esc(center_sub)}</span></div></div>'
            f'<div class="legend">{legend_rows}</div></div></div>')


def legend_row(name: str, color: str, value: str) -> str:
    return (f'<div class="legend-row"><span class="l-name">'
            f'<span class="dot" style="background:{color}"></span>{esc(name)}</span>'
            f'<span class="l-val">{esc(value)}</span></div>')


def verdict(dot: str, text_html: str, *, bg: str, border: str, dot_color: str) -> str:
    return (f'<div class="verdict" style="background:{bg};border-color:{border}">'
            f'<span class="dot" style="background:{dot_color}">{esc(dot)}</span>'
            f'<div class="txt">{text_html}</div></div>')


def flag_card(title: str, detail: str = "", *, impact_html: str = "",
              accent: str = CLAY, action: str = "") -> str:
    det = f'<div class="det">{esc(detail)}</div>' if detail else ""
    act = f'<div class="act"><b>Suggested action.</b> {esc(action)}</div>' if action else ""
    return (f'<div class="flag" style="border-left-color:{accent}">'
            f'<div class="row"><div class="ttl">{esc(title)}</div>{impact_html}</div>'
            f'{det}{act}</div>')


def chip(label: str, color: str) -> str:
    return f'<span class="chip" style="background:{color}">{esc(label)}</span>'


def data_table(headers, rows, *, right_from: int = 1) -> str:
    head = "".join(
        f'<th class="{ "r" if i >= right_from else "" }">{esc(title_case(str(h)))}</th>'
        for i, h in enumerate(headers))
    body = []
    for r in rows:
        cells = "".join(
            f'<td class="{ "r num" if i >= right_from else "" }">{c if isinstance(c, str) and c.startswith("<") else esc(c)}</td>'
            for i, c in enumerate(r))
        body.append(f"<tr>{cells}</tr>")
    return (f'<table><thead><tr>{head}</tr></thead>'
            f'<tbody>{"".join(body)}</tbody></table>')


def card(inner_html: str, *, accent: bool = False) -> str:
    return f'<div class="card{" accent" if accent else ""}">{inner_html}</div>'


def hero_card(eyebrow: str, big_html: str, sub_html: str = "", *, bg: str = INK) -> str:
    sub = f'<div class="hsub">{sub_html}</div>' if sub_html else ""
    return (f'<div class="hero-card" style="background:{bg}">'
            f'<div class="eyebrow">{esc(eyebrow)}</div>'
            f'<div class="big">{big_html}</div>{sub}</div>')


def bars(rows) -> str:
    """rows: list of (label, value_str, pct, color[, sub])."""
    out = ['<div class="bars">']
    for r in rows:
        label, value, p = r[0], r[1], max(0, min(100, int(round(r[2] or 0))))
        color = r[3] if len(r) > 3 and r[3] else INK
        sub = f'<div class="bar-sub">{esc(r[4])}</div>' if len(r) > 4 and r[4] else ""
        out.append(
            f'<div class="bar-row"><div class="b1"><span class="k">{esc(label)}</span>'
            f'<span class="v">{esc(value)}</span></div>'
            f'<div class="bar-track"><i style="width:{p}%;background:{color}"></i></div>{sub}</div>')
    out.append("</div>")
    return "".join(out)


def progress(pct_val, *, color: str = CLAY, left: str = "", right: str = "") -> str:
    p = max(0, min(100, int(round(pct_val or 0))))
    lab = (f'<div class="plabel"><span>{esc(left)}</span><span>{esc(right)}</span></div>'
           if (left or right) else "")
    return (f'<div class="progress"><div class="ptrack"><i style="width:{p}%;background:{color}"></i></div>'
            f'{lab}</div>')


def split_bar_light(segments) -> str:
    """segments: list of (pct, color, legend_name, legend_value). Dark text auto for light colors."""
    total = sum(max(0.0, num(p)) for p, *_ in segments) or 1.0
    bar, legend = [], []
    for seg in segments:
        p, color, name = seg[0], seg[1], seg[2]
        val = seg[3] if len(seg) > 3 else ""
        w = max(0.0, num(p)) / total * 100
        txt = f"{int(round(w))}%" if w >= 16 else ""
        bar.append(f'<span style="width:{w:.2f}%;background:{color}">{txt}</span>')
        legend.append(f'<span><span class="dot" style="background:{color}"></span>{esc(name)} '
                      f'<b>{esc(val)}</b></span>')
    return (f'<div class="lsplit">{"".join(bar)}</div>'
            f'<div class="lsplit-legend">{"".join(legend)}</div>')


def today_au() -> str:
    return datetime.now(timezone.utc).strftime("%d/%m/%Y")
