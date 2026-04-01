# Compliance status — documentation updates

## Latest behavior (no venue objects)

`getComplianceListStatus` **always** returns `{ label, compliant, resolved, actionRequested }`.

If the input has **no** `journal` and **no** `preprint` property:

| `compliant` input | Result label      | `resolved` | `action_requested` |
| ----------------- | ----------------- | ---------- | ------------------ |
| `true`            | Compliant         | false      | false              |
| `false` (or omitted) | Action Requested | false   | true               |

This matches **matrix row 1** (empty `{}` venues + compliant) and **row 5** (empty venues + non-compliant). See cases **19–20** in [`compliance-list-status.md`](compliance-list-status.md) and [`compliance-status-matrix.csv`](compliance-status-matrix.csv).

## Full matrix

The authoritative test matrix and table live in:

- [`compliance-list-status.md`](compliance-list-status.md) — human-readable table + file links  
- [`compliance-status-matrix.csv`](compliance-status-matrix.csv) — full case list  
- [`../src/utils/complianceStatus.spec.ts`](../src/utils/complianceStatus.spec.ts) — `COMPLIANCE_MATRIX` + edge tests  

When you change rules, update the spec, [`compliance-status-matrix.csv`](compliance-status-matrix.csv), and [`compliance-list-status.md`](compliance-list-status.md).
