# Wayly — Notifiable Data Breach (NDB) Response Runbook

Last updated: 2026-02-07 (Phase 9 security hardening)
Owner: security@wayly.com.au

This runbook turns the obligations of the Australian Privacy Act 1988
(Notifiable Data Breaches scheme — Part IIIC) into a concrete, time-boxed
playbook the on-call engineer can follow at 3 a.m. without thinking.

## TL;DR clock
* **T+0 → T+24h**: Contain. Stop the bleed.
* **T+24h → T+72h**: Assess. Is this an Eligible Data Breach (EDB)?
* **T+72h**: If EDB, notify affected individuals and the OAIC.
* **T+30 days**: Maximum statutory window for assessment ends.

## 1. Trigger criteria
Any one of these starts the clock:
* Backend reports `result: 'tampered'` from `/api/admin/audit-log/verify`.
* An external party reports unauthorised access.
* Unusual spike in `revoked_tokens` or admin audit `admin_login_complete` rows from unexpected IPs.
* A dependency CVE lands that *could* have allowed RCE / data exposure.
* Cloudflare WAF blocks > 100 SQL/XSS attempts in 60 sec.
* Failed `/api/auth/login` rate spike > 1000/hour (Phase 3 rate-limit alarms).
* Confirmed lost laptop / leaked credential of any Wayly employee.

## 2. T+0 — Contain (first hour)
1. **Acknowledge** in #wayly-security Slack channel — page the on-call engineer.
2. **Rotate credentials immediately** per `encryption-runbook.md` §4:
   * `JWT_SECRET` + `ADMIN_JWT_SECRET` — kills every active session.
   * Any leaked third-party key (Stripe, Resend, Mongo Atlas).
3. **Enable maintenance mode** if the bleed is ongoing:
   ```bash
   curl -X POST https://wayly.com.au/api/admin/maintenance \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -d '{"enabled": true, "message": "Scheduled maintenance"}'
   ```
4. **Snapshot Mongo** for forensic analysis (`mongodump --archive=breach-snapshot-$(date +%s).gz`).
5. **Pull Cloudflare logs** for the suspect window (`cf logpull --start --end --output gz`).
6. **Disable the offending account / IP** via the admin panel.

## 3. T+0 → T+24h — Triage & evidence collection
* Walk `admin_audit_log` via `/api/admin/audit-log/verify` — confirm hash chain integrity for the window.
* Identify the affected scope: how many `users`, `participants`, `households`?
* Determine what categories of PII / health information were involved.
* Save all evidence in an immutable bucket (`s3://wayly-incident-evidence/<incident-id>/`).
* Brief the founders + DPO via secure channel (Signal). **Do not** discuss in regular Slack.

## 4. T+24h → T+72h — Eligible Data Breach (EDB) assessment

A breach is "eligible" under APP if **all three** are true:
1. There is unauthorised access to, or unauthorised disclosure of, personal information held by Wayly **OR** the information is lost in circumstances where unauthorised access / disclosure is likely.
2. The access / disclosure is likely to result in **serious harm** to any of the individuals to whom the information relates.
3. Wayly has been unable to prevent the likely risk of serious harm with remedial action.

| Question | If YES → notify | If NO → maybe not EDB |
|---|---|---|
| Could a participant be exposed to financial harm (loss of benefits, fraud)? | ✅ | ❌ |
| Could a participant's medical / aged-care information be used to discriminate or coerce? | ✅ | ❌ |
| Did the breach include unhashed passwords or current session tokens? | ✅ | ❌ |
| Was the data successfully encrypted at rest with keys NOT also exposed? | ❌ | ✅ |
| Was the data already publicly known? | ❌ | ✅ |

If unsure, **default to notifying**. Under-notifying is a $50M+ corporate fine.

## 5. T+72h — Notification (if EDB)
1. **OAIC**: file via [oaic.gov.au/notifiable-data-breaches/report](https://www.oaic.gov.au/privacy/notifiable-data-breaches/report-a-data-breach/). Use the saved evidence pack.
2. **Affected individuals**: email via Resend using the template in `templates/breach_notification.html`. The email MUST include:
   - The nature of the breach (what happened, in plain English).
   - What information was involved.
   - What Wayly is doing in response.
   - What the user can do (change password, watch statements, etc.).
   - Wayly contact for further questions.
3. **Public statement**: if > 100 individuals affected, publish a notice at `wayly.com.au/security/incident-<date>`.

## 6. Post-incident review (within 30 days)
* Root cause analysis written up in `/security-audit/incidents/`.
* New controls landed and tested (track in PRD.md as a new phase if material).
* Tabletop exercise scheduled within 90 days.

## 7. Contacts
| Role | Person | Channel |
|---|---|---|
| Incident commander | (founder) | Signal |
| Engineering lead | (CTO) | Signal |
| Legal counsel | (firm name) | Phone |
| Cloud (AWS / Cloudflare / Mongo) | Their account-manager hotlines | — |
| External forensics (retained) | (TBD) | — |

## 8. References
* OAIC NDB guide: https://www.oaic.gov.au/privacy/notifiable-data-breaches/
* Privacy Act 1988: https://www.legislation.gov.au/Details/C2023C00120
* OAIC breach reporting form: https://www.oaic.gov.au/privacy/notifiable-data-breaches/report-a-data-breach/
