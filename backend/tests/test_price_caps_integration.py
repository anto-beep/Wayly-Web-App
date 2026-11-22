"""Live integration regression for the May 2026 price-cap deferral sweep.

Exercises:
  * POST /api/auth/login (cathy@example.com paid family plan)
  * POST /api/public/price-check (3 rate scenarios)
  * GET  /api/program-reference/public (policy_status.price_caps)
  * GET  /api/cms/articles (titles + body phrasing)
  * Mongo program_reference rows (closed price_caps_start + deferred status)
"""
from __future__ import annotations

import os
import re
from pathlib import Path

import pytest
import requests
from pymongo import MongoClient
from dotenv import dotenv_values

BACKEND_ENV = dotenv_values(Path("/app/backend/.env"))
MONGO_URL = BACKEND_ENV.get("MONGO_URL") or os.environ.get("MONGO_URL")
DB_NAME = BACKEND_ENV.get("DB_NAME") or os.environ.get("DB_NAME")

FRONTEND_ENV = dotenv_values(Path("/app/frontend/.env"))
BASE_URL = (FRONTEND_ENV.get("REACT_APP_BACKEND_URL") or "").rstrip("/")

EMAIL = "cathy@example.com"
PASSWORD = "testpass123"


# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": EMAIL, "password": PASSWORD},
               timeout=20)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("token") or body.get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# --------------------------------------------------------------------------- #
# /api/public/price-check live response contract
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("service,rate,expected_verdict,expected_median", [
    ("Personal care", 100.0, "high", 84.0),
    ("Domestic assistance — cleaning", 60.0, "low", 76.0),
    ("Personal care", 84.0, "fair", 84.0),
])
def test_public_price_check_live(session, service, rate, expected_verdict, expected_median):
    r = session.post(f"{BASE_URL}/api/public/price-check",
                     json={"service": service, "rate": rate}, timeout=20)
    assert r.status_code == 200, f"{service} {rate}: {r.status_code} {r.text}"
    data = r.json()

    assert data.get("median") == expected_median, data
    assert data.get("verdict") == expected_verdict, data
    assert "cap" not in data, f"Top-level 'cap' must be absent — got {list(data.keys())}"

    note = (data.get("caps_note") or "").lower()
    assert note, "caps_note missing from response"
    assert "deferred indefinitely" in note
    assert "may 2026" in note


# --------------------------------------------------------------------------- #
# /api/program-reference/public — policy_status.price_caps
# --------------------------------------------------------------------------- #
def test_program_reference_public_policy_status():
    r = requests.get(f"{BASE_URL}/api/program-reference/public", timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "policy_status" in data, f"missing policy_status: {list(data.keys())}"
    assert data["policy_status"].get("price_caps") == "deferred_indefinitely"


# --------------------------------------------------------------------------- #
# Mongo program_reference rows
# --------------------------------------------------------------------------- #
def test_mongo_price_caps_start_closed():
    assert MONGO_URL and DB_NAME, "MONGO_URL/DB_NAME missing from /app/backend/.env"
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    db = client[DB_NAME]
    rows = list(db.program_reference.find(
        {"key": "policy_date.price_caps_start"}, {"_id": 0}
    ))
    assert rows, "No policy_date.price_caps_start rows in program_reference"
    closed = [r for r in rows if r.get("effective_to") == "2026-05-19"]
    assert closed, f"No row closed at 2026-05-19. Rows: {rows}"


def test_mongo_price_caps_status_deferred():
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    db = client[DB_NAME]
    rows = list(db.program_reference.find(
        {"key": "policy.price_caps_status"}, {"_id": 0}
    ))
    assert rows, "No policy.price_caps_status row in program_reference"
    deferred_open = [r for r in rows
                     if r.get("value") == "deferred_indefinitely"
                     and r.get("effective_to") in (None, "", "null")]
    assert deferred_open, f"No open 'deferred_indefinitely' row. Rows: {rows}"


# --------------------------------------------------------------------------- #
# CMS — article titles + glossary phrasing
# --------------------------------------------------------------------------- #
def _fetch_articles():
    # Try a few likely endpoints; the test_credentials list doesn't pin one.
    for path in ("/api/public/cms/articles", "/api/cms/articles", "/api/articles"):
        r = requests.get(f"{BASE_URL}{path}", timeout=20)
        if r.status_code == 200:
            try:
                data = r.json()
            except Exception:
                continue
            items = (
                data.get("articles") if isinstance(data, dict) else None
            ) or (data.get("items") if isinstance(data, dict) else None) or (
                data if isinstance(data, list) else None
            )
            if isinstance(items, list) and items:
                return items, path
    return [], None


def test_cms_article_titles_updated():
    items, path = _fetch_articles()
    assert items, "No CMS articles returned from /api/cms/articles (or aliases)"
    by_slug = {it.get("slug"): it for it in items if isinstance(it, dict)}

    a = by_slug.get("support-at-home-price-caps-july-2026")
    assert a, f"Article 'support-at-home-price-caps-july-2026' missing (path={path})"
    title = (a.get("title") or "").lower()
    assert "deferred indefinitely" in title, f"Unexpected title: {a.get('title')}"

    b = by_slug.get("what-changes-for-hcp-families-july-2026")
    assert b, "Article 'what-changes-for-hcp-families-july-2026' missing"
    btitle = (b.get("title") or "").lower()
    assert "deferred" in btitle, f"Unexpected title: {b.get('title')}"


def test_cms_article_body_does_not_present_caps_as_live_event():
    # Fetch the single article by slug to ensure we have body_md
    r = requests.get(
        f"{BASE_URL}/api/public/cms/articles/support-at-home-price-caps-july-2026",
        timeout=20,
    )
    assert r.status_code == 200, r.text
    a = r.json()
    if isinstance(a, dict) and "article" in a:
        a = a["article"]
    body = (a.get("body") or a.get("content") or a.get("body_md") or a.get("body_markdown") or "").lower()
    assert body, f"Article body empty: keys={list(a.keys())}"
    # forbidden phrasings that present caps as a live upcoming event
    forbidden = [
        "price caps will commence on 1 july 2026",
        "price caps commence on 1 july 2026",
        "from 1 july 2026 price caps will",
    ]
    for phrase in forbidden:
        assert phrase not in body, f"Article still says: {phrase!r}"


# --------------------------------------------------------------------------- #
# Glossary 'Price cap' entry
# --------------------------------------------------------------------------- #
def test_glossary_price_cap_says_deferred():
    for path in ("/api/public/cms/glossary", "/api/cms/glossary", "/api/glossary"):
        r = requests.get(f"{BASE_URL}{path}", timeout=20)
        if r.status_code == 200:
            try:
                data = r.json()
            except Exception:
                continue
            items = (
                data.get("terms") if isinstance(data, dict) else None
            ) or (data.get("glossary") if isinstance(data, dict) else None
            ) or (data.get("items") if isinstance(data, dict) else None) or (
                data if isinstance(data, list) else None
            )
            if isinstance(items, list) and items:
                price_cap = next(
                    (it for it in items
                     if isinstance(it, dict)
                     and (it.get("term") or it.get("title") or "").lower() == "price cap"),
                    None,
                )
                if price_cap:
                    text = (
                        (price_cap.get("definition") or "")
                        + " " + (price_cap.get("body") or "")
                        + " " + (price_cap.get("description") or "")
                    ).lower()
                    assert "deferred indefinitely" in text, \
                        f"Glossary 'Price cap' missing 'deferred indefinitely': {price_cap}"
                    return
    pytest.skip("Glossary endpoint not found; main agent should expose /api/cms/glossary")
