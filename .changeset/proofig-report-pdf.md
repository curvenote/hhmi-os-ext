---
'@hhmi/checks-proofig': minor
'@hhmi/proofig-pdf-service': minor
---

Add Proofig report PDF generation: a Cloud Run worker renders the report URL to PDF and stores it on the check run; auto-enqueue on All clear / Flagged notify; download and regenerate actions in the results UI (and return-from-Proofig dialog).
