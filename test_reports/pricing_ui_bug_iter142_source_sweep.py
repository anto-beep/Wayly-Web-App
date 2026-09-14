#!/usr/bin/env python3
from pathlib import Path
TERMS = ["Billed monthly", "$19/month", "$19 per month"]
ROOT = Path("/app/frontend/src")
SUFFIXES = {".js", ".jsx", ".ts", ".tsx", ".json", ".html"}
for term in TERMS:
    print(f"TERM {term!r}")
    count = 0
    for p in sorted(ROOT.rglob("*")):
        if not p.is_file() or p.suffix not in SUFFIXES:
            continue
        try:
            lines = p.read_text(errors="ignore").splitlines()
        except Exception:
            continue
        for i, line in enumerate(lines, 1):
            if term in line:
                count += 1
                print(f"{p}:{i}: {line.strip()}")
    print(f"TOTAL {count}\n")
