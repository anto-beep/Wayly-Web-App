"""Wayly, performance index ensure module.

Idempotent. Called at startup to ensure every collection has the indexes
needed to back the queries the codebase actually runs. Built from a real
grep audit of `db.<collection>.find / update / delete / aggregate / count`
across /app/backend/**/*.py.

ESR rule: every compound index lists Equality fields first, then Sort
fields, then Range fields. See /app/INDEXES.md for the per-index rationale.
"""
from __future__ import annotations
import logging

import pymongo

logger = logging.getLogger("wayly.indexes")


async def ensure_performance_indexes(db) -> dict[str, int]:
    """Returns counts per collection of indexes ensured."""
    counts: dict[str, int] = {}

    async def _safe(coll_name: str, *args, **kwargs) -> None:
        try:
            coll = db[coll_name]
            await coll.create_index(*args, **kwargs)
            counts[coll_name] = counts.get(coll_name, 0) + 1
        except Exception as e:
            # Most failures are "index already exists with different opts" ,
            # those are non-fatal. Log and move on.
            logger.debug("index skip %s %s: %s", coll_name, args, e)

    ASC = pymongo.ASCENDING
    DESC = pymongo.DESCENDING

    # ============================================================
    # AUTH / USERS
    # ============================================================
    await _safe("users", [("id", ASC)], unique=True)
    await _safe("users", [("email", ASC)], unique=True)
    await _safe("users", [("inbound_token", ASC)], sparse=True)
    await _safe("users", [("admin_role", ASC)])
    await _safe("users", [("household_id", ASC)])
    await _safe("users", [("email_verified", ASC), ("verification_deadline", ASC)])
    await _safe("users", [("plan", ASC), ("created_at", DESC)])
    await _safe("users", [("trial_ends_at", ASC)])
    await _safe("users", [("created_at", DESC)])

    await _safe("user_sessions", [("user_id", ASC)])
    await _safe("user_sessions", "expires_at", expireAfterSeconds=0)

    await _safe("revoked_tokens", [("user_id", ASC), ("reason", ASC)])
    await _safe("revoked_tokens", "expires_at", expireAfterSeconds=0)

    await _safe("password_resets", [("token", ASC)], unique=True)
    await _safe("password_resets", [("email", ASC), ("used", ASC), ("created_at", DESC)])

    await _safe("email_verifications", [("token", ASC)], unique=True)
    await _safe("email_verifications", [("user_id", ASC)])

    await _safe("email_verification_tokens", [("token", ASC)], unique=True)
    await _safe("email_verification_tokens", [("user_id", ASC), ("used", ASC)])
    await _safe("email_verification_tokens", "expires_at", expireAfterSeconds=0)

    # ============================================================
    # PARTICIPANTS / HOUSEHOLDS / ACCOUNTS
    # ============================================================
    await _safe("participants", [("id", ASC)], unique=True)
    await _safe("participants", [("household_id", ASC), ("is_archived", ASC), ("is_primary", DESC)])
    await _safe("participants", [("account_id", ASC), ("status", ASC), ("is_primary", DESC)])
    await _safe("participants", [("primary_user_id", ASC)])
    await _safe("participants", [("seed_key", ASC), ("is_seed", ASC)])
    await _safe("participants", [("status", ASC)])
    await _safe("participants", [("lifecycle_state", ASC)])

    await _safe("households", [("id", ASC)], unique=True)
    await _safe("households", [("owner_id", ASC)])
    await _safe("households", [("primary_user_id", ASC)])

    await _safe("household_members", [("household_id", ASC), ("status", ASC)])
    await _safe("household_members", [("user_id", ASC)])

    await _safe("accounts", [("id", ASC)], unique=True)
    await _safe("accounts", [("owner_id", ASC)])
    await _safe("accounts", [("owner_user_id", ASC)])
    await _safe("account_members", [("account_id", ASC), ("user_id", ASC)], unique=True)
    await _safe("account_members", [("user_id", ASC)])

    await _safe("invites", [("token", ASC)], unique=True)
    await _safe("invites", [("household_id", ASC), ("status", ASC)])
    await _safe("invites", [("email", ASC)])

    # ============================================================
    # STATEMENTS / DECODER / DOCUMENTS
    # ============================================================
    await _safe("statements", [("id", ASC)], unique=True)
    await _safe("statements", [("household_id", ASC), ("uploaded_at", DESC)])
    await _safe("statements", [("participant_id", ASC), ("period_end", DESC)])
    await _safe("statements", [("household_id", ASC), ("period_end", DESC)])
    await _safe("statements", [("account_id", ASC), ("period_end", DESC)])
    await _safe("statements", [("uploaded_at", DESC)])

    # ---- Duplicate-statement lifecycle (Phase 1) ----
    # Exact-duplicate lookup by file SHA, scoped to a household. `sparse`
    # so legacy rows without the field don't block insertion.
    await _safe("statements", [("household_id", ASC), ("file_sha256", ASC)], sparse=True)
    # Logical-duplicate lookup by semantic fingerprint, scoped to a household.
    await _safe("statements", [("household_id", ASC), ("extracted_fingerprint", ASC)], sparse=True)
    # The structural guarantee from the brief: at most one ACTIVE version
    # per (household + participant + period_label). Partial unique index.
    await _safe(
        "statements",
        [("household_id", ASC), ("participant_id", ASC), ("period_label", ASC)],
        unique=True,
        partialFilterExpression={"state": "active", "period_label": {"$type": "string"}},
        name="one_active_per_logical_statement",
    )
    # Range queries on state + archived_at for the retention sweeper.
    await _safe("statements", [("state", ASC), ("archived_at", DESC)], sparse=True)

    # Immutable audit log for statement state transitions.
    await _safe("statement_audit_log", [("id", ASC)], unique=True)
    await _safe("statement_audit_log", [("statement_id", ASC), ("event_at", DESC)])
    await _safe("statement_audit_log", [("actor_user_id", ASC), ("event_at", DESC)])

    # Per-participant derived calculation snapshots (Phase 2 will populate these).
    await _safe("derived_calculation_runs", [("id", ASC)], unique=True)
    await _safe("derived_calculation_runs", [("participant_id", ASC), ("calculation_kind", ASC), ("calculated_at", DESC)])

    # Idempotency keys, one row per (user, scope, key); TTL-expired after 24h.
    await _safe("idempotency_keys", [("key", ASC), ("scope", ASC), ("user_id", ASC)], unique=True)
    await _safe("idempotency_keys", "created_at", expireAfterSeconds=86400)

    await _safe("statement_intake_queue", [("status", ASC), ("created_at", ASC)])
    await _safe("statement_intake_queue", [("household_id", ASC), ("created_at", DESC)])

    await _safe("inbound_mail_unmatched", [("ts", DESC)])

    await _safe("anomalies", [("statement_id", ASC), ("severity", ASC)])
    await _safe("anomalies", [("household_id", ASC), ("created_at", DESC)])

    await _safe("documents", [("household_id", ASC), ("created_at", DESC)])
    await _safe("documents", [("household_id", ASC), ("uploaded_at", DESC)])
    await _safe("documents", [("user_id", ASC), ("created_at", DESC)])

    await _safe("vault_documents", [("user_id", ASC), ("uploaded_at", DESC)])
    await _safe("vault_documents", [("household_id", ASC), ("uploaded_at", DESC)])

    await _safe("generated_reports", [("user_id", ASC), ("created_at", DESC)])
    await _safe("generated_reports", [("participant_id", ASC), ("created_at", DESC)])
    await _safe("generated_reports", [("household_id", ASC), ("created_at", DESC)])

    await _safe("report_sections", [("report_id", ASC)])
    await _safe("report_download_tokens", [("token", ASC)], unique=True)
    await _safe("report_download_tokens", "expires_at", expireAfterSeconds=0)

    # ============================================================
    # BILLING / SUBSCRIPTIONS / STRIPE
    # ============================================================
    await _safe("subscriptions", [("user_id", ASC)], unique=True)
    await _safe("subscriptions", [("stripe_customer_id", ASC)])
    await _safe("subscriptions", [("stripe_subscription_id", ASC)])
    await _safe("subscriptions", [("status", ASC), ("current_period_end", ASC)])
    await _safe("subscriptions", [("status", ASC), ("trial_end", ASC)])
    await _safe("subscriptions", [("status", ASC), ("updated_at", DESC)])

    await _safe("payment_transactions", [("session_id", ASC)], unique=True)
    await _safe("payment_transactions", [("user_id", ASC), ("created_at", DESC)])

    await _safe("stripe_webhook_events", [("event_id", ASC)], unique=True)
    await _safe("stripe_webhook_events", [("result", ASC), ("ts", DESC)])

    await _safe("refunds", [("id", ASC)], unique=True)
    await _safe("refunds", [("session_id", ASC)])
    await _safe("refunds", [("user_id", ASC), ("created_at", DESC)])

    # ============================================================
    # AUDIT & SECURITY
    # ============================================================
    await _safe("audit_events", [("household_id", ASC), ("ts", DESC)])
    await _safe("audit_events", [("user_id", ASC), ("ts", DESC)])
    await _safe("audit_events", [("account_id", ASC), ("at", DESC)])
    await _safe("audit_events", [("actor_id", ASC), ("at", DESC)])
    await _safe("audit_events", [("action", ASC), ("at", DESC)])
    await _safe("audit_events", [("target", ASC), ("at", DESC)])

    await _safe("admin_audit", [("actor_id", ASC), ("ts", DESC)])
    await _safe("admin_audit", [("action", ASC), ("ts", DESC)])
    await _safe("admin_audit", [("ts", DESC)])

    await _safe("admin_audit_log", [("seq", ASC)])
    await _safe("admin_audit_log", [("ts", DESC)])

    await _safe("admin_sessions", [("id", ASC)], unique=True)
    await _safe("admin_sessions", [("user_id", ASC)])
    await _safe("admin_sessions", "expires_at", expireAfterSeconds=0)

    await _safe("admin_devices", [("user_id", ASC), ("device_id", ASC)], unique=True)
    await _safe("admin_devices", [("user_id", ASC), ("last_seen_at", DESC)])
    await _safe("admin_login_devices", [("user_id", ASC), ("device_id", ASC)], unique=True)

    await _safe("admin_invites", [("token", ASC)], unique=True)
    await _safe("admin_invites", [("email", ASC), ("status", ASC)])

    await _safe("admin_user_notes", [("target_user_id", ASC), ("created_at", DESC)])
    await _safe("feature_flags", [("name", ASC)], unique=True)
    await _safe("system_state", [("key", ASC)], unique=True)
    await _safe("data_requests", [("id", ASC)], unique=True)
    await _safe("data_requests", [("user_id", ASC), ("created_at", DESC)])
    await _safe("data_requests", [("status", ASC), ("created_at", DESC)])

    await _safe("security_event_counters", [("ts", ASC)])
    await _safe("security_event_counters", [("rule", ASC), ("key", ASC), ("ts", DESC)])
    await _safe("security_alerts", [("resolved", ASC), ("created_at", DESC)])
    await _safe("security_alerts", [("severity", ASC), ("resolved", ASC), ("created_at", DESC)])
    await _safe("security_alerts", [("rule", ASC), ("key", ASC), ("resolved", ASC)])

    # ============================================================
    # OBSERVABILITY (LLM COST + HEALTH + NOTIFY)
    # ============================================================
    await _safe("llm_calls", [("ts", DESC)])
    await _safe("llm_calls", [("user_id", ASC), ("ts", DESC)])
    await _safe("llm_calls", [("model", ASC), ("ts", DESC)])
    await _safe("llm_calls", [("success", ASC), ("ts", DESC)])
    await _safe("llm_calls", [("endpoint", ASC), ("ts", DESC)])

    await _safe("health_state", [("service", ASC)], unique=True)

    await _safe("notifications", [("user_id", ASC), ("read", ASC), ("created_at", DESC)])
    await _safe("notifications", [("user_id", ASC), ("created_at", DESC)])

    await _safe("notification_log", [("campaign_id", ASC), ("ts", DESC)])
    await _safe("notification_log", [("status", ASC), ("ts", DESC)])
    await _safe("notification_log", [("user_id", ASC), ("ts", DESC)])

    await _safe("push_log", [("user_id", ASC), ("ts", DESC)])
    await _safe("email_campaigns", [("id", ASC)], unique=True)
    await _safe("email_campaigns", [("status", ASC), ("scheduled_at", ASC)])
    await _safe("email_templates_custom", [("key", ASC)], unique=True)
    await _safe("tool_email_log", [("email", ASC), ("ok", ASC), ("ts", DESC)])
    await _safe("newsletter_subscribers", [("email", ASC)], unique=True)
    await _safe("newsletter_subscribers", [("status", ASC), ("created_at", DESC)])

    # ============================================================
    # SCENARIO ENGINE
    # ============================================================
    await _safe("participant_events", [("participant_id", ASC), ("created_at", DESC)])
    await _safe("participant_events", [("participant_id", ASC), ("event_type", ASC), ("created_at", DESC)])
    await _safe("participant_state_audit", [("participant_id", ASC), ("created_at", DESC)])

    await _safe("scenario_alerts", [("id", ASC)], unique=True)
    await _safe("scenario_alerts", [("participant_id", ASC), ("created_at", DESC)])
    await _safe("scenario_alerts", [("user_id", ASC), ("created_at", DESC)])
    await _safe("scenario_alerts", [("resolved", ASC), ("created_at", DESC)])
    await _safe("scenario_alerts", [("dedupe_key", ASC)])

    # ============================================================
    # FAMILY / VISITS / WELLBEING / ALERTS
    # ============================================================
    await _safe("family_messages", [("household_id", ASC), ("created_at", DESC)])
    await _safe("family_wall_posts", [("participant_id", ASC), ("created_at", DESC)])
    await _safe("wellbeing", [("household_id", ASC), ("created_at", DESC)])
    await _safe("wellbeing", [("user_id", ASC), ("created_at", DESC)])

    await _safe("concern_log", [("household_id", ASC), ("created_at", DESC)])
    await _safe("hospital_admissions", [("participant_id", ASC), ("admission_date", DESC)])
    await _safe("care_plan_amendments", [("participant_id", ASC), ("created_at", DESC)])
    await _safe("amendments", [("participant_id", ASC), ("created_at", DESC)])
    await _safe("care_team_members", [("participant_id", ASC)])
    await _safe("participant_add_ons", [("id", ASC)], unique=True)
    await _safe("participant_add_ons", [("participant_id", ASC), ("created_at", DESC)])

    await _safe("user_external_contacts", [("user_id", ASC), ("created_at", DESC)])

    await _safe("visits", [("household_id", ASC), ("starts_at", ASC)])
    await _safe("visits", [("participant_id", ASC), ("starts_at", ASC)])
    await _safe("budget_alerts", [("household_id", ASC), ("created_at", DESC)])
    await _safe("budget_alerts", [("participant_id", ASC), ("created_at", DESC)])
    await _safe("athm_items", [("household_id", ASC), ("created_at", DESC)])
    await _safe("athm_commitments", [("household_id", ASC), ("created_at", DESC)])
    await _safe("correspondence", [("household_id", ASC), ("occurred_at", DESC)])
    await _safe("referrals", [("household_id", ASC), ("referred_at", DESC)])
    await _safe("provider_ratings", [("user_id", ASC), ("created_at", DESC)])
    await _safe("provider_switches", [("household_id", ASC), ("created_at", DESC)])
    await _safe("means_test_settings", [("user_id", ASC)], unique=True)

    # ============================================================
    # CHAT / ASK WAYLY
    # ============================================================
    await _safe("chat_history", [("user_id", ASC), ("created_at", DESC)])
    await _safe("chat_turns", [("session_id", ASC), ("ts", ASC)])
    await _safe("chat_turns", [("household_id", ASC), ("ts", DESC)])
    await _safe("chat_turns", [("household_id", ASC), ("role", ASC)])

    # ============================================================
    # CMS
    # ============================================================
    await _safe("cms_articles", [("slug", ASC)], unique=True)
    await _safe("cms_articles", [("published", ASC), ("published_at", DESC)])
    await _safe("cms_articles", [("updated_at", DESC)])
    await _safe("cms_glossary", [("slug", ASC)], unique=True)
    await _safe("cms_glossary", [("term", ASC)])
    await _safe("cms_changelog", [("published", ASC), ("release_date", DESC)])
    await _safe("cms_reviewers", [("id", ASC)], unique=True)
    await _safe("cms_reviewers", [("name", ASC)])
    await _safe("cms_templates", [("key", ASC)], unique=True)
    await _safe("cms_templates", [("updated_at", DESC)])

    # ============================================================
    # SUPPORT TICKETS
    # ============================================================
    await _safe("support_tickets", [("id", ASC)], unique=True)
    await _safe("support_tickets", [("user_id", ASC), ("created_at", DESC)])
    await _safe("support_tickets", [("status", ASC), ("created_at", DESC)])
    await _safe("support_tickets", [("assignee_id", ASC), ("status", ASC)])
    await _safe("ticket_messages", [("ticket_id", ASC), ("created_at", ASC)])
    await _safe("ticket_macros", [("id", ASC)], unique=True)

    # ============================================================
    # ADVISER
    # ============================================================
    await _safe("adviser_clients", [("adviser_user_id", ASC), ("status", ASC)])
    await _safe("adviser_clients", [("adviser_user_id", ASC), ("created_at", DESC)])
    await _safe("adviser_clients", [("invite_token", ASC)], sparse=True)
    await _safe("adviser_clients", [("client_email", ASC)])
    await _safe("adviser_scenarios", [("user_id", ASC), ("created_at", DESC)])
    await _safe("adviser_scenarios", [("client_id", ASC), ("created_at", DESC)])
    await _safe("adviser_brand_profiles", [("user_id", ASC)], unique=True)

    # ============================================================
    # DIGEST / LIFECYCLE / RATE LIMITS / FREE TOOLS
    # ============================================================
    await _safe("digest_sends", [("user_id", ASC), ("sent_at", DESC)])
    await _safe("digest_sends", [("household_id", ASC), ("sent_at", DESC)])

    # TTL on ephemeral / rate-limit collections
    await _safe("free_tool_usage", "expires_at", expireAfterSeconds=0)
    await _safe("rate_limits", "expires_at", expireAfterSeconds=0)

    # ============================================================
    # MISC
    # ============================================================
    await _safe("contact_requests", [("created_at", DESC)])
    await _safe("contact_requests", [("intent", ASC), ("created_at", DESC)])

    await _safe("program_reference", [("namespace", ASC), ("key", ASC)])
    await _safe("program_reference", [("effective_from", ASC), ("effective_to", ASC)])

    total = sum(counts.values())
    logger.info("ensure_performance_indexes → %d indexes across %d collections",
                total, len(counts))
    return counts
