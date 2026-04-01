# Compliance list status

List-row compliance status (badge label, flags, and related UI/email copy) is derived by **`getComplianceListStatus`** in [`src/utils/complianceStatus.ts`](../src/utils/complianceStatus.ts). Vitest cases live in [`src/utils/complianceStatus.spec.ts`](../src/utils/complianceStatus.spec.ts).

**Further notes (no venue objects, links):** [`compliance-status-updates.md`](compliance-status-updates.md)

## Inputs and outputs

- **`compliant`**: publication-level flag; omitted or `undefined` is treated as `false`.
- **Preprint / journal**: each venue may have `complianceIssueStatus` (from Airtable). Empty cells in the table below mean **no status** for that venue (missing field or `''` after trim—same normalization in code).
- **Output**: `getComplianceListStatus` always returns `{ label, compliant, resolved, actionRequested }`. If neither a **journal** nor **preprint** object exists on the input, venue statuses normalize to empty: **Compliant** when `compliant` is true, **Action Requested** when false (CSV cases 19–20).

The product matrix uses **Requested Action Completed** in specs; the UI label is **`Resolved`**.

## Matrix (machine-readable)

The same rows are maintained as CSV for spreadsheets and diffing:

[`compliance-status-matrix.csv`](compliance-status-matrix.csv)

## Matrix and edge cases (table)

| Case | Suite | Compliant | Preprint `complianceIssueStatus` | Journal `complianceIssueStatus` | Status label | Resolved | Action requested | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | matrix | yes | | | Compliant | no | no | Omitted pre/journal = no complianceIssueStatus (empty venue object). |
| 2 | matrix | yes | requested action completed | | Resolved | yes | no | |
| 3 | matrix | yes | | requested action completed | Resolved | yes | no | |
| 4 | matrix | yes | requested action completed | requested action completed | Resolved | yes | no | |
| 5 | matrix | no | | | Action Requested | no | yes | |
| 6 | matrix | no | | hhmi monitoring | No Action Needed | no | no | |
| 7 | matrix | no | | outstanding | Action Requested | no | yes | |
| 8 | matrix | no | | fix in progress | Action Requested | no | yes | |
| 9 | matrix | no | | no action needed | No Action Needed | no | no | |
| 10 | matrix | no | outstanding | | Action Requested | no | yes | |
| 11 | matrix | no | fix in progress | | Action Requested | no | yes | |
| 12 | matrix | no | hhmi monitoring | no action needed | No Action Needed | no | no | |
| 13 | matrix | no | outstanding | no action needed | Action Requested | no | yes | |
| 14 | matrix | no | fix in progress | no action needed | Action Requested | no | yes | |
| 15 | matrix | no | no action needed | hhmi monitoring | No Action Needed | no | no | |
| 16 | matrix | no | no action needed | outstanding | Action Requested | no | yes | |
| 17 | matrix | no | no action needed | fix in progress | Action Requested | no | yes | |
| 18 | edge | (undefined) | | hhmi monitoring | No Action Needed | no | no | compliant omitted on input; treated as false. Same outputs as matrix row 6. |
| 19 | edge | yes | (no venues) | (no venues) | Compliant | no | no | Neither journal nor preprint object on input; same normalized empty venues as matrix row 1. |
| 20 | edge | no | (no venues) | (no venues) | Action Requested | no | yes | Neither journal nor preprint object on input; same normalized empty venues as matrix row 5. |
| 21 | edge | no | | Resolved | Action Requested | no | yes | Journal status 'Resolved' while non-compliant; preprint venue empty (no status). |
| 22 | edge | no | requested action completed | | No Action Needed | no | no | Non-compliant with preprint-only requested action completed; journal venue empty. |
| 23 | edge | yes | Open | Outstanding | Compliant | no | no | Not in product matrix; sanity check for unrelated statuses when compliant. |

This table is **not** an exhaustive permutation of every string Airtable could send; it matches the contracted matrix plus explicit edge tests. When rules change, update the CSV, this doc, and `COMPLIANCE_MATRIX` together.
