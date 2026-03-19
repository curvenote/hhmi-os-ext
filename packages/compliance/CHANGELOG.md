# @hhmi/compliance

## 0.2.1

### Patch Changes

- d6b92ba: Changes to wording based on feedback
- 5f78c90: - Wording changes to compliance dashboards for major contributions from labs
  - Removed Review Reminder label from publication dialog
  - Review reminder text is now shown for all unresolved issues, not just those within 2 years of review
  -
- Updated dependencies [e2b0efb]
- Updated dependencies [4670e7c]
- Updated dependencies [d6b92ba]
- Updated dependencies [e2b0efb]
- Updated dependencies [e2b0efb]
  - @hhmi/pmc@0.2.1

## 0.2.0

### Minor Changes

- 4ef50cb: Adds the Journal Search Tool for Lab Budget advice

### Patch Changes

- 4ef50cb: Adding an in DB caching layer for the all scientists airtable call
- 535d5df: Fixed lint command and applied it
- Updated dependencies [535d5df]
- Updated dependencies [535d5df]
- Updated dependencies [535d5df]
- Updated dependencies [535d5df]
  - @hhmi/pmc@0.2.0

## 0.1.12

### Patch Changes

- 458d590: Switch to lucide grid aligned open access icon

## 0.1.11

### Patch Changes

- e59b2d9: Add `path` and `isComplianceManager` to all events

## 0.1.10

### Patch Changes

- 5a2d03c: Removed modal closed events
- adadb07: Fixes scientist card update bug when switching between two shared dashboards
- 5a2d03c: Added properties to HHMI_COMPLIANCE_PUBLICATION_MODAL_OPENED event

## 0.1.9

### Patch Changes

- 5d8f298: Attempting to recover from server timeouts via clientside retries
- 3563ebd: Adding analytics to track timeouts

## 0.1.8

### Patch Changes

- Fix critical build issue

## 0.1.7

### Patch Changes

- 75c75b6: Remove feature flag read for launch
- fdd4cdf: Pre-launch analytics overview and improvement
- 342c94e: Show 'Full Name with Preferred' on dashboard when available, falling back to primary

## 0.1.6

### Patch Changes

- b601f5d: No longer storing request-report flag in local storage

## 0.1.5

### Patch Changes

- d60d007: Moved to using skeletonee to improve intial navigation on compliance dashboard

## 0.1.4

### Patch Changes

- 6f5e1a1: Text changes based on acceptance testing

## 0.1.3

### Patch Changes

- c017b55: tuned page loading logic
- c017b55: Add a webhook to enable airtable cache warming from a vercel cron

## 0.1.2

### Patch Changes

- 159ea93: Added scopes for initial feature flagged deployment

## 0.1.1

### Patch Changes

- f512935: Enhanced article links and badges are now shown depending on a configuration setting
- 6179c39: Fix normalization during preprint item loading to read from correct field for the related journal article publisher

## 0.1.0

### Minor Changes

- 3a3d63a: Updates for Prisma v7 in line with core platform upgrade, minimum Curvenote Platform version will be v0.14.0

### Patch Changes

- 50f085a: Clicking the compliance issue panel now filters the covered publications listing
- 50f085a: Use a person's name instead of relying on "scientist"
- 50f085a: Added an invite user link to the ShareReportDialog when the investigator has not yet joined the workspace
- 50f085a: Redirect users with the `hhmi-compliance.admin` scope appropriately on qualification and navigation.
- 18588a0: Enable a lab manager to send a request access email direct from the compliance module
- 1bd089d: Show "Resolved" for compliant issues that required action but are now resolved.
- 50f085a: User a schema based format when storing inbound email payloads
- Updated dependencies [50f085a]
- Updated dependencies [3a3d63a]
  - @hhmi/pmc@0.1.0
