"""CSC-1 (Classification Self-Check) library.

Modules:
  - registry: loads thresholds / vignettes / iat_domains from data/csc/*.yaml
  - scoring:  domain-weighted composite score + vignette-anchored confidence
  - schema:   Pydantic models for the csc.payload.v1 shareable output

Called from routes/csc.py. Nothing here reaches into server.py.
"""
