# Duplicate Funding ID Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show warn + info cards on PMC Admin NIHMS Funding Identifiers for duplicate funding IDs, with deposit-relevant row details.

**Architecture:** Pure classification helpers in `common/` (unit-tested, reuse `normalizeGrantId` + same name normalization as `createHhmiGrantUniqueId`). UI cards in `$siteName.grants.tsx` next to `MissingFieldsSummary`.

**Tech Stack:** TypeScript, React Router route component, Vitest, existing `ui`/`primitives` from `@curvenote/scms-core`.

## Global Constraints

- Duplicate = ≥2 records with same trimmed non-empty `grantId`
- Resolved = every row non-empty `fullName` and unique name keys within group (trim → lower → `\s+` → `_`)
- Unresolved = blank name or colliding normalized names within a duplicate group
- Detail columns: Funding ID · Investigator · First · Last · Email (no ORCID)
- MissingFieldsSummary unchanged
- Warn card red; info card amber/neutral

---

### Task 1: Classification helpers + tests

**Files:**
- Create: `packages/pmc/src/common/duplicate-funding-ids.ts`
- Create: `packages/pmc/src/common/duplicate-funding-ids.test.ts`

**Interfaces:**
- Produces:
  - `normalizeInvestigatorNameKey(name: string): string`
  - `classifyDuplicateGrantGroups(scientists: HHMIScientist[]): { unresolved: DuplicateGrantGroup[]; resolved: DuplicateGrantGroup[] }`
  - `DuplicateGrantGroup = { grantId: string; scientists: HHMIScientist[] }`

- [ ] **Step 1: Write failing tests** for unique IDs (empty), resolved collision, blank name → unresolved, case/whitespace name collision → unresolved, empty grantId ignored
- [ ] **Step 2: Implement helpers** using `normalizeGrantId` and name key matching `createHhmiGrantUniqueId` name part
- [ ] **Step 3: Run** `bun run test:unit -- src/common/duplicate-funding-ids.test.ts` — expect PASS
- [ ] **Step 4: Commit**

### Task 2: UI cards on grants admin page

**Files:**
- Modify: `packages/pmc/src/routes/$siteName.grants.tsx`
- Create: `.changeset/pmc-duplicate-funding-id-summary.md`

**Interfaces:**
- Consumes: `classifyDuplicateGrantGroups` from Task 1
- Produces: `DuplicateFundingIdSummary` rendered above main table with missing fields

- [ ] **Step 1: Add** `DuplicateFundingIdSummary` with unresolved (red) and resolved (amber) cards; reuse `FieldValue` for missing cells
- [ ] **Step 2: Wire** into `GrantsTable` after `MissingFieldsSummary`
- [ ] **Step 3: Lint/compile/test**; changeset; commit

---

## Spec coverage

| Spec item | Task |
| --- | --- |
| Group by trimmed grantId; skip empty | Task 1 |
| Resolved vs unresolved name rules | Task 1 |
| Warn + info cards, deposit columns, no ORCID | Task 2 |
| Keep MissingFieldsSummary | Task 2 |
