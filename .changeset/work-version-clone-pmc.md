---
'@hhmi/pmc': minor
---

Migrate PMC new-version creation to the platform `cloneDraftWorkVersionFromSource` helper. Work Details and submission-page clone paths inherit full predecessor state (files, authors, metadata) while preserving submission version wiring, duplicate-draft guards, activities, and deposit redirects. Fix inherited journal name display on new-version deposit forms; add contextual breadcrumbs for new-version deposit and confirm pages; clear DOI-lookup metadata when switching to manual entry without wiping inherited title/journal.
