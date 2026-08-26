# Text integrity: EULA cache refresh cron (reference)

This page describes how **Turnitin EULA terms** are cached in SCMS and how the **platform cron scheduler** keeps that cache fresh. It is reference material for operators and engineers extending the integration.

**Related:** [Submit relay API](./submit.md) · [Webhook and notify flow](./webhook.md)

---

## Why a cached EULA exists

Turnitin requires users to accept the current End User License Agreement (EULA) before submit and viewer flows. The extension:

1. Fetches the latest terms version and HTML from **checks-relay** (`getTerms` + page mode).
2. Persists them on the iThenticate **Object** row in SCMS (shared cache, not per-user).
3. Compares each user's stored acceptance against the cached version when gating check runs.

On-demand paths (user opens EULA dialog, submit job, admin **Refresh EULA** button) call `refreshEulaCacheIfStale`, which skips relay when the cache is younger than **24 hours**.

The **cron job** forces a full refresh on a schedule so terms drift is detected even when no user triggers a check.

---

## Cron callback endpoint

| Field | Value |
|-------|--------|
| **Method** | `POST` only (`GET` returns 401) |
| **Path** | `/v1/hooks/text-integrity/eula-cache/refresh` |
| **Auth** | Endpoint-scoped handshake JWT (see below) |
| **Response** | `{ ok: true, refreshed, skipped?, eula?: { version, date_fetched } }` |

The handler calls `runEulaCacheCronRefresh`, which always forces relay `getTerms` + page fetch (ignores the 24-hour freshness window).

---

## Authentication (scoped handshake)

This endpoint is intended for **internal SCMS cron only**. It does **not** use a static Bearer secret in extension config.

When a `CronJob` row has `target_auth = HANDSHAKE`, the cron tick runner mints a short-lived JWT signed with platform config:

- `api.handshakeIssuer`
- `api.handshakeSigningSecret`

The token's `endpoint_scope` claim must match:

```text
POST:/v1/hooks/text-integrity/eula-cache/refresh
```

The route verifies issuer, signature, expiry, and scope via `verifyEndpointScopedHandshake` (same pattern as `POST /v1/hooks/text-integrity/retry-sweep`).

No extra secrets are required under `app.extensions.checks-text-integrity`.

---

## Built-in CronJob

The extension registers a **builtin** job with a fixed id so admin UI and seeds stay idempotent.

| Field | Value |
|-------|--------|
| **CronJob id** | `text-integrity-eula-cache-refresh` |
| **Display name** | Text Integrity EULA cache refresh |
| **Default schedule** | `0 */12 * * *` (every 12 hours, UTC) |
| **target_type** | `HTTP` |
| **http_method** | `POST` |
| **target_auth** | `HANDSHAKE` |
| **target_scope** | `POST:/v1/hooks/text-integrity/eula-cache/refresh` |
| **target_url** | Resolved from `api.url` + scope (same host as other cron HTTP jobs) |

The default schedule runs twice per 24-hour cache TTL so stale terms are refreshed before user-facing flows rely on an expired cache.

---

## Setup (recommended)

### 1. Prerequisites

Ensure platform config includes:

- **`app.checks.relayBaseUrl`** and **`app.checks.relayApiKey`** — SCMS calls checks-relay for `getTerms`.
- **`api.handshakeIssuer`** and **`api.handshakeSigningSecret`** — used by cron to mint scoped tokens.
- **`api.url`** — base URL used to resolve the cron HTTP target (app process calling its own API).

Extension config (`app.extensions.checks-text-integrity`) needs relay routing fields such as `serviceName` and `relayInstanceId` as for normal check operations.

### 2. Install via admin UI

1. Open **Platform → Checks → Text Integrity** admin.
2. In the service actions row, use **Install cron** under **Refresh EULA** when "Scheduled refresh cron not installed" is shown.
3. After install, the row shows the schedule and next run time.

Schedule and enable/disable are managed under **System → Cron** after install.

### 3. Install manually (System → Cron)

If you prefer not to use the admin button, create or seed a row with the builtin id and fields in the table above. The admin **Install cron** action calls `installTextIntegrityEulaCacheRefreshCronJob`, which is idempotent.

---

## Manual refresh (not cron)

Operators can refresh immediately without waiting for cron:

- **Admin UI:** **Refresh EULA** button (server action with normal session auth; no handshake).
- **User flows:** Stale cache is refreshed lazily when EULA status is checked or before submit when required.

These paths do not require the cron job to be installed.

---

## What the refresh does

1. Load merged text-integrity config (extension + object-store overrides).
2. `POST` checks-relay terms URL — fetch current version metadata (`lang: en-US`).
3. `POST` again with `mode: page` — fetch HTML for the version.
4. Persist `{ version, url, validFrom, validUntil, html, date_fetched, ... }` on the iThenticate Object row.

If relay is not configured or terms fetch fails, the handler returns `{ ok: true, refreshed: false, skipped: "<reason>" }` without failing the HTTP status (cron records success/failure from HTTP status only).

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Cron returns **401** | Handshake misconfiguration, wrong `target_scope`, or token expired before delivery |
| Cron returns **503** / job fails | Unlikely on this route after handshake migration; check relay connectivity instead |
| `skipped: relay_not_configured` | Missing `app.checks.relayBaseUrl` or `relayApiKey` |
| `skipped: relay_terms_failed_*` | Relay or provider terms API error |
| Cache never updates | Cron job not installed, disabled, or tick not running (`/v1/cron/tick`) |

Check **System → Cron** for last run status and **Text Integrity admin** for manual **Refresh EULA** to validate relay terms independently of cron.

---

## Source files

| File | Role |
|------|------|
| `src/server/eulaCacheCron.server.ts` | Builtin id, scope, schedule; seed/install/status helpers |
| `src/server/eula.server.ts` | `refreshEulaCache`, `runEulaCacheCronRefresh` |
| `src/routes/v1.hooks.text-integrity.eula-cache.refresh/route.tsx` | POST webhook; handshake verification |
| `src/admin/TextIntegrityRefreshEulaRow.tsx` | Manual EULA refresh button (service actions row) |
| `src/admin/TextIntegrityEulaCronPanel.tsx` | Scheduled EULA refresh cron install/status UI |
| `src/admin/actionHandlers.server.ts` | `text-integrity-install-eula-cron`, `text-integrity-eula-cron-status` intents |
| `packages/scms-server/.../runDueCronJobs.server.ts` | Mints scoped handshake for `HANDSHAKE` cron jobs |
| `packages/scms-server/.../cron/scopes.ts` | `verifyEndpointScopedHandshake` |
