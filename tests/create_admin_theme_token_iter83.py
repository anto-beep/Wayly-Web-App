#!/usr/bin/env python3
"""Create a short-lived admin UI test token for iteration 83 browser checks."""

import json
from pathlib import Path

from admin_theme_bug_verification_iter83 import app_url, create_admin_token


OUT = Path("/app/test_reports/admin_theme_token_iter83.json")


if __name__ == "__main__":
    token, email = create_admin_token()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"token": token, "email": email, "base_url": app_url()}, indent=2))
    print(f"Wrote admin UI token for {email} to {OUT}")