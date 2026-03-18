/**
 * Journal search: advice strings, journal types, cutoff dates, and getAdvice logic.
 * Single source of truth for HHMI spending policy advice based on journal type and submission date.
 */

import type { NormalizedJournal } from '../../backend/airtable.journals.server.js';

/** Journal type enum values from Airtable (Type field). */
export const JOURNAL_TYPES = ['open access', 'subscription', 'transformative', 'hybrid'] as const;

export type JournalType = (typeof JOURNAL_TYPES)[number];

/** Cutoff dates for transformative and hybrid (ISO date strings). */
export const TRANSFORMATIVE_CUTOFF = '2026-01-01';
export const HYBRID_CUTOFF = '2023-01-01';

/** All advice messages in one place for easy update. */
export const ADVICE_MESSAGES = {
  OPEN_ACCESS: 'HHMI lab budgets can be used to pay open access fees for this paper.',
  SUBSCRIPTION:
    'This journal does not have an open access option, so there are no open access fees. HHMI lab budgets can be used to pay other types of fees (e.g., page/color charges) at this journal.',
  TRANSFORMATIVE_ON_OR_AFTER_CUTOFF:
    'HHMI lab budgets cannot be used to pay open access fees for this paper, but can be used to pay other types of fees (e.g., page/color charges).',
  TRANSFORMATIVE_BEFORE_CUTOFF:
    'HHMI lab budgets can be used to pay open access fees for this paper.',
  HYBRID_ON_OR_AFTER_CUTOFF:
    'HHMI lab budgets cannot be used to pay open access fees for this paper, but can be used to pay other types of fees (e.g., page/color charges).',
  HYBRID_BEFORE_CUTOFF: 'HHMI lab budgets can be used to pay open access fees for this paper.',
} as const;

/** Copy for variant B yes/no questions. */
export const JOURNAL_SEARCH_QUESTIONS = {
  transformative: 'Was the work submitted on or after 1 January 2026?',
  hybrid: 'Was the work submitted on or after 1 January 2023?',
} as const;

function isOnOrAfter(dateStr: string, cutoff: string): boolean {
  if (!dateStr) return false;
  return dateStr >= cutoff;
}

export interface GetAdviceInput {
  journal: Pick<NormalizedJournal, 'type' | 'payment_instruction_override'>;
  /** ISO date string (YYYY-MM-DD) for variant A (date picker). */
  submissionDate?: string;
  /** For variant B: true = on or after cutoff, false = before cutoff. Only used when type is transformative or hybrid. */
  submittedOnOrAfterCutoff?: boolean;
}

/**
 * Returns the advice string for the given journal and optional date/yes-no.
 * If journal has payment_instruction_override set, that is returned. Otherwise logic from type + date applies.
 */
export function getAdvice(input: GetAdviceInput): string {
  const { journal, submissionDate, submittedOnOrAfterCutoff } = input;
  const override = (journal.payment_instruction_override ?? '').trim();
  if (override) return override;

  const type = (journal.type ?? '').toLowerCase().trim();

  switch (type) {
    case 'open access':
      return ADVICE_MESSAGES.OPEN_ACCESS;
    case 'subscription':
      return ADVICE_MESSAGES.SUBSCRIPTION;
    case 'transformative': {
      if (submittedOnOrAfterCutoff !== undefined) {
        return submittedOnOrAfterCutoff
          ? ADVICE_MESSAGES.TRANSFORMATIVE_ON_OR_AFTER_CUTOFF
          : ADVICE_MESSAGES.TRANSFORMATIVE_BEFORE_CUTOFF;
      }
      if (submissionDate) {
        const onOrAfter = isOnOrAfter(submissionDate, TRANSFORMATIVE_CUTOFF);
        return onOrAfter
          ? ADVICE_MESSAGES.TRANSFORMATIVE_ON_OR_AFTER_CUTOFF
          : ADVICE_MESSAGES.TRANSFORMATIVE_BEFORE_CUTOFF;
      }
      return ''; // need date or yes/no
    }
    case 'hybrid': {
      if (submittedOnOrAfterCutoff !== undefined) {
        return submittedOnOrAfterCutoff
          ? ADVICE_MESSAGES.HYBRID_ON_OR_AFTER_CUTOFF
          : ADVICE_MESSAGES.HYBRID_BEFORE_CUTOFF;
      }
      if (submissionDate) {
        const onOrAfter = isOnOrAfter(submissionDate, HYBRID_CUTOFF);
        return onOrAfter
          ? ADVICE_MESSAGES.HYBRID_ON_OR_AFTER_CUTOFF
          : ADVICE_MESSAGES.HYBRID_BEFORE_CUTOFF;
      }
      return ''; // need date or yes/no
    }
    default:
      return '';
  }
}

/** Whether this type requires a date or yes/no before showing advice. */
export function typeRequiresDateOrChoice(type: string): boolean {
  const t = (type ?? '').toLowerCase().trim();
  return t === 'transformative' || t === 'hybrid';
}

/**
 * True when the journal has a non-empty payment instruction override.
 * When true, the UI should skip the data selector and variant A/B question and show advice immediately with the override content.
 */
export function hasPaymentInstructionOverride(
  journal: Pick<NormalizedJournal, 'payment_instruction_override'>,
): boolean {
  return (journal.payment_instruction_override ?? '').trim() !== '';
}
