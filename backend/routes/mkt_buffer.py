"""Wayly Social OS — Phase 3: Buffer integration (attach media + schedule).

Server-side Buffer GraphQL client (https://api.buffer.com). Operates ONLY on the
founder's EXISTING Buffer drafts — it NEVER creates new posts. It:

  * verifies the connected organisation + channels against the known allow-list,
  * lists existing drafts / scheduled posts,
  * matches a campaign's APPROVED marketing assets (ordered carousels) to a draft,
  * validates every public media URL is reachable before any write,
  * attaches media + optionally schedules (Australia/Sydney) via `editPost`,
  * reads the post back to verify the result, and records an idempotent job log.

Writes default to dry-run; a real Buffer write happens only when `dry_run=false`.
Mounted at /api/mkt/buffer/*. All routes require super_admin/operations_admin.
"""
from __future__ import annotations

import os
import json
import uuid
import asyncio
import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from typing import Optional, List, Dict, Any

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from admin_auth import require_super_or_ops
from routes.mkt1 import db, _slug, _now, _public_url, _thumb_url, _audit, PLATFORMS

logger = logging.getLogger(__name__)

BUFFER_API_URL = (os.environ.get("BUFFER_API_URL") or "https://api.buffer.com").rstrip("/")
ORG_ID = os.environ.get("BUFFER_ORGANIZATION_ID") or "6a2173643e3610b5593de3f6"
SYDNEY = ZoneInfo("Australia/Sydney")

# Founder-supplied connected channels (verified live before any write).
EXPECTED_CHANNELS: Dict[str, str] = {
    "facebook": os.environ.get("BUFFER_FACEBOOK_CHANNEL_ID") or "6a218d81c687a22dd45db600",
    "instagram": os.environ.get("BUFFER_INSTAGRAM_CHANNEL_ID") or "6a27fde78f1d11f9b269aaef",
    "linkedin": os.environ.get("BUFFER_LINKEDIN_CHANNEL_ID") or "6a2800588f1d11f9b269b3ed",
}
POST_SERVICES = {"facebook", "instagram", "linkedin"}
DRAFT_STATUSES = {"draft", "scheduled", "sent", "sentFailed", "needsApproval"}

# ------------------------------------------------------------------ GraphQL ops
Q_CHANNELS = "query($o:OrganizationId!){channels(input:{organizationId:$o}){id name service}}"

Q_POSTS = ("query($o:OrganizationId!,$a:String){posts(first:100,after:$a,input:{organizationId:$o,"
           " filter:{status:[%s]}}){edges{node{id text status channelId channelService"
           " dueAt createdAt assets{__typename}}}pageInfo{hasNextPage endCursor}}}")

MAX_POSTS = 2000  # safety cap for full pagination

Q_POST = ("query($id:PostId!){post(input:{id:$id}){id text status channelId"
          " channelService dueAt assets{__typename}}}")

M_EDIT = ("mutation($input:EditPostInput!){editPost(input:$input){__typename"
          " ... on PostActionSuccess{post{id status dueAt channelService assets{__typename}}}"
          " ... on NotFoundError{message}"
          " ... on UnauthorizedError{message}"
          " ... on UnexpectedError{message}"
          " ... on RestProxyError{message}"
          " ... on LimitReachedError{message}"
          " ... on InvalidInputError{message}}}")


def _token() -> str:
    tok = os.environ.get("BUFFER_API_TOKEN")
    if not tok:
        raise HTTPException(503, "Buffer is not configured (missing BUFFER_API_TOKEN)")
    return tok


def _gql_sync(query: str, variables: dict, token: str) -> dict:
    resp = requests.post(
        BUFFER_API_URL,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        data=json.dumps({"query": query, "variables": variables}),
        timeout=40,
    )
    if resp.status_code == 401:
        raise HTTPException(502, "Buffer rejected the access token (401)")
    try:
        body = resp.json()
    except Exception:
        raise HTTPException(502, f"Buffer returned a non-JSON response ({resp.status_code})")
    if body.get("errors"):
        msg = "; ".join(e.get("message", "unknown") for e in body["errors"])[:400]
        raise HTTPException(502, f"Buffer API error: {msg}")
    return body.get("data") or {}


async def _gql(query: str, variables: dict) -> dict:
    return await asyncio.to_thread(_gql_sync, query, variables, _token())


def _check_url_sync(url: str) -> dict:
    """Unauthenticated reachability check of a public media URL (as Buffer sees it)."""
    out = {"url": url, "ok": False, "status": None, "content_type": None}
    try:
        r = requests.get(url, timeout=25, stream=True)
        out["status"] = r.status_code
        out["content_type"] = r.headers.get("Content-Type")
        out["ok"] = r.status_code == 200
        r.close()
    except Exception as e:
        out["error"] = str(e)[:200]
    return out


async def _validate_media(matched: List[dict]) -> List[dict]:
    """Check every media URL + any document/video cover thumbnail is publicly reachable."""
    urls: List[str] = []
    for m in matched:
        urls.append(m["media_url"])
        if m.get("thumbnail_url"):
            urls.append(m["thumbnail_url"])
    if not urls:
        return []
    return list(await asyncio.gather(*[asyncio.to_thread(_check_url_sync, u) for u in urls]))


def _to_utc(local_str: str) -> str:
    """Interpret a naive 'YYYY-MM-DDTHH:MM[:SS]' as Australia/Sydney -> UTC Z."""
    try:
        dt = datetime.fromisoformat(local_str)
    except ValueError:
        raise HTTPException(400, "due_at_local must be ISO like 2026-06-20T09:00")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=SYDNEY)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _asset_input(a: dict) -> Optional[dict]:
    url = _public_url(a)
    t = a.get("asset_type")
    if t == "image":
        img: Dict[str, Any] = {"url": url}
        if a.get("alt_text"):
            img["metadata"] = {"altText": a["alt_text"]}
        return {"image": img}
    if t == "video":
        vid: Dict[str, Any] = {"url": url}
        thumb = _thumb_url(a)
        if thumb:
            vid["thumbnailUrl"] = thumb
        return {"video": vid}
    if t == "document":
        thumb = _thumb_url(a)
        if not thumb:
            return None  # LinkedIn document needs a cover thumbnail
        title = (a.get("content_topic") or a.get("filename") or "Wayly")[:200]
        return {"document": {"url": url, "thumbnailUrl": thumb, "title": title}}
    return None


# ------------------------------------------------------------------- models
class PlanIn(BaseModel):
    buffer_post_id: str = Field(min_length=1)
    campaign_id: str = Field(min_length=1)
    platform: Optional[str] = None            # override; defaults to the draft's service
    due_at_local: Optional[str] = None        # Australia/Sydney local time


class AttachIn(PlanIn):
    dry_run: bool = True
    idempotency_key: Optional[str] = None
    force: bool = False


class RecoverExecIn(BaseModel):
    dry_run: bool = True
    buffer_post_ids: Optional[List[str]] = None
    force: bool = False


def build_mkt_buffer_router() -> APIRouter:
    router = APIRouter(prefix="/mkt/buffer", tags=["social-os-buffer"])

    # ----------------------------------------------------------- connection
    @router.get("/status")
    async def status(admin: dict = Depends(require_super_or_ops)):
        if not os.environ.get("BUFFER_API_TOKEN"):
            return {"configured": False, "organization_id": ORG_ID, "channels": [],
                    "expected_channels": EXPECTED_CHANNELS}
        data = await _gql(Q_CHANNELS, {"o": ORG_ID})
        live = {c["id"]: c for c in (data.get("channels") or [])}
        channels = []
        for svc, cid in EXPECTED_CHANNELS.items():
            c = live.get(cid)
            channels.append({
                "service": svc, "expected_id": cid,
                "connected": bool(c), "live_name": (c or {}).get("name"),
                "live_service": (c or {}).get("service"),
                "matches": bool(c) and (c.get("service", "").lower() == svc),
            })
        # also surface any other live channels not in our allow-list
        extras = [{"service": c.get("service"), "id": c.get("id"), "name": c.get("name")}
                  for c in (data.get("channels") or []) if c["id"] not in set(EXPECTED_CHANNELS.values())]
        return {
            "configured": True, "organization_id": ORG_ID,
            "org_verified": len(data.get("channels") or []) > 0,
            "channels": channels, "other_channels": extras,
        }

    # ----------------------------------------------------------- list drafts
    async def _fetch_all_posts(status: str) -> List[dict]:
        """Cursor-paginate the ENTIRE post set for a status (never just page 1)."""
        out: List[dict] = []
        cursor = None
        while True:
            data = await _gql(Q_POSTS % status, {"o": ORG_ID, "a": cursor})
            conn = data.get("posts") or {}
            for edge in conn.get("edges") or []:
                n = edge.get("node")
                if n:
                    out.append(n)
            page = conn.get("pageInfo") or {}
            if page.get("hasNextPage") and page.get("endCursor") and len(out) < MAX_POSTS:
                cursor = page["endCursor"]
            else:
                break
        return out

    def _norm_post(n: dict) -> dict:
        return {
            "id": n["id"],
            "text": (n.get("text") or "").strip()[:280],
            "status": n.get("status"),
            "service": n.get("channelService"),
            "channel_id": n.get("channelId"),
            "due_at": n.get("dueAt"),
            "created_at": n.get("createdAt"),
            "asset_count": len(n.get("assets") or []),
        }

    @router.get("/drafts")
    async def drafts(status: str = Query("draft"), channel: Optional[str] = None,
                     created_after: Optional[str] = None,
                     admin: dict = Depends(require_super_or_ops)):
        if status not in DRAFT_STATUSES:
            raise HTTPException(400, f"Invalid status. Allowed: {', '.join(sorted(DRAFT_STATUSES))}")
        if channel and channel not in POST_SERVICES:
            raise HTTPException(400, f"Invalid channel. Allowed: {', '.join(sorted(POST_SERVICES))}")
        known = set(EXPECTED_CHANNELS.values())
        rows = []
        by_service: Dict[str, int] = {}
        for n in await _fetch_all_posts(status):
            if n.get("channelId") not in known:
                continue
            svc = n.get("channelService")
            if channel and svc != channel:
                continue
            if created_after and (n.get("createdAt") or "") < created_after:
                continue
            by_service[svc] = by_service.get(svc, 0) + 1
            rows.append(_norm_post(n))
        rows.sort(key=lambda r: r.get("created_at") or "", reverse=True)
        return {"status": status, "count": len(rows), "by_service": by_service, "drafts": rows}

    # ----------------------------------------------------------- resolve plan
    async def _resolve(body: PlanIn) -> dict:
        # 1) read the existing draft back from Buffer (never create one)
        data = await _gql(Q_POST, {"id": body.buffer_post_id})
        draft = data.get("post")
        if not draft:
            raise HTTPException(404, "Buffer post not found (only existing drafts can be used)")
        if draft.get("channelId") not in set(EXPECTED_CHANNELS.values()):
            raise HTTPException(400, "That Buffer post is on a channel outside the configured allow-list")

        platform = (body.platform or draft.get("channelService") or "").lower()
        if platform not in POST_SERVICES:
            raise HTTPException(400, f"Unsupported platform '{platform}'")

        # 2) gather approved assets for this campaign + platform, carousel order
        cid = _slug(body.campaign_id)
        flt = {"is_deleted": {"$ne": True}, "approval_status": "approved",
               "campaign_id": cid, "target_platform": {"$in": [platform, "all"]}}
        assets = await db.mkt_assets.find(flt).sort(
            [("carousel_order", 1), ("created_at", 1)]).to_list(100)

        warnings: List[str] = []
        asset_inputs: List[dict] = []
        matched: List[dict] = []
        for a in assets:
            ai = _asset_input(a)
            if ai is None:
                warnings.append(f"Skipped '{a.get('filename')}' — document needs a cover thumbnail")
                continue
            asset_inputs.append(ai)
            matched.append({
                "asset_id": a["id"], "filename": a.get("filename"),
                "asset_type": a.get("asset_type"), "carousel_order": a.get("carousel_order", 0),
                "media_url": _public_url(a), "thumbnail_url": _thumb_url(a), "alt_text": a.get("alt_text", ""),
            })

        if not asset_inputs:
            warnings.append("No attachable approved assets matched this campaign + platform")

        # 3) validate every media URL (and any cover thumbnail) is publicly reachable
        checks = await _validate_media(matched)
        media_ok = all(c["ok"] for c in checks) if checks else True

        # 4) build the exact editPost input
        due_utc = _to_utc(body.due_at_local) if body.due_at_local else None
        buffer_input: Dict[str, Any] = {"id": body.buffer_post_id, "assets": asset_inputs}
        if due_utc:
            buffer_input.update({"mode": "customScheduled", "schedulingType": "automatic",
                                 "dueAt": due_utc, "saveToDraft": False})
            schedule_label = f"Schedule {due_utc} (from {body.due_at_local} Australia/Sydney)"
        else:
            buffer_input["saveToDraft"] = True
            schedule_label = "Attach media only (keep as draft)"

        return {
            "buffer_post_id": body.buffer_post_id,
            "draft": {"id": draft["id"], "service": draft.get("channelService"),
                      "status": draft.get("status"), "current_asset_count": len(draft.get("assets") or []),
                      "text": (draft.get("text") or "")[:280]},
            "campaign_id": cid, "platform": platform,
            "matched_assets": matched, "asset_count": len(asset_inputs),
            "media_validation": checks, "media_ok": media_ok,
            "schedule": schedule_label, "due_at_utc": due_utc,
            "buffer_input": buffer_input, "warnings": warnings,
        }

    async def _write_resolved(resolved: dict, admin: dict,
                              idempotency_key: Optional[str] = None, force: bool = False) -> dict:
        """Perform the live editPost on an EXISTING draft, verify, and record. Never creates a post."""
        post_id = resolved["buffer_input"]["id"]
        if resolved["asset_count"] == 0:
            raise HTTPException(400, "Nothing to attach — no approved assets matched")
        if not resolved["media_ok"]:
            raise HTTPException(400, "One or more media URLs are not publicly reachable; aborting write")
        asset_ids = sorted(m["asset_id"] for m in resolved["matched_assets"])

        if idempotency_key:
            prior = await db.mkt_buffer_jobs.find_one({"idempotency_key": idempotency_key, "result": "success"})
            if prior and not force:
                prior.pop("_id", None)
                return {"idempotent": True, "result": "success", **prior}
        if not force:
            dup = await db.mkt_buffer_jobs.find_one({
                "buffer_post_id": post_id, "asset_ids": asset_ids,
                "due_at_utc": resolved["due_at_utc"], "result": "success"})
            if dup:
                dup.pop("_id", None)
                return {"idempotent": True, "result": "success", **dup}

        job_id = str(uuid.uuid4())
        data = await _gql(M_EDIT, {"input": resolved["buffer_input"]})
        payload = data.get("editPost") or {}
        typename = payload.get("__typename")
        if typename != "PostActionSuccess":
            err = payload.get("message") or f"Buffer returned {typename}"
            await db.mkt_buffer_jobs.insert_one({
                "id": job_id, "buffer_post_id": post_id,
                "campaign_id": resolved.get("campaign_id"), "platform": resolved.get("platform"),
                "asset_ids": asset_ids, "asset_count": resolved["asset_count"],
                "due_at_utc": resolved["due_at_utc"], "result": "error",
                "error_message": err, "buffer_typename": typename,
                "idempotency_key": idempotency_key, "actor_email": admin.get("email"),
                "created_at": _now(),
            })
            await _audit("buffer_post", post_id, "attach_failed", admin, {"error": err})
            raise HTTPException(502, f"Buffer rejected the update: {err}")

        verify = (await _gql(Q_POST, {"id": post_id})).get("post") or {}
        verified_count = len(verify.get("assets") or [])
        new_pub = "scheduled" if resolved["due_at_utc"] else "unpublished"
        await db.mkt_assets.update_many(
            {"id": {"$in": asset_ids}},
            {"$set": {"publication_status": new_pub, "buffer_post_id": post_id, "updated_at": _now()}})

        job = {
            "id": job_id, "buffer_post_id": post_id,
            "campaign_id": resolved.get("campaign_id"), "platform": resolved.get("platform"),
            "asset_ids": asset_ids, "asset_count": resolved["asset_count"],
            "verified_asset_count": verified_count,
            "due_at_utc": resolved["due_at_utc"], "buffer_status": verify.get("status"),
            "result": "success", "idempotency_key": idempotency_key,
            "actor_email": admin.get("email"), "created_at": _now(),
        }
        await db.mkt_buffer_jobs.insert_one(dict(job))
        await _audit("buffer_post", post_id, "attach", admin,
                     {"assets": resolved["asset_count"], "scheduled": bool(resolved["due_at_utc"])})
        return {"result": "success",
                "verify": {"status": verify.get("status"), "asset_count": verified_count,
                           "due_at": verify.get("dueAt")},
                **{k: job[k] for k in ("id", "buffer_post_id", "campaign_id", "platform",
                                       "asset_count", "due_at_utc")}}

    @router.post("/plan")
    async def plan(body: PlanIn, admin: dict = Depends(require_super_or_ops)):
        return {"dry_run": True, **await _resolve(body)}

    # ----------------------------------------------------------- attach/schedule
    @router.post("/attach")
    async def attach(body: AttachIn, admin: dict = Depends(require_super_or_ops)):
        resolved = await _resolve(body)
        if body.dry_run:
            return {"dry_run": True, "would_write": True, **resolved}
        res = await _write_resolved(resolved, admin, body.idempotency_key, body.force)
        return {"dry_run": False, **res}

    # ----------------------------------------------------------- bulk recovery
    async def _resolve_by_draft(post_id: str) -> dict:
        """Build an attach plan for a draft from assets EXPLICITLY linked via buffer_draft_id."""
        draft = (await _gql(Q_POST, {"id": post_id})).get("post")
        if not draft:
            raise HTTPException(404, "Buffer post not found")
        platform = (draft.get("channelService") or "").lower()
        assets = await db.mkt_assets.find(
            {"is_deleted": {"$ne": True}, "approval_status": "approved", "buffer_draft_id": post_id}
        ).sort([("carousel_order", 1), ("created_at", 1)]).to_list(100)
        warnings: List[str] = []
        asset_inputs: List[dict] = []
        matched: List[dict] = []
        for a in assets:
            ai = _asset_input(a)
            if ai is None:
                warnings.append(f"Skipped '{a.get('filename')}' — document needs a cover thumbnail")
                continue
            asset_inputs.append(ai)
            matched.append({"asset_id": a["id"], "filename": a.get("filename"),
                            "asset_type": a.get("asset_type"), "carousel_order": a.get("carousel_order", 0),
                            "media_url": _public_url(a), "thumbnail_url": _thumb_url(a), "alt_text": a.get("alt_text", "")})
        checks = await _validate_media(matched)
        media_ok = all(c["ok"] for c in checks) if checks else True
        # recovery attaches media only — scheduling stays disabled until acceptance tests pass
        buffer_input = {"id": post_id, "assets": asset_inputs, "saveToDraft": True}
        return {
            "buffer_post_id": post_id, "campaign_id": None, "platform": platform,
            "draft": {"id": post_id, "service": platform, "status": draft.get("status"),
                      "current_asset_count": len(draft.get("assets") or []),
                      "text": (draft.get("text") or "")[:280]},
            "matched_assets": matched, "asset_count": len(asset_inputs),
            "media_validation": checks, "media_ok": media_ok,
            "schedule": "Attach media only (scheduling disabled)", "due_at_utc": None,
            "buffer_input": buffer_input, "warnings": warnings,
        }

    async def _linked_draft_ids() -> List[str]:
        ids = await db.mkt_assets.distinct("buffer_draft_id", {
            "is_deleted": {"$ne": True}, "approval_status": "approved",
            "buffer_draft_id": {"$ne": None}})
        return [i for i in ids if i]

    @router.get("/recover/plan")
    async def recover_plan(admin: dict = Depends(require_super_or_ops)):
        ids = await _linked_draft_ids()
        plans = []
        for pid in ids[:100]:
            try:
                plans.append(await _resolve_by_draft(pid))
            except HTTPException as e:
                plans.append({"buffer_post_id": pid, "error": e.detail, "asset_count": 0, "media_ok": False})
        ready = sum(1 for p in plans if p.get("asset_count") and p.get("media_ok"))
        return {"linked_draft_count": len(ids), "ready": ready,
                "blocked": len(plans) - ready, "plans": plans}

    @router.post("/recover/execute")
    async def recover_execute(body: RecoverExecIn, admin: dict = Depends(require_super_or_ops)):
        ids = body.buffer_post_ids or await _linked_draft_ids()
        results = []
        for pid in ids:
            try:
                resolved = await _resolve_by_draft(pid)
                if not resolved["asset_count"]:
                    results.append({"buffer_post_id": pid, "status": "skipped", "reason": "no ready assets"})
                    continue
                if body.dry_run:
                    results.append({"buffer_post_id": pid, "status": "dry_run",
                                    "asset_count": resolved["asset_count"], "media_ok": resolved["media_ok"]})
                    continue
                if not resolved["media_ok"]:
                    results.append({"buffer_post_id": pid, "status": "blocked", "reason": "media not reachable"})
                    continue
                r = await _write_resolved(resolved, admin, idempotency_key=f"recover:{pid}", force=body.force)
                results.append({"buffer_post_id": pid, "status": "attached",
                                "verified": r.get("verify"), "idempotent": r.get("idempotent", False)})
            except HTTPException as e:
                results.append({"buffer_post_id": pid, "status": "error", "reason": e.detail})
        return {"dry_run": body.dry_run, "count": len(results), "results": results}

    # ----------------------------------------------------------- job history
    @router.get("/jobs")
    async def jobs(limit: int = Query(100, le=500), admin: dict = Depends(require_super_or_ops)):
        rows = await db.mkt_buffer_jobs.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
        return {"count": len(rows), "jobs": rows}

    return router
