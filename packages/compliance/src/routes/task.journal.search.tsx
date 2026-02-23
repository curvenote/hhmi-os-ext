import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { withAppContext } from '@curvenote/scms-server';
import {
  MainWrapper,
  PageFrame,
  getBrandingFromMetaMatches,
  joinPageTitle,
  WizardQuestion,
  ui,
  cn,
} from '@curvenote/scms-core';
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
  const journals = await getJournalsFromCacheOrFetch();
  return { journals };
}

function toOption(j: NormalizedJournal): { value: string; label: string } {
  return { value: j.id, label: j.journal_name };
}

function formatDateForAdvice(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
  const [variant, setVariant] = useState<'A' | 'B'>('B');
  const [submissionDate, setSubmissionDate] = useState<Date | null>(null);
  const [submittedOnOrAfterCutoff, setSubmittedOnOrAfterCutoff] = useState<boolean | null>(null);

  const selectedJournal = useMemo(
    () => journals.find((j) => j.id === selectedJournalId) ?? null,
    [journals, selectedJournalId],
  );

  const onSearch = useCallback(
    (query: string) => {
      const q = query.trim().toLowerCase();
      const filtered = q
        ? journals.filter((j) => j.journal_name.toLowerCase().includes(q))
        : journals;
      return Promise.resolve(filtered.slice(0, 100).map(toOption));
    },
    [journals],
  );

  const journalOptions = useMemo(() => journals.map(toOption), [journals]);

  const needsDateOrChoice = selectedJournal
    ? typeRequiresDateOrChoice(selectedJournal.type)
    : false;
  const hasOverride = selectedJournal ? hasPaymentInstructionOverride(selectedJournal) : false;
  const typeLabel = selectedJournal?.type ? selectedJournal.type : '';
  const typeNormalized = (selectedJournal?.type ?? '').toLowerCase().trim();

  const advice = useMemo(() => {
    if (!selectedJournal) return '';
    const input: Parameters<typeof getAdvice>[0] = { journal: selectedJournal };
    if (variant === 'A' && submissionDate) {
      input.submissionDate = formatDateForAdvice(submissionDate);
    } else if (variant === 'B' && submittedOnOrAfterCutoff !== null) {
      input.submittedOnOrAfterCutoff = submittedOnOrAfterCutoff;
    }
    return getAdvice(input);
  }, [selectedJournal, variant, submissionDate, submittedOnOrAfterCutoff]);

  const showAdviceImmediately = selectedJournal && (!needsDateOrChoice || hasOverride);
  const showAdviceFromInput =
    selectedJournal &&
    needsDateOrChoice &&
    !hasOverride &&
    (variant === 'A' ? submissionDate != null : submittedOnOrAfterCutoff !== null);

  const resetDateAndChoice = useCallback(() => {
    setSubmissionDate(null);
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
    { label: 'Journal search – HHMI spending policies', isCurrentPage: true },
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
        title="Search for HHMI spending policies on supported journals"
        description="Select a journal to see whether HHMI lab budgets can be used to pay open access or other fees."
        breadcrumbs={breadcrumbs}
      >
        <div className="space-y-8 max-w-4xl">
          {/* A/B toggle top-right – only when journal needs date/choice and has no override */}
          {selectedJournal && needsDateOrChoice && !hasOverride && (
            <div className="flex flex-wrap gap-4 justify-between items-center">
              <div className="flex gap-2 justify-end items-center w-full">
                <ui.ToggleGroup
                  type="single"
                  value={variant}
                  onValueChange={(v) => v && setVariant(v as 'A' | 'B')}
                  className="inline-flex rounded-md border p-0.5 cursor-pointer"
                >
                  <ui.ToggleGroupItem
                    value="A"
                    aria-label="Date picker"
                    className="px-3 py-1 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  >
                    A
                  </ui.ToggleGroupItem>
                  <ui.ToggleGroupItem
                    value="B"
                    aria-label="Yes/No question"
                    className="px-3 py-1 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  >
                    B
                  </ui.ToggleGroupItem>
                </ui.ToggleGroup>
              </div>
            </div>
          )}

          {/* Journal search */}
          <div>
            <label className="block mb-2 font-medium">Search for a journal</label>
            <ui.AsyncComboBox
              value={selectedJournalId}
              onValueChange={handleJournalChange}
              onSearch={onSearch}
              placeholder="Search for a journal..."
              searchPlaceholder="Type to search..."
              emptyMessage="No journals found."
              minSearchLength={1}
              initialOptions={journalOptions.length > 0 ? journalOptions.slice(0, 50) : []}
              triggerClassName="w-full"
            />
          </div>

          {/* Selected journal type pill */}
          {selectedJournal && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-md">HHMI classifies this journal as:</span>
              <span
                className={cn(
                  'px-3 py-1 text-sm font-medium rounded-full',
                  pillClassesForType(selectedJournal.type),
                )}
              >
                {typeLabel || 'Unknown'}
              </span>
            </div>
          )}

          {/* Immediate advice for open access / subscription – styled like Compliance Wizard outcomes */}
          {showAdviceImmediately && advice && (
            <ui.SimpleAlert
              type="info"
              message={
                <div className="flex flex-col">
                  <div className="text-lg font-medium">Spending policy</div>
                  <span className="text-inherit">{advice}</span>
                </div>
              }
            />
          )}

          {/* Date picker (variant A) or Yes/No (variant B) for transformative / hybrid – skip when override is set */}
          {selectedJournal && needsDateOrChoice && !hasOverride && (
            <div className="space-y-4">
              {variant === 'A' && (
                <div>
                  <label className="block mb-2 text-sm font-medium">Submission date</label>
                  <ui.Popover>
                    <ui.PopoverTrigger asChild>
                      <ui.Button variant="outline" className="justify-start w-full text-left">
                        {submissionDate ? submissionDate.toLocaleDateString() : 'Pick a date'}
                      </ui.Button>
                    </ui.PopoverTrigger>
                    <ui.PopoverContent className="p-0 w-auto">
                      <ui.Calendar
                        mode="single"
                        selected={submissionDate ?? undefined}
                        onSelect={(d) => setSubmissionDate(d ?? null)}
                      />
                    </ui.PopoverContent>
                  </ui.Popover>
                </div>
              )}
              {variant === 'B' && (
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
            </div>
          )}

          {/* Advice from date or yes/no – styled like Compliance Wizard outcomes */}
          {showAdviceFromInput && advice && (
            <ui.SimpleAlert
              type="info"
              message={
                <div className="flex flex-col">
                  <div className="text-lg font-medium">Spending policy</div>
                  <span className="text-inherit">{advice}</span>
                </div>
              }
            />
          )}
        </div>
      </PageFrame>
    </MainWrapper>
  );
}
