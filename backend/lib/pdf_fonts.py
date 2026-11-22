"""Base64-embedded @font-face CSS for the brand fonts (Fraunces / Inter / IBM
Plex Mono), so Chromium-rendered PDFs use the exact in-app typography without any
network access at render time. Font files live in ``backend/assets/fonts``.
"""
from __future__ import annotations

import base64
import functools
from pathlib import Path

_FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"

_FACES = [
    ("Fraunces", 500, "Fraunces-500.woff2"),
    ("Fraunces", 600, "Fraunces-600.woff2"),
    ("Fraunces", 700, "Fraunces-700.woff2"),
    ("Inter", 400, "Inter-400.woff2"),
    ("Inter", 500, "Inter-500.woff2"),
    ("Inter", 600, "Inter-600.woff2"),
    ("IBM Plex Mono", 400, "IBMPlexMono-400.woff2"),
    ("IBM Plex Mono", 500, "IBMPlexMono-500.woff2"),
    ("IBM Plex Mono", 600, "IBMPlexMono-600.woff2"),
]


@functools.lru_cache(maxsize=1)
def font_face_css() -> str:
    out = []
    for family, weight, fn in _FACES:
        p = _FONT_DIR / fn
        if not p.exists():
            continue
        b64 = base64.b64encode(p.read_bytes()).decode("ascii")
        out.append(
            "@font-face{font-family:'%s';font-style:normal;font-weight:%d;"
            "font-display:swap;src:url(data:font/woff2;base64,%s) format('woff2')}"
            % (family, weight, b64)
        )
    return "\n".join(out)
