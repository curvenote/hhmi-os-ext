import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from 'react-router';
import { useFetcher, data } from 'react-router';
import { DownloadCloud, List } from 'lucide-react';
import {
  PageFrame,
  ui,
  primitives,
  formatDate,
  SectionWithHeading,
  scopes,
} from '@curvenote/scms-core';
import { withAppPMCContext } from '../backend/context.server.js';
import { isNihmsApiConfigured } from '../backend/nihms-api.server.js';
import {
  fetchAndCorrelateNihmsRecords,
  type NihmsExplorerResult,
} from '../backend/nihms-explorer.server.js';
import type { CorrelatedRecord, CorrelatedVersion } from '../backend/nihms-correlate.js';
import { PMC_DEPOSIT_WORKFLOW } from '../workflows.js';
import { formatManuscriptId } from '../components/utils.js';

interface LoaderData {
  configured: boolean;
}

type ActionData = { ok: true; result: NihmsExplorerResult } | { ok: false; error: string };

export const meta: MetaFunction = () => {
  return [
    { title: 'NIHMS Records' },
    { name: 'description', content: 'Compare live NIHMS records with PMC deposits' },
  ];
};

export async function loader(args: LoaderFunctionArgs): Promise<LoaderData> {
  await withAppPMCContext(args, [scopes.site.submissions.update]);
  return { configured: await isNihmsApiConfigured() };
}

export async function action(args: ActionFunctionArgs) {
  await withAppPMCContext(args, [scopes.site.submissions.update]);
  const formData = await args.request.formData();
  if (formData.get('intent') !== 'fetch') {
    return data({ ok: false, error: 'Invalid intent' } satisfies ActionData, { status: 400 });
  }
  try {
    const result = await fetchAndCorrelateNihmsRecords();
    return { ok: true, result } satisfies ActionData;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('NIHMS records fetch failed:', message);
    return data({ ok: false, error: message } satisfies ActionData, { status: 502 });
  }
}

const FLAG_FILTERS: ui.FilterDefinition[] = [
  { groupKey: 'flag', key: 'flag', value: 'duplicate', label: 'Duplicate NIHMS records' },
  { groupKey: 'flag', key: 'flag', value: 'status-differs', label: 'Status differs' },
  { groupKey: 'flag', key: 'flag', value: 'unmatched', label: 'No Workspace match' },
];

const FLAG_PREDICATES: Record<string, (item: CorrelatedRecord) => boolean> = {
  duplicate: (item) => item.flags.duplicate,
  'status-differs': (item) => item.flags.statusDiffers,
  unmatched: (item) => item.flags.unmatched,
};

function stateLabel(status?: string) {
  if (!status) return undefined;
  const states = PMC_DEPOSIT_WORKFLOW.states as Record<string, { label?: string } | undefined>;
  return states[status]?.label ?? status;
}

function nihmsDate(value?: string) {
  return value ? value.slice(0, 10) : undefined;
}

function matchesSearch(item: CorrelatedRecord, term: string) {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  const { record } = item;
  return [
    record.title,
    record.nihmsId,
    formatManuscriptId(record.nihmsId),
    record.pmid,
    record.pmcid,
    record.packageId,
    record.journal,
    record.currentStatus,
    ...item.versions.map((v) => v.title),
  ].some((value) => value?.toLowerCase().includes(needle));
}

function FetchButton({ disabled }: { disabled: boolean }) {
  const fetcher = useFetcher<ActionData>({ key: 'nihms-fetch' });
  const busy = fetcher.state !== 'idle';
  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="fetch" />
      <ui.Button type="submit" disabled={busy || disabled} aria-busy={busy}>
        <DownloadCloud className={busy ? 'mr-2 animate-pulse' : 'mr-2'} />
        {busy ? 'Fetching from NIHMS…' : 'Fetch from NIHMS'}
      </ui.Button>
    </fetcher.Form>
  );
}

function Summary({ result }: { result: NihmsExplorerResult }) {
  const count = (pred: (r: CorrelatedRecord) => boolean) => result.records.filter(pred).length;
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600 dark:text-gray-300">
      <span>Fetched {formatDate(result.fetchedAt, 'yyyy-MM-dd HH:mm:ss')}</span>
      <span>{(result.durationMs / 1000).toFixed(1)}s</span>
      <span>{result.totalRecords} HHMI records in NIHMS</span>
      <span>{result.records.length} deposited from the Workspace</span>
      <span>{count((r) => r.flags.duplicate)} duplicates</span>
      <span>{count((r) => r.flags.statusDiffers)} status differs</span>
      <span>{count((r) => r.flags.unmatched)} unmatched</span>
    </div>
  );
}

const MATCH_LABELS: Record<CorrelatedVersion['match'], string> = {
  package: 'Package ID',
  manuscript: 'Manuscript ID',
  'package+manuscript': 'Package + manuscript ID',
  'same-work': 'Same work',
};

function VersionRow({ version, compared }: { version: CorrelatedVersion; compared: boolean }) {
  return (
    <tr className="border-t border-gray-200 dark:border-gray-700">
      <td className="py-1 pr-4 whitespace-nowrap">
        {formatDate(version.dateCreated, 'yyyy-MM-dd HH:mm')}
      </td>
      <td className="py-1 pr-4">
        <ui.Badge variant={compared ? 'default' : 'outline'}>{stateLabel(version.status)}</ui.Badge>
      </td>
      <td className="py-1 pr-4 whitespace-nowrap">{MATCH_LABELS[version.match]}</td>
      <td className="py-1 pr-4 font-mono text-xs whitespace-nowrap">
        {formatManuscriptId(version.manuscriptId) ?? '—'}
      </td>
      <td className="py-1 pr-4 font-mono text-xs whitespace-nowrap" title={version.workVersionId}>
        {version.workVersionId.slice(0, 8)}…{version.workVersionId.slice(-6)}
      </td>
      <td className="py-1 whitespace-nowrap">
        <a
          className="text-blue-700 underline dark:text-blue-300"
          href={`/app/sites/pmc/deposits/${version.submissionId}/v/${version.submissionVersionId}`}
        >
          Open deposit
        </a>
      </td>
    </tr>
  );
}

function RecordCard({ item }: { item: CorrelatedRecord }) {
  const { record, versions, flags, mappedStatus, comparedVersionId } = item;
  const dates = [
    ['Submitted', nihmsDate(record.submissionDate)],
    ['Initial approval', nihmsDate(record.initialApprovalDate)],
    ['Tagging complete', nihmsDate(record.taggingCompletionDate)],
    ['Final approval', nihmsDate(record.finalApprovalDate)],
    ['Published', nihmsDate(record.articlePublicationDate)],
    ['Sent to PMC', nihmsDate(record.shipToPmcDate)],
  ].filter(([, value]) => value);

  return (
    <primitives.Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap gap-2 items-baseline">
        <span className="font-mono font-semibold">{formatManuscriptId(record.nihmsId)}</span>
        <ui.Badge variant="outline">{record.currentStatus ?? 'No status'}</ui.Badge>
        {record.daysInCurrentStatus !== undefined && (
          <span className="text-sm text-gray-500">{record.daysInCurrentStatus} days in status</span>
        )}
        {flags.duplicate && <ui.Badge variant="destructive">Duplicate</ui.Badge>}
        {flags.statusDiffers && <ui.Badge variant="secondary">Status differs</ui.Badge>}
        {flags.unmatched && <ui.Badge variant="secondary">No Workspace match</ui.Badge>}
      </div>
      <div className="font-medium">{record.title}</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-300">
        {record.journal && <span>{record.journal}</span>}
        {record.pmid && <span>PMID {record.pmid}</span>}
        {record.pmcid && <span>PMC{record.pmcid.replace(/^PMC/i, '')}</span>}
        {record.packageId && (
          <span className="font-mono text-xs" title="bulk-submission-id">
            Package {record.packageId}
          </span>
        )}
      </div>
      {dates.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          {dates.map(([label, value]) => (
            <span key={label}>
              {label}: {value}
            </span>
          ))}
        </div>
      )}
      {mappedStatus && (
        <div className="text-xs text-gray-500">
          Maps to Workspace status: {stateLabel(mappedStatus)}
        </div>
      )}
      {versions.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-left text-gray-500">
                <th className="pr-4 font-medium">Version created</th>
                <th className="pr-4 font-medium">Workspace status</th>
                <th className="pr-4 font-medium">Matched by</th>
                <th className="pr-4 font-medium">Stored manuscript ID</th>
                <th className="pr-4 font-medium">Package</th>
                <th className="font-medium" />
              </tr>
            </thead>
            <tbody>
              {versions.map((version) => (
                <VersionRow
                  key={version.submissionVersionId}
                  version={version}
                  compared={version.submissionVersionId === comparedVersionId}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-sm text-gray-500">No matching deposit in the Workspace.</div>
      )}
    </primitives.Card>
  );
}

export default function NihmsRecordsPage({ loaderData }: { loaderData: LoaderData }) {
  const fetcher = useFetcher<ActionData>({ key: 'nihms-fetch' });
  const actionData = fetcher.data;
  const result = actionData?.ok ? actionData.result : undefined;

  return (
    <PageFrame
      title="NIHMS Records"
      subtitle="Live records from the NIHMS Funder Manuscript List API for deposits made from the Workspace, with the matching deposit versions in our database."
    >
      <div className="flex flex-col gap-3">
        <FetchButton disabled={!loaderData.configured} />
        {!loaderData.configured && (
          <div className="text-sm text-red-600">
            The NIHMS API isn't configured. Add <code>app.extensions.pmc.nihmsApi</code> to the app
            config.
          </div>
        )}
        {actionData && !actionData.ok && (
          <div className="text-sm text-red-600">Couldn't fetch from NIHMS: {actionData.error}</div>
        )}
        {result && <Summary result={result} />}
      </div>
      {result && (
        <SectionWithHeading heading="Workspace deposits in NIHMS" icon={<List />}>
          <ui.ClientFilterableList
            items={result.records}
            filters={FLAG_FILTERS}
            className="max-w-none"
            emptyMessage="No records match."
            searchComponent={(searchTerm, setSearchTerm) => (
              <ui.ClientQuerySearch
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                placeholder="Filter by title, NIHMSID, PMID, PMCID, package ID, journal, status..."
                resultLabel="record"
              />
            )}
            filterBar={(items, activeFilters, setActiveFilters, filterDefinitions) => (
              <ui.ClientFilterBar
                items={items}
                filters={filterDefinitions}
                activeFilters={activeFilters}
                setActiveFilters={setActiveFilters}
                customCountFunction={(resolved: CorrelatedRecord[], filter: ui.FilterDefinition) =>
                  resolved.filter(FLAG_PREDICATES[String(filter.value)] ?? (() => true)).length
                }
              />
            )}
            filterItems={(items, searchTerm, activeFilters) =>
              items.filter(
                (item) =>
                  matchesSearch(item, searchTerm) &&
                  FLAG_FILTERS.every(
                    (filter) =>
                      ui.isAllFiltersActive(activeFilters) ||
                      !ui.isFilterActive(activeFilters, filter) ||
                      FLAG_PREDICATES[String(filter.value)](item),
                  ),
              )
            }
            getItemKey={(item) => item.record.nihmsId}
            renderItem={(item) => <RecordCard item={item} />}
          />
        </SectionWithHeading>
      )}
    </PageFrame>
  );
}
