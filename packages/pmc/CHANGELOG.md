# @hhmi/pmc

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
