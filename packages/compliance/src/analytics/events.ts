export enum HHMITrackEvent {
  HHMI_COMPLIANCE_SCIENTIST_SELECTED = 'HHMI Compliance Scientist Selected',
  HHMI_COMPLIANCE_FILTER_APPLIED = 'HHMI Compliance Filter Applied',
  HHMI_COMPLIANCE_POLICY_OPENED = 'HHMI Compliance Policy URL Opened',
  HHMI_COMPLIANCE_PUBLICATION_MODAL_OPENED = 'HHMI Compliance Publication Modal Opened',
  HHMI_COMPLIANCE_PMC_LINK_CLICKED = 'HHMI Compliance PMC Link Clicked',
  HHMI_COMPLIANCE_PUBMED_LINK_CLICKED = 'HHMI Compliance PubMed Link Clicked',
  HHMI_COMPLIANCE_DOI_LINK_CLICKED = 'HHMI Compliance DOI Link Clicked',
  HHMI_COMPLIANCE_URL_LINK_CLICKED = 'HHMI Compliance URL Link Clicked',
  HHMI_COMPLIANCE_ENHANCED_PMC_LINK_CLICKED = 'HHMI Compliance Enhanced PMC Link Clicked',
  HHMI_COMPLIANCE_ENHANCED_PREPRINT_LINK_CLICKED = 'HHMI Compliance Enhanced Preprint Link Clicked',
  HHMI_COMPLIANCE_REPORT_SHARED = 'HHMI Compliance Report Shared',
  HHMI_COMPLIANCE_REPORT_ACCESS_REVOKED = 'HHMI Compliance Report Access Revoked',
  HHMI_COMPLIANCE_REPORT_HIDDEN = 'HHMI Compliance Report Hidden',
  HHMI_COMPLIANCE_REPORT_SHARE_CLICKED = 'HHMI Compliance Share Report Clicked',
  HHMI_COMPLIANCE_ACCESS_GRANTS_VIEWED = 'HHMI Compliance Access Grants Viewed',
  HHMI_COMPLIANCE_HELP_REQUESTED = 'HHMI Compliance Help Requested',
  HHMI_COMPLIANCE_REPORT_TASK_CLICKED = 'HHMI Compliance Report Task Card Clicked',
  HHMI_COMPLIANCE_ROLE_QUALIFIED = 'HHMI Compliance Role Qualified',
  HHMI_COMPLIANCE_DASHBOARD_REQUESTED = 'HHMI Compliance Dashboard Requested',
  HHMI_COMPLIANCE_JOURNAL_SEARCH_TASK_CLICKED = 'HHMI Compliance Journal Search Task Clicked',
  HHMI_COMPLIANCE_JOURNAL_SEARCH_ADVICE_SHOWN = 'HHMI Compliance Journal Search Advice Shown',

  // Wizard flow events
  COMPLIANCE_WIZARD_CLICKED = 'PMC Compliance Wizard Clicked',
  COMPLIANCE_WIZARD_STARTED = 'PMC Compliance Wizard Started',
  COMPLIANCE_WIZARD_COMPLETED = 'PMC Compliance Wizard Completed',
  COMPLIANCE_WIZARD_RESTARTED = 'PMC Compliance Wizard Restarted',
  COMPLIANCE_WIZARD_FINISHED = 'PMC Compliance Wizard Finished',

  // Question interaction events
  COMPLIANCE_WIZARD_QUESTION_ANSWERED = 'PMC Compliance Wizard Question Answered',
  COMPLIANCE_WIZARD_QUESTION_CHANGED = 'PMC Compliance Wizard Question Changed',

  // Outcome action events
  COMPLIANCE_WIZARD_OUTCOME_VIEWED = 'PMC Compliance Wizard Outcome Viewed',
  COMPLIANCE_WIZARD_BIORXIV_CLICKED = 'PMC Compliance Wizard BioRxiv Link Clicked',
  COMPLIANCE_WIZARD_PMC_DEPOSIT_CLICKED = 'PMC Compliance Wizard PMC Deposit Clicked',
  COMPLIANCE_WIZARD_HELP_LINK_CLICKED = 'PMC Compliance Wizard Help Link Clicked',

  COMPLIANCE_WIZARD_CONFIRM_USEFUL = 'PMC Compliance Wizard Confirmed Useful',
  COMPLIANCE_WIZARD_CONFIRM_NEED_HELP = 'PMC Compliance Wizard Confirmed Need Help',
  COMPLIANCE_WIZARD_HELP_REQUEST_SUBMITTED = 'PMC Compliance Wizard Help Request Submitted',

  // Timeout events
  HHMI_COMPLIANCE_SERVER_TIMEOUT = 'HHMI Compliance Server Timeout',
  HHMI_COMPLIANCE_TIMEOUT_RETRY = 'HHMI Compliance Timeout Retry',
}

export const HHMITrackEventDescriptions: Record<HHMITrackEvent, string> = {
  [HHMITrackEvent.HHMI_COMPLIANCE_SCIENTIST_SELECTED]:
    'User selected a scientist for compliance review',
  [HHMITrackEvent.HHMI_COMPLIANCE_FILTER_APPLIED]: 'User applied a filter in HHMI compliance list',
  [HHMITrackEvent.HHMI_COMPLIANCE_POLICY_OPENED]: 'User opened the HHMI policy URL',
  [HHMITrackEvent.HHMI_COMPLIANCE_PMC_LINK_CLICKED]: 'User clicked on a PMC link',
  [HHMITrackEvent.HHMI_COMPLIANCE_PUBMED_LINK_CLICKED]: 'User clicked on a PubMed link',
  [HHMITrackEvent.HHMI_COMPLIANCE_DOI_LINK_CLICKED]: 'User clicked on a DOI link',
  [HHMITrackEvent.HHMI_COMPLIANCE_URL_LINK_CLICKED]: 'User clicked on a URL link',
  [HHMITrackEvent.HHMI_COMPLIANCE_ENHANCED_PMC_LINK_CLICKED]:
    'User clicked on an enhanced PMC link',
  [HHMITrackEvent.HHMI_COMPLIANCE_ENHANCED_PREPRINT_LINK_CLICKED]:
    'User clicked on an enhanced preprint link',
  [HHMITrackEvent.HHMI_COMPLIANCE_HELP_REQUESTED]: 'User requested help or support',
  [HHMITrackEvent.HHMI_COMPLIANCE_REPORT_SHARED]: 'Compliance report shared with another user',
  [HHMITrackEvent.HHMI_COMPLIANCE_REPORT_ACCESS_REVOKED]: 'Access to compliance report revoked',
  [HHMITrackEvent.HHMI_COMPLIANCE_REPORT_HIDDEN]: 'User hid their compliance report',
  [HHMITrackEvent.HHMI_COMPLIANCE_ACCESS_GRANTS_VIEWED]:
    'Admin viewed access grants for a scientist compliance report',
  [HHMITrackEvent.HHMI_COMPLIANCE_PUBLICATION_MODAL_OPENED]:
    'User opened the publication modal via article title',
  [HHMITrackEvent.HHMI_COMPLIANCE_REPORT_SHARE_CLICKED]:
    'User clicked the share this report button',
  [HHMITrackEvent.HHMI_COMPLIANCE_REPORT_TASK_CLICKED]:
    'User clicked the compliance report task card from dashboard',
  [HHMITrackEvent.HHMI_COMPLIANCE_ROLE_QUALIFIED]:
    'User qualified their compliance role (scientist or lab-manager)',
  [HHMITrackEvent.HHMI_COMPLIANCE_DASHBOARD_REQUESTED]:
    'User requested another user to share their compliance dashboard',
  [HHMITrackEvent.HHMI_COMPLIANCE_JOURNAL_SEARCH_TASK_CLICKED]:
    'User clicked the Journal Payment Lookup Tool task card from dashboard',
  [HHMITrackEvent.HHMI_COMPLIANCE_JOURNAL_SEARCH_ADVICE_SHOWN]:
    'Spending policy advice was shown in the Journal Payment Lookup Tool',
  [HHMITrackEvent.COMPLIANCE_WIZARD_CLICKED]:
    'User clicked the compliance wizard task card button on dashboard',
  [HHMITrackEvent.COMPLIANCE_WIZARD_STARTED]: 'User started the PMC compliance wizard page',
  [HHMITrackEvent.COMPLIANCE_WIZARD_COMPLETED]:
    'User completed the PMC compliance wizard; only tracks the first completion after wizard start, does not fire again after restart',
  [HHMITrackEvent.COMPLIANCE_WIZARD_RESTARTED]:
    'User clicked the Start Over button in PMC compliance wizard',
  [HHMITrackEvent.COMPLIANCE_WIZARD_FINISHED]:
    'User clicked Finish button in PMC compliance wizard',

  [HHMITrackEvent.COMPLIANCE_WIZARD_QUESTION_ANSWERED]:
    'User answered a question in the PMC compliance wizard',
  [HHMITrackEvent.COMPLIANCE_WIZARD_QUESTION_CHANGED]:
    'User changed an answer in the PMC compliance wizard',

  [HHMITrackEvent.COMPLIANCE_WIZARD_OUTCOME_VIEWED]:
    'User viewed compliance outcomes; fires every time outcomes change during the wizard session',
  [HHMITrackEvent.COMPLIANCE_WIZARD_BIORXIV_CLICKED]: 'User clicked on BioRxiv submission link',
  [HHMITrackEvent.COMPLIANCE_WIZARD_PMC_DEPOSIT_CLICKED]: 'User clicked on PMC deposit task card',
  [HHMITrackEvent.COMPLIANCE_WIZARD_HELP_LINK_CLICKED]: 'User clicked on help link',

  [HHMITrackEvent.COMPLIANCE_WIZARD_CONFIRM_USEFUL]:
    'After completing the wizard, user confirmed the wizard was useful',
  [HHMITrackEvent.COMPLIANCE_WIZARD_CONFIRM_NEED_HELP]:
    'After completing the wizard, user confirmed they stil needed help',
  [HHMITrackEvent.COMPLIANCE_WIZARD_HELP_REQUEST_SUBMITTED]:
    'User submitted a help request form after indicating they needed help',

  [HHMITrackEvent.HHMI_COMPLIANCE_SERVER_TIMEOUT]:
    'Server timeout occurred while loading compliance data (Airtable query took too long)',
  [HHMITrackEvent.HHMI_COMPLIANCE_TIMEOUT_RETRY]:
    'User clicked retry button after experiencing a server timeout',
};
