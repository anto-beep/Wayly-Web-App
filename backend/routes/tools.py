"""INV-1 v1.2 WS16 · Tool Registry HTTP surface.

`GET /api/tools`         → the full registry, filtered to `active: true`.
`GET /api/tools/{slug}`  → one entry, 404 if unknown.

The registry is authored in ``backend/data/tool_registry.yaml`` and is the
canonical source of truth for every tool surface in the product. The
frontend has a mirror at ``frontend/src/config/toolRegistry.js`` for
build-time consumption; a build-time consistency check
(``scripts/tool-registry-check.js``) fails CI if the two drift.

No auth is required, the registry is public metadata (tool names,
routes, icons) and is consumed by anonymous surfaces (marketing site,
mobile app tool listing).
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml
from fastapi import APIRouter, HTTPException

logger = logging.getLogger("wayly.tool_registry")

_REGISTRY_PATH = Path(__file__).parent.parent / "data" / "tool_registry.yaml"
_CACHED: Optional[Dict[str, Any]] = None


def _load() -> Dict[str, Any]:
    """Load and cache the registry. Fail fast on parse errors."""
    global _CACHED
    if _CACHED is not None:
        return _CACHED
    with _REGISTRY_PATH.open("r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh)
    if not isinstance(data, dict) or "tools" not in data:
        raise RuntimeError(
            f"tool_registry.yaml missing 'tools' key: {_REGISTRY_PATH}"
        )
    _CACHED = data
    return data


def list_active_tools() -> List[Dict[str, Any]]:
    """Return every active tool, sorted by ``order`` ascending.

    Public helper so other modules can compute the canonical tool count
    without going through the HTTP layer.
    """
    tools = [t for t in _load().get("tools", []) if t.get("active", True)]
    return sorted(tools, key=lambda t: t.get("order", 999))


def canonical_tool_count() -> int:
    """The number Wayly shows publicly. Nine as of INV-1 v1.2."""
    return len(list_active_tools())


def build_tools_router() -> APIRouter:
    router = APIRouter(tags=["tools"])

    @router.get("/tools")
    async def get_tools() -> Dict[str, Any]:
        tools = list_active_tools()
        return {
            "version": _load().get("version", "1.0"),
            "count": len(tools),
            "tools": tools,
        }

    @router.get("/tools/{slug}")
    async def get_tool(slug: str) -> Dict[str, Any]:
        for t in list_active_tools():
            if t["slug"] == slug:
                return t
        raise HTTPException(status_code=404, detail=f"tool not found: {slug}")

    return router
