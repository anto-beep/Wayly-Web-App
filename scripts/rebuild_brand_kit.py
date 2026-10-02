"""Re-render every Wayly brand-kit PNG from its SVG master.

Run after editing any SVG in /app/frontend/public/branding/svg. Re-renders to
the standard size matrix used by the website + brand kit, refreshes the
favicons, and rebuilds wayly-brand-kit.zip.

Idempotent — safe to re-run any time.
"""
from __future__ import annotations
import io
import os
import zipfile
from pathlib import Path

import cairosvg

ROOT = Path("/app/frontend/public/branding")
SVG_DIR = ROOT / "svg"
PNG_DIR = ROOT / "png"
FAV_DIR = ROOT / "favicon"
PUBLIC_ROOT = Path("/app/frontend/public")

# Render matrix: { output_filename: (source_svg, width_px) }
# Heights derive from each SVG's intrinsic aspect ratio.
PNG_RENDERS: dict[str, tuple[str, int]] = {
    # ---- Mark (icon only) ----
    "wayly-mark-16.png":   ("wayly-mark.svg",   16),
    "wayly-mark-32.png":   ("wayly-mark.svg",   32),
    "wayly-mark-48.png":   ("wayly-mark.svg",   48),
    "wayly-mark-64.png":   ("wayly-mark.svg",   64),
    "wayly-mark-96.png":   ("wayly-mark.svg",   96),
    "wayly-mark-128.png":  ("wayly-mark.svg",   128),
    "wayly-mark-180.png":  ("wayly-mark.svg",   180),
    "wayly-mark-192.png":  ("wayly-mark.svg",   192),
    "wayly-mark-256.png":  ("wayly-mark.svg",   256),
    "wayly-mark-384.png":  ("wayly-mark.svg",   384),
    "wayly-mark-512.png":  ("wayly-mark.svg",   512),
    "wayly-mark-1024.png": ("wayly-mark.svg",   1024),

    # ---- Mark light (for dark backgrounds) ----
    "wayly-mark-light-512.png":  ("wayly-mark-light.svg",  512),
    "wayly-mark-light-1024.png": ("wayly-mark-light.svg",  1024),

    # ---- Mono marks (single-colour) ----
    "wayly-mark-mono-navy-512.png":  ("wayly-mark-mono-navy.svg",  512),
    "wayly-mark-mono-white-512.png": ("wayly-mark-mono-white.svg", 512),

    # ---- Wordmark (text only) ----
    "wayly-wordmark-navy-512.png":   ("wayly-wordmark-navy.svg",  512),
    "wayly-wordmark-navy-1024.png":  ("wayly-wordmark-navy.svg",  1024),
    "wayly-wordmark-navy-2048.png":  ("wayly-wordmark-navy.svg",  2048),
    "wayly-wordmark-white-512.png":  ("wayly-wordmark-white.svg", 512),
    "wayly-wordmark-white-1024.png": ("wayly-wordmark-white.svg", 1024),
    "wayly-wordmark-white-2048.png": ("wayly-wordmark-white.svg", 2048),

    # ---- Lockup (mark + wordmark) ----
    "wayly-lockup-navy-512.png":   ("wayly-lockup-navy.svg",  512),
    "wayly-lockup-navy-1024.png":  ("wayly-lockup-navy.svg",  1024),
    "wayly-lockup-navy-2048.png":  ("wayly-lockup-navy.svg",  2048),
    "wayly-lockup-navy-4096.png":  ("wayly-lockup-navy.svg",  4096),
    "wayly-lockup-white-512.png":  ("wayly-lockup-white.svg", 512),
    "wayly-lockup-white-1024.png": ("wayly-lockup-white.svg", 1024),
    "wayly-lockup-white-2048.png": ("wayly-lockup-white.svg", 2048),
    "wayly-lockup-white-4096.png": ("wayly-lockup-white.svg", 4096),
}

# Favicons are rendered from the same master mark, but live in /favicon/.
FAVICON_RENDERS: dict[str, tuple[str, int]] = {
    "favicon-16.png":         ("wayly-mark.svg", 16),
    "favicon-32.png":         ("wayly-mark.svg", 32),
    "favicon-48.png":         ("wayly-mark.svg", 48),
    "favicon-64.png":         ("wayly-mark.svg", 64),
    "favicon-96.png":         ("wayly-mark.svg", 96),
    "favicon-128.png":        ("wayly-mark.svg", 128),
    "favicon-180.png":        ("wayly-mark.svg", 180),
    "favicon-192.png":        ("wayly-mark.svg", 192),
    "favicon-256.png":        ("wayly-mark.svg", 256),
    "favicon-512.png":        ("wayly-mark.svg", 512),
    "apple-touch-icon.png":   ("wayly-mark.svg", 180),
    "icon-192.png":           ("wayly-mark.svg", 192),
    "icon-512.png":           ("wayly-mark.svg", 512),
}


def render(svg_path: Path, out_path: Path, width: int) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cairosvg.svg2png(
        url=str(svg_path),
        write_to=str(out_path),
        output_width=width,
    )
    print(f"  {out_path.relative_to(PUBLIC_ROOT)} ({width}px)")


def main() -> None:
    print("Rendering /branding/png/ from SVG masters...")
    for filename, (svg_name, width) in PNG_RENDERS.items():
        svg = SVG_DIR / svg_name
        render(svg, PNG_DIR / filename, width)

    print("\nRendering /branding/favicon/ from wayly-mark.svg...")
    for filename, (svg_name, width) in FAVICON_RENDERS.items():
        svg = SVG_DIR / svg_name
        render(svg, FAV_DIR / filename, width)

    # Mirror new favicons to the public root (legacy /favicon.ico and apple-touch-icon paths).
    print("\nMirroring legacy root paths...")
    import shutil
    shutil.copy(FAV_DIR / "apple-touch-icon.png", PUBLIC_ROOT / "apple-touch-icon.png")
    print(f"  apple-touch-icon.png mirrored to /")

    # OG image (1200x630) — re-export from branding/og-image.svg if present; otherwise compose from lockup.
    og_svg = ROOT / "og-image.svg"
    if og_svg.exists():
        print("\nRendering /og-image.png + /og-default.png + /branding/og-image.png from og-image.svg...")
        for target in [
            PUBLIC_ROOT / "og-image.png",
            PUBLIC_ROOT / "og-default.png",
            ROOT / "og-image.png",
        ]:
            cairosvg.svg2png(url=str(og_svg), write_to=str(target), output_width=1200)
            print(f"  {target.relative_to(PUBLIC_ROOT)}")

    # Rebuild the zip.
    print("\nRebuilding wayly-brand-kit.zip...")
    zip_path = ROOT / "wayly-brand-kit.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in sorted(SVG_DIR.glob("*.svg")):
            zf.write(f, arcname=f"branding/svg/{f.name}")
        for f in sorted(PNG_DIR.glob("*.png")):
            zf.write(f, arcname=f"branding/png/{f.name}")
        for f in sorted(FAV_DIR.glob("*")):
            if f.is_file():
                zf.write(f, arcname=f"branding/favicon/{f.name}")
        # Include the README if present.
        readme = ROOT / "README.md"
        if readme.exists():
            zf.write(readme, arcname="branding/README.md")
    size_kb = zip_path.stat().st_size / 1024
    print(f"  {zip_path.relative_to(PUBLIC_ROOT)} ({size_kb:.1f} KB, {sum(1 for _ in zipfile.ZipFile(zip_path).namelist())} files)")

    print("\nDone. Hard-refresh any open tabs to bust the CDN cache.")


if __name__ == "__main__":
    main()
