"""Wayly Scenario Engine — package init.

Phase 2 (this commit) introduces the lifecycle state machine, parallel flag
bag, and immutable per-participant state audit. Nothing here is yet wired
into alerts (Phase 4) or the statement decoder (Phase 6). The package is
purely model + guard + audit.
"""
