"""Iter257 — Stripe price selection must be mode-aware.

A live secret key (sk_live_*) must use the *_LIVE price ids; a test key must
use the base ids. Regression guard for the production checkout 502 caused by a
live key paired with a test-mode price id.
"""
import importlib
import os

import pytest


payments = importlib.import_module("routes.payments")


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    for k in [
        "STRIPE_API_KEY",
        "STRIPE_PRICE_ID_SOLO", "STRIPE_PRICE_ID_FAMILY", "STRIPE_PRICE_ID_ADDITIONAL",
        "STRIPE_PRICE_ID_SOLO_LIVE", "STRIPE_PRICE_ID_FAMILY_LIVE", "STRIPE_PRICE_ID_ADDITIONAL_LIVE",
    ]:
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("STRIPE_PRICE_ID_SOLO", "price_test_solo")
    monkeypatch.setenv("STRIPE_PRICE_ID_FAMILY", "price_test_family")
    monkeypatch.setenv("STRIPE_PRICE_ID_SOLO_LIVE", "price_live_solo")
    monkeypatch.setenv("STRIPE_PRICE_ID_FAMILY_LIVE", "price_live_family")


def test_test_key_uses_test_price(monkeypatch):
    monkeypatch.setenv("STRIPE_API_KEY", "sk_test_abc")
    assert payments._stripe_is_live() is False
    assert payments._price_for_plan("solo") == "price_test_solo"
    assert payments._price_for_plan("family") == "price_test_family"


def test_live_key_uses_live_price(monkeypatch):
    monkeypatch.setenv("STRIPE_API_KEY", "sk_live_abc")
    assert payments._stripe_is_live() is True
    assert payments._price_for_plan("solo") == "price_live_solo"
    assert payments._price_for_plan("family") == "price_live_family"


def test_live_key_falls_back_to_base_when_no_live_price(monkeypatch):
    monkeypatch.setenv("STRIPE_API_KEY", "sk_live_abc")
    monkeypatch.delenv("STRIPE_PRICE_ID_SOLO_LIVE", raising=False)
    # No _LIVE set → falls back to base id (so a partial config still resolves).
    assert payments._price_for_plan("solo") == "price_test_solo"


def test_plan_for_price_matches_both_modes(monkeypatch):
    monkeypatch.setenv("STRIPE_API_KEY", "sk_live_abc")
    assert payments._plan_for_price("price_live_family") == "family"
    assert payments._plan_for_price("price_test_family") == "family"
    assert payments._plan_for_price("price_unknown") is None


def test_webhook_secret_is_mode_aware(monkeypatch):
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_test_base")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET_LIVE", "whsec_live_val")
    # Test key → base secret
    monkeypatch.setenv("STRIPE_API_KEY", "sk_test_abc")
    assert payments._webhook_secret() == "whsec_test_base"
    # Live key → live secret
    monkeypatch.setenv("STRIPE_API_KEY", "sk_live_abc")
    assert payments._webhook_secret() == "whsec_live_val"
    # Live key but no _LIVE set → falls back to base
    monkeypatch.delenv("STRIPE_WEBHOOK_SECRET_LIVE", raising=False)
    assert payments._webhook_secret() == "whsec_test_base"
