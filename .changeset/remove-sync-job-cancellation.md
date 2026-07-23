---
'@hhmi/pmc': patch
---

Remove unused cancel actions from Funding Id Sync and PMC workflow sync. Align funding sync progress updates with the stale-job reaper so timed-out jobs are not resurrected mid-run.
