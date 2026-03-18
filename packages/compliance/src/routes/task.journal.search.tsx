import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { withAppContext } from '@curvenote/scms-server';
import {
  MainWrapper,
  PageFrame,
  getBrandingFromMetaMatches,
  joinPageTitle,
  RequestHelpDialog,
  WizardQuestion,
  ui,
  cn,
} from '@curvenote/scms-core';
import Fuse from 'fuse.js';
import type { IFuseOptions } from 'fuse.js';
import { useCallback, useMemo, useState } from 'react';
import { getJournalsFromCacheOrFetch } from '../backend/airtable-cache.server.js';
import type { NormalizedJournal } from '../backend/airtable.journals.server.js';
import {
  getAdvice,
  hasPaymentInstructionOverride,
  typeRequiresDateOrChoice,
  JOURNAL_SEARCH_QUESTIONS,
} from '../features/journal-search/journalSearchAdvice.js';

interface LoaderData {
  journals: NormalizedJournal[];
}

export const meta: MetaFunction<LoaderData> = ({ matches }) => {
  const branding = getBrandingFromMetaMatches(matches);
  return [{ title: joinPageTitle('Journal search – HHMI spending policies', branding.title) }];
};

export async function loader(args: LoaderFunctionArgs): Promise<LoaderData> {
  await withAppContext(args);
  const raw = await getJournalsFromCacheOrFetch();
  const journals = [...raw].sort((a, b) =>
    (a.journal_name ?? '').localeCompare(b.journal_name ?? '', undefined, { sensitivity: 'base' }),
  );
  return { journals };
}

function toOption(j: NormalizedJournal): { value: string; label: string } {
  return { value: j.id, label: j.journal_name };
}

const FUSE_CONFIG: IFuseOptions<NormalizedJournal> = {
  keys: [{ name: 'journal_name', weight: 1 }],
  threshold: 0.35,
  distance: 200,
  minMatchCharLength: 2,
  ignoreLocation: true,
  findAllMatches: true,
  shouldSort: true,
  includeScore: true,
};

function sanitizeSearchInput(input: string): string {
  if (typeof input !== 'string') return '';
  return input.trim().replace(/\s+/g, ' ').substring(0, 100);
}

/** Pill background + text classes by journal type (open access, subscription, transformative, hybrid, unknown). */
function pillClassesForType(type: string | null | undefined): string {
  const t = (type ?? '').toLowerCase().trim();
  switch (t) {
    case 'open access':
      return 'bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-200';
    case 'subscription':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200';
    case 'transformative':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/60 dark:text-yellow-200';
    case 'hybrid':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-200';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export default function JournalSearchRoute({ loaderData }: { loaderData: LoaderData }) {
  const { journals } = loaderData;
  const [selectedJournalId, setSelectedJournalId] = useState<string>('');
  const [submittedOnOrAfterCutoff, setSubmittedOnOrAfterCutoff] = useState<boolean | null>(null);
  const [showHelpDialog, setShowHelpDialog] = useState(false);

  const selectedJournal = useMemo(
    () => journals.find((j) => j.id === selectedJournalId) ?? null,
    [journals, selectedJournalId],
  );

  const fuse = useMemo(() => new Fuse(journals, FUSE_CONFIG), [journals]);

  const onSearch = useCallback(
    (query: string) => {
      const sanitized = sanitizeSearchInput(query);
      if (!sanitized) {
        return Promise.resolve(journals.slice(0, 50).map(toOption));
      }
      const results = fuse.search(sanitized);
      const options = results.slice(0, 100).map((result) => toOption(result.item));
      return Promise.resolve(options);
    },
    [journals, fuse],
  );

  const journalOptions = useMemo(() => journals.map(toOption), [journals]);

  const journalByValue = useCallback(
    (value: string) => journals.find((j) => j.id === value) ?? null,
    [journals],
  );

  const renderOptionWithBadge = useCallback(
    (option: { value: string; label: string }) => {
      const journal = journalByValue(option.value);
      const typeLabel = journal?.type ?? '';
      return (
        <>
          <span className="truncate">{option.label}</span>
          {journal && (
            <span
              className={cn(
                'shrink-0 px-2 py-0.5 text-xs font-medium rounded-full',
                pillClassesForType(journal.type),
              )}
            >
              {typeLabel || 'Unknown'}
            </span>
          )}
        </>
      );
    },
    [journalByValue],
  );

  const needsDateOrChoice = selectedJournal
    ? typeRequiresDateOrChoice(selectedJournal.type)
    : false;
  const hasOverride = selectedJournal ? hasPaymentInstructionOverride(selectedJournal) : false;
  const typeLabel = selectedJournal?.type ? selectedJournal.type : '';
  const typeNormalized = (selectedJournal?.type ?? '').toLowerCase().trim();

  const advice = useMemo(() => {
    if (!selectedJournal) return null;
    const input: Parameters<typeof getAdvice>[0] = { journal: selectedJournal };
    if (submittedOnOrAfterCutoff !== null) {
      input.submittedOnOrAfterCutoff = submittedOnOrAfterCutoff;
    }
    return getAdvice(input);
  }, [selectedJournal, submittedOnOrAfterCutoff]);

  const showAdviceImmediately = selectedJournal && (!needsDateOrChoice || hasOverride);
  const showAdviceFromInput =
    selectedJournal && needsDateOrChoice && !hasOverride && submittedOnOrAfterCutoff !== null;

  const resetDateAndChoice = useCallback(() => {
    setSubmittedOnOrAfterCutoff(null);
  }, []);

  const handleJournalChange = useCallback(
    (value: string) => {
      setSelectedJournalId(value);
      resetDateAndChoice();
    },
    [resetDateAndChoice],
  );

  const breadcrumbs = [
    { label: 'Home', href: '/app/dashboard' },
    { label: 'Journal Checker Tool', isCurrentPage: true },
  ];

  const transformativeQuestion = {
    id: 'transformative-date',
    title: JOURNAL_SEARCH_QUESTIONS.transformative,
    type: 'boolean' as const,
    options: [
      { value: true, label: 'Yes' },
      { value: false, label: 'No' },
    ],
  };

  const hybridQuestion = {
    id: 'hybrid-date',
    title: JOURNAL_SEARCH_QUESTIONS.hybrid,
    type: 'boolean' as const,
    options: [
      { value: true, label: 'Yes' },
      { value: false, label: 'No' },
    ],
  };

  return (
    <MainWrapper>
      <PageFrame
        title="Journal Checker Tool"
        description="Search for a journal to see whether HHMI lab budgets can be used to pay open access or other fees."
        // description="If the journal you have searched for is not listed here, please reach out to oapolicy@hhmi.org for assistance with questions about paying open access fees."
        breadcrumbs={breadcrumbs}
      >
        <div className="space-y-8 max-w-3xl">
          {/* Journal search */}
          <div>
            <label className="block mb-1">Search for a journal</label>
            <ui.AsyncComboBox
              triggerMode="inline"
              {...({ selectedLabel: selectedJournal?.journal_name } as Record<string, unknown>)}
              value={selectedJournalId}
              onValueChange={handleJournalChange}
              onSearch={onSearch}
              placeholder="Start typing to search..."
              searchPlaceholder="Type to search..."
              emptyMessage="No journals found."
              minSearchLength={1}
              initialOptions={journalOptions.length > 0 ? journalOptions.slice(0, 50) : []}
              triggerClassName="w-full"
              renderOption={renderOptionWithBadge}
            />
            <div className="mt-1 max-w-2xl text-xs font-light text-muted-foreground">
              If the journal you have searched for is not listed here, please reach out to the{' '}
              <ui.Button
                variant="link"
                className="p-0 h-auto text-xs font-light underline text-primary underline-offset-4 hover:no-underline"
                onClick={() => setShowHelpDialog(true)}
              >
                Open Science Team
              </ui.Button>{' '}
              for assistance with questions about paying open access fees at this journal.
            </div>
          </div>
          {selectedJournal && (
            <ui.Card className="p-6 pt-6 pb-8 space-y-12">
              <div className="space-y-8">
                {selectedJournal && (
                  <div className="space-y-1">
                    <div className="text-2xl font-medium">{selectedJournal.journal_name}</div>
                    <div>
                      {typeLabel ? (
                        <div className="flex flex-wrap gap-2 items-center">
                          <span className="font-light text-md">
                            HHMI classifies this journal as:
                          </span>
                          <span
                            className={cn(
                              'px-3 py-[2px] text-sm font-medium rounded-full',
                              pillClassesForType(selectedJournal.type),
                            )}
                          >
                            {typeLabel}
                          </span>
                        </div>
                      ) : (
                        <ui.SimpleAlert
                          type="info"
                          className="mt-8"
                          message={
                            <div className="font-light text-md">
                              HHMI has not classified this journal. Please reach out to the{' '}
                              <ui.Button
                                variant="link"
                                className="p-0 h-auto font-light underline text-primary underline-offset-4 hover:no-underline"
                                onClick={() => setShowHelpDialog(true)}
                              >
                                Open Science Team
                              </ui.Button>{' '}
                              for assistance with questions about paying open access fees at this
                              journal.
                            </div>
                          }
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* Immediate advice for open access / subscription – styled like Compliance Wizard outcomes */}
                {showAdviceImmediately && advice && (
                  <ui.SimpleAlert
                    type={advice.type}
                    message={
                      <div className="flex flex-col">
                        <div className="text-lg font-medium">Spending policy</div>
                        <span className="text-inherit">{advice.message}</span>
                      </div>
                    }
                  />
                )}

                {/* Yes/No question for transformative / hybrid – skip when override is set */}
                {selectedJournal && needsDateOrChoice && !hasOverride && (
                  <div className="space-y-4">
                    {typeNormalized === 'transformative' && (
                      <WizardQuestion
                        question={transformativeQuestion}
                        value={submittedOnOrAfterCutoff}
                        onChange={(v) => setSubmittedOnOrAfterCutoff(v as boolean)}
                      />
                    )}
                    {typeNormalized === 'hybrid' && (
                      <WizardQuestion
                        question={hybridQuestion}
                        value={submittedOnOrAfterCutoff}
                        onChange={(v) => setSubmittedOnOrAfterCutoff(v as boolean)}
                      />
                    )}
                  </div>
                )}

                {/* Advice from yes/no choice – styled like Compliance Wizard outcomes */}
                {showAdviceFromInput && advice && (
                  <ui.SimpleAlert
                    type={advice.type}
                    message={
                      <div className="flex flex-col">
                        <div className="text-lg font-medium">Spending policy</div>
                        <span className="text-inherit">{advice.message}</span>
                      </div>
                    }
                  />
                )}
              </div>
            </ui.Card>
          )}
        </div>
        <RequestHelpDialog
          open={showHelpDialog}
          onOpenChange={setShowHelpDialog}
          title="Request Help from the Open Science Team"
          prompt="Please describe your question about a journal that is not listed, about journal classification, or about paying open access fees."
          intent="general-help"
          successMessage="Your request has been sent to the HHMI Open Science Team. We'll get back to you as soon as possible."
          messageOptional={true}
        />
      </PageFrame>
    </MainWrapper>
  );
}
