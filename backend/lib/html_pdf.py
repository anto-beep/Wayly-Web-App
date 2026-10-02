"""Headless-Chromium HTML -> PDF renderer.

Shared helper so any tool can render a branded HTML template to a pixel-faithful
PDF (same fonts, colours and graphics as the in-app screens). Auto-detects the
Chrome/Chromium binary across container images; raises a clear error when none
is present so callers can fall back to the ReportLab pipeline.
"""
from __future__ import annotations

import asyncio
import os
import shutil
import tempfile
from pathlib import Path


def find_chrome() -> str | None:
    candidates = [
        os.environ.get("CHROME_BIN"),
        shutil.which("google-chrome"),
        shutil.which("google-chrome-stable"),
        shutil.which("chromium"),
        shutil.which("chromium-browser"),
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/root/bin/chromium",
    ]
    for c in candidates:
        if c and Path(c).exists():
            return c
    return None


def html_to_pdf_bytes_sync(html: str, *, landscape: bool = False,
                           timeout: int = 45) -> bytes:
    """Synchronous HTML -> PDF via headless Chromium (subprocess.run).

    Mirrors ``html_to_pdf_bytes`` but is safe to call from the many sync
    PDF renderers without an event loop. Raises on any failure so callers
    can fall back to their legacy ReportLab pipeline.
    """
    import subprocess
    chrome = find_chrome()
    if not chrome:
        raise RuntimeError("No Chrome/Chromium binary available for HTML->PDF rendering")
    workdir = tempfile.mkdtemp(prefix="wayly_pdf_")
    try:
        html_path = Path(workdir) / "doc.html"
        pdf_path = Path(workdir) / "doc.pdf"
        html_path.write_text(html, encoding="utf-8")
        args = [
            chrome, "--headless=new", "--disable-gpu", "--no-sandbox",
            "--no-pdf-header-footer", "--hide-scrollbars",
            "--force-color-profile=srgb",
            f"--print-to-pdf={pdf_path}",
        ]
        if landscape:
            args.append("--landscape")
        args.append(f"file://{html_path}")
        subprocess.run(args, capture_output=True, timeout=timeout, check=False)
        if not pdf_path.exists():
            raise RuntimeError("HTML->PDF rendering produced no output")
        return pdf_path.read_bytes()
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


async def html_to_pdf_bytes(html: str, *, landscape: bool = False,
                            timeout: int = 45) -> bytes:
    """Render an HTML string to PDF bytes with headless Chromium.

    The HTML should embed its own fonts (e.g. base64 @font-face) so rendering is
    self-contained and does not depend on network access at render time.
    """
    chrome = find_chrome()
    if not chrome:
        raise RuntimeError("No Chrome/Chromium binary available for HTML->PDF rendering")
    workdir = tempfile.mkdtemp(prefix="wayly_pdf_")
    try:
        html_path = Path(workdir) / "doc.html"
        pdf_path = Path(workdir) / "doc.pdf"
        html_path.write_text(html, encoding="utf-8")
        args = [
            chrome,
            "--headless=new",
            "--disable-gpu",
            "--no-sandbox",
            "--no-pdf-header-footer",
            "--hide-scrollbars",
            "--force-color-profile=srgb",
            f"--print-to-pdf={pdf_path}",
        ]
        if landscape:
            args.append("--landscape")
        args.append(f"file://{html_path}")
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            raise RuntimeError("HTML->PDF rendering timed out")
        if not pdf_path.exists():
            raise RuntimeError("HTML->PDF rendering produced no output")
        return pdf_path.read_bytes()
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
