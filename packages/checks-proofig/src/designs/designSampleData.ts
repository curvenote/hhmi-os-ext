import { KnownState, type ProofigDataSchema, type ProofigStage } from '../schema.js';

const NOW_ISO = new Date().toISOString();
export const TWO_MIN_AGO_ISO = new Date(Date.now() - 2 * 60 * 1000).toISOString();
export const FIVE_MIN_AGO_ISO = new Date(Date.now() - 5 * 60 * 1000).toISOString();
export const THIRTY_SEC_AGO_ISO = new Date(Date.now() - 30 * 1000).toISOString();

export const SAMPLE_PENDING_STAGE: ProofigStage = {
  status: 'pending',
  history: [],
  timestamp: NOW_ISO,
};

export const SAMPLE_PROCESSING_STAGE: ProofigStage = {
  status: 'processing',
  history: [{ status: 'pending', timestamp: FIVE_MIN_AGO_ISO }],
  timestamp: TWO_MIN_AGO_ISO,
};

export const SAMPLE_COMPLETED_STAGE: ProofigStage = {
  status: 'completed',
  history: [
    { status: 'pending', timestamp: FIVE_MIN_AGO_ISO },
    { status: 'processing', timestamp: TWO_MIN_AGO_ISO },
  ],
  timestamp: THIRTY_SEC_AGO_ISO,
};

export const SAMPLE_ERROR_STAGE: ProofigStage = {
  status: 'error',
  history: [{ status: 'processing', timestamp: FIVE_MIN_AGO_ISO }],
  timestamp: TWO_MIN_AGO_ISO,
  error: 'The remote service responded with HTTP 502 (Bad Gateway).',
};

export const SAMPLE_REPORT_URL = 'https://example.com/proofig/report/demo';

/** Same path as `PROOFIG_CHECKS_ACTION_PATH` in client (not imported here to avoid a cycle with `client.ts`). */
const DESIGN_REMOTE_STATUS_ACTION_PATH = '/app/extensions/proofig/actions';
const DESIGN_WORK_VERSION_ID = '00000000-0000-4000-8000-000000000001';
const DESIGN_CHECK_RUN_ID = '00000000-0000-4000-8000-000000000002';

/** Placeholder IDs and action path so Refresh / report flows render on the design page (POST will not succeed). */
export const designProofigRefreshProps = {
  remoteStatusActionPath: DESIGN_REMOTE_STATUS_ACTION_PATH,
  workVersionId: DESIGN_WORK_VERSION_ID,
  checkRunId: DESIGN_CHECK_RUN_ID,
} as const;

const COMPLETED_LINEAR_STAGES = {
  initialPost: {
    status: 'completed' as const,
    history: [{ status: 'processing' as const, timestamp: FIVE_MIN_AGO_ISO }],
    timestamp: FIVE_MIN_AGO_ISO,
  },
  subimageDetection: {
    status: 'completed' as const,
    history: [{ status: 'processing' as const, timestamp: FIVE_MIN_AGO_ISO }],
    timestamp: TWO_MIN_AGO_ISO,
  },
  subimageSelection: {
    status: 'completed' as const,
    history: [{ status: 'processing' as const, timestamp: TWO_MIN_AGO_ISO }],
    timestamp: TWO_MIN_AGO_ISO,
  },
  integrityDetection: {
    status: 'completed' as const,
    history: [{ status: 'processing' as const, timestamp: TWO_MIN_AGO_ISO }],
    timestamp: THIRTY_SEC_AGO_ISO,
  },
};

export const SAMPLE_RESULTS_DATA_FLAGGED: ProofigDataSchema = {
  reportId: 'demo-report-flagged',
  reportUrl: SAMPLE_REPORT_URL,
  deleted: false,
  summary: {
    state: KnownState.ReportFlagged,
    subimagesTotal: 24,
    matchesReview: 6,
    matchesReport: 3,
    inspectsReport: 0,
    reportUrl: SAMPLE_REPORT_URL,
    receivedAt: THIRTY_SEC_AGO_ISO,
  },
  stages: {
    ...COMPLETED_LINEAR_STAGES,
    resultsReview: {
      status: 'completed',
      outcome: 'flagged',
      history: [
        { status: 'requested', outcome: 'pending', timestamp: TWO_MIN_AGO_ISO },
        { status: 'completed', outcome: 'flagged', timestamp: THIRTY_SEC_AGO_ISO },
      ],
      timestamp: THIRTY_SEC_AGO_ISO,
    },
  },
};

export const SAMPLE_RESULTS_DATA_FLAGGED_WITH_MANUAL: ProofigDataSchema = {
  reportId: 'demo-report-flagged',
  reportUrl: SAMPLE_REPORT_URL,
  deleted: false,
  summary: {
    state: KnownState.ReportFlagged,
    subimagesTotal: 24,
    matchesReview: 6,
    matchesReport: 2,
    inspectsReport: 1,
    reportUrl: SAMPLE_REPORT_URL,
    receivedAt: THIRTY_SEC_AGO_ISO,
  },
  stages: {
    ...COMPLETED_LINEAR_STAGES,
    resultsReview: {
      status: 'completed',
      outcome: 'flagged',
      history: [
        { status: 'requested', outcome: 'pending', timestamp: TWO_MIN_AGO_ISO },
        { status: 'completed', outcome: 'flagged', timestamp: THIRTY_SEC_AGO_ISO },
      ],
      timestamp: THIRTY_SEC_AGO_ISO,
    },
  },
};

export const SAMPLE_RESULTS_DATA_FLAGGED_NO_PROBLEMS: ProofigDataSchema = {
  reportId: 'demo-report-flagged',
  reportUrl: SAMPLE_REPORT_URL,
  deleted: false,
  summary: {
    state: KnownState.ReportFlagged,
    subimagesTotal: 24,
    matchesReview: 6,
    matchesReport: 0,
    inspectsReport: 0,
    reportUrl: SAMPLE_REPORT_URL,
    receivedAt: THIRTY_SEC_AGO_ISO,
  },
  stages: {
    ...COMPLETED_LINEAR_STAGES,
    resultsReview: {
      status: 'completed',
      outcome: 'flagged',
      history: [
        { status: 'requested', outcome: 'pending', timestamp: TWO_MIN_AGO_ISO },
        { status: 'completed', outcome: 'flagged', timestamp: THIRTY_SEC_AGO_ISO },
      ],
      timestamp: THIRTY_SEC_AGO_ISO,
    },
  },
};

function makeAllClearResultsData({
  reportId,
  subimagesTotal,
}: {
  reportId: string;
  subimagesTotal: number;
}): ProofigDataSchema {
  return {
    reportId,
    reportUrl: SAMPLE_REPORT_URL,
    deleted: false,
    summary: {
      state: KnownState.ReportClean,
      subimagesTotal,
      matchesReview: 0,
      matchesReport: 0,
      inspectsReport: 0,
      reportUrl: SAMPLE_REPORT_URL,
      receivedAt: THIRTY_SEC_AGO_ISO,
    },
    stages: {
      ...COMPLETED_LINEAR_STAGES,
      resultsReview: {
        status: 'completed',
        outcome: 'clean',
        history: [
          { status: 'requested', outcome: 'pending', timestamp: TWO_MIN_AGO_ISO },
          { status: 'completed', outcome: 'clean', timestamp: THIRTY_SEC_AGO_ISO },
        ],
        timestamp: THIRTY_SEC_AGO_ISO,
      },
    },
  };
}

export const SAMPLE_RESULTS_DATA_ALL_CLEAR_2 = makeAllClearResultsData({
  reportId: 'demo-report-clear-2',
  subimagesTotal: 2,
});

export const SAMPLE_RESULTS_DATA_ALL_CLEAR_11 = makeAllClearResultsData({
  reportId: 'demo-report-clear-11',
  subimagesTotal: 11,
});

export const SAMPLE_RESULTS_DATA_AWAITING_REVIEW: ProofigDataSchema = {
  reportId: 'demo-report-awaiting',
  reportUrl: SAMPLE_REPORT_URL,
  deleted: false,
  summary: {
    state: KnownState.AwaitingReview,
    subimagesTotal: 24,
    matchesReview: 3,
    matchesReport: 0,
    inspectsReport: 0,
    reportUrl: SAMPLE_REPORT_URL,
    receivedAt: THIRTY_SEC_AGO_ISO,
  },
  stages: {
    ...COMPLETED_LINEAR_STAGES,
    resultsReview: {
      status: 'requested',
      outcome: 'pending',
      history: [{ status: 'requested', outcome: 'pending', timestamp: TWO_MIN_AGO_ISO }],
      timestamp: TWO_MIN_AGO_ISO,
    },
  },
};

/** Last-known summary after Proofig sends notify state Deleted — report link and refresh are hidden. */
export const SAMPLE_RESULTS_DATA_DELETED: ProofigDataSchema = {
  reportId: 'demo-report-deleted',
  reportUrl: SAMPLE_REPORT_URL,
  deleted: true,
  summary: {
    state: KnownState.Deleted,
    subimagesTotal: 24,
    matchesReview: 0,
    matchesReport: 3,
    inspectsReport: 1,
    reportUrl: SAMPLE_REPORT_URL,
    receivedAt: THIRTY_SEC_AGO_ISO,
  },
  stages: {
    ...COMPLETED_LINEAR_STAGES,
    resultsReview: {
      status: 'completed',
      outcome: 'flagged',
      history: [
        { status: 'requested', outcome: 'pending', timestamp: TWO_MIN_AGO_ISO },
        { status: 'completed', outcome: 'flagged', timestamp: THIRTY_SEC_AGO_ISO },
      ],
      timestamp: THIRTY_SEC_AGO_ISO,
    },
  },
};

const IN_PROGRESS_LINEAR = {
  initialPost: {
    status: 'completed' as const,
    history: [{ status: 'processing' as const, timestamp: FIVE_MIN_AGO_ISO }],
    timestamp: FIVE_MIN_AGO_ISO,
  },
  subimageDetection: {
    status: 'processing' as const,
    history: [{ status: 'pending' as const, timestamp: FIVE_MIN_AGO_ISO }],
    timestamp: TWO_MIN_AGO_ISO,
  },
};

export const SAMPLE_IN_PROGRESS_SUBIMAGE_DETECTION: ProofigDataSchema = {
  reportId: 'demo-in-progress-detection',
  deleted: false,
  stages: IN_PROGRESS_LINEAR,
};

export const SAMPLE_IN_PROGRESS_SUBIMAGE_REVIEW: ProofigDataSchema = {
  reportId: 'demo-in-progress-review',
  reportUrl: SAMPLE_REPORT_URL,
  deleted: false,
  stages: {
    initialPost: {
      status: 'completed' as const,
      history: [{ status: 'processing' as const, timestamp: FIVE_MIN_AGO_ISO }],
      timestamp: FIVE_MIN_AGO_ISO,
    },
    subimageDetection: {
      status: 'completed' as const,
      history: [{ status: 'processing' as const, timestamp: FIVE_MIN_AGO_ISO }],
      timestamp: TWO_MIN_AGO_ISO,
    },
    subimageSelection: {
      status: 'pending' as const,
      history: [{ status: 'processing' as const, timestamp: TWO_MIN_AGO_ISO }],
      timestamp: THIRTY_SEC_AGO_ISO,
    },
  },
};

export const SAMPLE_IN_PROGRESS_INTEGRITY: ProofigDataSchema = {
  reportId: 'demo-in-progress-integrity',
  deleted: false,
  stages: {
    ...IN_PROGRESS_LINEAR,
    subimageDetection: {
      status: 'completed' as const,
      history: [{ status: 'processing' as const, timestamp: FIVE_MIN_AGO_ISO }],
      timestamp: TWO_MIN_AGO_ISO,
    },
    subimageSelection: {
      status: 'completed' as const,
      history: [{ status: 'processing' as const, timestamp: TWO_MIN_AGO_ISO }],
      timestamp: TWO_MIN_AGO_ISO,
    },
    integrityDetection: {
      status: 'processing' as const,
      history: [{ status: 'pending' as const, timestamp: TWO_MIN_AGO_ISO }],
      timestamp: THIRTY_SEC_AGO_ISO,
    },
  },
};

export const SAMPLE_STAGE_ERROR: ProofigDataSchema = {
  reportId: 'demo-stage-error',
  deleted: false,
  stages: {
    initialPost: {
      status: 'completed' as const,
      history: [{ status: 'processing' as const, timestamp: FIVE_MIN_AGO_ISO }],
      timestamp: FIVE_MIN_AGO_ISO,
    },
    subimageDetection: SAMPLE_ERROR_STAGE,
  },
};

export const SAMPLE_INITIAL_UPLOAD: ProofigDataSchema = {
  reportId: 'demo-initial-upload',
  deleted: false,
  stages: {
    initialPost: SAMPLE_PROCESSING_STAGE,
  },
};
