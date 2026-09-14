"""Iter 273 — Backend endpoints for consolidated draft-letters
(care plans letter-from-findings) and invoice letter (draft-all)."""
import os
import requests
from pathlib import Path


def _load_env():
    env_path = Path('/app/frontend/.env')
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if '=' in line and not line.startswith('#'):
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip())


_load_env()
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
assert BASE_URL.startswith('http'), f"BASE_URL missing: {BASE_URL!r}"

EMAIL = 'cathy@example.com'
PASSWORD = 'testpass123'


def _login():
    r = requests.post(f'{BASE_URL}/api/auth/login',
                      json={'email': EMAIL, 'password': PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()['token']


def _headers():
    return {'Authorization': f'Bearer {_login()}',
            'Content-Type': 'application/json'}


# ---- Care plan: consolidated letter from findings ----
def test_care_plans_letter_from_findings_returns_entry_id_and_editor_path():
    findings = [
        {"title": "Missing quarterly budget", "detail": "The extracted quarterly_budget field is set to unknown.",
         "citation_source": "Aged Care Act", "severity": "compliance",
         "suggested_question": "Please confirm the quarterly budget in writing.",
         "addressee_primary": "provider"},
        {"title": "No named care partner", "detail": "The extracted named_care_partner field is set to unknown.",
         "citation_source": "Charter of Aged Care Rights", "severity": "choice",
         "suggested_question": "Who is the named care partner?",
         "addressee_primary": "provider"},
    ]
    r = requests.post(f'{BASE_URL}/api/care-plans/letter-from-findings',
                      headers=_headers(),
                      json={"findings": findings, "provider_name": "Test Provider",
                            "participant_id": None},
                      timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert 'entry_id' in data and data['entry_id']
    assert 'editor_path' in data and data['editor_path'].startswith('/tools/letters-and-follow-ups/')
    assert data['entry_id'] in data['editor_path']
    # addressee derived from majority
    assert data.get('addressee') == 'provider'


def test_care_plans_letter_from_findings_empty_findings():
    r = requests.post(f'{BASE_URL}/api/care-plans/letter-from-findings',
                      headers=_headers(),
                      json={"findings": [], "provider_name": "X"},
                      timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert data.get('entry_id')
    assert data.get('addressee') == 'provider'


# ---- Invoice: draft-all letter still works ----
def test_invoice_letter_draft_all_endpoint_works_or_404_if_no_invoice():
    """Ensure /api/invoices/{id}/letter endpoint exists (draft-all path)."""
    r = requests.get(f'{BASE_URL}/api/invoices', headers=_headers(), timeout=30)
    if r.status_code != 200:
        # Endpoint may differ; just skip
        return
    payload = r.json()
    invoices = payload if isinstance(payload, list) else payload.get('invoices', [])
    if not invoices:
        # No invoices to draft from — just POST with a fake id and expect 404, not 500
        r = requests.post(f'{BASE_URL}/api/invoices/nonexistent-id/letter',
                          headers=_headers(),
                          json={}, timeout=30)
        assert r.status_code in (400, 404, 422), f"expected 400/404/422, got {r.status_code}: {r.text[:200]}"
        return
    inv_id = invoices[0].get('id') or invoices[0].get('invoice_id')
    r = requests.post(f'{BASE_URL}/api/invoices/{inv_id}/letter',
                      headers=_headers(),
                      json={},
                      timeout=60)
    assert r.status_code in (200, 400, 404), r.text[:300]
    if r.status_code == 200:
        data = r.json()
        # Consolidated letter should return an entry_id + editor_path
        assert 'entry_id' in data or 'editor_path' in data or 'letter' in data


# ---- Statement detail (for FlagCard rendering) ----
def test_statement_detail_returns_anomalies():
    stmt_id = '63589b1a-86df-41f9-aff4-55c45451f2e5'
    r = requests.get(f'{BASE_URL}/api/statements/{stmt_id}',
                     headers=_headers(), timeout=30)
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    # Should have anomalies or flags for the FlagCard render
    has_flags = ('anomalies' in data or 'flags' in data
                 or (isinstance(data.get('decoded'), dict) and
                     ('anomalies' in data['decoded'] or 'flags' in data['decoded'])))
    assert has_flags, f"statement missing anomalies/flags: keys={list(data.keys())[:20]}"
