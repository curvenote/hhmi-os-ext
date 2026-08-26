# @hhmi/checks-shared

## 1.0.0

### Major Changes

- Major version bump for all workspace packages.

### Patch Changes

- 5a43605: Rename Segment analytics events to per-service labels (e.g. "Text Integrity Run Started") instead of HHMI-branded names. Track run lifecycle (started, completed, failed, retried), EULA funnel, results displayed, report opened, PDF download, and user-triggered run/retry actions with consistent properties (`checkKind`, `trigger`, work/version context). Upload-option toggles are tracked by the platform upload route, not these packages.
