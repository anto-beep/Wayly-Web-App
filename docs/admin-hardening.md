# Admin hardening — production checklist

The admin middleware (`admin_hardening.py`) supports two independent
guards. Both default to **open** so a misconfigured preview never locks
ops out. Turn them on before the production redeploy.

---

## 1. `ADMIN_GATE_KEY` — Header gate

When set, every request to `/api/admin/*` and `/api/admin_v2/*` must
carry the header:

```
X-Wayly-Admin-Gate: <the-value-you-set>
```

Without a matching header the middleware short-circuits with **403**.
Keeps the admin surface off the public internet even before the JWT
check runs. Rotate it whenever the ops roster changes.

**How to set**

- Emergent host: `Deployment → Environment variables → Add`
  - Key: `ADMIN_GATE_KEY`
  - Value: any high-entropy string (recommendation: `openssl rand -hex 32`)
- Redeploy so the new value is picked up.

**How ops uses it**

The gate value lives in the operator's browser as a persistent header
(injected via an internal browser extension or a Cloudflare Worker
that fronts the admin domain). It is **never** stored in the app.

---

## 2. `ADMIN_IP_ALLOWLIST` — IP allowlist

Comma-separated list of CIDR ranges or single IPs. When set, requests
to admin routes from any other address get a **403**.

```
ADMIN_IP_ALLOWLIST=203.0.113.4,203.0.113.5,198.51.100.0/24
```

Combine with `ADMIN_GATE_KEY` for belt-and-braces.

**Emergent host**

- Set the value in the deployment env vars.
- Redeploy.

The allowlist is re-read at boot only — restart the pod after any
change. `/api/admin/hardening/status` shows whether the gate is on
and how many allowlist entries are active (never the values).

---

## Verification after redeploy

```
curl -I https://wayly.com.au/api/admin/health
# Expect: HTTP/2 403  (until the header/IP are correct)

curl -I -H "X-Wayly-Admin-Gate: $ADMIN_GATE_KEY" \
     https://wayly.com.au/api/admin/health
# Expect: HTTP/2 401  (gate ok, JWT still required)
```

`/admin/preferences` (once you sign in) surfaces the current posture
as a read-only card so you can confirm from the browser.
