---
'@hhmi/pmc': patch
---

Show Manuscript ID / PMID / PMCID on depositor PMC pages, keep formPathIncludes as `/site/pmc/` so deposit/confirm hide work secondary nav (and avoid the confirm↔deposit redirect loop), prefix displayed manuscript IDs with NIHMS, and allow confirm auto-send_to_pmc without site:submissions:update (runs as the depositor).
