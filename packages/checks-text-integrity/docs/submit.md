# Text integrity: relay submit API (reference)

This page documents how the **checks-text-integrity** extension calls **checks-relay** to submit a manuscript for analysis. It complements [webhook and notify flow](./webhook.md) and [EULA cache refresh cron](./eula-cron.md).

---

## Endpoint

**Method and path:** `POST /api/v1/services/:serviceName/submit`

**Implementation (relay app):** `checks-relay/apps/relay/app/routes/v1/services.name/submit.ts` (path may vary slightly by repo layout).

---

## Request body

The handler parses JSON as a flat object, then **splits** it:

- **`credentials`** — Any object (or omitted → `{}`). Passed to the plugin as the first argument to `plugin.submit(credentials, payload)`.
- **Everything else** — Normalized into **`PluginSubmitPayload`** (see `@checks-relay/types`): required `clientId`, `files`, `notifyUrl`, optional `metadata`, plus relay-injected `id`.

### Required fields (after split)

| Field | Type | Relay validation |
|-------|------|------------------|
| `clientId` | string | Must be truthy. Used for **idempotency** per `(clientId, serviceName)`. |
| `files` | array | Non-empty; each element is an object with string **`url`** and **`filename`**; optional **`role`**. |
| `notifyUrl` | string | Must be truthy. Relay posts notification envelopes here when webhooks are processed. |

### Optional

| Field | Default | Notes |
|-------|---------|--------|
| `metadata` | `{}` | Freeform; **validated by the plugin**. Stored on the submission row. |

### Relay-injected field

After creating the submission row, relay calls `plugin.submit(credentials, pluginPayload)` where `pluginPayload` is `{ id, clientId, notifyUrl, files, metadata }`. The plugin receives **`id`**: the relay internal **submission UUID** (distinct from `clientId`).

---

## Responses

| Status | Meaning |
|--------|---------|
| **201** | New submission; plugin completed without throwing. JSON includes `status`, `message`, `result` with at least `submissionId` (relay id) and, when provided by the plugin, `externalRef` (provider submission id). Relay persists `status`, `result`, and `externalRef`. |
| **200** | **Idempotent hit:** submission already exists for this `clientId` + `serviceName`. Body returns existing `status` / `message` / `result` (**plugin `submit` is not invoked again**). |
| **400** | Invalid JSON, missing `clientId` / `files` / `notifyUrl`, invalid `files` shape, or non-string `clientId` / `notifyUrl`. |
| **404** | Unknown `serviceName` (plugin not registered). |
| **500** | Plugin threw; submission row updated to error state; response includes `submissionId` in `result`. |

---

## Idempotency

Repeating the same `clientId` for the same service **does not** create a second provider-side submission. For **one check run = one relay submission**, use:

- **`clientId` = text integrity run id** (`checkServiceRun.id`), so retries reuse the same key and return the same relay submission.

Using a stable key per work version instead of per run can prevent re-submission on a second run unless you rotate `clientId` deliberately.

---

## Credentials (extension → relay)

Shape is defined by the relay plugin’s `extractCredentials` (text integrity plugin). Typical fields:

| Field | Required | Notes |
|-------|----------|--------|
| `apiKey` | yes | Provider API key. |
| `apiUrl` | yes | Provider API base URL. |
| `integrationName` | no | Default often `checks-relay` or plugin default. |
| `integrationVersion` | no | Default semantic version string. |

---

## Plugin payload expectations

- **`files`** — Non-empty array. Implementations may only use **`files[0]`** today: each item must be fetchable by the relay/plugin (at minimum **`url`** and **`filename`** for upload and title fallback).
- **`metadata`** — Freeform; mapped by the plugin into the provider create-submission body (`owner`, `title`, `submitter`, `eula`, `group`, etc., as supported). Defaults may apply (for example `owner.id` from `payload.clientId` when omitted).
- **`clientId`** — Present on the payload for defaults and correlation.

SCMS stores **`apiBaseUrl`** in extension config; the job maps that to relay **`credentials.apiUrl`** when names differ between app and client.

---

## Example JSON body

```json
{
  "credentials": {
    "apiKey": "<from Text Integrity config>",
    "apiUrl": "<from apiBaseUrl / stored credentials>"
  },
  "clientId": "<text_integrity_run_id>",
  "notifyUrl": "<absolute URL to SCMS hook>",
  "files": [
    {
      "url": "<signed or public URL to PDF or DOCX>",
      "filename": "<original filename>"
    }
  ],
  "metadata": {
    "title": "<optional human title>",
    "owner": { "id": "...", "given_name": "...", "family_name": "...", "email": "..." }
  }
}
```

**HTTP headers:** Match other SCMS → relay calls (for example admin configure/status): **`Authorization: Bearer <app.checks.relayApiKey>`** (exact config key as used elsewhere in this extension).

**`serviceName`:** Extension `serviceName` from merged YAML + object overlay; default when unset depends on deployment (often a non-production placeholder such as `echo`).

---

## Notify URL pattern

Build the absolute URL for the extension notify route, for example:

`…/v1/api/hooks/text-integrity/notify/:id` with **`:id` = text integrity run id**

Confirm the mount prefix for your deployment; the extension registers under the app’s hooks path.

Relay may forward a **summary envelope** (`status`, `message`, `result`, …) rather than raw provider event bodies. Align the SCMS notify route with the relay version you run.

---

## Types (TypeScript)

In `@checks-relay/types`: **`RelaySubmitRequestBody`**, **`PluginSubmitPayload`**, **`SubmitManuscriptFile`**.

Relay validates `files` and builds `PluginSubmitPayload` before calling the plugin — see the relay `submit` route implementation cited above.
