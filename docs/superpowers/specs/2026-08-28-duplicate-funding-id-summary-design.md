# Duplicate Funding ID Summary on PMC Admin Grants Sync

**Date:** 2026-08-28  
**Status:** Draft for review  
**Repo:** `hhmi-os-ext`  
**Surface:** PMC Admin → NIHMS Funding Identifiers (`$siteName.grants.tsx`)

## Goal

Beside the existing “records with missing fields” card, surface duplicate NIHMS funding IDs so operators can see:

1. Collisions that **investigator name does not uniquely resolve** (warn)
2. Collisions that **are uniquely resolved by investigator name** (info)

Both cards must list the relevant deposit-facing record details.

## Context

- HHMI grant IDs are not unique across scientists (local data has collisions such as `HHMI_Chen_J`).
- Selection / deposit identity is `uniqueId = name_grantId` (`createHhmiGrantUniqueId`).
- Deposit PI fields are first name, last name, and email — **not** ORCID.
- ORCID remains only in the existing missing-fields summary.

## Behavior

### Duplicate grouping

- Normalize funding ID with the same trim used elsewhere (`normalizeGrantId` / `grantId.trim()`).
- A funding ID is a duplicate when **≥ 2** scientist records share that normalized ID.
- Empty / missing funding IDs are **not** treated as a duplicate group here (already covered by missing fields).

### Resolved vs unresolved

Within a duplicate funding-ID group:

| Classification | Rule |
| --- | --- |
| **Resolved by investigator name** | Every row has a non-empty `fullName` (trimmed), and all names are unique within the group using the same name normalization as `createHhmiGrantUniqueId` (trim → lower → whitespace → `_`). |
| **Unresolved** | Any other duplicate group: blank `fullName` on any row, or two+ rows that normalize to the same name. |

Name comparison must match deposit/lookup keys so the admin UI agrees with runtime disambiguation.

### UI (Approach A)

Keep `MissingFieldsSummary` unchanged. Above the main grants table (with missing fields), add:

1. **Warn card** (red, same visual language as missing fields) — only if any unresolved groups exist  
   - Title copy e.g. `{N} funding ID(s) duplicated across {M} records — investigator name does not uniquely resolve`  
   - Table columns: **Funding ID · Investigator · First · Last · Email**  
   - Group rows by funding ID (repeat badge or section header per ID)

2. **Info card** (amber/neutral, quieter than warn) — only if any resolved-duplicate groups exist  
   - Title copy e.g. `{N} funding ID(s) duplicated across {M} records — resolved by investigator name`  
   - Same columns and grouping

Missing field values in those detail cells use the existing red “Missing” treatment (`FieldValue`).

Do **not** add ORCID to these duplicate cards.

### Out of scope

- Changing Airtable sync, merge strategy, or deposit validation
- Auto-fixing duplicates in source data
- Highlighting duplicates inside the main grants table (Approach C)
- Combining warn + info into one card (Approach B)

## Implementation sketch

- Pure helpers (prefer unit-tested module next to the route or under `common/`):
  - `groupScientistsByGrantId`
  - `classifyDuplicateGrantGroups` → `{ unresolved, resolved }`
- Presentational components in `$siteName.grants.tsx` (or a small colocated component file if the route grows too large)
- Unit tests for classification edge cases: unique IDs, resolved collision, blank name, case/whitespace name collision, missing grantId ignored

## Success criteria

- Ops can see unresolved collisions with full deposit-relevant rows at a glance
- Ops can confirm name-based disambiguation for expected duplicate funding IDs without treating them as errors
- Classification matches `createHhmiGrantUniqueId` / `getHHMIScientistByGrantIdAndName` behavior
