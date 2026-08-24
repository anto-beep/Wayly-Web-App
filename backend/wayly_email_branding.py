"""Wayly email branding, single source of truth for palette + shell.

Every transactional email should route through :func:`wrap_email_html` so the
brand stays consistent across signup verification, trial welcome, statement
digests, adviser invites and admin templates. Colours mirror the app's
`--kindred-*` and `--wayly-*` CSS custom properties; fonts fall back to
Georgia + system serifs because custom web fonts are unreliable in email
clients.

Palette
-------
* Teal (primary):        #0E4D52 , dark surface (header), primary buttons on white
* Teal dark:             #0A3E42 , header background stripe
* Teal deep:             #072E31 , heavy accents / footer band alternative
* Teal light bg:         #E9F2F2 , outer canvas / note callouts
* Clay (accent CTA):     #A5512B , primary action buttons
* Clay hover:            #8A4423
* Warm cream (canvas):   #FBF8F3 , page background
* Warm surface:          #F4EFE7 , footer band, subtle inset cards
* Border:                #E7E0D5 , hairline dividers
* Body text:             #1C2B2D
* Muted text:            #524B42

Public API
----------
* :data:`COLORS`, dict of named brand colours (HEX strings).
* :func:`wrap_email_html`, build the branded shell around inner HTML.
"""
from __future__ import annotations
import html as _htmllib
from typing import Optional

COLORS = {
    "teal":          "#0E4D52",
    "teal_dark":     "#0A3E42",
    "teal_deep":     "#072E31",
    "teal_light":    "#E9F2F2",
    "clay":          "#A5512B",
    "clay_hover":    "#8A4423",
    "canvas":        "#FBF8F3",
    "warm_surface":  "#F4EFE7",
    "border":        "#E7E0D5",
    "text":          "#1C2B2D",
    "muted":         "#524B42",
    "white":         "#FFFFFF",
    "sage":          "#425F47",
    "gold":          "#B7791F",
    "terracotta":    "#C0392B",
}

BODY_FONT = "Georgia, 'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Palatino, serif"
HEADING_FONT = BODY_FONT  # keep them the same to mirror the app's editorial feel

BRAND_TAGLINE = "Wayly · Aged-care concierge for Australian families"
# Canonical brand URL. `PUBLIC_APP_URL` may be set per-environment; the
# hardcoded fallback ensures emails always link back to a Wayly-branded
# domain even in misconfigured containers. We deliberately *don't* fall
# back to FRONTEND_URL here, email footers and logos should always point
# to the public marketing site, never a preview host.
import os as _os
SITE_HOME = (_os.environ.get("PUBLIC_APP_URL") or "https://wayly.com.au").rstrip("/")
# Real Wayly logo, hosted from the frontend's /public/branding/ dir. The
# mono-white variant reads cleanly on the dark-teal header. Sized at 44px
# in the shell but the source is 512px so it stays crisp on retina/dark-mode
# rendering in every major email client (Gmail, Outlook, Yahoo, Apple Mail).
LOGO_MONO_WHITE_URL = f"{SITE_HOME}/branding/png/wayly-mark-mono-white-512.png"
LOGO_NAVY_URL = f"{SITE_HOME}/branding/png/wayly-mark-128.png"


def _esc(s: str) -> str:
    return _htmllib.escape(s or "", quote=True)


def format_au_date(value) -> str:
    """Format any date-like value as ``DD/MM/YYYY`` for Wayly emails.

    Accepts ``datetime``, ``date``, ISO-8601 strings (``YYYY-MM-DD`` or full
    timestamp) and returns the Australian long-form we standardised on.
    Falls back to ``str(value)`` when parsing fails so we never crash an
    outgoing email over a formatting corner case.
    """
    from datetime import date, datetime
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.strftime("%d/%m/%Y")
    if isinstance(value, date):
        return value.strftime("%d/%m/%Y")
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return ""
        # Fast path for the common isoformat variants.
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00")).strftime("%d/%m/%Y")
        except ValueError:
            pass
        try:
            return date.fromisoformat(s[:10]).strftime("%d/%m/%Y")
        except ValueError:
            return s
    return str(value)


def wrap_email_html(
    *,
    title: str,
    inner_html: str,
    eyebrow: Optional[str] = None,
    footer_note: Optional[str] = None,
    show_wayly_logo: bool = True,
) -> str:
    """Return a full HTML document wrapping ``inner_html`` in the Wayly shell.

    Args:
        title: Value for ``<title>`` and screen-reader preheader.
        inner_html: Trusted HTML to render inside the main content area.
        eyebrow: Small uppercase label above the Wayly wordmark in the header.
        footer_note: Extra copy shown in the footer strip. Falls back to a
            generic "you received this because" line.
        show_wayly_logo: Whether to render the 'W' avatar tile next to the
            wordmark. Keep True for user-facing mail.
    """
    eyebrow_html = (
        f'<div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;'
        f'opacity:.82;margin-top:6px;color:{COLORS["teal_light"]};font-family:{BODY_FONT};">'
        f'{_esc(eyebrow)}</div>'
    ) if eyebrow else ""

    logo_html = (
        f'<td valign="middle" style="width:52px;padding-right:14px;">'
        f'  <img src="{LOGO_MONO_WHITE_URL}" width="44" height="44" '
        f'alt="Wayly" '
        f'style="display:block;width:44px;height:44px;border:0;outline:none;'
        f'-ms-interpolation-mode:bicubic;border-radius:8px;" />'
        f'</td>'
    ) if show_wayly_logo else ""

    footer_copy = footer_note or (
        "You received this because you have a Wayly account. "
        "Crisis support: Lifeline 13 11 14 · 1800ELDERHelp 1800 353 374."
    )

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{_esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:{COLORS["canvas"]};font-family:{BODY_FONT};color:{COLORS["text"]};">
  <div style="display:none;overflow:hidden;line-height:1;opacity:0;max-height:0;max-width:0;">
    {_esc(title)}
  </div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:{COLORS["canvas"]};padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="600"
             style="width:600px;max-width:100%;background:{COLORS["white"]};border-radius:16px;overflow:hidden;border:1px solid {COLORS["border"]};">
        <!-- Header -->
        <tr><td style="background:{COLORS["teal_dark"]};padding:24px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              {logo_html}
              <td valign="middle">
                <div style="font-family:{HEADING_FONT};font-size:24px;color:{COLORS["white"]};font-weight:700;letter-spacing:-.01em;">Wayly</div>
                {eyebrow_html}
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px 40px 24px 40px;font-family:{BODY_FONT};color:{COLORS["text"]};font-size:15px;line-height:1.65;">
          {inner_html}
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:{COLORS["warm_surface"]};padding:20px 32px;text-align:center;color:{COLORS["muted"]};font-size:12px;line-height:1.6;font-family:{BODY_FONT};border-top:1px solid {COLORS["border"]};">
          <div>{BRAND_TAGLINE} · <a href="{SITE_HOME}" style="color:{COLORS["clay"]};text-decoration:none;font-weight:600;">wayly.com.au</a></div>
          <div style="margin-top:6px;font-size:11px;opacity:.85;">{_esc(footer_copy)}</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def button_html(*, href: str, label: str, colour: str = "clay") -> str:
    """Bulletproof-ish rounded button. Use ``colour='clay'`` for CTAs
    (primary), ``'teal'`` for secondary."""
    bg = COLORS.get(colour, COLORS["clay"])
    return (
        f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">'
        f'  <tr><td align="center" style="background:{bg};border-radius:999px;">'
        f'    <a href="{_esc(href)}" style="display:inline-block;padding:14px 32px;color:{COLORS["white"]};'
        f'font-weight:700;font-size:15px;text-decoration:none;font-family:{BODY_FONT};letter-spacing:.01em;">'
        f'{_esc(label)}</a>'
        f'  </td></tr>'
        f'</table>'
    )


def note_callout_html(*, text: str, tone: str = "teal") -> str:
    """A subtle inset note. ``tone`` in {teal, clay, sage}."""
    bg_map = {"teal": COLORS["teal_light"], "clay": "#FBEEE6", "sage": "#EAF1EA"}
    stripe_map = {"teal": COLORS["teal"], "clay": COLORS["clay"], "sage": COLORS["sage"]}
    bg = bg_map.get(tone, COLORS["teal_light"])
    stripe = stripe_map.get(tone, COLORS["teal"])
    return (
        f'<div style="margin:18px 0;padding:14px 18px;background:{bg};'
        f'border-left:3px solid {stripe};color:{COLORS["text"]};font-size:14px;line-height:1.6;'
        f'font-family:{BODY_FONT};border-radius:6px;">{text}</div>'
    )
