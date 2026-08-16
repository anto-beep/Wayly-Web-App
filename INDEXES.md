# Wayly — MongoDB Index Catalogue

> Single source of truth for every compound + TTL index Wayly creates at startup.
> See `/app/backend/perf_indexes.py` for the code that ensures them.
>
> **Rule we follow: ESR.** Every compound key lists **E**quality fields first,
> then **S**ort fields, then **R**ange fields. This is the layout MongoDB needs
> to use a single index for filter + sort + range without an in-memory sort.
>
> Indexes are ensured at FastAPI startup via the `_performance_index_bootstrap`
> hook in `server.py`. Mongo no-ops on an existing identical index, and conflicting
> options are logged at DEBUG (non-fatal) so we never block boot.

## How to read this table
| Column | Meaning |
| --- | --- |
| Collection | MongoDB collection name |
| Index | Field tuple in spec order (`-1` = DESCENDING) |
| Type | `compound` / `unique` / `sparse` / `ttl` |
| ESR role | Why each field appears in this position |
| Query it backs | The real call site (file:line) that motivated the index |

## Auth / Users

| Collection | Index | Type | ESR role | Query it backs |
| --- | --- | --- | --- | --- |
| users | `id` | unique | E | every `find({id})` lookup |
| users | `email` | unique | E | `auth/login`, `auth/signup`, password reset (server.py L224,291,440) |
| users | `inbound_token` | sparse | E | inbound-mail token match (server.py L1494) |
| users | `admin_role` | compound | E | admin dashboards (admin_routes.py L548) |
| users | `household_id` | compound | E | reverse household → users lookup |
| users | `email_verified, verification_deadline` | compound | E → R | login lockout check (server.py L291), grace-period scanner |
| users | `plan, created_at(-1)` | compound | E → S | admin "users by plan" reports |
| users | `trial_ends_at` | compound | R | trial scheduler scan |
| users | `created_at(-1)` | compound | S | admin user list default sort |
| user_sessions | `user_id` | compound | E | session lookup by user |
| user_sessions | `expires_at` | TTL | — | auto-expire stale sessions |
| revoked_tokens | `user_id, reason` | compound | E + E | revoked-token check on logout/lockout |
| revoked_tokens | `expires_at` | TTL | — | auto-expire revocations |
| password_resets | `token` | unique | E | `/auth/reset` (server.py L600) |
| password_resets | `email, used, created_at(-1)` | compound | E + E + S | latest-token-per-email (tests L208) |
| email_verifications | `token` | unique | E | legacy verify-email (server.py L813) |
| email_verifications | `user_id` | compound | E | per-user lookup |
| email_verification_tokens | `token` | unique | E | new flow verify-email click |
| email_verification_tokens | `user_id, used` | compound | E + E | unused tokens per user |
| email_verification_tokens | `expires_at` | TTL | — | Mongo auto-deletes expired |

## Participants / Households / Accounts

| Collection | Index | Type | ESR role | Query it backs |
| --- | --- | --- | --- | --- |
| participants | `id` | unique | E | every direct lookup |
| participants | `household_id, is_archived, is_primary(-1)` | compound | E + E + S | dashboard list (batch2_routes.py L169) |
| participants | `account_id, status, is_primary(-1)` | compound | E + E + S | account-scoped list |
| participants | `primary_user_id` | compound | E | reverse user → participant lookup (alerts.py L357) |
| participants | `seed_key, is_seed` | compound | E + E | Phase 8 seed scripts |
| participants | `status` | compound | E | reports scheduler scan (reports_scheduler.py L118) |
| participants | `lifecycle_state` | compound | E | lifecycle backfill scan (lifecycle.py L277) |
| households | `id` | unique | E | direct lookup |
| households | `owner_id` | compound | E | "household by owner" |
| households | `primary_user_id` | compound | E | "household by primary user" |
| household_members | `household_id, status` | compound | E + E | list active members (server.py L845,920) |
| household_members | `user_id` | compound | E | reverse: which households does this user belong to |
| accounts | `id` | unique | E | direct lookup |
| accounts | `owner_id` | compound | E | "account by owner" |
| accounts | `owner_user_id` | compound | E | billing path (server.py L4382) |
| account_members | `account_id, user_id` | unique | E + E | dedup membership |
| account_members | `user_id` | compound | E | "which accounts does this user belong to" |
| invites | `token` | unique | E | accept invite (server.py L1055,1072) |
| invites | `household_id, status` | compound | E + E | list pending invites (server.py L890,921) |
| invites | `email` | compound | E | "did we already invite this email" |

## Statements / Decoder / Documents

| Collection | Index | Type | ESR role | Query it backs |
| --- | --- | --- | --- | --- |
| statements | `id` | unique | E | direct lookup |
| statements | `household_id, uploaded_at(-1)` | compound | E + S | dashboard + recents (server.py L936,4027,4050) |
| statements | `participant_id, period_end(-1)` | compound | E + S | per-participant timeline (alerts.py L362) |
| statements | `household_id, period_end(-1)` | compound | E + S | household statements list |
| statements | `account_id, period_end(-1)` | compound | E + S | adviser per-account view |
| statements | `uploaded_at(-1)` | compound | S | watchdog "uploads in last 24h" (server.py L3871) |
| statement_intake_queue | `status, created_at` | compound | E + S | worker drains FIFO |
| statement_intake_queue | `household_id, created_at(-1)` | compound | E + S | UI: my queue |
| inbound_mail_unmatched | `ts(-1)` | compound | S | admin "unmatched inbox" |
| anomalies | `statement_id, severity` | compound | E + E | per-statement anomaly bar |
| anomalies | `household_id, created_at(-1)` | compound | E + S | household alerts feed |
| documents | `household_id, created_at(-1)` | compound | E + S | docs vault listing (documents_routes.py L140) |
| documents | `household_id, uploaded_at(-1)` | compound | E + S | older docs uploads sort |
| documents | `user_id, created_at(-1)` | compound | E + S | "my documents" |
| vault_documents | `user_id, uploaded_at(-1)` | compound | E + S | personal vault |
| vault_documents | `household_id, uploaded_at(-1)` | compound | E + S | shared vault |
| generated_reports | `user_id, created_at(-1)` | compound | E + S | report history |
| generated_reports | `participant_id, created_at(-1)` | compound | E + S | per-participant report (reports_scheduler.py L76) |
| generated_reports | `household_id, created_at(-1)` | compound | E + S | family report (extended_routes.py L497) |
| report_sections | `report_id` | compound | E | render report |
| report_download_tokens | `token` | unique | E | signed download link |
| report_download_tokens | `expires_at` | TTL | — | auto-expire links |

## Billing / Subscriptions / Stripe

| Collection | Index | Type | ESR role | Query it backs |
| --- | --- | --- | --- | --- |
| subscriptions | `user_id` | unique | E | one sub per user (server.py L4649,4717) |
| subscriptions | `stripe_customer_id` | compound | E | webhook lookup |
| subscriptions | `stripe_subscription_id` | compound | E | webhook lookup |
| subscriptions | `status, current_period_end` | compound | E + R | renewals scanner |
| subscriptions | `status, trial_end` | compound | E + R | trial-ending scanner (server.py L5542,5604,5655) |
| subscriptions | `status, updated_at(-1)` | compound | E + S | latest events |
| payment_transactions | `session_id` | unique | E | Stripe session lookup (server.py L4588) |
| payment_transactions | `user_id, created_at(-1)` | compound | E + S | "my receipts" |
| stripe_webhook_events | `event_id` | unique | E | webhook idempotency (server.py L4827) |
| stripe_webhook_events | `result, ts(-1)` | compound | E + S | admin webhook console |
| refunds | `id` | unique | E | direct |
| refunds | `session_id` | compound | E | match against original txn |
| refunds | `user_id, created_at(-1)` | compound | E + S | refund history |

## Audit & Security

| Collection | Index | Type | ESR role | Query it backs |
| --- | --- | --- | --- | --- |
| audit_events | `household_id, ts(-1)` | compound | E + S | family timeline (server.py L2004,522) |
| audit_events | `user_id, ts(-1)` | compound | E + S | per-user activity (admin_routes.py L90) |
| audit_events | `account_id, at(-1)` | compound | E + S | account-scoped audits |
| audit_events | `actor_id, at(-1)` | compound | E + S | "what did this user do" |
| audit_events | `action, at(-1)` | compound | E + S | filter by action type |
| audit_events | `target, at(-1)` | compound | E + S | "what happened to this resource" (test_iter56) |
| admin_audit | `actor_id, ts(-1)` | compound | E + S | admin activity per actor (test_admin_phase_b L316) |
| admin_audit | `action, ts(-1)` | compound | E + S | admin "what actions" view (admin_phase_e L474) |
| admin_audit | `ts(-1)` | compound | S | latest admin events |
| admin_audit_log | `seq` | compound | S | tamper-evident log read (admin_hardening.py L199) |
| admin_audit_log | `ts(-1)` | compound | S | latest |
| admin_sessions | `id` | unique | E | direct |
| admin_sessions | `user_id` | compound | E | who's logged in |
| admin_sessions | `expires_at` | TTL | — | auto-expire |
| admin_devices | `user_id, device_id` | unique | E + E | dedup device per user (admin_devices.py L43) |
| admin_devices | `user_id, last_seen_at(-1)` | compound | E + S | device list sorted (admin_devices.py L85) |
| admin_login_devices | `user_id, device_id` | unique | E + E | dedup (admin_hardening.py L100) |
| admin_invites | `token` | unique | E | accept |
| admin_invites | `email, status` | compound | E + E | pending invites |
| admin_user_notes | `target_user_id, created_at(-1)` | compound | E + S | notes per user |
| feature_flags | `name` | unique | E | flag lookup |
| system_state | `key` | unique | E | maintenance flag (admin_hardening.py L215) |
| data_requests | `id` | unique | E | direct |
| data_requests | `user_id, created_at(-1)` | compound | E + S | "my data requests" |
| data_requests | `status, created_at(-1)` | compound | E + S | open queue |
| security_event_counters | `ts` | compound | R | TTL purge scanner (security_alerter.py L311) |
| security_event_counters | `rule, key, ts(-1)` | compound | E + E + S | per-key counter window (security_alerter.py L210) |
| security_alerts | `resolved, created_at(-1)` | compound | E + S | open-alerts list (security_alerter.py L323) |
| security_alerts | `severity, resolved, created_at(-1)` | compound | E + E + S | "open criticals" (L365) |
| security_alerts | `rule, key, resolved` | compound | E + E + E | dedup check (L227) |

## Observability (LLM cost · health · notify)

| Collection | Index | Type | ESR role | Query it backs |
| --- | --- | --- | --- | --- |
| llm_calls | `ts(-1)` | compound | S | dashboards by time |
| llm_calls | `user_id, ts(-1)` | compound | E + S | per-user spend |
| llm_calls | `model, ts(-1)` | compound | E + S | per-model spend |
| llm_calls | `success, ts(-1)` | compound | E + S | error-rate window (health_watchdog.py L67) |
| llm_calls | `endpoint, ts(-1)` | compound | E + S | per-endpoint cost |
| health_state | `service` | unique | E | upserts (health_watchdog.py L107,123) |
| notifications | `user_id, read, created_at(-1)` | compound | E + E + S | unread badge (notifications.py L64) |
| notifications | `user_id, created_at(-1)` | compound | E + S | bell drawer (notifications.py L62) |
| notification_log | `campaign_id, ts(-1)` | compound | E + S | campaign delivery report |
| notification_log | `status, ts(-1)` | compound | E + S | failed sends scanner (health_watchdog.py L83) |
| notification_log | `user_id, ts(-1)` | compound | E + S | per-user delivery |
| push_log | `user_id, ts(-1)` | compound | E + S | per-user push history |
| email_campaigns | `id` | unique | E | direct |
| email_campaigns | `status, scheduled_at` | compound | E + R | scheduler scan |
| email_templates_custom | `key` | unique | E | template lookup |
| tool_email_log | `email, ok, ts(-1)` | compound | E + E + S | email-result rate-limit (server.py L4333) |
| newsletter_subscribers | `email` | unique | E | dedup |
| newsletter_subscribers | `status, created_at(-1)` | compound | E + S | active list |

## Scenario Engine

| Collection | Index | Type | ESR role | Query it backs |
| --- | --- | --- | --- | --- |
| participant_events | `participant_id, created_at(-1)` | compound | E + S | timeline (events.py L522) |
| participant_events | `participant_id, event_type, created_at(-1)` | compound | E + E + S | filter by type (test_scenario_phase8 L254) |
| participant_state_audit | `participant_id, created_at(-1)` | compound | E + S | lifecycle history (lifecycle.py L152,262) |
| scenario_alerts | `id` | unique | E | direct (alerts.py L650) |
| scenario_alerts | `participant_id, created_at(-1)` | compound | E + S | per-participant alerts (alerts.py L640) |
| scenario_alerts | `user_id, created_at(-1)` | compound | E + S | "my alerts" |
| scenario_alerts | `resolved, created_at(-1)` | compound | E + S | open alerts feed |
| scenario_alerts | `dedupe_key` | compound | E | dedup writes (alerts.py L111) |

## Family / Visits / Wellbeing / Care

| Collection | Index | Type | ESR role | Query it backs |
| --- | --- | --- | --- | --- |
| family_messages | `household_id, created_at(-1)` | compound | E + S | family thread (server.py L1995) |
| family_wall_posts | `participant_id, created_at(-1)` | compound | E + S | wall feed (batch2_routes.py L379) |
| wellbeing | `household_id, created_at(-1)` | compound | E + S | check-in history (server.py L1141) |
| wellbeing | `user_id, created_at(-1)` | compound | E + S | per-user check-ins |
| concern_log | `household_id, created_at(-1)` | compound | E + S | participant concerns |
| hospital_admissions | `participant_id, admission_date(-1)` | compound | E + S | admissions list (batch2_routes.py L266) |
| care_plan_amendments | `participant_id, created_at(-1)` | compound | E + S | amendments (batch2_routes.py L607) |
| amendments | `participant_id, created_at(-1)` | compound | E + S | legacy |
| care_team_members | `participant_id` | compound | E | care team listing |
| participant_add_ons | `id` | unique | E | direct |
| participant_add_ons | `participant_id, created_at(-1)` | compound | E + S | add-ons per participant |
| user_external_contacts | `user_id, created_at(-1)` | compound | E + S | contacts |
| visits | `household_id, starts_at` | compound | E + S | calendar (extended_routes.py L78) |
| visits | `participant_id, starts_at` | compound | E + S | participant calendar |
| budget_alerts | `household_id, created_at(-1)` | compound | E + S | alerts list (extended_routes.py L127) |
| budget_alerts | `participant_id, created_at(-1)` | compound | E + S | per-participant alerts |
| athm_items | `household_id, created_at(-1)` | compound | E + S | AT-HM items (extended_routes.py L253) |
| athm_commitments | `household_id, created_at(-1)` | compound | E + S | commitments |
| correspondence | `household_id, occurred_at(-1)` | compound | E + S | letters (extended_routes.py L305) |
| referrals | `household_id, referred_at(-1)` | compound | E + S | referrals (extended_routes.py L357) |
| provider_ratings | `user_id, created_at(-1)` | compound | E + S | "my ratings" (extended_routes.py L404) |
| provider_switches | `household_id, created_at(-1)` | compound | E + S | switch history (extended_routes.py L195) |
| means_test_settings | `user_id` | unique | E | one row per user |

## Chat / Ask Wayly

| Collection | Index | Type | ESR role | Query it backs |
| --- | --- | --- | --- | --- |
| chat_history | `user_id, created_at(-1)` | compound | E + S | per-user history |
| chat_turns | `session_id, ts` | compound | E + S | conversation reconstruction |
| chat_turns | `household_id, ts(-1)` | compound | E + S | family chat (server.py L1955) |
| chat_turns | `household_id, role` | compound | E + E | role-filtered counts (server.py L4328) |

## CMS

| Collection | Index | Type | ESR role | Query it backs |
| --- | --- | --- | --- | --- |
| cms_articles | `slug` | unique | E | article lookup |
| cms_articles | `published, published_at(-1)` | compound | E + S | published list |
| cms_articles | `updated_at(-1)` | compound | S | admin editor (admin_phase_e2.py L88) |
| cms_glossary | `slug` | unique | E | glossary lookup |
| cms_glossary | `term` | compound | S | alphabetical glossary (admin_phase_e2.py L301) |
| cms_changelog | `published, release_date(-1)` | compound | E + S | latest release (seo_routes.py L147) |
| cms_reviewers | `id` | unique | E | direct |
| cms_reviewers | `name` | compound | S | reviewers by name |
| cms_templates | `key` | unique | E | template lookup |
| cms_templates | `updated_at(-1)` | compound | S | admin editor |

## Support tickets

| Collection | Index | Type | ESR role | Query it backs |
| --- | --- | --- | --- | --- |
| support_tickets | `id` | unique | E | direct (test_admin_phase_d L193) |
| support_tickets | `user_id, created_at(-1)` | compound | E + S | "my tickets" |
| support_tickets | `status, created_at(-1)` | compound | E + S | admin open queue |
| support_tickets | `assignee_id, status` | compound | E + E | "my assigned" |
| ticket_messages | `ticket_id, created_at` | compound | E + S | thread render (test_admin_phase_d L143) |
| ticket_macros | `id` | unique | E | direct |

## Adviser

| Collection | Index | Type | ESR role | Query it backs |
| --- | --- | --- | --- | --- |
| adviser_clients | `adviser_user_id, status` | compound | E + E | client counts (adviser_routes.py L146) |
| adviser_clients | `adviser_user_id, created_at(-1)` | compound | E + S | client list (adviser_routes.py L161) |
| adviser_clients | `invite_token` | sparse | E | accept link (adviser_routes.py L260) |
| adviser_clients | `client_email` | compound | E | dedup invite |
| adviser_scenarios | `user_id, created_at(-1)` | compound | E + S | scenarios |
| adviser_scenarios | `client_id, created_at(-1)` | compound | E + S | scenarios per client |
| adviser_brand_profiles | `user_id` | unique | E | one brand per adviser |

## Digest / Rate limits / Free tools

| Collection | Index | Type | ESR role | Query it backs |
| --- | --- | --- | --- | --- |
| digest_sends | `user_id, sent_at(-1)` | compound | E + S | digest history |
| digest_sends | `household_id, sent_at(-1)` | compound | E + S | family digest |
| free_tool_usage | `expires_at` | TTL | — | auto-clean rate-limit rows |
| rate_limits | `expires_at` | TTL | — | auto-clean redis-fallback rows |

## Misc

| Collection | Index | Type | ESR role | Query it backs |
| --- | --- | --- | --- | --- |
| contact_requests | `created_at(-1)` | compound | S | admin contact-form inbox |
| contact_requests | `intent, created_at(-1)` | compound | E + S | filter by intent |
| program_reference | `namespace, key` | compound | E + E | reference data lookup |
| program_reference | `effective_from, effective_to` | compound | R + R | time-versioned lookup |

---

## Updating this catalogue

1. Add the `create_index` call to `/app/backend/perf_indexes.py` in the right section.
2. Append a row to the matching table above with the file:line that motivates it.
3. Verify on a running pod with `db.<collection>.getIndexes()` and a sample `.explain("executionStats")` showing `IXSCAN` (not `COLLSCAN`).
