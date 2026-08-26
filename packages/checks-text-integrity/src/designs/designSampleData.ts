import { WebhookEvent, type TextIntegrityDataSchema } from '../schema.js';
import type { ServiceManifestSnapshot } from '../serviceDataSchemas.js';

export const TWO_MIN_AGO_ISO = new Date(Date.now() - 2 * 60 * 1000).toISOString();
export const FIVE_MIN_AGO_ISO = new Date(Date.now() - 5 * 60 * 1000).toISOString();
export const THIRTY_SEC_AGO_ISO = new Date(Date.now() - 30 * 1000).toISOString();

const DEFAULT_DESIGN_MANIFEST: ServiceManifestSnapshot = {
  name: 'ithenticate',
  title: 'iThenticate',
  logo: '',
  version: '1.0.0',
};

const COMPLETED_STAGES = {
  submission: {
    status: 'completed' as const,
    history: [{ status: 'processing' as const, timestamp: FIVE_MIN_AGO_ISO }],
    timestamp: FIVE_MIN_AGO_ISO,
  },
  processing: {
    status: 'completed' as const,
    history: [{ status: 'processing' as const, timestamp: FIVE_MIN_AGO_ISO }],
    timestamp: TWO_MIN_AGO_ISO,
  },
  reportGeneration: {
    status: 'completed' as const,
    history: [{ status: 'processing' as const, timestamp: TWO_MIN_AGO_ISO }],
    timestamp: THIRTY_SEC_AGO_ISO,
  },
};

export type TextIntegrityDesignSampleData = {
  resultsData: TextIntegrityDataSchema;
  results0Percent: TextIntegrityDataSchema;
  results5Percent: TextIntegrityDataSchema;
  results32Percent: TextIntegrityDataSchema;
  results55Percent: TextIntegrityDataSchema;
  results80Percent: TextIntegrityDataSchema;
  noStages: TextIntegrityDataSchema | undefined;
  inProgress: TextIntegrityDataSchema;
  stageError: TextIntegrityDataSchema;
};

function resolveDesignManifest(manifest?: ServiceManifestSnapshot): ServiceManifestSnapshot {
  if (!manifest) return DEFAULT_DESIGN_MANIFEST;
  return {
    name: manifest.name || DEFAULT_DESIGN_MANIFEST.name,
    title: manifest.title || DEFAULT_DESIGN_MANIFEST.title,
    logo: manifest.logo || DEFAULT_DESIGN_MANIFEST.logo,
    version: manifest.version || DEFAULT_DESIGN_MANIFEST.version,
  };
}

export function buildTextIntegrityDesignSampleData(
  manifest?: ServiceManifestSnapshot,
): TextIntegrityDesignSampleData {
  const baseManifest = resolveDesignManifest(manifest);

  function makeResultsData(overallMatchPercentage: number): TextIntegrityDataSchema {
    return {
      externalId: `demo-external-${overallMatchPercentage}`,
      submissionId: 'demo-submission-456',
      externalRef: 'demo-provider-789',
      reportPdfId: 'demo-pdf-001',
      manifest: baseManifest,
      stages: COMPLETED_STAGES,
      latest: {
        event: WebhookEvent.ReportGenerationComplete,
        receivedAt: THIRTY_SEC_AGO_ISO,
        overallMatchPercentage,
        reportPdfId: 'demo-pdf-001',
      },
      summaryReport: {
        submissionId: 'demo-submission-456',
        overallMatchPercentage,
        internetMatchPercentage: Math.round(overallMatchPercentage * 0.55),
        publicationMatchPercentage: Math.round(overallMatchPercentage * 0.3),
        submittedWorksMatchPercentage: Math.round(overallMatchPercentage * 0.15),
        status: 'COMPLETE',
        timeRequested: FIVE_MIN_AGO_ISO,
        timeGenerated: THIRTY_SEC_AGO_ISO,
        topSourceLargestMatchedWordCount: 142,
        topMatches: [],
      },
    };
  }

  return {
    resultsData: makeResultsData(32),
    results0Percent: makeResultsData(0),
    results5Percent: makeResultsData(5),
    results32Percent: makeResultsData(32),
    results55Percent: makeResultsData(55),
    results80Percent: makeResultsData(80),
    noStages: {
      manifest: baseManifest,
    } as TextIntegrityDataSchema,
    inProgress: {
      externalId: 'demo-in-progress',
      submissionId: 'demo-submission-in-progress',
      manifest: baseManifest,
      stages: {
        submission: {
          status: 'completed',
          history: [{ status: 'processing', timestamp: FIVE_MIN_AGO_ISO }],
          timestamp: FIVE_MIN_AGO_ISO,
        },
        processing: {
          status: 'processing',
          history: [{ status: 'pending', timestamp: FIVE_MIN_AGO_ISO }],
          timestamp: TWO_MIN_AGO_ISO,
        },
      },
    },
    stageError: {
      externalId: 'demo-error',
      submissionId: 'demo-submission-error',
      manifest: baseManifest,
      stages: {
        submission: {
          status: 'completed',
          history: [{ status: 'processing', timestamp: FIVE_MIN_AGO_ISO }],
          timestamp: FIVE_MIN_AGO_ISO,
        },
        processing: {
          status: 'error',
          history: [{ status: 'processing', timestamp: FIVE_MIN_AGO_ISO }],
          timestamp: TWO_MIN_AGO_ISO,
          error: 'The remote service responded with HTTP 502 (Bad Gateway).',
        },
      },
    },
  };
}

const DEFAULT_SAMPLES = buildTextIntegrityDesignSampleData();

export const SAMPLE_RESULTS_DATA = DEFAULT_SAMPLES.resultsData;
export const SAMPLE_RESULTS_0_PERCENT = DEFAULT_SAMPLES.results0Percent;
export const SAMPLE_RESULTS_5_PERCENT = DEFAULT_SAMPLES.results5Percent;
export const SAMPLE_RESULTS_32_PERCENT = DEFAULT_SAMPLES.results32Percent;
export const SAMPLE_RESULTS_55_PERCENT = DEFAULT_SAMPLES.results55Percent;
export const SAMPLE_RESULTS_80_PERCENT = DEFAULT_SAMPLES.results80Percent;
export const SAMPLE_NO_STAGES = DEFAULT_SAMPLES.noStages;
export const SAMPLE_IN_PROGRESS = DEFAULT_SAMPLES.inProgress;
export const SAMPLE_STAGE_ERROR = DEFAULT_SAMPLES.stageError;
