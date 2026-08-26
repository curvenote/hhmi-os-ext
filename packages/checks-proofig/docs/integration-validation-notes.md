---
authors:
  - Steve Purves
abstract: ''
exports:
  - format: typst
    template: https://github.com/curvenote-themes/typst-plain/archive/refs/heads/main.zip
    output: integration-notes.pdf
---

# Integration Validation Notes

## Authentication Timing

An authentication request is sent on-demand when a valid token is not already held. Tokens obtained from the `/auth/authenticate` endpoint are cached and reused up until their expiry time (based on the `exp` claim within the token). A fresh authentication request is only issued when the previously cached token has expired. There is no periodic, scheduled, or background authentication polling.

The following user actions may result in an authentication token being requested, if a valid cached token is not already available:

| User Action        | Description                                                                |
| ------------------ | -------------------------------------------------------------------------- |
| Submit a new check | A token is required to submit the document to Proofig for processing.      |
| Refresh status     | A token is required to request the current status of a submission.         |
| Open report        | A token is required to generate an authenticated URL for viewing a report. |

In all cases, if a valid cached token exists it is reused and no authentication request is made.

If a 401 response is received from either the submission or status endpoint, the cached token is invalidated and a single re-authentication attempt is made before failing.

## Status Timing

Requests to the Proofig `/api/status` endpoint are made in the following specific scenarios:

| Trigger                        | Frequency | Description                                                                                                                   |
| ------------------------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| User Triggered - Update Status | Once      | On button click, one status request syncs local state with current remote status.                                             |
| Awaiting: Sub-Image Approval   | Once      | One status request hydrates sub-image approval state on page load for the latest run only.                                    |
| Sub-image approval follow-up   | Once      | After opening the Proofig report, closing the follow-up dialog (Continue, overlay, Escape, or X) triggers one status request. |

These are one-off requests triggered by specific application states. No polling is implemented against any Proofig endpoint.
