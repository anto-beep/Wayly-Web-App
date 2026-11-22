"""FUNDTRACK-1 — canonical budget figure ladder.

Locked decision #2: one canonical figure ladder, computed once server-side,
rendered identically on every surface. Every budget surface (Today dashboard,
Budget Scenarios, Budget Calculator / BC-2, the Quarterly Budget report) reads
the SAME eight figures (A..H) from :func:`compute_ladder`. No surface recomputes
or renames a figure.
"""
from .ladder import (  # noqa: F401
    LADDER_LABELS,
    UNDERSPEND_MIN_ELAPSED,
    STATEMENT_CYCLE_DAYS,
    carryover_cap,
    compute_ladder,
)
