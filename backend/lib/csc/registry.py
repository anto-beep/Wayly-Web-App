"""CSC-1 file-backed registry (INDEX-1 adjacent).

Loads and caches the three data files that CSC-1 needs:

  - ``data/csc/thresholds.yaml``   composite → primary mapping, domain weights,
                                    confidence policy
  - ``data/csc/vignettes.yaml``    eight reference vectors (C1..C8) for
                                    confidence distance
  - ``data/csc/iat_domains.yaml``  "What the assessor will ask" table

These live in the file system rather than the ``program_reference`` Mongo
registry because they are Wayly-defined calibration data, not statutory
figures. When the ``program_reference`` allowlist gains a ``csc.`` prefix in
a later iteration these functions become thin shims over ``get_value``.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List

import yaml

_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "csc"


def _load(name: str) -> Dict[str, Any]:
    path = _DATA_DIR / name
    with path.open("r", encoding="utf-8") as fh:
        return yaml.safe_load(fh)


@lru_cache(maxsize=1)
def load_thresholds() -> Dict[str, Any]:
    return _load("thresholds.yaml")


@lru_cache(maxsize=1)
def load_vignettes() -> Dict[str, Any]:
    return _load("vignettes.yaml")


@lru_cache(maxsize=1)
def load_iat_domains() -> Dict[str, Any]:
    return _load("iat_domains.yaml")


def budget_source_version() -> str:
    """String surfaced in the CSC payload's ``budget_source_version`` field
    and in the PDF footer. Version-locks the INDEX-1 snapshot used."""
    return "index-1-schedule-v2-2025-11"


def clear_cache() -> None:
    """Testing hook, allows a test to reload the YAML files after mutation."""
    load_thresholds.cache_clear()
    load_vignettes.cache_clear()
    load_iat_domains.cache_clear()
