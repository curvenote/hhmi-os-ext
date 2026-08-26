# Text Integrity Operation Sequences

This document summarizes the main runtime flows for the Text Integrity extension.
The extension talks to checks-relay for provider operations and stores normalized
state in the SCMS `checkServiceRun.data.serviceData` object.

![Text Integrity operation overview](./operation-sequence.svg)

## Happy Path

The happy path starts when a user runs the check from SCMS. SCMS creates a check
run, enqueues the submit job, uploads the manuscript to checks-relay, and then
applies provider notify webhooks as they arrive.

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant UI as SCMS UI
  participant Action as Text Integrity action
  participant DB as SCMS DB
  participant Jobs as SCMS jobs
  participant Submit as TEXT_INTEGRITY_SUBMIT
  participant Relay as checks-relay
  participant Provider as Provider plugin/API
  participant Hook as Text Integrity notify route

  User->>UI: Run Text Integrity check
  UI->>Action: intent=execute(workVersionId)
  Action->>DB: Load work version and merged extension config
  Action->>DB: Create checkServiceRun with initial serviceData
  Action->>Jobs: Enqueue TEXT_INTEGRITY_SUBMIT(checkRunId, workVersionId)
  Action-->>UI: success

  Jobs->>Submit: Run submit job
  Submit->>DB: Load work version and check run submitter
  Submit->>DB: Load merged Text Integrity config
  Submit->>Submit: Validate EULA, sign manuscript file, build relayContext
  Submit->>Relay: POST upload(client_id, notify_url, files, metadata)
  Relay->>Provider: Submit manuscript
  Provider-->>Relay: externalId
  Relay-->>Submit: result.externalId
  Submit->>DB: Mark submission processing and store externalId/submissionId
  Submit->>Jobs: Mark submit job completed

  Provider-->>Relay: Lifecycle events
  Relay->>Hook: POST notify envelope(checkRunId)
  Hook->>DB: Apply webhook event to serviceData
  Hook-->>Relay: ok

  opt Report PDF is ready
    Hook->>Jobs: Enqueue PDF persistence job
  end

  UI->>DB: Read check run serviceData
  DB-->>UI: Updated stages, summary/report metadata
```

Key state transitions:

- `startTextIntegrityCheckRun` creates the run with minimal Text Integrity service data.
- `TEXT_INTEGRITY_SUBMIT` calls checks-relay upload with `client_id` set to the check run id.
- The submit job stores the relay `externalId`, then notify webhooks become the primary source of workflow progress.
- The notify route applies webhook envelopes through the shared state machine.

## Status Polling: Catch Up Missed Notify Events

Status polling is used when SCMS needs to ask checks-relay for the current check
status. This is useful if a notify webhook was delayed, missed, or the UI wants
to refresh state from relay.

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant UI as SCMS UI
  participant Action as relay-status action
  participant DB as SCMS DB
  participant Relay as checks-relay
  participant Provider as Provider plugin/API

  User->>UI: Refresh remote status
  UI->>Action: intent=relay-status(checkRunId, workVersionId)
  Action->>DB: Load check run
  Action->>Action: Resolve externalId from serviceData
  Action->>DB: Load merged Text Integrity config
  Action->>Relay: POST check/:externalId/status(client_id)
  Relay->>Provider: Read provider status
  Provider-->>Relay: Current status
  Relay-->>Action: envelopes[]
  Action->>DB: Apply envelopes via applyRelayCheckStatusEnvelopes
  Action-->>UI: success
  UI->>DB: Read updated check run state
```

In this case, relay only returns notify-equivalent envelopes. The action applies
them through the same state machine used by the webhook route, so polling and
webhooks converge on the same stored `serviceData` shape.

## Status Polling: Recovery Starts Report Generation

Relay status can also include a provider-neutral recovery hint. The extension
uses a local lease to make sure only one SCMS request starts the relay recovery
operation for a check run at a time.

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant UI as SCMS UI
  participant Action as relay-status action
  participant DB as SCMS DB
  participant Relay as checks-relay
  participant Provider as Provider plugin/API

  User->>UI: Refresh remote status
  UI->>Action: intent=relay-status(checkRunId, workVersionId)
  Action->>DB: Load check run and externalId
  Action->>Relay: POST check/:externalId/status(client_id)
  Relay->>Provider: Read provider status
  Provider-->>Relay: Processing needs report generation recovery
  Relay-->>Action: envelopes[], recovery=start-report-generation

  Action->>DB: Apply returned envelopes
  Action->>DB: Plan recovery and acquire lease

  alt New relay start is needed
    Action->>Relay: POST report/start-generation(recovery, relayContext)
    Relay->>Provider: Start report generation
    Provider-->>Relay: started
    Relay-->>Action: success
    Action->>DB: Mark relayRecovery.startedAt
    Action->>DB: Apply synthetic PROCESSING_PHASE_STARTED
    Action->>DB: Mark relayRecovery.localProcessingStartedAt
  else Recovery already active or complete
    Action-->>UI: success without another relay start
  end

  Action-->>UI: success
```

The recovery markers intentionally split external and local state:

- `relayRecovery.startedAt` means the external relay `start-report-generation`
  call succeeded.
- `relayRecovery.localProcessingStartedAt` means SCMS also applied the local
  synthetic `PROCESSING_PHASE_STARTED` transition.

This prevents duplicate relay starts while keeping local state reconciliation
retryable.

## Status Polling: Retry Local Reconciliation Only

If relay start succeeds but SCMS fails while applying the synthetic local
processing transition, a later status poll should not call relay again. It should
retry only the local reconciliation step.

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant UI as SCMS UI
  participant Action as relay-status action
  participant DB as SCMS DB
  participant Relay as checks-relay

  Note over DB: relayRecovery.startedAt exists
  Note over DB: relayRecovery.localProcessingStartedAt is missing

  User->>UI: Refresh remote status again
  UI->>Action: intent=relay-status(checkRunId, workVersionId)
  Action->>Relay: POST check/:externalId/status(client_id)
  Relay-->>Action: envelopes[], recovery=start-report-generation
  Action->>DB: Apply returned envelopes
  Action->>DB: Plan recovery

  alt External relay start already recorded
    Action->>DB: Apply synthetic PROCESSING_PHASE_STARTED
    Action->>DB: Mark relayRecovery.localProcessingStartedAt
    Action-->>UI: success
  else No recovery needed
    Action-->>UI: success
  end
```

This covers the edge where the external side effect already happened, but the
local processing stage was not advanced. The follow-up poll reuses the existing
lease owner and does not make a second `report/start-generation` call.

## Operational Notes

- Turnitin EULA terms are cached in SCMS and refreshed on a schedule; see [EULA cache refresh cron](./eula-cron.md).
- The check run id is used as `client_id` for relay upload/status calls and as
  the notify route id.
- The notify route and status polling both apply relay notify envelopes through
  the same Text Integrity state machine.
- Status polling requires an `externalId`; before upload completes, polling
  returns an error telling the user to try again after upload.
- Recovery is guarded by both stage state and relay recovery markers:
  processing states `processing`, `completed`, and `notify-skipped` skip
  recovery.
- A live lease blocks concurrent recovery starts. Once the external start is
  recorded, future polls can only retry local reconciliation or skip.
