---
'@hhmi/checks-notify': patch
'@hhmi/checks-text-integrity': patch
'@hhmi/checks-proofig': patch
---

Reduce check Slack notification frequency to started, terminal outcomes, and errors. Narrow milestone whitelists to terminal webhook events and provider states; stop emitting retry, sweep summary, PDF-stored, and submit-accepted pings.
