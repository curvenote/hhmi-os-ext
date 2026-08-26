import { extensionPackageTitle } from '../meta.js';
import { DefaultArea } from '../components/progress/DefaultArea.js';
import { InitialPostProgressArea } from '../components/progress/InitialPostProgressArea.js';
import { IntegrityDetectionProgressArea } from '../components/progress/IntegrityDetectionProgressArea.js';
import { PendingProgressArea } from '../components/progress/PendingProgressArea.js';
import { SimpleErrorArea } from '../components/progress/SimpleErrorArea.js';
import { StageProgressArea } from '../components/progress/StageProgressArea.js';
import { SubimageApprovalProgressArea } from '../components/progress/SubimageApprovalProgressArea.js';
import { SubimageDetectionProgressArea } from '../components/progress/SubimageDetectionProgressArea.js';
import { ResultsSummaryArea } from '../components/ResultsSummaryArea.js';
import { DesignSection } from './designShared.js';
import {
  TWO_MIN_AGO_ISO,
  designProofigRefreshProps,
  SAMPLE_COMPLETED_STAGE,
  SAMPLE_ERROR_STAGE,
  SAMPLE_PENDING_STAGE,
  SAMPLE_PROCESSING_STAGE,
  SAMPLE_REPORT_URL,
  SAMPLE_RESULTS_DATA_ALL_CLEAR_2,
  SAMPLE_RESULTS_DATA_ALL_CLEAR_11,
  SAMPLE_RESULTS_DATA_AWAITING_REVIEW,
  SAMPLE_RESULTS_DATA_DELETED,
  SAMPLE_RESULTS_DATA_FLAGGED,
  SAMPLE_RESULTS_DATA_FLAGGED_NO_PROBLEMS,
  SAMPLE_RESULTS_DATA_FLAGGED_WITH_MANUAL,
} from './designSampleData.js';
import { SummaryBadgeDesigns } from './SummaryBadgeDesigns.js';

export function ExtensionDesigns() {
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
        description="Base segmented progress bar, used wihtin other components with an optional “started X ago” subline."
      >
        <StageProgressArea step={2} numSteps={4} stageStartedAt={TWO_MIN_AGO_ISO} />
      </DesignSection>

      <DesignSection
        name="SimpleErrorArea"
        description="Generic error alert plus error-state progress bar."
      >
        <SimpleErrorArea
          step={2}
          numSteps={4}
          message="Subimage detection failed."
          data={SAMPLE_ERROR_STAGE}
        />
      </DesignSection>

      <DesignSection
        name="PendingProgressArea"
        description="Initial pending state shown while the upload to Proofig is being prepared."
      >
        <PendingProgressArea data={SAMPLE_PENDING_STAGE} />
      </DesignSection>

      <DesignSection
        name="InitialPostProgressArea"
        description="Stage 1 — uploading the work to Proofig."
      >
        <InitialPostProgressArea data={SAMPLE_PROCESSING_STAGE} {...designProofigRefreshProps} />
      </DesignSection>

      <DesignSection
        name="SubimageDetectionProgressArea"
        description="Stage 2 — Proofig is identifying sub-images within figures."
      >
        <SubimageDetectionProgressArea
          data={SAMPLE_PROCESSING_STAGE}
          {...designProofigRefreshProps}
        />
      </DesignSection>

      <DesignSection
        name="SubimageApprovalProgressArea"
        description="Stage 3 — author must approve the detected sub-images at Proofig."
      >
        <SubimageApprovalProgressArea
          data={SAMPLE_COMPLETED_STAGE}
          reportUrl={SAMPLE_REPORT_URL}
          {...designProofigRefreshProps}
        />
      </DesignSection>

      <DesignSection
        name="IntegrityDetectionProgressArea"
        description="Stage 4 — Proofig is running image integrity checks."
      >
        <IntegrityDetectionProgressArea
          data={SAMPLE_PROCESSING_STAGE}
          {...designProofigRefreshProps}
        />
      </DesignSection>

      <DesignSection
        name="DefaultArea"
        description="Fallback panel rendered when no other stage matches."
      >
        <DefaultArea />
      </DesignSection>

      <DesignSection
        name="ResultsSummaryArea — Awaiting review"
        description="Proofig has flagged matches for human review — review-state headline and review-coloured punchcard."
      >
        <ResultsSummaryArea
          proofigData={SAMPLE_RESULTS_DATA_AWAITING_REVIEW}
          {...designProofigRefreshProps}
        />
      </DesignSection>

      <DesignSection
        name="ResultsSummaryArea — All Clear (2 sub-images)"
        description="Report: Clean with a small number of sub-images and no flagged matches."
      >
        <ResultsSummaryArea
          proofigData={SAMPLE_RESULTS_DATA_ALL_CLEAR_2}
          {...designProofigRefreshProps}
        />
      </DesignSection>

      <DesignSection
        name="ResultsSummaryArea — All Clear (11 sub-images)"
        description="Report: Clean with a larger number of sub-images and no flagged matches."
      >
        <ResultsSummaryArea
          proofigData={SAMPLE_RESULTS_DATA_ALL_CLEAR_11}
          {...designProofigRefreshProps}
        />
      </DesignSection>

      <DesignSection
        name="ResultsSummaryArea — Flagged"
        description="Final results summary with confirmed problems and manual problems (Report: Flagged)."
      >
        <ResultsSummaryArea
          proofigData={SAMPLE_RESULTS_DATA_FLAGGED_WITH_MANUAL}
          {...designProofigRefreshProps}
        />
      </DesignSection>

      <DesignSection
        name="ResultsSummaryArea — Flagged"
        description="Final results summary with confirmed problems and no manual problems (Report: Flagged)."
      >
        <ResultsSummaryArea
          proofigData={SAMPLE_RESULTS_DATA_FLAGGED}
          {...designProofigRefreshProps}
        />
      </DesignSection>

      <DesignSection
        name="ResultsSummaryArea — Flagged"
        description="Final results summary that was flagged but no problems were confirmed (Report: Flagged)."
      >
        <ResultsSummaryArea
          proofigData={SAMPLE_RESULTS_DATA_FLAGGED_NO_PROBLEMS}
          {...designProofigRefreshProps}
        />
      </DesignSection>

      <DesignSection
        name="ResultsSummaryArea — Report deleted"
        description="After Proofig notifies Deleted: punchcard and headline still reflect last-known counts; actions row shows only “Report is no longer available on Proofig” (no review link, no refresh)."
      >
        <ResultsSummaryArea
          proofigData={SAMPLE_RESULTS_DATA_DELETED}
          {...designProofigRefreshProps}
        />
      </DesignSection>
    </div>
  );
}

export default ExtensionDesigns;
