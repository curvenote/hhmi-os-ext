import type { Workflow, WorkflowTransition } from '@curvenote/scms-core';

/** Platform site slug for HHMI PMC (URLs, Slack metadata, API paths). */
export const PMC_WORKSPACE_SITE_NAME = 'pmc';

export const PMC_STATE_NAMES = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  NO_ACTION_NEEDED: 'NO_ACTION_NEEDED',
  DEPOSITED: 'DEPOSITED',
  DEPOSIT_FAILED: 'DEPOSIT_FAILED',
  DEPOSIT_CONFIRMED_BY_PMC: 'DEPOSIT_CONFIRMED_BY_PMC',
  DEPOSIT_REJECTED_BY_PMC: 'DEPOSIT_REJECTED_BY_PMC',
  SUBMITTERS_FILES_REQUESTED: 'SUBMITTERS_FILES_REQUESTED',
  REVIEWER_APPROVED_INITIAL: 'REVIEWER_APPROVED_INITIAL',
  REVIEWER_REJECTED_INITIAL: 'REVIEWER_REJECTED_INITIAL',
  NIHMS_CONVERSION_COMPLETE: 'NIHMS_CONVERSION_COMPLETE',
  REVIEWER_APPROVED_FINAL: 'REVIEWER_APPROVED_FINAL',
  AVAILABLE_ON_PMC: 'AVAILABLE_ON_PMC',
  WITHDRAWN_FROM_PMC: 'WITHDRAWN_FROM_PMC',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  REMOVED_FROM_PROCESSING: 'REMOVED_FROM_PROCESSING',
  REQUEST_NEW_VERSION: 'REQUEST_NEW_VERSION',
};

const REQUEST_NEW_VERSION_CONFIRMATION =
  'Are you sure you want to request a new version of this deposit? The submitter will be notified by email.';

const MARK_NO_ACTION_NEEDED_LABELS = {
  button: 'No Action Needed',
  confirmation: 'Are you sure you want to mark this deposit as no action needed?',
  success: 'Deposit has been marked as no action needed',
  action: 'No Action Needed',
  inProgress: 'Marking as no action needed...',
} as const;

const MERMAID: string | undefined = `graph TD
    DRAFT[DRAFT<br/>Draft]
    PENDING[PENDING<br/>New Deposit Uploaded]
    NO_ACTION[NO_ACTION_NEEDED<br/>No Action Needed]
    DEPOSITED[DEPOSITED<br/>Deposit Sent to PMC]
    DEPOSIT_FAILED[DEPOSIT_FAILED<br/>Deposit Failed]
    PMC_CONFIRMED[DEPOSIT_CONFIRMED_BY_PMC<br/>PMC Confirmed Deposit]
    PMC_REJECTED[DEPOSIT_REJECTED_BY_PMC<br/>PMC Rejected Deposit]
    FILES_REQUESTED[SUBMITTERS_FILES_REQUESTED<br/>Additional Files Requested]
    REVIEWER_APPROVED_INIT[REVIEWER_APPROVED_INITIAL<br/>Reviewer Approved Initial]
    REVIEWER_REJECTED_INIT[REVIEWER_REJECTED_INITIAL<br/>Reviewer Rejected Initial]
    NIHMS_COMPLETE[NIHMS_CONVERSION_COMPLETE<br/>NIHMS Conversion Complete]
    REVIEWER_APPROVED_FINAL[REVIEWER_APPROVED_FINAL<br/>Reviewer Approved Final]
    AVAILABLE[AVAILABLE_ON_PMC<br/>Available on PMC]
    WITHDRAWN[WITHDRAWN_FROM_PMC<br/>Withdrawn from PMC]
    REQUEST_NEW[REQUEST_NEW_VERSION<br/>Request New Version]
    CANCELLED[CANCELLED<br/>Cancelled]
    FAILED[FAILED<br/>Failed]
    REMOVED_FROM_PROCESSING[REMOVED_FROM_PROCESSING<br/>Removed from Processing]

    DRAFT -->|submit_to_hhmi| PENDING
    PENDING -->|send_to_pmc| DEPOSITED
    PENDING -->|mark_deposit_failed| DEPOSIT_FAILED
    DEPOSITED -->|confirmed_by_pmc| PMC_CONFIRMED
    DEPOSITED -->|rejected_by_pmc| PMC_REJECTED
    DEPOSIT_FAILED -->|clear_failure_from_deposit_failed| PENDING
    DEPOSIT_FAILED -->|mark_no_action_needed_from_deposit_failed| NO_ACTION
    FAILED -->|clear_failure_from_failed| PENDING
    PMC_CONFIRMED -->|reviewer_approve_initial| REVIEWER_APPROVED_INIT
    PMC_CONFIRMED -->|reviewer_reject_initial| REVIEWER_REJECTED_INIT
    PMC_CONFIRMED -->|request_files| FILES_REQUESTED
    PMC_REJECTED -->|request_files| FILES_REQUESTED
    PMC_REJECTED -->|mark_no_action_needed_from_rejected| NO_ACTION
    REVIEWER_APPROVED_INIT -->|request_files| FILES_REQUESTED
    REVIEWER_APPROVED_INIT -->|request_new_version_from_reviewer_approved| REQUEST_NEW
    REVIEWER_APPROVED_INIT -->|mark_no_action_needed_from_reviewer_approved| NO_ACTION
    REVIEWER_REJECTED_INIT -->|request_files| FILES_REQUESTED
    REVIEWER_REJECTED_INIT -->|mark_no_action_needed_from_reviewer_rejected| NO_ACTION
    FILES_REQUESTED -->|request_new_version_from_files_requested| REQUEST_NEW
    FILES_REQUESTED -->|mark_no_action_needed_from_files_requested| NO_ACTION
    FILES_REQUESTED -->|cancel_deposit_from_files_requested| CANCELLED
    REVIEWER_APPROVED_INIT -->|nihms_conversion_complete| NIHMS_COMPLETE
    NIHMS_COMPLETE -->|reviewer_approve_final| REVIEWER_APPROVED_FINAL
    REVIEWER_APPROVED_FINAL -->|publish_to_pmc| AVAILABLE
    AVAILABLE -->|withdraw_from_pmc| WITHDRAWN
    DEPOSIT_FAILED -->|request_new_version_from_failed| REQUEST_NEW
    PMC_REJECTED -->|request_new_version_from_rejected| REQUEST_NEW
    REVIEWER_REJECTED_INIT -->|request_new_version_from_reviewer_rejected| REQUEST_NEW
    FAILED -->|request_new_version_from_failed_state| REQUEST_NEW
    FAILED -->|mark_no_action_needed_from_failed| NO_ACTION
    REMOVED_FROM_PROCESSING -->|request_new_version_from_removed| REQUEST_NEW
    REMOVED_FROM_PROCESSING -->|mark_no_action_needed_from_removed| NO_ACTION
    REQUEST_NEW -->|complete_cloning| DRAFT

    %% Style end states
    classDef endState fill:#e5f5e5,stroke:#2d5a2d,stroke-width:2px
    classDef errorState fill:#ffe6e6,stroke:#cc0000,stroke-width:2px
    classDef warningState fill:#fff3cd,stroke:#856404,stroke-width:2px
    class NO_ACTION,DEPOSIT_FAILED,PMC_REJECTED,FILES_REQUESTED,REVIEWER_REJECTED_INIT,FAILED,REMOVED_FROM_PROCESSING,REQUEST_NEW,CANCELLED endState
    class DEPOSIT_FAILED,PMC_REJECTED,REVIEWER_REJECTED_INIT,FAILED,REMOVED_FROM_PROCESSING errorState
    class WITHDRAWN,REQUEST_NEW,FILES_REQUESTED warningState

    %% Request New Version from every state except DRAFT and AVAILABLE_ON_PMC`;

export const PMC_DEPOSIT_WORKFLOW = {
  version: 1,
  mermaid: MERMAID,
  name: 'PMC_DEPOSIT',
  label: 'PMC Deposit Workflow',
  initialState: PMC_STATE_NAMES.DRAFT,
  states: {
    [PMC_STATE_NAMES.DRAFT]: {
      name: PMC_STATE_NAMES.DRAFT,
      label: 'Draft',
      messages: {
        admin:
          'The submitter has started a new deposit, but has not yet submitted this version for review.',
      },
      visible: false,
      published: false,
      authorOnly: true,
      inbox: false,
      tags: [],
    },
    [PMC_STATE_NAMES.PENDING]: {
      name: PMC_STATE_NAMES.PENDING,
      label: 'New Deposit Uploaded',
      messages: {
        user: 'Your deposit has been created. The HHMI Support Team will review it shortly.',
        admin: 'New deposit received, pending review.',
      },
      visible: false,
      published: false,
      authorOnly: false,
      inbox: true,
      tags: [],
    },
    [PMC_STATE_NAMES.NO_ACTION_NEEDED]: {
      name: PMC_STATE_NAMES.NO_ACTION_NEEDED,
      label: 'No Action Needed',
      messages: {
        user: 'The HHMI Support Team has marked this deposit as "no action needed".',
        admin: 'This deposit was marked as "no action needed".',
      },
      visible: false,
      published: false,
      authorOnly: false,
      inbox: false,
      tags: ['end'],
    },
    [PMC_STATE_NAMES.DEPOSITED]: {
      name: PMC_STATE_NAMES.DEPOSITED,
      label: 'Deposit Sent to PMC',
      messages: {
        user: 'Your deposit has been sent to PMC.',
        admin: 'This deposit has been successfully uploaded to the PMC bulk submission system.',
      },
      visible: false,
      published: false,
      authorOnly: false,
      inbox: true,
      tags: [],
    },
    [PMC_STATE_NAMES.DEPOSIT_CONFIRMED_BY_PMC]: {
      name: PMC_STATE_NAMES.DEPOSIT_CONFIRMED_BY_PMC,
      label: 'PMC Confirmed Deposit',
      messages: {
        user: 'PMC Confirms deposit has been received. Usually takes about 2 weeks to be available on PMC.',
        admin: 'Initial processing was completed and PMC confirms deposit has been received.',
      },
      visible: false,
      published: false,
      authorOnly: false,
      inbox: true,
      tags: [],
    },
    [PMC_STATE_NAMES.DEPOSIT_REJECTED_BY_PMC]: {
      name: PMC_STATE_NAMES.DEPOSIT_REJECTED_BY_PMC,
      label: 'PMC Rejected Deposit',
      messages: {
        user: 'PMC has rejected the deposit after initial processing. Contact the HHMI Support Team for more information.',
        admin:
          'PMC has rejected the deposit after initial processing. Check error messages for more details.',
      },
      visible: false,
      published: false,
      authorOnly: false,
      inbox: true,
      tags: ['error', 'end'],
    },
    [PMC_STATE_NAMES.SUBMITTERS_FILES_REQUESTED]: {
      name: PMC_STATE_NAMES.SUBMITTERS_FILES_REQUESTED,
      label: 'Additional Files Requested',
      messages: {
        user: 'Additional files have been requested for your deposit. Please provide the requested files.',
        admin: 'Additional files have been requested from the submitter.',
      },
      visible: false,
      published: false,
      authorOnly: false,
      inbox: true,
      tags: ['warning', 'end'],
    },
    [PMC_STATE_NAMES.REVIEWER_APPROVED_INITIAL]: {
      name: PMC_STATE_NAMES.REVIEWER_APPROVED_INITIAL,
      label: 'Reviewer Approved (Initial)',
      messages: {
        user: 'Your deposit has been approved by the HHMI Reviewer.',
        admin: 'This deposit has been approved by the HHMI Reviewer.',
      },
      visible: false,
      published: false,
      authorOnly: false,
      inbox: true,
      tags: [],
    },
    [PMC_STATE_NAMES.REVIEWER_REJECTED_INITIAL]: {
      name: PMC_STATE_NAMES.REVIEWER_REJECTED_INITIAL,
      label: 'Reviewer Rejected (Initial)',
      messages: {
        user: 'Your deposit has been rejected by the nominated reviewer via the NIHMS system. Please contact the HHMI Support Team for more information.',
        admin: 'This deposit has been rejected by the nominated reviewer via the NIHMS system.',
      },
      visible: false,
      published: false,
      authorOnly: false,
      inbox: true,
      tags: ['error', 'end'],
    },
    [PMC_STATE_NAMES.NIHMS_CONVERSION_COMPLETE]: {
      name: PMC_STATE_NAMES.NIHMS_CONVERSION_COMPLETE,
      label: 'NIHMS Conversion Complete',
      messages: {
        all: 'NIHMS conversion process has been completed. The Reviewer will receive an email for final approval.',
      },
      visible: false,
      published: false,
      authorOnly: false,
      inbox: true,
      tags: [],
    },
    [PMC_STATE_NAMES.REVIEWER_APPROVED_FINAL]: {
      name: PMC_STATE_NAMES.REVIEWER_APPROVED_FINAL,
      label: 'Reviewer Approval (Final)',
      messages: {
        user: 'Your deposit has been given final approval by the HHMI Reviewer.',
        admin: 'This deposit has been given final approval by the HHMI Reviewer.',
      },
      visible: false,
      published: false,
      authorOnly: false,
      inbox: true,
      tags: [],
    },
    [PMC_STATE_NAMES.AVAILABLE_ON_PMC]: {
      name: PMC_STATE_NAMES.AVAILABLE_ON_PMC,
      label: 'Available on PMC',
      messages: {
        user: 'Your deposit is now available on PMC.',
        admin: 'This deposit is now available on PMC.',
      },
      visible: false,
      published: false,
      authorOnly: false,
      inbox: true,
      tags: ['end'],
    },
    [PMC_STATE_NAMES.WITHDRAWN_FROM_PMC]: {
      name: PMC_STATE_NAMES.WITHDRAWN_FROM_PMC,
      label: 'Withdrawn from PMC',
      messages: {
        user: 'Your deposit has been withdrawn from PMC by NIHMS.',
        admin: 'This deposit has been withdrawn from PMC by NIHMS.',
      },
      visible: false,
      published: false,
      authorOnly: false,
      inbox: false,
      tags: ['warning', 'end'],
    },
    [PMC_STATE_NAMES.FAILED]: {
      name: PMC_STATE_NAMES.FAILED,
      label: 'Failed',
      messages: {
        user: 'Your deposit has failed. Please contact the HHMI Support Team.',
        admin: 'This deposit has failed to process. Check email errors for more details.',
      },
      visible: false,
      published: false,
      authorOnly: false,
      inbox: true,
      tags: ['error', 'end'],
    },
    [PMC_STATE_NAMES.CANCELLED]: {
      name: PMC_STATE_NAMES.CANCELLED,
      label: 'Cancelled',
      messages: {
        user: 'Your deposit has been cancelled.',
        admin: 'This deposit has been cancelled.',
      },
      visible: false,
      published: false,
      authorOnly: true, // Depositor action; hide Cancel transition in admin UI
      inbox: false,
      tags: ['error', 'end'],
    },
    [PMC_STATE_NAMES.REMOVED_FROM_PROCESSING]: {
      name: PMC_STATE_NAMES.REMOVED_FROM_PROCESSING,
      label: 'Removed from Processing',
      messages: {
        user: 'Your deposit has been removed from processing by NIHMS.',
        admin: 'This deposit has been removed from processing by NIHMS.',
      },
      visible: false,
      published: false,
      authorOnly: false,
      inbox: false,
      tags: ['error', 'end'],
    },
    [PMC_STATE_NAMES.DEPOSIT_FAILED]: {
      name: PMC_STATE_NAMES.DEPOSIT_FAILED,
      label: 'Deposit Failed',
      messages: {
        user: 'Your deposit has failed. Please contact the HHMI Support Team.',
        admin: 'This deposit has failed to process. Check error messages for more details.',
      },
      visible: false,
      published: false,
      authorOnly: false,
      inbox: true,
      tags: ['error', 'end'],
    },
    [PMC_STATE_NAMES.REQUEST_NEW_VERSION]: {
      name: PMC_STATE_NAMES.REQUEST_NEW_VERSION,
      label: 'New Version Requested',
      messages: {
        user: 'A new version of your deposit was requested.',
        admin: 'The submitter has been asked to update their deposit.',
      },
      visible: false,
      published: false,
      authorOnly: false,
      inbox: true,
      tags: ['warning', 'end'],
      requiredScopes: [],
      requiresJob: false,
    },
  },
  transitions: [
    {
      version: 1,
      name: 'submit_to_hhmi',
      sourceStateName: PMC_STATE_NAMES.DRAFT,
      targetStateName: PMC_STATE_NAMES.PENDING,
      labels: {
        button: 'Submit',
        confirmation: 'Are you sure you want to submit this deposit to the HHMI Support Team?',
        success: 'Deposit successfully submitted to HHMI',
        action: 'Submit to HHMI',
        inProgress: 'Submitting to HHMI...',
      },
      userTriggered: true,
      help: 'Submit this deposit to the HHMI Support Team for processing',
      requiredScopes: [],
      requiresJob: false,
    },
    {
      version: 1,
      name: 'send_to_pmc',
      sourceStateName: PMC_STATE_NAMES.PENDING,
      targetStateName: PMC_STATE_NAMES.DEPOSITED,
      labels: {
        button: 'Send to PMC',
        confirmation: 'Confirm you want to send this deposit to PMC',
        success: 'Deposit has been transferred to PMC',
        action: 'Send to PMC',
        inProgress: 'Depositing at PMC...',
      },
      userTriggered: true,
      help: 'Send this deposit to PMC for processing',
      requiredScopes: ['site:submissions:update'], // TODO dedicated PMC scopes and roles
      requiresJob: true,
      options: {
        jobType: 'PMC_DEPOSIT_FTP',
        agency: 'hhmi',
      },
    },
    {
      version: 1,
      name: 'confirmed_by_pmc',
      sourceStateName: PMC_STATE_NAMES.DEPOSITED,
      targetStateName: PMC_STATE_NAMES.DEPOSIT_CONFIRMED_BY_PMC,
      labels: {
        success: 'Deposit has been marked as confirmed by PMC',
      },
      userTriggered: false,
      help: 'Confirmation was received from PMC that the deposit has been accepted without errors',
      requiredScopes: ['site:submissions:update'], // TODO dedicated PMC scopes and roles
      requiresJob: false,
    },
    {
      version: 1,
      name: 'rejected_by_pmc',
      sourceStateName: PMC_STATE_NAMES.DEPOSITED,
      targetStateName: PMC_STATE_NAMES.DEPOSIT_REJECTED_BY_PMC,
      labels: {
        success: 'Deposit has been rejected by PMC',
      },
      userTriggered: false,
      help: 'Confirmation was received from PMC that the deposit has been accepted without errors',
      requiredScopes: ['site:submissions:update'], // TODO dedicated PMC scopes and roles
      requiresJob: false,
    },
    {
      version: 1,
      name: 'request_files_from_pmc_confirmed',
      sourceStateName: PMC_STATE_NAMES.DEPOSIT_CONFIRMED_BY_PMC,
      targetStateName: PMC_STATE_NAMES.SUBMITTERS_FILES_REQUESTED,
      labels: {
        button: 'Request Additional Files',
        confirmation: 'Are you sure you want to request additional files from the submitter?',
        success: 'Additional files have been requested from the submitter',
        action: 'Request Additional Files',
        inProgress: 'Requesting additional files...',
      },
      userTriggered: false,
      help: 'Request additional files from the submitter after PMC confirmation',
      requiredScopes: ['site:submissions:update'],
      requiresJob: false,
    },
    {
      version: 1,
      name: 'request_files_from_pmc_rejected',
      sourceStateName: PMC_STATE_NAMES.DEPOSIT_REJECTED_BY_PMC,
      targetStateName: PMC_STATE_NAMES.SUBMITTERS_FILES_REQUESTED,
      labels: {
        button: 'Request Additional Files',
        confirmation: 'Are you sure you want to request additional files from the submitter?',
        success: 'Additional files have been requested from the submitter',
        action: 'Request Additional Files',
        inProgress: 'Requesting additional files...',
      },
      userTriggered: false,
      help: 'Request additional files from the submitter after PMC rejection',
      requiredScopes: ['site:submissions:update'],
      requiresJob: false,
    },
    {
      version: 1,
      name: 'request_files_from_reviewer_approved',
      sourceStateName: PMC_STATE_NAMES.REVIEWER_APPROVED_INITIAL,
      targetStateName: PMC_STATE_NAMES.SUBMITTERS_FILES_REQUESTED,
      labels: {
        button: 'Request Additional Files',
        confirmation: 'Are you sure you want to request additional files from the submitter?',
        success: 'Additional files have been requested from the submitter',
        action: 'Request Additional Files',
        inProgress: 'Requesting additional files...',
      },
      userTriggered: false,
      help: 'Request additional files from the submitter after reviewer approval',
      requiredScopes: ['site:submissions:update'],
      requiresJob: false,
    },
    {
      version: 1,
      name: 'request_new_version_from_reviewer_approved',
      sourceStateName: PMC_STATE_NAMES.REVIEWER_APPROVED_INITIAL,
      targetStateName: PMC_STATE_NAMES.REQUEST_NEW_VERSION,
      labels: {
        button: 'Request New Version',
        confirmation: REQUEST_NEW_VERSION_CONFIRMATION,
        success: 'New version requested for this deposit',
        action: 'Request New Version',
        inProgress: 'Requesting new version...',
      },
      userTriggered: true,
      help: 'Request a new version of this deposit from the HHMI Support Team.',
      requiredScopes: ['site:submissions:update'],
      requiresJob: false,
    },
    {
      version: 1,
      name: 'mark_no_action_needed_from_reviewer_approved',
      sourceStateName: PMC_STATE_NAMES.REVIEWER_APPROVED_INITIAL,
      targetStateName: PMC_STATE_NAMES.NO_ACTION_NEEDED,
      labels: MARK_NO_ACTION_NEEDED_LABELS,
      userTriggered: true,
      help: 'Mark this deposit as no action needed from the reviewer approved state.',
      requiredScopes: ['site:submissions:update'],
      requiresJob: false,
    },
    {
      version: 1,
      name: 'request_files_from_reviewer_rejected',
      sourceStateName: PMC_STATE_NAMES.REVIEWER_REJECTED_INITIAL,
      targetStateName: PMC_STATE_NAMES.SUBMITTERS_FILES_REQUESTED,
      labels: {
        button: 'Request Additional Files',
        confirmation: 'Are you sure you want to request additional files from the submitter?',
        success: 'Additional files have been requested from the submitter',
        action: 'Request Additional Files',
        inProgress: 'Requesting additional files...',
      },
      userTriggered: false,
      help: 'Request additional files from the submitter after reviewer rejection',
      requiredScopes: ['site:submissions:update'],
      requiresJob: false,
    },
    {
      version: 1,
      name: 'reviewer_approve_initial',
      sourceStateName: PMC_STATE_NAMES.DEPOSIT_CONFIRMED_BY_PMC,
      targetStateName: PMC_STATE_NAMES.REVIEWER_APPROVED_INITIAL,
      labels: {
        button: 'Approve Initial Version',
        confirmation: 'Confirm you want to MANUALLY approve the initial version',
        success: 'Deposit has been MANUALLY proved by the HHMI Reviewer',
        action: 'Approve Initial Version',
        inProgress: 'Marking as approved by the HHMI Reviewer...',
      },
      userTriggered: false,
      help: 'Approve the initial version of the deposit on behalf of the HHMI Reviewer',
      requiredScopes: ['site:submissions:update'], // TODO dedicated PMC scopes and roles
      requiresJob: false,
    },
    {
      version: 1,
      name: 'nihms_conversion_complete',
      sourceStateName: PMC_STATE_NAMES.REVIEWER_APPROVED_INITIAL,
      targetStateName: PMC_STATE_NAMES.NIHMS_CONVERSION_COMPLETE,
      labels: {
        success: 'NIHMS has completed the conversion process',
      },
      userTriggered: false,
      help: 'NIHMS has completed the conversion process',
      requiredScopes: ['site:submissions:update'],
      requiresJob: false,
    },
    {
      version: 1,
      name: 'reviewer_approve_final',
      sourceStateName: PMC_STATE_NAMES.NIHMS_CONVERSION_COMPLETE,
      targetStateName: PMC_STATE_NAMES.REVIEWER_APPROVED_FINAL,
      labels: {
        success: 'Final version approved',
      },
      userTriggered: false,
      help: 'Reviewer approves the final converted version',
      requiredScopes: ['site:submissions:update'],
      requiresJob: false,
    },
    {
      version: 1,
      name: 'publish_to_pmc',
      sourceStateName: PMC_STATE_NAMES.REVIEWER_APPROVED_FINAL,
      targetStateName: PMC_STATE_NAMES.AVAILABLE_ON_PMC,
      labels: {
        success: 'Deposit is now available on PMC',
      },
      userTriggered: false,
      help: 'Deposit is now publicly available on PMC',
      requiredScopes: ['site:submissions:update'],
      requiresJob: false,
    },
    {
      version: 1,
      name: 'withdraw_from_pmc',
      sourceStateName: PMC_STATE_NAMES.AVAILABLE_ON_PMC,
      targetStateName: PMC_STATE_NAMES.WITHDRAWN_FROM_PMC,
      labels: {
        success: 'Deposit has been withdrawn from PMC by NIHMS',
      },
      userTriggered: false,
      help: 'Deposit has been withdrawn from PMC by NIHMS',
      requiredScopes: ['site:submissions:update'],
      requiresJob: false,
    },
    {
      version: 1,
      name: 'mark_failed',
      sourceStateName: null,
      targetStateName: PMC_STATE_NAMES.FAILED,
      labels: {
        success: 'Processing this deposit has failed',
      },
      userTriggered: false,
      help: 'An error has occurred during handling of this deposit which has caused it to fail. ',
      requiredScopes: ['site:submissions:update'],
      requiresJob: false,
    },
    {
      version: 1,
      name: 'cancel_deposit',
      sourceStateName: null,
      targetStateName: PMC_STATE_NAMES.CANCELLED,
      labels: {
        button: 'Cancel Deposit',
        confirmation: 'Are you sure you want to cancel this deposit?',
        success: 'Deposit has been cancelled',
        action: 'Cancel Deposit',
        inProgress: 'Cancelling deposit...',
      },
      userTriggered: true,
      help: 'A deposit can be cancelled at any time. It will not be removed from the system but may be hidden.',
      requiredScopes: ['site:submissions:update'],
      requiresJob: false,
    },
    {
      version: 1,
      name: 'remove_from_processing',
      sourceStateName: null,
      targetStateName: PMC_STATE_NAMES.REMOVED_FROM_PROCESSING,
      labels: {
        success: 'Deposit has been removed from processing by NIHMS',
      },
      userTriggered: false,
      help: 'Deposit has been removed from processing by NIHMS from any state',
      requiredScopes: ['site:submissions:update'],
      requiresJob: false,
    },
    {
      version: 1,
      name: 'mark_deposit_failed',
      sourceStateName: PMC_STATE_NAMES.PENDING,
      targetStateName: PMC_STATE_NAMES.DEPOSIT_FAILED,
      labels: {
        success: 'Deposit has been marked as failed',
      },
      userTriggered: false,
      help: 'System transition: An error has occurred during deposit, marking as failed.',
      requiredScopes: ['site:submissions:update'],
      requiresJob: false,
    },
    {
      version: 1,
      name: 'request_new_version_from_failed',
      sourceStateName: PMC_STATE_NAMES.DEPOSIT_FAILED,
      targetStateName: PMC_STATE_NAMES.REQUEST_NEW_VERSION,
      labels: {
        button: 'Request New Version',
        confirmation: REQUEST_NEW_VERSION_CONFIRMATION,
        success: 'New version requested for this deposit',
        action: 'Request New Version',
        inProgress: 'Requesting new version...',
      },
      userTriggered: true,
      help: 'Request a new version of this deposit from the HHMI Support Team.',
      requiredScopes: ['site:submissions:update'],
      requiresJob: false,
    },
    {
      version: 1,
      name: 'mark_no_action_needed_from_deposit_failed',
      sourceStateName: PMC_STATE_NAMES.DEPOSIT_FAILED,
      targetStateName: PMC_STATE_NAMES.NO_ACTION_NEEDED,
      labels: MARK_NO_ACTION_NEEDED_LABELS,
      userTriggered: true,
      help: 'Mark this deposit as no action needed from the deposit failed state.',
      requiredScopes: ['site:submissions:update'],
      requiresJob: false,
    },
    {
      version: 1,
      name: 'mark_no_action_needed_from_rejected',
      sourceStateName: PMC_STATE_NAMES.DEPOSIT_REJECTED_BY_PMC,
      targetStateName: PMC_STATE_NAMES.NO_ACTION_NEEDED,
      labels: {
        button: 'No Action Needed',
        confirmation: 'Are you sure you want to mark this deposit as no action needed?',
        success: 'Deposit has been marked as no action needed',
        action: 'No Action Needed',
        inProgress: 'Marking as no action needed...',
      },
      userTriggered: true,
      help: 'Mark this deposit as no action needed from the PMC rejected state.',
      requiredScopes: ['site:submissions:update'],
      requiresJob: false,
    },
    {
      version: 1,
      name: 'request_new_version_from_rejected',
      sourceStateName: PMC_STATE_NAMES.DEPOSIT_REJECTED_BY_PMC,
      targetStateName: PMC_STATE_NAMES.REQUEST_NEW_VERSION,
      labels: {
        button: 'Request New Version',
        confirmation: REQUEST_NEW_VERSION_CONFIRMATION,
        success: 'New version requested for this deposit',
        action: 'Request New Version',
        inProgress: 'Requesting new version...',
      },
      userTriggered: true,
      help: 'Request a new version of this deposit from the HHMI Support Team.',
      requiredScopes: ['site:submissions:update'],
      requiresJob: false,
    },
    {
      version: 1,
      name: 'mark_no_action_needed_from_reviewer_rejected',
      sourceStateName: PMC_STATE_NAMES.REVIEWER_REJECTED_INITIAL,
      targetStateName: PMC_STATE_NAMES.NO_ACTION_NEEDED,
      labels: {
        button: 'No Action Needed',
        confirmation: 'Are you sure you want to mark this deposit as no action needed?',
        success: 'Deposit has been marked as no action needed',
        action: 'No Action Needed',
        inProgress: 'Marking as no action needed...',
      },
      userTriggered: true,
      help: 'Mark this deposit as no action needed from the reviewer rejected state.',
      requiredScopes: ['site:submissions:update'],
      requiresJob: false,
    },
    {
      version: 1,
      name: 'request_new_version_from_reviewer_rejected',
      sourceStateName: PMC_STATE_NAMES.REVIEWER_REJECTED_INITIAL,
      targetStateName: PMC_STATE_NAMES.REQUEST_NEW_VERSION,
      labels: {
        button: 'Request New Version',
        confirmation: REQUEST_NEW_VERSION_CONFIRMATION,
        success: 'New version requested for this deposit',
        action: 'Request New Version',
        inProgress: 'Requesting new version...',
      },
      userTriggered: true,
      help: 'Request a new version of this deposit from the HHMI Support Team.',
      requiredScopes: ['site:submissions:update'],
      requiresJob: false,
    },
    {
      version: 1,
      name: 'request_new_version_from_failed_state',
      sourceStateName: PMC_STATE_NAMES.FAILED,
      targetStateName: PMC_STATE_NAMES.REQUEST_NEW_VERSION,
      labels: {
        button: 'Request New Version',
        confirmation: REQUEST_NEW_VERSION_CONFIRMATION,
        success: 'New version requested for this deposit',
        action: 'Request New Version',
        inProgress: 'Requesting new version...',
      },
      userTriggered: true,
      help: 'Request a new version of this deposit from the HHMI Support Team.',
      requiredScopes: ['site:submissions:update'],
      requiresJob: false,
    },
    {
      version: 1,
      name: 'mark_no_action_needed_from_failed',
      sourceStateName: PMC_STATE_NAMES.FAILED,
      targetStateName: PMC_STATE_NAMES.NO_ACTION_NEEDED,
      labels: MARK_NO_ACTION_NEEDED_LABELS,
      userTriggered: true,
      help: 'Mark this deposit as no action needed from the failed state.',
      requiredScopes: ['site:submissions:update'],
      requiresJob: false,
    },
    {
      version: 1,
      name: 'request_new_version_from_removed',
      sourceStateName: PMC_STATE_NAMES.REMOVED_FROM_PROCESSING,
      targetStateName: PMC_STATE_NAMES.REQUEST_NEW_VERSION,
      labels: {
        button: 'Request New Version',
        confirmation: REQUEST_NEW_VERSION_CONFIRMATION,
        success: 'New version requested for this deposit',
        action: 'Request New Version',
        inProgress: 'Requesting new version...',
      },
      userTriggered: true,
      help: 'Request a new version of this deposit from the HHMI Support Team.',
      requiredScopes: ['site:submissions:update'],
      requiresJob: false,
    },
    {
      version: 1,
      name: 'mark_no_action_needed_from_removed',
      sourceStateName: PMC_STATE_NAMES.REMOVED_FROM_PROCESSING,
      targetStateName: PMC_STATE_NAMES.NO_ACTION_NEEDED,
      labels: MARK_NO_ACTION_NEEDED_LABELS,
      userTriggered: true,
      help: 'Mark this deposit as no action needed from the removed from processing state.',
      requiredScopes: ['site:submissions:update'],
      requiresJob: false,
    },
    {
      version: 1,
      name: 'complete_cloning',
      sourceStateName: PMC_STATE_NAMES.REQUEST_NEW_VERSION,
      targetStateName: PMC_STATE_NAMES.DRAFT,
      labels: {
        success: 'Deposit has been marked as draft',
      },
      userTriggered: false,
      help: 'System transition: A new version has been requested, creating a new draft.',
      requiredScopes: ['site:submissions:update'],
      requiresJob: false,
    },
    {
      version: 1,
      name: 'clear_failure_from_failed',
      sourceStateName: PMC_STATE_NAMES.FAILED,
      targetStateName: PMC_STATE_NAMES.PENDING,
      labels: {
        button: 'Clear Failure',
        confirmation:
          'Are you sure you want to clear the failure and reset this deposit to pending?',
        success: 'Failure cleared, deposit reset to pending',
        action: 'Clear Failure',
        inProgress: 'Clearing failure...',
      },
      userTriggered: true,
      help: 'Clear the failure status and reset this deposit back to pending for reprocessing',
      requiredScopes: ['site:submissions:update'],
      requiresJob: false,
    },
    {
      version: 1,
      name: 'clear_failure_from_deposit_failed',
      sourceStateName: PMC_STATE_NAMES.DEPOSIT_FAILED,
      targetStateName: PMC_STATE_NAMES.PENDING,
      labels: {
        button: 'Clear Failure',
        confirmation:
          'Are you sure you want to clear the failure and reset this deposit to pending?',
        success: 'Failure cleared, deposit reset to pending',
        action: 'Clear Failure',
        inProgress: 'Clearing failure...',
      },
      userTriggered: true,
      help: 'Clear the deposit failure status and reset this deposit back to pending for reprocessing',
      requiredScopes: ['site:submissions:update'],
      requiresJob: false,
    },
    {
      version: 1,
      name: 'request_new_version_from_files_requested',
      sourceStateName: PMC_STATE_NAMES.SUBMITTERS_FILES_REQUESTED,
      targetStateName: PMC_STATE_NAMES.REQUEST_NEW_VERSION,
      labels: {
        button: 'Request New Version',
        confirmation: REQUEST_NEW_VERSION_CONFIRMATION,
        success: 'New version requested for this deposit',
        action: 'Request New Version',
        inProgress: 'Requesting new version...',
      },
      userTriggered: true,
      help: 'Request a new version of this deposit from the HHMI Support Team.',
      requiredScopes: ['site:submissions:update'],
      requiresJob: false,
    },
    {
      version: 1,
      name: 'mark_no_action_needed_from_files_requested',
      sourceStateName: PMC_STATE_NAMES.SUBMITTERS_FILES_REQUESTED,
      targetStateName: PMC_STATE_NAMES.NO_ACTION_NEEDED,
      labels: MARK_NO_ACTION_NEEDED_LABELS,
      userTriggered: true,
      help: 'Mark this deposit as no action needed from the files requested state.',
      requiredScopes: ['site:submissions:update'],
      requiresJob: false,
    },
    {
      version: 1,
      name: 'cancel_deposit_from_files_requested',
      sourceStateName: PMC_STATE_NAMES.SUBMITTERS_FILES_REQUESTED,
      targetStateName: PMC_STATE_NAMES.CANCELLED,
      labels: {
        button: 'Cancel Deposit',
        confirmation: 'Are you sure you want to cancel this deposit?',
        success: 'Deposit has been cancelled',
        action: 'Cancel Deposit',
        inProgress: 'Cancelling deposit...',
      },
      userTriggered: true,
      help: 'Cancel this deposit from the files requested state',
      requiredScopes: ['site:submissions:update'],
      requiresJob: false,
    },
  ],
};

/**
 * Mutually exclusive state mappings for PMC workflow
 * When a variant state appears in activity feed, it replaces the critical path state
 * Each critical path state can have multiple alternatives (array format)
 */
export const PMC_MUTUALLY_EXCLUSIVE_STATES = {
  [PMC_STATE_NAMES.DEPOSIT_CONFIRMED_BY_PMC]: [PMC_STATE_NAMES.DEPOSIT_REJECTED_BY_PMC],
  [PMC_STATE_NAMES.DEPOSITED]: [PMC_STATE_NAMES.DEPOSIT_FAILED],
  [PMC_STATE_NAMES.REVIEWER_APPROVED_INITIAL]: [PMC_STATE_NAMES.REVIEWER_REJECTED_INITIAL],
  [PMC_STATE_NAMES.SUBMITTERS_FILES_REQUESTED]: [PMC_STATE_NAMES.REQUEST_NEW_VERSION],
} as const;

/**
 * End condition states that should be displayed in the tramline when they differ from activity feed
 */
export const PMC_END_CONDITION_STATES = [
  PMC_STATE_NAMES.FAILED,
  PMC_STATE_NAMES.DEPOSIT_FAILED,
  PMC_STATE_NAMES.DEPOSIT_REJECTED_BY_PMC,
  PMC_STATE_NAMES.SUBMITTERS_FILES_REQUESTED,
  PMC_STATE_NAMES.CANCELLED,
  PMC_STATE_NAMES.REMOVED_FROM_PROCESSING,
  PMC_STATE_NAMES.REVIEWER_REJECTED_INITIAL,
  PMC_STATE_NAMES.REQUEST_NEW_VERSION,
  PMC_STATE_NAMES.NO_ACTION_NEEDED,
] as const;

/**
 * Critical path states for PMC workflow
 */
export const PMC_CRITICAL_PATH_STATES = [
  PMC_STATE_NAMES.PENDING,
  PMC_STATE_NAMES.DEPOSITED,
  PMC_STATE_NAMES.DEPOSIT_CONFIRMED_BY_PMC,
  PMC_STATE_NAMES.REVIEWER_APPROVED_INITIAL,
  PMC_STATE_NAMES.NIHMS_CONVERSION_COMPLETE,
  PMC_STATE_NAMES.REVIEWER_APPROVED_FINAL,
  PMC_STATE_NAMES.AVAILABLE_ON_PMC,
] as const;

/**
 * Priority order for admin action buttons: earlier entries appear first (primary in SplitButton).
 * - Exact transition names list first.
 * - Prefix 'request_new_version' matches all request_new_version_from_* transitions.
 */
const ADMIN_ACTION_PRIORITY: (string | { prefix: string })[] = [
  'send_to_pmc',
  { prefix: 'request_new_version' },
];

function getTransitionSortKey(name: string): number {
  for (let i = 0; i < ADMIN_ACTION_PRIORITY.length; i++) {
    const rule = ADMIN_ACTION_PRIORITY[i];
    if (typeof rule === 'string') {
      if (name === rule) return i;
    } else if (name.startsWith(rule.prefix)) {
      return i;
    }
  }
  return ADMIN_ACTION_PRIORITY.length;
}

/**
 * Returns user-triggered transitions available for the given workflow state in the admin UI:
 * state-specific transitions plus "from any state" (sourceStateName === null), deduplicated by
 * target (prefer state-specific), excluding transitions whose target state is authorOnly.
 * Results are ordered so that Send to PMC and Request New Version are prioritised (first in list).
 */
export function getAvailableTransitionsForAdmin(
  workflow: Workflow | undefined,
  currentStatus: string,
): WorkflowTransition[] {
  const allCandidates =
    workflow?.transitions?.filter((t: WorkflowTransition) => {
      if (!t.userTriggered || t.targetStateName === currentStatus) return false;
      const fromCurrent = t.sourceStateName === currentStatus;
      const fromAny = t.sourceStateName === null;
      if (fromAny && currentStatus === PMC_STATE_NAMES.DRAFT) return false;
      return fromCurrent || fromAny;
    }) ?? [];
  const byTarget = new Map<string, WorkflowTransition>();
  for (const t of allCandidates) {
    const existing = byTarget.get(t.targetStateName);
    if (!existing || (t.sourceStateName === currentStatus && existing.sourceStateName === null)) {
      byTarget.set(t.targetStateName, t);
    }
  }
  const list = Array.from(byTarget.values()).filter(
    (t) => !workflow?.states?.[t.targetStateName]?.authorOnly,
  );
  list.sort((a, b) => getTransitionSortKey(a.name) - getTransitionSortKey(b.name));
  return list;
}

// Export an array of workflows that this extension provides
export const workflows: Workflow[] = [PMC_DEPOSIT_WORKFLOW];
