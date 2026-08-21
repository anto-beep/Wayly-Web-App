# Wayly Mobile Agent — Scenario Engine Handoff (Phases 0–8)

> Drop this entire document into the `anto-beep/mobile-app` agent. It is the complete contract for surfacing the eight-phase Scenario Engine on the mobile app. No business logic is duplicated — the mobile app is a renderer + capture surface on top of the backend's `/api/scenario/*` endpoints and the schema contract.

---

## 0. Background — what the scenario engine is

Wayly's scenario engine models the **full reality of a Support at Home participant's journey**: a lifecycle state machine, parallel status flags, a 68-event taxonomy, an alerting/deadline engine, and a deterministic AI guardrail. Everything mutates through the engine — the engine is the only path that can change `participant.lifecycle_state`, the parallel `flags` bag, or write to the hash-chained `participant_state_audit` log.

The mobile app must:
1. **Pull the schema once at launch** (and on cache miss) and pin a minimum version.
2. **Render the timeline + alerts + workflows** using schema-driven labels and contact directories — never hard-code state lists, event types, or phone numbers.
3. **Capture events through the same endpoint the web app uses** — `POST /api/scenario/participants/{id}/events`. The engine handles transitions, flag updates, alert generation, and audit logging.
4. **Pre-flight any Ask Wayly chat input through the boundary classifier** before showing the LLM streaming UI — if the response would be `ROUTE_OUT` or `ESCALATE`, show the contact card instead.
5. **Never** display, store, or surface anything tagged `restricted: SAFEGUARDING_ALERT` to non-primary-caregiver roles.

---

## 1. Required reading (in this order)

| Order | File / endpoint | What you'll get |
| --- | --- | --- |
| 1 | `GET /api/scenario/schema` (no auth) | The full type contract — see §3 |
| 2 | `/app/docs/scenario-engine-validation-report.md` | Phase-by-phase status, end-to-end test matrix, seeded household walkthroughs |
| 3 | `/app/memory/CHANGELOG.md` (iterations 30–38) | Chronological reasoning + decisions across phases |
| 4 | `/app/backend/scenario_engine/lifecycle.py` | State machine + transition guards (read-only — do not port) |
| 5 | `/app/backend/scenario_engine/events.py` | Event taxonomy + side-effects (read-only) |
| 6 | `/app/backend/scenario_engine/boundaries.py` | Boundary classifier + contact directory (read-only) |
| 7 | `/app/backend/scenario_engine/workflows.py` | 3 guided wizards (read-only) |
| 8 | `/app/frontend/src/pages/extended/ParticipantTimeline.jsx` | Reference web rendering — port the **structure**, not the styles |
| 9 | `/app/frontend/src/components/WorkflowsPanel.jsx` | Reference workflow wizard flow |

---

## 2. API base URL

- **Production**: `https://wayly.com.au/api`
- **Preview**: `https://statement-checker-3.preview.emergentagent.com/api`

Pin via env / build flag. All paths below are relative to `…/api`.

---

## 3. The contract — `GET /scenario/schema`

**Auth**: none. **Cacheable**: yes (the response is deterministic; cache invalidates on `schema_version` change).

```jsonc
{
  "schema_version": "1.0.0",                // pin a min version; refuse to render if older
  "section_revisions": {                    // diff sections independently for cheap updates
    "lifecycle": "1.0.0", "flags": "1.0.0", "events": "1.0.0",
    "alerts": "1.0.0",   "boundaries": "1.0.0", "workflows": "1.0.0"
  },
  "lifecycle": {
    "states": ["AWAITING_ASSESSMENT", "ASSESSED_WAITLISTED", "ACTIVE", "HOSPITALISED", "RESTORATIVE", "INTERIM_FUNDED", "AWAITING_REASSESSMENT", "PROVIDER_TRANSITION", "PROVIDER_CEASED", "SUSPENDED", "END_OF_LIFE", "EXITED", "DECEASED", "REMOVED"],
    "initial_states": ["ACTIVE", "AWAITING_ASSESSMENT"],
    "terminal_states": ["DECEASED", "REMOVED"],
    "allowed_transitions": { "ACTIVE": ["HOSPITALISED", "AWAITING_REASSESSMENT", "PROVIDER_TRANSITION", "SUSPENDED", "END_OF_LIFE", "EXITED", "DECEASED", "RESTORATIVE", "INTERIM_FUNDED", "PROVIDER_CEASED"], ... }
  },
  "flags": {
    "groups": { "funding": [...], "clinical": [...], "service": [...], "policy": [...], "safeguarding": ["SAFEGUARDING_ALERT", ...] },
    "all_flags": [/* 42 */],
    "payload_keys": { "RESTORATIVE_ACTIVE": ["episode_number", "start_date", "end_date"], ... },
    "mutual_exclusion": [ ["FUNDED_OPERATIONAL", "INTERIM_FUNDED"], ... ],
    "restricted_flags": ["SAFEGUARDING_ALERT"]   // NEVER render to non-primary-caregiver roles
  },
  "events": {
    "trigger_sources": ["caregiver", "manual", "statement", "system"],
    "types": [
      {
        "key": "hospitalised",
        "label": "Hospitalised",
        "category": "clinical",
        "affects": ["lifecycle", "flag"],
        "transition": "HOSPITALISED",
        "flag_changes": ["HOSPITAL_ADMISSION_ACTIVE"],
        "payload_keys": ["hospital_name", "admission_reason"]
      },
      /* … 68 total … */
    ]
  },
  "alerts": {
    "severities": ["info", "low", "medium", "high", "critical"],
    "axes": ["funding", "clinical", "service", "policy", "safeguarding", "compliance"],
    "types": {
      "budget_exhaustion_projected": { "severity": "high", "axis": "funding" },
      "lifetime_cap_reached":         { "severity": "high", "axis": "funding" },
      /* … 26 total … */
    }
  },
  "boundaries": {
    "levels": ["SAFE_TO_EXPLAIN", "ROUTE_OUT", "ESCALATE"],
    "contacts": {
      "my_aged_care":           { "label": "My Aged Care",            "phone": "1800 200 422", "tel_link": "tel:1800200422", "hours": "8am-8pm Mon-Fri, 10am-2pm Sat", "blurb": "..." },
      "services_australia_fis": { "label": "Services Australia FIS",  "phone": "132 300", ... },
      "opan":                   { "label": "OPAN", "phone": "1800 700 600", ... },
      "elder_abuse_helpline":   { "label": "1800ELDERHelp", "phone": "1800 353 374", ... },
      /* … 12 contacts total — DO NOT hard-code these, always source from /scenario/schema */
    },
    "event_advice_boundary": {
      "deceased":                          { "level": "ESCALATE",  "contact_keys": ["my_aged_care", "services_australia_fis", "opan"] },
      "elder_abuse_disclosed":             { "level": "ESCALATE",  "contact_keys": ["elder_abuse_helpline"] },
      "services_australia_letter_received":{ "level": "ROUTE_OUT", "contact_keys": ["services_australia_fis"] },
      "lifetime_cap_reached":              { "level": "ROUTE_OUT", "contact_keys": ["services_australia_fis"] },
      /* … */
    },
    "alert_advice_boundary": { /* same shape, keyed by alert_type */ }
  },
  "workflows": {
    "reassessment":     { "key": "reassessment",    "label": "Request a reassessment", "intro": "...", "advice_boundary": "SAFE_TO_EXPLAIN", "steps": [...] },
    "hospitalisation":  { ... },
    "death":            { ..., "advice_boundary": "ESCALATE", "route_out_contacts": ["my_aged_care", "services_australia_fis", "opan"] }
  }
}
```

### Schema-version contract

- **Major** (`2.x.x`): breaking. Mobile must refuse to render and prompt to upgrade.
- **Minor** (`1.y.x`): additive only (new event type, new flag, new contact). Mobile renders gracefully — unknown enum values must be **shown verbatim** (don't crash on an event type the bundled labels don't have — fall back to the `label` field returned by the schema).
- **Patch** (`1.0.z`): label / blurb / contact-hours edits. Mobile picks up automatically.

### Caching strategy

```ts
// pseudocode
const cached = await storage.get("scenario_schema");
if (cached && Date.now() - cached.fetched_at < 60 * 60_000) {
    schema = cached.payload;
} else {
    schema = await GET("/scenario/schema");
    storage.set("scenario_schema", { payload: schema, fetched_at: Date.now() });
}
// On launch, optionally HEAD the endpoint for the new schema_version and refresh
```

---

## 4. Auth

Same JWT-based auth as the web app — `POST /api/auth/login` → `{ token, refresh_token }`. Pass `Authorization: Bearer <token>` on every scenario endpoint except `/scenario/schema` and `/scenario/workflows` (catalogue), which are public.

The participant payloads carry `account_id` and `primary_user_id`; show **only** the participants belonging to the logged-in user (`GET /account` returns the user's active participants).

---

## 5. The five endpoints the mobile app actually calls

### 5.1 List event types
```
GET /scenario/event-types        # same data the schema returns under events.types — use whichever is cheapest
```

### 5.2 Capture an event (the only mutation)
```
POST /scenario/participants/{participant_id}/events
Content-Type: application/json
Authorization: Bearer <token>

{
  "event_type":      "hospitalised",                  // must be one of schema.events.types[].key
  "effective_date":  "2026-02-05",                    // ISO date the event took place
  "trigger_source":  "caregiver",                     // one of schema.events.trigger_sources
  "note":            "Robert had a fall — admitted to RMH",
  "payload":         { "hospital_name": "Royal Melbourne", "admission_reason": "Fall — hip fracture" },
  "source":          { "kind": "mobile",  "mobile_app_version": "1.4.2" }
}

→ 200 OK
{
  "event": { "id": "...", "event_type": "hospitalised", "advice_boundary": "SAFE_TO_EXPLAIN", "proposed": { "transition_status": "applied", "lifecycle_transition": "HOSPITALISED" }, ... },
  "alerts_emitted": [ ... ]                            // optional, depending on side-effects
}
```

**Rules**:
- The engine validates the transition. If you POST `event_type: "reassessment_completed"` while the participant is in `ACTIVE` (not `AWAITING_REASSESSMENT`), the response will include `proposed.transition_status: "blocked"`. **Show this to the user inline** — don't silently swallow it.
- The engine may also return `advice_boundary: "ROUTE_OUT" | "ESCALATE"` and `route_out_contacts: [...]`. Render the contact card under the event in the timeline.
- The engine writes the audit row. The mobile app must NOT write directly to `participants` or `participant_events`.

### 5.3 List events (optional — timeline is usually enough)
```
GET /scenario/participants/{id}/events?limit=50
```

### 5.4 List active alerts
```
GET /scenario/participants/{id}/alerts
→ [ { "id": "...", "alert_type": "budget_exhaustion_projected", "title": "...", "body": "...", "severity": "high", "advice_boundary": "SAFE_TO_EXPLAIN", "next_action_text": "Open budget", "next_action_link": "/app/budget-alerts", "route_out_contacts": [], ... } ]
```

The `next_action_link` is a **web** path. On mobile, map known web paths to native screens (see §7).

### 5.5 Merged timeline (events + state changes + alerts)
```
GET /scenario/participants/{id}/timeline?limit=80
→ {
    "first_name": "Robert",
    "lifecycle_state": "RESTORATIVE",
    "items": [
      { "at": "2026-02-06T03:12:00Z", "type": "event", "data": { ...event payload... } },
      { "at": "2026-02-06T03:12:00Z", "type": "state", "data": { "kind": "lifecycle_transition", "from_value": "ACTIVE", "to_value": "HOSPITALISED" } },
      { "at": "2026-02-05T11:00:00Z", "type": "alert", "data": { ...alert payload... } }
    ]
  }
```

Items are pre-sorted newest-first. The web app renders three card variants — port the structure to native cells. See §6.

### 5.6 Workflows (Phase 6)
```
GET /scenario/workflows                            # public catalogue
GET /scenario/workflows/{key}                      # auth required; key is one of: reassessment, hospitalisation, death
```

For each workflow, the mobile app renders a step-by-step wizard. Each step has:
- `event_type` (optional — if present, the mobile app POSTs to `/scenario/participants/{id}/events` on advance; if null, it's an acknowledgement-only step).
- `payload_fields[]` — render dynamic form inputs (`text`, `number`, `date`, `select`).
- `cta` — the button label.

When the workflow's top-level `advice_boundary === "ESCALATE"`, the wizard must surface the resolved `route_out_contacts_resolved` block prominently. (The Death workflow is the only ESCALATE one currently.)

### 5.7 Boundary preview (Ask Wayly — Phase 5)
```
POST /scenario/boundary-probe
{ "query": "Should I sell mum's house to pay the RAD?" }

→ { "boundary": "ROUTE_OUT" | "ESCALATE" | "SAFE_TO_EXPLAIN", "topic": "...", "contacts": [...] }
```

**Mobile rule**: call this **before** firing `POST /chat` (the LLM endpoint). If `boundary !== "SAFE_TO_EXPLAIN"`, **do not** call `/chat` — show the contact card directly with a single primary CTA (`Call <contact>` deep-linked to `tel:` from the schema). This is the deterministic guardrail; relying on the LLM to police itself is unacceptable.

---

## 6. Rendering rules

### 6.1 Timeline cells (3 variants — match the schema's `type` field)

| `type` | Cell | Required visible bits |
| --- | --- | --- |
| `event` | "Event" cell | `event_type.label` (lookup from schema), `note`, `at` (formatted DD MMM YYYY hh:mm), transition outcome (`applied`/`blocked`), boundary chip if not SAFE_TO_EXPLAIN, contact block if present |
| `state` | "Status changed" cell | `kind` (humanised), `from_value` → `to_value`, `at` |
| `alert` | "Alert" cell | `title`, `body`, severity colour (use schema-driven palette below), `next_action_text` deep-linked to native screen, contact block if not SAFE_TO_EXPLAIN |

### 6.2 Severity palette
| Severity | Web token | Use for |
| --- | --- | --- |
| `critical` | wayly-clay-600 / clay-50 bg | Red. Deceased path. Lifetime cap reached. |
| `high` | wayly-clay-500 / amber-50 bg | Amber. Budget exhaustion projected. Quarter-end imminent. |
| `medium` | wayly-gold-500 | Yellow. Informational nudges. |
| `low` / `info` | wayly-neutral-300 | Grey-out. |

The mobile app should ship its own equivalents — but key off the severity string from the schema, not your own categorisation.

### 6.3 Contact card

Source the directory from `schema.boundaries.contacts`. Each rendered contact:
- Primary button: `Call <contact.label>` → tel link.
- Hours line if `contact.hours` set.
- Blurb if `contact.blurb` set.
- For ESCALATE: red border + "Please contact straight away" label.
- For ROUTE_OUT: teal border + "Where to start" label.

**Do not hard-code phone numbers**. The contacts directory is the single source of truth. Phone numbers can change.

### 6.4 Status badges

Map `lifecycle_state` to a colour from the schema's `groups` taxonomy:
- `ACTIVE`, `RESTORATIVE`, `INTERIM_FUNDED` → green
- `HOSPITALISED`, `END_OF_LIFE` → amber
- `DECEASED`, `REMOVED` → grey
- `AWAITING_*`, `PROVIDER_*`, `SUSPENDED` → neutral

---

## 7. Deep-link mapping (web path → native screen)

Alerts return `next_action_link` as web paths. Map them:

| Web path | Native screen |
| --- | --- |
| `/app/budget-alerts` | `BudgetAlertsScreen` |
| `/app/statements` | `StatementsListScreen` |
| `/app/statements/{id}` | `StatementDetailScreen` |
| `/app/scenarios` | `LogScenarioScreen` |
| `/app/timeline` | `TimelineScreen` (active participant) |
| `/app/participants/{id}/timeline` | `TimelineScreen` (pinned to that participant) |
| `/app/participants` | `ParticipantsListScreen` |

Unmapped paths → open in in-app browser pointed at the production base URL.

---

## 8. Seeded households for end-to-end testing

The validation seed script (`/app/backend/scripts/seed_phase8_households.py`) creates three illustrative journeys under the `cathy@example.com` test account. Use these to validate every wizard, every alert, every advice-boundary path:

| Participant | Journey | Use to validate |
| --- | --- | --- |
| Dorothy Anderson | Long-running happy-path; many statements, occasional anomalies | Statement-anomaly events on the timeline; budget-projection clock |
| Robert Kowalski | `ACTIVE → HOSPITALISED → ACTIVE → RESTORATIVE` (3 events seeded) | Hospitalisation workflow; restorative-pathway flag; multi-step transitions |
| Patricia Holloway | `MEANS_NOT_DISCLOSED` flag + matching event | ROUTE_OUT boundary chip on an event; Ask Wayly muzzling on contribution queries |

Add: a `deceased` event + `lifetime_cap_reached` event on a 4th seeded participant to validate the ESCALATE flow + Death workflow. (Web tests already cover this; mobile should mirror.)

---

## 9. What the mobile app MUST NOT do

1. **Do not port the state machine, transition map, event taxonomy, flag groups, alert types, or boundary classifier into the mobile codebase.** They live in the backend; the schema endpoint is the contract.
2. **Do not write to MongoDB directly.** All mutations go through `POST /scenario/participants/{id}/events`.
3. **Do not hard-code phone numbers, organisation labels, or boundary levels.** Always source from `/scenario/schema`.
4. **Do not call `/chat` without first calling `/scenario/boundary-probe`.** Skipping the boundary check defeats the deterministic guardrail.
5. **Do not render `SAFEGUARDING_ALERT` flag or any event tagged in `schema.flags.restricted_flags` to a non-primary-caregiver role.** The web app filters server-side via role; on mobile, double-check client-side too.
6. **Do not store or surface `restricted` payloads in offline cache** beyond the active session.
7. **Do not show legal or financial advice** for any event/alert tagged `ROUTE_OUT` or `ESCALATE` — always defer to the contact card.

---

## 10. Acceptance checklist (Definition of Done for the mobile rollout)

- [ ] App reads `/scenario/schema` at launch, caches it, and uses the cached version for all rendering. Refreshes when `schema_version` changes.
- [ ] Timeline screen renders all three cell variants (event/state/alert) using schema-driven labels.
- [ ] Per-participant timeline pinned to `id` works (parity with web `/app/participants/:id/timeline`).
- [ ] Dashboard surfaces a 5-row recent activity panel (parity with web `DashboardTimelinePanel.jsx`).
- [ ] Event capture form mirrors `ScenarioCapture.jsx` — type picker, payload fields, transition outcome surfaced inline.
- [ ] Three workflow wizards render — reassessment, hospitalisation, death — each step posting through the events endpoint.
- [ ] Ask Wayly chat input fires `/scenario/boundary-probe` before `/chat`; ROUTE_OUT/ESCALATE replies show the contact card without ever invoking the LLM.
- [ ] Phone numbers / contact labels are NEVER hard-coded — sourced from schema only.
- [ ] Three seeded households (Dorothy, Robert, Patricia) are visible and exercisable in the mobile UI; the agent has walked each through their end-to-end journey at least once.
- [ ] Mobile-side regression suite for: lifecycle badge colour, transition-blocked toast, boundary contact rendering, schema-version mismatch upgrade prompt.

---

## 11. Open follow-ups (not blocking the mobile rollout)

- `freezegun`-pinned CI so the two budget-projection tests don't skip <14d into a quarter.
- Provider-facing schema endpoint (read-only) so partner billing systems pre-flight against the same taxonomy.
- "Next best action" dashboard banner driven by workflows + lifecycle state.

---

**Contact for questions**: leave a comment on the latest iteration in `/app/memory/CHANGELOG.md` or ping the main agent. The web app at `https://wayly.com.au` is the live reference implementation — when in doubt, mirror what it does on the corresponding native screen.
