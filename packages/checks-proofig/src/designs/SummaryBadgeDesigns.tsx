import type { ProofigDataSchema } from '../schema.js';
import { ProofigSummaryBadge } from '../components/ProofigSummaryBadge.js';
import { ProofigWorkListSummary } from '../components/ProofigWorkListSummary.js';
import { DesignSection, WorkListSummaryChip } from './designShared.js';
import {
  SAMPLE_INITIAL_UPLOAD,
  SAMPLE_IN_PROGRESS_INTEGRITY,
  SAMPLE_IN_PROGRESS_SUBIMAGE_DETECTION,
  SAMPLE_IN_PROGRESS_SUBIMAGE_REVIEW,
  SAMPLE_RESULTS_DATA_ALL_CLEAR_2,
  SAMPLE_RESULTS_DATA_AWAITING_REVIEW,
  SAMPLE_RESULTS_DATA_FLAGGED,
  SAMPLE_RESULTS_DATA_FLAGGED_NO_PROBLEMS,
  SAMPLE_RESULTS_DATA_FLAGGED_WITH_MANUAL,
  SAMPLE_STAGE_ERROR,
} from './designSampleData.js';

type SummaryBadgeSample = {
  name: string;
  description?: string;
  metadata: ProofigDataSchema | undefined;
};

const SUMMARY_BADGE_SAMPLES: SummaryBadgeSample[] = [
  {
    name: 'Uploading to Proofig',
    description: 'Initial post stage — processing.',
    metadata: SAMPLE_INITIAL_UPLOAD,
  },
  {
    name: 'Sub-image detection',
    description: 'Pipeline in progress at detection stage.',
    metadata: SAMPLE_IN_PROGRESS_SUBIMAGE_DETECTION,
  },
  {
    name: 'Ready for sub-image review',
    description: 'Sub-image selection complete — compact work list shows eye icon.',
    metadata: SAMPLE_IN_PROGRESS_SUBIMAGE_REVIEW,
  },
  {
    name: 'Running integrity detection',
    description: 'Integrity detection stage — processing.',
    metadata: SAMPLE_IN_PROGRESS_INTEGRITY,
  },
  {
    name: 'Stage error',
    description: 'Failed stage — destructive badge and work list label.',
    metadata: SAMPLE_STAGE_ERROR,
  },
  {
    name: 'Awaiting review',
    description: 'Matches flagged for human review before final report.',
    metadata: SAMPLE_RESULTS_DATA_AWAITING_REVIEW,
  },
  {
    name: 'All clear',
    description: 'Final report clean — no confirmed problems.',
    metadata: SAMPLE_RESULTS_DATA_ALL_CLEAR_2,
  },
  {
    name: 'Confirmed all clear',
    description: 'Report flagged but review found no confirmed problems.',
    metadata: SAMPLE_RESULTS_DATA_FLAGGED_NO_PROBLEMS,
  },
  {
    name: 'Problems found',
    description: 'Final flagged report with confirmed image problems.',
    metadata: SAMPLE_RESULTS_DATA_FLAGGED,
  },
  {
    name: 'Manual problems',
    description: 'Problems recorded only as manual inspects (no auto matches).',
    metadata: SAMPLE_RESULTS_DATA_FLAGGED_WITH_MANUAL,
  },
];

function SummaryBadgeStateRow({ sample }: { sample: SummaryBadgeSample }) {
  return (
    <div className="grid gap-4 border-b border-gray-100 py-5 last:border-b-0 dark:border-gray-800 lg:grid-cols-[minmax(0,1.2fr)_auto_auto_auto] lg:items-center">
      <div className="space-y-1">
        <div className="text-sm font-medium text-gray-900 dark:text-white">{sample.name}</div>
        {sample.description ? (
          <p className="text-xs text-gray-600 dark:text-gray-400">{sample.description}</p>
        ) : null}
      </div>
      <div className="space-y-1">
        <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Timeline badge
        </div>
        <ProofigSummaryBadge metadata={sample.metadata} />
      </div>
      <div className="space-y-1">
        <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Work list
        </div>
        <WorkListSummaryChip>
          <ProofigWorkListSummary metadata={sample.metadata} />
        </WorkListSummaryChip>
      </div>
      <div className="space-y-1">
        <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Work list (compact)
        </div>
        <WorkListSummaryChip compact>
          <ProofigWorkListSummary metadata={sample.metadata} compact />
        </WorkListSummaryChip>
      </div>
    </div>
  );
}

export function SummaryBadgeDesigns() {
  return (
    <DesignSection
      name="Summary badges"
      description="Timeline badges and My Works check summary chips in normal and compact layouts."
      wide
    >
      <div className="space-y-0">
        {SUMMARY_BADGE_SAMPLES.map((sample) => (
          <SummaryBadgeStateRow key={sample.name} sample={sample} />
        ))}
      </div>
    </DesignSection>
  );
}
