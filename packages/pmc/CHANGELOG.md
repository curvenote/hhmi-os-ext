# @hhmi/pmc

## 1.1.0

### Minor Changes

- 511308b: Enrich HHMI grant deposits with awardee PI (`fname`, `lname`, `email`) looked up from synced grant records, surface grant ID and email in the grant picker, and bump `pmc-utils` to 0.4.0 so FTP renders nested `<PI>` in `bulk_meta.xml`.

### Patch Changes

- 53668d0: Hide investigator emails from the HHMI grant selector; show only name in the closed dropdown
- 7ed2100: Fix false "status was not updated" toast after successful Send to PMC by waiting for loader data to refresh before deciding job outcome.
- 4d0f905: Stop PMC admin action polling/toast loops when a deposit job finishes but the submission transition is stuck.
- 1449e04: Flag duplicate NIHMS funding IDs on the grants sync admin page, with warn vs info cards based on whether investigator name uniquely resolves the collision.
- 0b2dab6: Restore HHMI grant identity as grantId + investigator name (`uniqueId`) so duplicate grant IDs stay distinct and existing submissions keep their selected investigator.
- abba334: Normalize HHMI grant IDs with trim on both lookup and combobox option values so whitespace from Airtable no longer breaks PI resolution.
- 01c95c3: Sign PMC deposit files via resolveBucketForCdn so local MinIO private CDN URLs map to the prv bucket
- 6f76732: Fix admin deposit success toast (fire on job COMPLETED), require two loader/revalidate epochs before stuck warning, validate HHMI PI completeness when grants are selected, and cover clearInitialHHMIGrant grantId matching.

## 1.0.1

### Patch Changes

- 3f052ae: Change PMC Deposit card title
- d39c761: Restore PMC deposit routing after platform draft-resume generalization (`formPathIncludes` + `resolveResumeDraftPath`)

## 1.0.0

### Major Changes

- Major version bump for all workspace packages.

### Minor Changes

- 7b38cc6: Register PMC Deposit as a standalone create-work option with icons and descriptions, add `PMCDepositLauncher` at `/app/works/pmc`, implement the `createWorkVersion` server handler, and fix PMC routing (JSON create response with client navigate, error UI, and route gating).
- 2b06f6b: Add a merge/replace strategy for Funding Id Sync, including a guard that refuses to replace all funding data with an empty Airtable result.
- 2b06f6b: Expand HHMI funding-identifier sync to store preferred/primary first name, preferred last name, and email from Airtable; improve the Funding Id Sync admin UI with richer investigator details, a missing-fields summary, active-job latching/polling, and a 10-run job history.
- a3f06e1: Migrate PMC new-version creation to the platform `cloneDraftWorkVersionFromSource` helper with a PMC-specific `seedMetadataFromSource` that keeps full file inheritance while resetting deposit preview/confirmed flags. Work Details and submission-page clone paths inherit full predecessor state (files, authors, metadata) while preserving submission version wiring, duplicate-draft guards, activities, and deposit redirects. Fix inherited journal name display on new-version deposit forms; add contextual breadcrumbs for new-version deposit and confirm pages; clear DOI-lookup metadata when switching to manual entry without wiping inherited title/journal.

### Patch Changes

- fd64fda: Minimize DB returns
- 2b06f6b: Remove unused cancel actions from Funding Id Sync and PMC workflow sync. Align funding sync progress updates with the stale-job reaper so timed-out jobs are not resurrected mid-run.
- dd88233: Maintaing PMC upload behaviour for new versions while adopting updated clone and seed functions

## 0.2.2

### Patch Changes

- b0ca960: Better links on slcack notifications
- 1596480: Further changes to slack messages to include links

## 0.2.1

### Patch Changes

- e2b0efb: Add missing transitions from `REVIEWER_APPROVED_INITIAL` to `REQUEST_NEW_VERSION` and `NO_ACTION_NEEDED`, update the PMC workflow Mermaid diagram, and replace the split button with a kebab menu for workflow actions.
- 4670e7c: Additional fix to incoming email body parsing to ensure that NIUHMS links are stripped
- d6b92ba: Changed task title
- e2b0efb: Ping slack on inbound email
- e2b0efb: Updated email processor to not ignore emails if there are problems parsing messages from the body, a fallback will be used instead. Made the body parsing more general to allow for more variation in the expected greeting line.

## 0.2.0

### Patch Changes

- 535d5df: Updates to stay aligned with SCMS codebase
- 535d5df: Posting to latest Curvenote task runner utilities
- 535d5df: Aligning to latest `@curvenote/common`
- 535d5df: Fixed lint command and applied it

## 0.1.18

### Patch Changes

- 2bfb8bd: Marking Available on PMC as an end state so that it is treated as a success state in the status timeline

## 0.1.17

### Patch Changes

- e93762b: Fix workflow webhook for submission version in an workspace only statuses, prevent continuous updates but still log unseen statuses as activites
- 0dfae6f: Improve job logging for workflow sync tasks
- 23946e3: Add redirect route for pmc deposit submissions to their latest version
- a0c17b7: Updates to the pizza tracker to allow No Action Needed to be disaplyed after the last known status from activities
- 679e0e5: Assigning service account user to context in workflow sync webhook

## 0.1.16

### Patch Changes

- 7a83694: Limit the Request New Version transition from certain states
- f42cdda: Fixes to workflow sync webhook and improvements in Workflow Sync UI to display more error info and indicate how a job was started

## 0.1.15

### Patch Changes

- 7368b9d: Adding a confirmation dialog for PMC Admin inbox actions
- 7368b9d: Submitters will automatically receive an email when a PMC admin presses "Request New Version"

## 0.1.14

### Patch Changes

- 4c32dda: Made a fix to ensure that inbound submitters files requested emails always cause an auto transition to request new version. Added unit tests.
- a9b438d: Auto transition from PENDING to send_to_pmc without user interaction
- a9b438d: Send and email when a new PMC deposit is made
- a7c978b: Changes to the language around Funding Ids, removing the "grants" from the UI
- 4a1661e: Moved all emails to templates
- 05119e8: Simplified breadcrumbs on deposit and preview pages, linking back to Home at the root link.
- e9a8326: When a deposit is rejected with the message that it should be submited directly by the journal, it will transition to a "No Action Needed" end state

## 0.1.13

### Patch Changes

- 469d8da: Workflow sync will not update certain skipped statuses that are arraved at through workspace interactions e.g. Request New Version or No Action needed, preventing the data form PMC to override these statuses

## 0.1.0

### Minor Changes

- 3a3d63a: Updates for Prisma v7 in line with core platform upgrade, minimum Curvenote Platform version will be v0.14.0

### Patch Changes

- 50f085a: Inbound email data now stored with schema
