---
'@hhmi/checks-shared': patch
'@hhmi/checks-proofig': patch
'@hhmi/checks-text-integrity': patch
---

Rename Segment analytics events to per-service labels (e.g. "Text Integrity Run Started") instead of HHMI-branded names. Track run lifecycle (started, completed, failed, retried), EULA funnel, results displayed, report opened, PDF download, and user-triggered run/retry actions with consistent properties (`checkKind`, `trigger`, work/version context). Upload-option toggles are tracked by the platform upload route, not these packages.
