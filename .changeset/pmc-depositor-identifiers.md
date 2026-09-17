---
'@hhmi/pmc': patch
---

Show Manuscript ID / PMID / PMCID on the depositor PMC details and review pages via explicit `PublicationInfoCard` props, and keep the work secondary nav visible on submission details by listing each deposit form step (`/site/pmc/deposit`, `/site/pmc/confirm`) in `formPathIncludes`. Listing only the deposit step made the draft-only work guard bounce `confirm` back to `deposit`, which redirects forward again once previewed — an endless loop that blocked every in-progress deposit. Requires `@curvenote/scms-core` with list support for `formPathIncludes`.
