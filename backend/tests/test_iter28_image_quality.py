"""Iteration 28 — Image quality assessment + auto-rotation tests.

These tests exercise the OpenCV-backed quality module in document_extract.py
without going through the LLM vision call (which is exercised separately).
"""
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
import pytest
from PIL import Image, ImageDraw, ImageFilter

from document_extract import (
    assess_image_quality,
    auto_rotate,
    _prepare_image_for_vision,
    _QUALITY_THRESHOLDS,
)


def _statement_image(text="Support at Home statement\nParticipant: Test\nGross: $1,234.56", size=(1200, 1600)):
    """Build a synthetic statement-like image (white bg, black text)."""
    img = Image.new("RGB", size, "white")
    d = ImageDraw.Draw(img)
    # Default PIL font is small but produces enough variance to register as non-blank
    for y_offset, line in enumerate(text.split("\n")):
        d.text((50, 50 + y_offset * 40), line, fill="black")
    # Add a few faux table rows so blur/skew metrics have edges to chew on
    for i in range(15):
        d.line([(50, 200 + i * 60), (size[0] - 50, 200 + i * 60)], fill="black", width=2)
    return img


def test_quality_good_image():
    img = _statement_image()
    q = assess_image_quality(img)
    assert q["rating"] in ("good", "fair"), f"Expected good/fair, got {q['rating']}: {q}"
    assert q["is_blank"] is False
    assert q["width"] == 1200 and q["height"] == 1600


def test_quality_blank_image():
    img = Image.new("RGB", (1200, 1600), "white")
    q = assess_image_quality(img)
    assert q["is_blank"] is True
    assert q["rating"] == "blank"
    assert any("blank" in w.lower() for w in q["warnings"])


def test_quality_dark_image():
    base = _statement_image()
    arr = np.array(base).astype(np.int16) - 200
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    img = Image.fromarray(arr)
    q = assess_image_quality(img)
    assert q["brightness"] is not None and q["brightness"] < _QUALITY_THRESHOLDS["brightness_low"]
    assert q["rating"] == "poor"
    assert any("dark" in w.lower() for w in q["warnings"])


def test_quality_blurry_image():
    # Use a denser image so blur doesn't collapse std into "blank" range
    img = _statement_image(text="Support at Home statement\n" * 8 + "Item 1 $123.45 Item 2 $456.78\n" * 6)
    blurred = img.filter(ImageFilter.GaussianBlur(radius=8))
    q = assess_image_quality(blurred)
    assert q["blur_score"] is not None
    # Heavy blur should drop blur_score well below the fair threshold
    assert q["blur_score"] < _QUALITY_THRESHOLDS["blur_min_fair"], q
    assert q["rating"] == "poor", q
    assert any("blur" in w.lower() for w in q["warnings"])


def test_skew_detection_and_auto_rotate():
    base = _statement_image(size=(1400, 1800))
    # Rotate the canvas by +7 degrees so we have a known skew
    rotated = base.rotate(-7, resample=Image.BICUBIC, fillcolor="white", expand=False)
    q = assess_image_quality(rotated)
    # Skew detection isn't exact but should land within ~3° of the truth
    assert abs(q["skew_angle"]) >= 3.0, q
    # Auto-rotate should pull the angle back toward zero
    corrected = auto_rotate(rotated, q["skew_angle"])
    q2 = assess_image_quality(corrected)
    assert abs(q2["skew_angle"]) < abs(q["skew_angle"]), (q, q2)


def test_low_resolution_warning():
    img = _statement_image(size=(500, 700))  # short side 500 < 600 threshold
    q = assess_image_quality(img)
    assert q["width"] == 500 and q["height"] == 700
    assert any("resolution" in w.lower() for w in q["warnings"])
    # 500 short side falls below the low-res threshold → poor
    assert q["rating"] == "poor"


def test_prepare_for_vision_returns_quality_dict():
    img = _statement_image()
    prepared, quality = _prepare_image_for_vision(img)
    assert prepared is not None
    assert "rating" in quality and "warnings" in quality


def test_prepare_for_vision_corrects_skew():
    base = _statement_image(size=(1400, 1800))
    rotated = base.rotate(-6, resample=Image.BICUBIC, fillcolor="white", expand=False)
    prepared, quality = _prepare_image_for_vision(rotated)
    # The returned image should be re-uprighted (different from input)
    arr_in = np.array(rotated)
    arr_out = np.array(prepared)
    assert arr_in.shape == arr_out.shape
    # Pixel-wise the corrected image should differ from the skewed input
    assert not np.array_equal(arr_in, arr_out)


def test_image_to_base64_jpeg_returns_quality():
    """End-to-end: validate that _image_to_base64_jpeg now returns (b64, quality)."""
    from document_extract import _image_to_base64_jpeg
    base = _statement_image()
    buf = io.BytesIO()
    base.save(buf, format="JPEG", quality=90)
    raw = buf.getvalue()
    b64, quality = _image_to_base64_jpeg(raw, ".jpg")
    assert isinstance(b64, str) and len(b64) > 100
    assert "rating" in quality
    assert "warnings" in quality


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
