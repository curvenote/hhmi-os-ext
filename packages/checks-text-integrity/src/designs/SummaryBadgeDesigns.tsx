import type { TextIntegrityDataSchema } from '../schema.js';
import { TextIntegritySummaryBadge } from '../components/TextIntegritySummaryBadge.js';
import { TextIntegrityWorkListSummary } from '../components/TextIntegrityWorkListSummary.js';
import { DesignSection, WorkListSummaryChip } from './designShared.js';
import { useTextIntegrityDesignSamples } from './useTextIntegrityDesignSamples.js';

type SummaryBadgeSample = {
  name: string;
  description?: string;
  metadata: TextIntegrityDataSchema | undefined;
};

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
        <TextIntegritySummaryBadge metadata={sample.metadata} />
      </div>
      <div className="space-y-1">
        <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Work list
        </div>
        <WorkListSummaryChip>
          <TextIntegrityWorkListSummary metadata={sample.metadata} />
        </WorkListSummaryChip>
      </div>
      <div className="space-y-1">
        <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Work list (compact)
        </div>
        <WorkListSummaryChip compact>
          <TextIntegrityWorkListSummary metadata={sample.metadata} compact />
        </WorkListSummaryChip>
      </div>
    </div>
  );
}

export function SummaryBadgeDesigns() {
  const samples = useTextIntegrityDesignSamples();

  const summaryBadgeSamples: SummaryBadgeSample[] = [
    {
      name: 'No stages',
      description: 'Check run not started — em dash timeline badge and pending work list label.',
      metadata: samples.noStages,
    },
    {
      name: 'In progress',
      description: 'Submission complete, processing underway.',
      metadata: samples.inProgress,
    },
    {
      name: 'Error',
      description: 'Failed processing stage.',
      metadata: samples.stageError,
    },
    {
      name: '0% similar',
      description: 'Complete report — lowest similarity tier.',
      metadata: samples.results0Percent,
    },
    {
      name: '5% similar',
      description: 'Complete report — low similarity.',
      metadata: samples.results5Percent,
    },
    {
      name: '32% similar',
      description: 'Complete report — moderate similarity.',
      metadata: samples.results32Percent,
    },
    {
      name: '55% similar',
      description: 'Complete report — elevated similarity.',
      metadata: samples.results55Percent,
    },
    {
      name: '80% similar',
      description: 'Complete report — high similarity.',
      metadata: samples.results80Percent,
    },
  ];

  return (
    <DesignSection
      name="Summary badges"
      description="Timeline badges and My Works check summary chips in normal and compact layouts."
      wide
    >
      <div className="space-y-0">
        {summaryBadgeSamples.map((sample) => (
          <SummaryBadgeStateRow key={sample.name} sample={sample} />
        ))}
      </div>
    </DesignSection>
  );
}
