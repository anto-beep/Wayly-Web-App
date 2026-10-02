"""Participant Contacts, UI-1 §8.

A lightweight per-participant rolodex: GPs, allied health, advocates, family,
neighbours, anyone who matters in the participant's care circle. Lives in a
side panel on the participant view. Backed by Mongo `participant_contacts`.
"""
from __future__ import annotations
import os
import secrets
from datetime import datetime, timezone
from typing import Optional, Literal

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _strip(d):
    if d:
        d.pop("_id", None)
    return d


CONTACT_KIND = (
    "emergency", "gp", "specialist", "care_manager", "provider_coordinator",
    "allied_health", "pharmacist", "family", "friend", "neighbour",
    "advocate", "other",
)


class ContactBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kind: Literal[
        "emergency", "gp", "specialist", "care_manager", "provider_coordinator",
        "allied_health", "pharmacist", "family", "friend", "neighbour",
        "advocate", "other",
    ] = "other"
    role_or_title: Optional[str] = Field(default=None, max_length=200)
    organisation: Optional[str] = Field(default=None, max_length=200)
    phone: Optional[str] = Field(default=None, max_length=40)
    email: Optional[str] = Field(default=None, max_length=200)
    address: Optional[str] = Field(default=None, max_length=400)
    notes: Optional[str] = Field(default=None, max_length=2000)
    is_primary: bool = False


def build_contacts_router():
    from server import get_current_user_id  # lazy
    r = APIRouter(tags=["participant-contacts"])

    async def _ensure_household_access(user_id: str, participant_id: str):
        p = await db.participants.find_one({"id": participant_id}, {"_id": 0, "household_id": 1})
        if not p:
            raise HTTPException(404, "Participant not found")
        u = await db.users.find_one({"id": user_id}, {"_id": 0, "household_id": 1, "is_admin": 1})
        if u and u.get("is_admin"):
            return p["household_id"]
        if not u or u.get("household_id") != p.get("household_id"):
            raise HTTPException(403, "Not a household member of this participant")
        return p["household_id"]

    @r.get("/participants/{participant_id}/contacts")
    async def list_contacts(participant_id: str, user_id: str = Depends(get_current_user_id)):
        await _ensure_household_access(user_id, participant_id)
        rows = []
        async for c in db.participant_contacts.find({"participant_id": participant_id}, {"_id": 0}).sort("name", 1):
            rows.append(c)
        return {"contacts": rows}

    @r.post("/participants/{participant_id}/contacts")
    async def create_contact(participant_id: str, body: ContactBody, user_id: str = Depends(get_current_user_id)):
        await _ensure_household_access(user_id, participant_id)
        doc = {
            "id": secrets.token_urlsafe(12),
            "participant_id": participant_id,
            "created_at": _now(),
            "updated_at": _now(),
            **body.model_dump(),
        }
        await db.participant_contacts.insert_one(doc)
        return {"contact": _strip(doc)}

    @r.patch("/participants/{participant_id}/contacts/{contact_id}")
    async def update_contact(
        participant_id: str, contact_id: str, body: ContactBody,
        user_id: str = Depends(get_current_user_id),
    ):
        await _ensure_household_access(user_id, participant_id)
        updates = {**body.model_dump(), "updated_at": _now()}
        res = await db.participant_contacts.update_one(
            {"id": contact_id, "participant_id": participant_id},
            {"$set": updates},
        )
        if not res.matched_count:
            raise HTTPException(404, "Contact not found")
        doc = await db.participant_contacts.find_one({"id": contact_id}, {"_id": 0})
        return {"contact": doc}

    @r.delete("/participants/{participant_id}/contacts/{contact_id}")
    async def delete_contact(participant_id: str, contact_id: str, user_id: str = Depends(get_current_user_id)):
        await _ensure_household_access(user_id, participant_id)
        res = await db.participant_contacts.delete_one(
            {"id": contact_id, "participant_id": participant_id},
        )
        if not res.deleted_count:
            raise HTTPException(404, "Contact not found")
        return {"ok": True}

    return r
