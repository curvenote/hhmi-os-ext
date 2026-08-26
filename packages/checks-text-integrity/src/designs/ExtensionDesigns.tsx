import { extensionPackageTitle } from '../meta.js';
import { ProcessingProgressArea } from '../components/progress/ProcessingProgressArea.js';
import { SimpleErrorArea } from '../components/progress/SimpleErrorArea.js';
import { StageProgressArea } from '../components/progress/StageProgressArea.js';
import { SubmissionCompleteProgressArea } from '../components/progress/SubmissionCompleteProgressArea.js';
import { SubmittingProgressArea } from '../components/progress/SubmittingProgressArea.js';
import { TextIntegrityResultsArea } from '../components/TextIntegrityResultsArea.js';
import { DesignSection } from './designShared.js';
import { SummaryBadgeDesigns } from './SummaryBadgeDesigns.js';
import { useTextIntegrityDesignSamples } from './useTextIntegrityDesignSamples.js';

export function ExtensionDesigns() {
  const samples = useTextIntegrityDesignSamples();

  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          {extensionPackageTitle} — Progress &amp; Results
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Each component is rendered in its main display state with hard-coded sample data.
        </p>
      </header>

      <SummaryBadgeDesigns />

      <DesignSection
        name="StageProgressArea"
        description="Base segmented progress bar with a static message subline."
      >
        <StageProgressArea
          step={2}
          numSteps={3}
          message="Submission received and queued for processing…"
        />
      </DesignSection>

      <DesignSection
        name="SimpleErrorArea"
        description="Error alert plus segmented bar: earlier stages green, failed segment red."
      >
        <SimpleErrorArea
          numSteps={3}
          segmentTones={['complete', 'error', 'muted']}
          failedStageTitle="Processing"
          error="The remote service responded with HTTP 502 (Bad Gateway)."
        />
      </DesignSection>

      <DesignSection
        name="SubmittingProgressArea"
        description="Stage 1 — uploading the work to the text integrity service."
      >
        <SubmittingProgressArea />
      </DesignSection>

      <DesignSection
        name="SubmissionCompleteProgressArea"
        description="Submission accepted — waiting for processing to start."
      >
        <SubmissionCompleteProgressArea />
      </DesignSection>

      <DesignSection
        name="ProcessingProgressArea"
        description="Stage 2 — service is analysing the submission."
      >
        <ProcessingProgressArea />
      </DesignSection>

      <DesignSection
        name="TextIntegrityResultsArea"
        description="Final results with similarity scores, top matches and report actions."
      >
        <TextIntegrityResultsArea metadata={samples.resultsData} />
      </DesignSection>
    </div>
  );
}

export default ExtensionDesigns;
