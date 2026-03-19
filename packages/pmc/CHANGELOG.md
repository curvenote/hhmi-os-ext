# @hhmi/pmc

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
