// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolveSubmissionStatus,
  metadataFromAirtableIdFields,
  activitiesFromAirtableDateFields,
  extractManuscriptId,
  shouldUpdateStatusOnSync,
  PMC_STATUSES_THAT_DO_NOT_CHANGE_ON_SYNC,
  type SubmissionVersion,
  type AirtableRecord,
  type ActivityStub,
} from './pmc-workflow-sync.js';
import { ActivityType } from '@curvenote/scms-db';
import { PMC_STATE_NAMES } from '../../workflows.js';

// Mock uuidv7 to return predictable IDs
vi.mock('uuidv7', () => ({
  uuidv7: () => 'test-uuid-123',
}));

// Mock formatDate to return predictable dates
vi.mock('@curvenote/common', () => ({
  formatDate: () => '2024-01-01T00:00:00.000Z',
}));

describe('PMC Airtable Functions', () => {
  let mockSubmissionVersion: SubmissionVersion;
  let mockAirtableRecord: AirtableRecord;

  beforeEach(() => {
    mockSubmissionVersion = {
      id: 'submission-version-123',
      status: PMC_STATE_NAMES.DRAFT,
      metadata: {
        pmc: {
          emailProcessing: {
            manuscriptId: 'NIHMS123456',
          },
          pmid: '12345678',
          pmcid: 'PMC123456',
        },
      },
      work_version: {
        id: 'work-version-123',
        title: 'Test Submission',
        metadata: {
          pmc: {
            emailProcessing: {
              manuscriptId: 'NIHMS123456',
            },
            pmid: '12345678',
            pmcid: 'PMC123456',
          },
        },
      },
    };

    mockAirtableRecord = {
      fields: {
        NIHMSID: 'NIHMS123456',
        PMID: '87654321',
        PMCID: 'PMC876543',
        'current-status': "Reviewer's Initial Approval Requested",
        'initial-approval-date': '2024-01-15T00:00:00.000Z',
        'final-approval-date': '2024-02-01T00:00:00.000Z',
      },
    };
  });

  describe('extractManuscriptId', () => {
    it('should extract manuscript ID from metadata', () => {
      const manuscriptId = extractManuscriptId(mockSubmissionVersion);
      expect(manuscriptId).toBe('NIHMS123456');
    });

    it('should return undefined when metadata is missing', () => {
      const submissionVersionWithoutMetadata: SubmissionVersion = {
        ...mockSubmissionVersion,
        metadata: null,
        work_version: {
          ...mockSubmissionVersion.work_version,
          metadata: null,
        },
      };
      const manuscriptId = extractManuscriptId(submissionVersionWithoutMetadata);
      expect(manuscriptId).toBeUndefined();
    });

    it('should return undefined when pmc metadata is missing', () => {
      const submissionVersionWithoutPmc: SubmissionVersion = {
        ...mockSubmissionVersion,
        metadata: {},
        work_version: {
          ...mockSubmissionVersion.work_version,
          metadata: {},
        },
      };
      const manuscriptId = extractManuscriptId(submissionVersionWithoutPmc);
      expect(manuscriptId).toBeUndefined();
    });
  });

  describe('resolveSubmissionStatus', () => {
    it('should use mapped current-status when available', () => {
      const activities: ActivityStub[] = [];
      const result = resolveSubmissionStatus(mockSubmissionVersion, mockAirtableRecord, activities);

      expect(result).toBe(PMC_STATE_NAMES.DEPOSIT_CONFIRMED_BY_PMC);
      expect(activities).toHaveLength(1);
      expect(activities[0]).toEqual({
        activity_type: ActivityType.SUBMISSION_VERSION_STATUS_CHANGE,
        status: PMC_STATE_NAMES.DEPOSIT_CONFIRMED_BY_PMC,
      });
    });

    it('should not create activity when status is unchanged', () => {
      const submissionVersionWithSameStatus: SubmissionVersion = {
        ...mockSubmissionVersion,
        status: PMC_STATE_NAMES.DEPOSIT_CONFIRMED_BY_PMC,
      };
      const activities: ActivityStub[] = [];

      const result = resolveSubmissionStatus(
        submissionVersionWithSameStatus,
        mockAirtableRecord,
        activities,
      );

      expect(result).toBe(PMC_STATE_NAMES.DEPOSIT_CONFIRMED_BY_PMC);
      expect(activities).toHaveLength(0);
    });

    it('should not create duplicate activities', () => {
      const activities: ActivityStub[] = [
        {
          activity_type: ActivityType.SUBMISSION_VERSION_STATUS_CHANGE,
          status: PMC_STATE_NAMES.DEPOSIT_CONFIRMED_BY_PMC,
        },
      ];

      const result = resolveSubmissionStatus(mockSubmissionVersion, mockAirtableRecord, activities);

      expect(result).toBe(PMC_STATE_NAMES.DEPOSIT_CONFIRMED_BY_PMC);
      expect(activities).toHaveLength(1); // No duplicate added
    });

    it('should fallback to date-based status resolution when no current-status mapping', () => {
      const airtableRecordWithoutStatus: AirtableRecord = {
        fields: {
          NIHMSID: 'NIHMS123456',
          PMCID: 'PMC876543',
          'initial-approval-date': '2024-01-15T00:00:00.000Z',
          'final-approval-date': '2024-02-01T00:00:00.000Z',
        },
      };
      const activities: ActivityStub[] = [];

      const result = resolveSubmissionStatus(
        mockSubmissionVersion,
        airtableRecordWithoutStatus,
        activities,
      );

      // Should return REVIEWER_APPROVED_FINAL based on final-approval-date (highest date-based status)
      // PMCID alone doesn't determine status since articles can be withdrawn/removed
      expect(result).toBe(PMC_STATE_NAMES.REVIEWER_APPROVED_FINAL);
      expect(activities).toHaveLength(0); // No activities for fallback resolution
    });

    it('should not change status based on PMCID alone', () => {
      const submissionVersion = {
        id: 'submission-version-123',
        status: PMC_STATE_NAMES.REVIEWER_APPROVED_FINAL,
        metadata: {
          pmc: {
            emailProcessing: {
              manuscriptId: 'NIHMS123456',
            },
            pmid: '12345678',
            pmcid: 'PMC123456',
          },
        },
        work_version: {
          id: 'work-version-123',
          title: 'Test Submission',
          metadata: {
            pmc: {
              emailProcessing: {
                manuscriptId: 'NIHMS123456',
              },
              pmid: '12345678',
              pmcid: 'PMC123456',
            },
          },
        },
      };
      const airtableRecord = {
        fields: {
          NIHMSID: 'NIHMS123456',
          PMCID: 'PMC123456',
          'final-approval-date': '2024-01-01T10:00:00Z',
        },
      };

      const result = resolveSubmissionStatus(submissionVersion, airtableRecord, []);

      // Should return REVIEWER_APPROVED_FINAL based on date field, not PMCID
      // PMCID presence doesn't automatically mean AVAILABLE_ON_PMC since article could be withdrawn
      expect(result).toBe(PMC_STATE_NAMES.REVIEWER_APPROVED_FINAL);
    });
  });

  describe('skipped statuses (do not change on sync)', () => {
    it('should not update status when current status is NO_ACTION_NEEDED even if Airtable resolves differently', () => {
      const currentStatus = PMC_STATE_NAMES.NO_ACTION_NEEDED;
      const resolvedStatus = PMC_STATE_NAMES.DEPOSIT_CONFIRMED_BY_PMC;

      expect(shouldUpdateStatusOnSync(currentStatus, resolvedStatus)).toBe(false);
    });

    it('should not update status when current status is REQUEST_NEW_VERSION even if Airtable resolves differently', () => {
      const currentStatus = PMC_STATE_NAMES.REQUEST_NEW_VERSION;
      const resolvedStatus = PMC_STATE_NAMES.AVAILABLE_ON_PMC;

      expect(shouldUpdateStatusOnSync(currentStatus, resolvedStatus)).toBe(false);
    });

    it('should not update status when current status is CANCELLED even if Airtable resolves differently', () => {
      const currentStatus = PMC_STATE_NAMES.CANCELLED;
      const resolvedStatus = PMC_STATE_NAMES.REVIEWER_APPROVED_FINAL;

      expect(shouldUpdateStatusOnSync(currentStatus, resolvedStatus)).toBe(false);
    });

    it('should not update status when current status is FAILED even if Airtable resolves differently', () => {
      const currentStatus = PMC_STATE_NAMES.FAILED;
      const resolvedStatus = PMC_STATE_NAMES.DEPOSIT_CONFIRMED_BY_PMC;

      expect(shouldUpdateStatusOnSync(currentStatus, resolvedStatus)).toBe(false);
    });

    it('should update status when current status is DRAFT and Airtable resolves to a different status', () => {
      const currentStatus = PMC_STATE_NAMES.DRAFT;
      const resolvedStatus = PMC_STATE_NAMES.DEPOSIT_CONFIRMED_BY_PMC;

      expect(shouldUpdateStatusOnSync(currentStatus, resolvedStatus)).toBe(true);
    });

    it('should not update status when current and resolved status are the same', () => {
      expect(shouldUpdateStatusOnSync(PMC_STATE_NAMES.DRAFT, PMC_STATE_NAMES.DRAFT)).toBe(false);
      expect(
        shouldUpdateStatusOnSync(
          PMC_STATE_NAMES.DEPOSIT_CONFIRMED_BY_PMC,
          PMC_STATE_NAMES.DEPOSIT_CONFIRMED_BY_PMC,
        ),
      ).toBe(false);
    });

    it('should not update status when current is skipped even when resolved equals current', () => {
      // Edge case: current is CANCELLED, resolved is also CANCELLED (e.g. from date fallback)
      // We still don't "update" (no-op), and shouldUpdateStatusOnSync is false because status match
      expect(shouldUpdateStatusOnSync(PMC_STATE_NAMES.CANCELLED, PMC_STATE_NAMES.CANCELLED)).toBe(
        false,
      );
    });
  });

  describe('metadataFromAirtableIdFields', () => {
    it('should update PMID and PMCID when they are different', () => {
      const activities: ActivityStub[] = [];
      const result = metadataFromAirtableIdFields(
        mockSubmissionVersion,
        mockAirtableRecord,
        activities,
      );

      expect(result).not.toBeNull();
      expect(result!.pmid).toBe('87654321');
      expect(result!.pmcid).toBe('PMC876543');
      expect(activities).toHaveLength(0); // No new PMCID activity since it already exists
    });

    it('should create PMCID activity when PMCID is newly assigned', () => {
      const submissionVersionWithoutPmcid: SubmissionVersion = {
        ...mockSubmissionVersion,
        metadata: {
          pmc: {
            emailProcessing: {
              manuscriptId: 'NIHMS123456',
            },
            pmid: '12345678',
            // No pmcid
          },
        },
        work_version: {
          ...mockSubmissionVersion.work_version,
          metadata: {
            pmc: {
              emailProcessing: {
                manuscriptId: 'NIHMS123456',
              },
              pmid: '12345678',
              // No pmcid
            },
          },
        },
      };
      const activities: ActivityStub[] = [];

      const result = metadataFromAirtableIdFields(
        submissionVersionWithoutPmcid,
        mockAirtableRecord,
        activities,
      );

      expect(result).not.toBeNull();
      expect(result!.pmcid).toBe('PMC876543');
      expect(activities).toHaveLength(0); // No activities for PMCID assignment anymore
    });

    it('should not update metadata when values are the same', () => {
      const airtableRecordWithSameValues: AirtableRecord = {
        fields: {
          NIHMSID: 'NIHMS123456',
          PMID: '12345678', // Same as current
          PMCID: 'PMC123456', // Same as current
        },
      };
      const activities: ActivityStub[] = [];

      const result = metadataFromAirtableIdFields(
        mockSubmissionVersion,
        airtableRecordWithSameValues,
        activities,
      );

      expect(result).toBeNull();
      expect(activities).toHaveLength(0);
    });

    it('should create pmc object if it does not exist', () => {
      const submissionVersionWithoutPmc: SubmissionVersion = {
        ...mockSubmissionVersion,
        metadata: {},
        work_version: {
          ...mockSubmissionVersion.work_version,
          metadata: {},
        },
      };
      const activities: ActivityStub[] = [];

      const result = metadataFromAirtableIdFields(
        submissionVersionWithoutPmc,
        mockAirtableRecord,
        activities,
      );

      expect(result).not.toBeNull();
      expect(result!.pmid).toBe('87654321');
      expect(result!.pmcid).toBe('PMC876543');
    });
  });

  describe('activitiesFromAirtableDateFields', () => {
    it('should create activities for milestone dates', () => {
      const result = activitiesFromAirtableDateFields(mockAirtableRecord);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        activity_type: ActivityType.SUBMISSION_VERSION_STATUS_CHANGE,
        status: PMC_STATE_NAMES.REVIEWER_APPROVED_INITIAL,
        date_created: '2024-01-15T00:00:00.000Z',
      });
      expect(result[1]).toEqual({
        activity_type: ActivityType.SUBMISSION_VERSION_STATUS_CHANGE,
        status: PMC_STATE_NAMES.REVIEWER_APPROVED_FINAL,
        date_created: '2024-02-01T00:00:00.000Z',
      });
    });

    it('should handle airtable record with no milestone dates', () => {
      const airtableRecordWithoutDates: AirtableRecord = {
        fields: {
          NIHMSID: 'NIHMS123456',
        },
      };

      const result = activitiesFromAirtableDateFields(airtableRecordWithoutDates);

      expect(result).toHaveLength(0);
    });

    it('should handle airtable record with some milestone dates', () => {
      const airtableRecordWithSomeDates: AirtableRecord = {
        fields: {
          NIHMSID: 'NIHMS123456',
          'initial-approval-date': '2024-01-15T00:00:00.000Z',
          // No final-approval-date
        },
      };

      const result = activitiesFromAirtableDateFields(airtableRecordWithSomeDates);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        activity_type: ActivityType.SUBMISSION_VERSION_STATUS_CHANGE,
        status: PMC_STATE_NAMES.REVIEWER_APPROVED_INITIAL,
        date_created: '2024-01-15T00:00:00.000Z',
      });
    });
  });
});
