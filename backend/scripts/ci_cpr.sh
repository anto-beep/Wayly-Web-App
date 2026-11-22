#!/usr/bin/env bash
# CPR-FINDINGS-UX-1 v2 · Workstream A CI gate. Runs the CPR-ERR-A golden fixture
# (anti-fabrication + verification panel + registry/banned-rule assertions).
# A non-zero exit blocks the cpr_ux_v2 flag flip.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== CPR-FINDINGS-UX-1 v2 CI: Workstream A golden fixture =="
python -m pytest \
  tests/test_cpr_err_a_golden.py \
  -q
