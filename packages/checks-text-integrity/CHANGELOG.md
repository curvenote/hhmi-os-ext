# @hhmi/checks-text-integrity

## 1.0.0

### Major Changes

- Major version bump for all workspace packages.

### Patch Changes

- 5a43605: Rename Segment analytics events to per-service labels (e.g. "Text Integrity Run Started") instead of HHMI-branded names. Track run lifecycle (started, completed, failed, retried), EULA funnel, results displayed, report opened, PDF download, and user-triggered run/retry actions with consistent properties (`checkKind`, `trigger`, work/version context). Upload-option toggles are tracked by the platform upload route, not these packages.
- 5a43605: Add compact work list summary variants for check summaries shown in timeline popovers.
- 5a43605: Add relay recovery handling, viewer relay context support, and fixed text integrity setting defaults.
- 5a43605: Enforce work check scopes on extension actions and UI: require `work:checks:read` to view checks and download stored PDFs, and `work:checks:dispatch` to run, retry, or call third-party check services.
- 5a43605: Use endpoint-scoped handshake auth for the EULA cache refresh cron webhook, remove `eulaCronSecret`, add builtin cron install in admin, and document setup in `docs/eula-cron.md`.
- 5a43605: Change small matches setting UI and value flow
- 5a43605: Submission time error details should now flow back to the UI
- 5a43605: UI improvements and exposing design component
- 5a43605: Reduce timings before refresh status button appears
- 5a43605: Minimize DB returns
- 5a43605: Reduce check Slack notification frequency to started, terminal outcomes, and errors. Narrow milestone whitelists to terminal webhook events and provider states; stop emitting retry, sweep summary, PDF-stored, and submit-accepted pings.
- 5a43605: Show a retried notice instead of the retry button on superseded failed check runs, and revalidate after a successful retry without duplicate toast/revalidate loops.
- 5a43605: Text integrity upload and admin UI polish: remove the multi-file advisory from the upload check card, and move scheduled EULA refresh cron install/status into its own admin panel above the retry cron card while keeping the manual Refresh EULA button in the service actions row.
- 5a43605: Handle submission updates as a first class state change and do not cause pdf generation automatically on update
- 5a43605: EULA flow support
- 5a43605: Refresh work-list check badges for Proofig and Text Integrity: segment-bar result states, compact ok/count summaries with underline, improved dark-mode contrast, aligned spacing with similarity badges, and restored timeline logo sizing.
- Updated dependencies [5a43605]
- Updated dependencies
- Updated dependencies [5a43605]
  - @hhmi/checks-shared@1.0.0
  - @hhmi/checks-notify@1.0.0

## 0.1.0

### Minor Changes

- 06c8538: First staging ready version of the check integrations.
