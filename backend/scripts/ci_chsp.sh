#!/usr/bin/env bash
# WS-6 · CHSP-TOOLS-1 CI gate. Runs the golden fixture suite + the WS-1 API
# tests. A non-zero exit blocks the chsp_tools_v1 flag flip.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== CHSP-TOOLS-1 CI: WS-1 golden fixtures + API =="
python -m pytest \
  tests/test_chsp_fee_check_golden.py \
  tests/test_chsp_tools_v1_api.py \
  -q
