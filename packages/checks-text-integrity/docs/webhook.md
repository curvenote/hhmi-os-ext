# Text integrity: webhook and notify flow (reference)

This page describes how **SCMS** (this extension), **checks-relay**, and the **external provider** interact for submit, inbound webhooks, and outbound notify callbacks. It is reference material for engineers extending or operating the integration; behavior in production follows the relay plugin and provider contract for your deployment.

**Related:** [Submit relay API](./submit.md)

---

## Sequence diagram

The diagram below is the canonical Mermaid source; a rendered copy may be kept as `webhook.sequence.svg` (regenerate from `webhook.sequence.mmd` when the flow changes).

```mermaid
sequenceDiagram
  autonumber
  actor User as User
  participant SCMS as SCMS (checks-text-integrity)
  participant Relay as checks-relay (text integrity plugin)
  participant Provider as External provider API

  rect rgba(230,230,230,0.25)
    note over User,SCMS: Submit from SCMS UI
    User->>SCMS: Click submit
    SCMS->>Relay: POST /api/v1/services/:service_name/submit\ncredentials, client_id, files[], notify_url, metadata
    Relay->>Provider: Create submission
    Provider-->>Relay: externalRef (submission id)
    Relay->>Provider: Upload manuscript file(s)
    Provider-->>Relay: Upload accepted
    Relay-->>SCMS: 201 Created\nsubmissionId + externalRef (status=submitted)
  end

  rect rgba(230,230,230,0.25)
    note over Provider,Relay: Webhook: SUBMISSION_COMPLETE
    Provider->>Relay: POST /api/v1/ingest/:webhookPathId\nprovider event header = SUBMISSION_COMPLETE\nOccurs on status transition PROCESSING -> (COMPLETE | ERROR)\n(payload includes submission id + status)\n(optional signature)

    alt Submission error
      Relay-->>SCMS: notify: SUBMISSION_FAILED\npayload.submission_status=ERROR
    else Submission success
      Relay-->>SCMS: notify: SUBMISSION_COMPLETE\npayload.submission_status=COMPLETE
      Relay->>Provider: Generate similarity report
      Relay-->>SCMS: notify: PROCESSING_PHASE_STARTED\npayload.phase=\"upload_and_similarity\"
    end
  end

  rect rgba(230,230,230,0.25)
    note over Provider,Relay: Webhook: SIMILARITY_COMPLETE
    Provider->>Relay: POST /api/v1/ingest/:webhookPathId\nprovider event header = SIMILARITY_COMPLETE\n(payload includes similarity results + metadata.custom.check_service_run_id)

    Relay-->>SCMS: notify: PROCESSING_PHASE_COMPLETE\npayload.phase=\"upload_and_similarity\"\npayload.provider_payload=<full payload>\n(+ payload.report.* if available)

    Relay->>Provider: Request report generation (async)\n(e.g. PDF, HTML, other)
    Provider-->>Relay: 202 Accepted (report generation queued)
    Relay-->>SCMS: notify: REPORT_GENERATION_STARTED
  end

  rect rgba(230,230,230,0.25)
    note over Provider,Relay: Webhook: PDF_STATUS (report rendering status)
    Provider->>Relay: POST /api/v1/ingest/:webhookPathId\nprovider event header = PDF_STATUS\nOccurs immediately after render request and on each status change\n(payload includes submission_id + status=PENDING|SUCCESS|FAILED)\n(optional signature)

    alt status=PENDING
      Relay-->>SCMS: notify: REPORT_GENERATION_STARTED
    else status=SUCCESS
      Relay-->>SCMS: notify: REPORT_GENERATION_COMPLETE\ninclude report id/url (format-specific)
    else status=FAILED
      Relay-->>SCMS: notify: REPORT_GENERATION_FAILED\ninclude error details (if present)
    end
  end

  rect rgba(230,230,230,0.25)
    note over SCMS,Relay: SCMS fetches report content (sync)
    SCMS->>Relay: POST /api/v1/services/:service_name/submission/:submission_id/report\ncredentials + request params
    Relay->>Provider: Fetch report artifact (content)\n(format-specific)
    Provider-->>Relay: report bytes/content + content_type
    Relay-->>SCMS: 200 OK (immediate)\nreport content
  end

  rect rgba(230,230,230,0.25)
    note over User,SCMS: SCMS user clicks 'Open and authenticate' (sync)
    User->>SCMS: Click 'Open and authenticate'
    SCMS->>Relay: POST /api/v1/services/:service_name/submission/:submission_id/viewer-url\ncredentials + viewer options
    Relay->>Provider: Create viewer/launch URL
    Provider-->>Relay: viewer_url
    Relay-->>SCMS: 200 OK\nviewer_url (+ expires_in)
  end
```

---

## Endpoints (quick reference)

| Direction | HTTP | Purpose |
|-----------|------|---------|
| SCMS → relay | `POST /api/v1/services/:service_name/submit` | Create submission, upload files, register `notify_url` |
| Provider → relay | `POST /api/v1/ingest/:webhookPathId` | Inbound webhook; relay validates and forwards to SCMS |
| Relay → SCMS | `POST` to `notify_url` from submit | Outbound notify (envelope shape depends on relay version; align SCMS parsing with deployed relay) |
| SCMS → relay | `POST .../submission/:submission_id/report` | Fetch report bytes |
| SCMS → relay | `POST .../submission/:submission_id/viewer-url` | Obtain signed viewer URL |

Path parameter `service_name` is the relay-registered service for this extension (configured as `serviceName` in extension settings).

---

## Webhook event names (logical)

These labels are **logical** event names used in diagrams and extension handling. The wire format (headers, body fields) is defined by the provider; the relay plugin maps inbound requests into relay status and notify payloads.

| Logical event | Typical meaning |
|----------------|-----------------|
| `SUBMISSION_COMPLETE` | Manuscript ingestion finished (success or error) |
| `SIMILARITY_COMPLETE` | Similarity scoring finished |
| `PDF_STATUS` | Report rendering/export status update |

---

## Notify behavior (conceptual)

- Relay may emit **one or more** HTTP callbacks to SCMS per inbound webhook, depending on orchestration (for example, submission outcome plus “processing started”).
- Submit supplies **`notify_url`**; relay persists it with the submission and uses it when processing ingest.
- For credential use on webhook-triggered outbound provider calls, relay must resolve **integration-scoped** secrets (not re-sent on every webhook); see relay configuration and plugin implementation for storage details.

---

## SCMS responsibilities

- Build **`notify_url`** as an absolute URL to the extension’s notify route for the check run (see [submit.md](./submit.md) for the usual pattern).
- Parse notify envelopes consistently with the relay version in use (legacy vs standardized `event` + payload is a common migration point).
- Drive UI from `serviceData` / stage fields updated by notify handling.

---

## Source files

| File | Role |
|------|------|
| `webhook.sequence.mmd` | Mermaid source for tooling / SVG export |
| `webhook.sequence.svg` | Optional static render; regenerate when `.mmd` changes |
