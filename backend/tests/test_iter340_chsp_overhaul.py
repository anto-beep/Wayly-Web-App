"""iter340: CHSP Tools overhaul — Fee Check plain-English, save de-dupe, per-person history, trends, overcharge letter."""
import os
import requests
import pytest

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://final-verify-web.preview.emergentagent.com').rstrip('/')
EMAIL = 'peter@test.com'
PASSWORD = 'Peter!2026'
PARTICIPANT_ID = '34f9a7f9-08d5-4358-b773-e443f1f11985'


@pytest.fixture(scope='module')
def token():
    r = requests.post(f'{BASE_URL}/api/auth/login', json={'email': EMAIL, 'password': PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json().get('access_token') or r.json().get('token')


@pytest.fixture(scope='module')
def auth(token):
    return {'Authorization': f'Bearer {token}'}


# --- Fee Check preview: plain-English fields ---
def test_fee_check_preview_material_overcharge(auth):
    payload = {
        'agreed_rate': 6.0,
        'units_billed': 4,
        'units_received': 4,
        'billed_amount': 40.0,
        'service_type': 'domestic_assistance',
    }
    r = requests.post(f'{BASE_URL}/api/chsp1/fee-check/preview', json=payload, headers=auth, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    print('preview response keys:', list(body.keys()))
    d = body.get('result', body)
    assert d.get('overall_verdict') == 'material', d
    for k in ['verdict_headline', 'verdict_explanation', 'rate_tier_label', 'rate_explanation',
              'units_tier_label', 'units_explanation', 'action_label']:
        assert k in d, f'missing {k}: {d}'
    assert 'overcharged' in d['verdict_headline'].lower(), d['verdict_headline']
    # amount_delta = 40 - (6*4) = 16
    assert abs(float(d.get('amount_delta', 0)) - 16.0) < 0.01, d.get('amount_delta')
    assert d['rate_tier_label'].lower() in ('too high', 'high'), d['rate_tier_label']
    assert 'right' in d['units_tier_label'].lower(), d['units_tier_label']


# --- Save + de-dupe ---
def test_save_dedupe_and_force(auth):
    inv = {
        'participant_id': PARTICIPANT_ID,
        'header': {
            'provider_name': 'TEST_DedupeProvider',
            'invoice_reference': 'TEST-DUP-001',
            'invoice_date': '2026-07-05',
            'period_start': '2026-07-01',
            'period_end': '2026-07-31',
        },
        'line_items': [{'service_type': 'domestic_assistance', 'units': 2, 'unit_rate': 55.0, 'amount': 110.0}],
        'totals': {'grand_total': 110.0, 'client_contribution': 20.0, 'government_subsidy': 90.0},
        'force': False,
    }
    # Pre-cleanup: remove any prior TEST_DedupeProvider invoices (from previous runs)
    listing0 = requests.get(f'{BASE_URL}/api/chsp1/invoices', headers=auth, timeout=30).json()
    prior = listing0.get('invoices', listing0) if isinstance(listing0, dict) else listing0
    for inv_ in prior or []:
        if isinstance(inv_, dict) and inv_.get('provider_name') == 'TEST_DedupeProvider':
            requests.delete(f"{BASE_URL}/api/chsp1/invoices/{inv_.get('id')}", headers=auth, timeout=15)
    # First save
    r1 = requests.post(f'{BASE_URL}/api/chsp1/invoice/save', json=inv, headers=auth, timeout=30)
    assert r1.status_code == 200, r1.text
    d1 = r1.json()
    saved_id = d1.get('id') or (d1.get('invoice') or {}).get('id')
    print('first save:', d1)
    assert saved_id or d1.get('saved'), d1

    # Second identical save (force=false) → duplicate:true, no new record
    r2 = requests.post(f'{BASE_URL}/api/chsp1/invoice/save', json=inv, headers=auth, timeout=30)
    assert r2.status_code == 200, r2.text
    d2 = r2.json()
    print('dup save:', d2)
    assert d2.get('duplicate') is True, d2
    assert 'existing' in d2, d2

    # Force save creates new
    inv2 = dict(inv); inv2['force'] = True
    r3 = requests.post(f'{BASE_URL}/api/chsp1/invoice/save', json=inv2, headers=auth, timeout=30)
    assert r3.status_code == 200, r3.text
    d3 = r3.json()
    print('force save:', d3)
    assert not d3.get('duplicate'), d3

    # Cleanup: delete any TEST_ invoices
    listing = requests.get(f'{BASE_URL}/api/chsp1/invoices', headers=auth, timeout=30).json()
    invoices = listing.get('invoices', listing) if isinstance(listing, dict) else listing
    for inv_ in invoices or []:
        if isinstance(inv_, dict) and inv_.get('provider_name') == 'TEST_DedupeProvider':
            requests.delete(f"{BASE_URL}/api/chsp1/invoices/{inv_.get('id')}", headers=auth, timeout=15)


# --- Per-person invoice history ---
def test_invoices_scoped_by_participant(auth):
    r = requests.get(f'{BASE_URL}/api/chsp1/invoices', headers=auth,
                     params={'participant_id': PARTICIPANT_ID}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    invoices = d.get('invoices', d) if isinstance(d, dict) else d
    print(f'invoices for participant {PARTICIPANT_ID}: {len(invoices) if invoices else 0}')
    assert isinstance(invoices, list)
    # invalid participant should return empty
    r2 = requests.get(f'{BASE_URL}/api/chsp1/invoices', headers=auth,
                      params={'participant_id': 'nonexistent-participant-zzz'}, timeout=30)
    assert r2.status_code == 200, r2.text
    d2 = r2.json()
    inv2 = d2.get('invoices', d2) if isinstance(d2, dict) else d2
    assert inv2 == [] or inv2 is None or len(inv2) == 0, inv2


# --- Trends ---
def test_invoice_trends(auth):
    r = requests.get(f'{BASE_URL}/api/chsp1/invoice-trends', headers=auth,
                     params={'participant_id': PARTICIPANT_ID}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    print('trends:', d)
    assert 'trends' in d, d
    assert isinstance(d['trends'], list)
    if d['trends']:
        t = d['trends'][0]
        for k in ['month', 'contribution', 'total', 'count']:
            assert k in t, f'trend row missing {k}: {t}'


# --- Overcharge letter ---
def test_overcharge_letter_generation(auth):
    payload = {
        'provider_name': 'Sunshine Community Care Pty Ltd',
        'agreed_rate': 6.0,
        'billed_rate': 10.0,
        'billed_amount': 40.0,
        'expected_amount': 24.0,
        'service_type': 'domestic_assistance',
        'units_billed': 4,
        'invoice_reference': 'SCC-20260731-0412',
    }
    r = requests.post(f'{BASE_URL}/api/chsp1/overcharge-letter', json=payload, headers=auth, timeout=90)
    assert r.status_code == 200, r.text
    d = r.json()
    assert 'letter' in d, d
    letter = d['letter']
    assert isinstance(letter, str) and len(letter) > 100, f'letter too short: {letter!r}'
    print('letter first 300 chars:', letter[:300])
    # Should reference key facts
    low = letter.lower()
    assert 'sunshine' in low or 'provider' in low
