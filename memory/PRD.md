# Kindred — Product Requirements (Living Doc)

## Product
Kindred is the AI operating system for Australian families navigating the Support at Home program (effective 1 Nov 2025). The primary paying user is the adult-child family caregiver; the participant (the older parent) is the secondary user. Provider-agnostic SaaS, never takes commissions, never sells data.

## Personas
- **Cathy (52, primary caregiver)** — main paying user, busy, wants 30-second oversight.
- **Dorothy (79, participant)** — voice-first, large-text, single-action UX.
- **Karen (48, secondary caregiver)** — read-only sibling with weekly digest (deferred).
- **Mark (financial advisor)** — B2B2C, multi-client portal (deferred).

## Core requirements (MVP scope)
- Caregiver uploads PDF/CSV statement → AI parses every line item.
- Plain-English summary + anomaly detection.
- Quarterly budget burn across 3 streams (Clinical/Independence/Everyday Living).
- Lifetime contribution cap progress.
- AI chat with statement+budget context.
- Family thread for siblings.
- Immutable audit log.
- Participant view: today's appointment, single-number budget, big call+concern buttons.

## Architecture (current)
- React (CRA) + Tailwind + shadcn UI.
- FastAPI + MongoDB (motor).
- JWT auth (bcrypt), 30-day TTL.
- Claude Sonnet 4.5 via emergentintegrations (EMERGENT_LLM_KEY) for parsing/anomalies/chat.
- pypdf for PDF text extraction.
- Single-user-per-household for now (multi-user comes later).

## Implemented (May 2026 — initial build)
- Full auth: signup with role select (caregiver/participant), login, me.
- Onboarding to create household (participant name, classification 1–8, provider, grandfathered flag).
- Statement upload (PDF/CSV/TXT) → Claude parses → store line items + summary + anomalies.
- Anomaly rules: duplicate detection, rate-spike vs household median; LLM rewrites them in plain English.
- Budget endpoint: per-stream allocation, spent, remaining, %, lifetime cap progress, rollover cap.
- AI chat with full context (classification, quarterly budget, stream burn, lifetime cap, latest summary).
- Family thread (single-user for now, ready for multi-user).
- Audit log records HOUSEHOLD_CREATED, STATEMENT_UPLOADED, FAMILY_MESSAGE_POSTED, CONCERN_FLAGGED.
- Participant view: today card, big quarter-remaining number, call + flag-concern giant buttons.
- Design: Organic & Earthy palette (#F9F8F6 bg, #2A3B32 primary), Outfit + Figtree fonts.

## Backlog (P0/P1 next)
- P0: Multi-user households (invite siblings as secondary caregivers).
- P0: Real appointments (calendar agent + ICS parsing).
- P1: Advisor (B2B2C) dashboard for financial advisors.
- P1: Provider directory + comparison (1 July 2026 cap moment).
- P1: Voice agent (Whisper STT + ElevenLabs TTS for participant).
- P1: Sunday digest emails for secondary caregivers.
- P2: Hospital-discharge / Restorative Care helper.
- P2: White-label advisor portal.
- P2: Provider statement template auto-detect (top-20 templates).
- P2: Bank statement / open banking ingest.
- P2: Stripe subscription billing.

## Next actions
- End-to-end testing via testing_agent.
- Add seed sample data for fresh accounts (so the dashboard is not empty).
- Add data export / household delete (privacy compliance).
