# @hhmi/checks-proofig

## 1.0.0

### Major Changes

- Major version bump for all workspace packages.

### Minor Changes

- 5a43605: Add Proofig report PDF generation: a Cloud Run worker renders the report URL to PDF and stores it on the check run; auto-enqueue on All clear / Flagged notify; download and regenerate actions in the results UI (and return-from-Proofig dialog).

### Patch Changes

- 5a43605: Rename Segment analytics events to per-service labels (e.g. "Text Integrity Run Started") instead of HHMI-branded names. Track run lifecycle (started, completed, failed, retried), EULA funnel, results displayed, report opened, PDF download, and user-triggered run/retry actions with consistent properties (`checkKind`, `trigger`, work/version context). Upload-option toggles are tracked by the platform upload route, not these packages.
- 5a43605: Add compact work list summary variants for check summaries shown in timeline popovers.
- 5a43605: Enforce work check scopes on extension actions and UI: require `work:checks:read` to view checks and download stored PDFs, and `work:checks:dispatch` to run, retry, or call third-party check services.
- 5a43605: Minimize DB returns
- 5a43605: tightening up UI layouts
- 5a43605: Reduce check Slack notification frequency to started, terminal outcomes, and errors. Narrow milestone whitelists to terminal webhook events and provider states; stop emitting retry, sweep summary, PDF-stored, and submit-accepted pings.
- 5a43605: Show a retried notice instead of the retry button on superseded failed check runs, and revalidate after a successful retry without duplicate toast/revalidate loops.
- 5a43605: Exporting design components. Improvements to UI and messaging.
- 5a43605: UI Tweaks
- 5a43605: Clean up Proofig failure handling, admin actions, and summary display details.
- 5a43605: Improve the configuration of upload dialog dropzone
- 5a43605: Refresh work-list check badges for Proofig and Text Integrity: segment-bar result states, compact ok/count summaries with underline, improved dark-mode contrast, aligned spacing with similarity badges, and restored timeline logo sizing.
- Updated dependencies [5a43605]
- Updated dependencies
- Updated dependencies [5a43605]
  - @hhmi/checks-shared@1.0.0
  - @hhmi/checks-notify@1.0.0

## 0.1.0

### Minor Changes

- 06c8538: First staging ready version of the check integrations.
