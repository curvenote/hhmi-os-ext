import { useFetcher, useLoaderData } from 'react-router';
import { ui, cn } from '@curvenote/scms-core';
import { Trash2, ExternalLink, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { GeneralError } from '@curvenote/scms-core';
import type { PMCWorkVersionMetadataSection, GrantEntry } from '../common/metadata.schema.js';
import { validateGrantIdInput, normalizeGrantId } from '../common/validation.js';

import type { Funder } from './funders.js';
import { PMC_FUNDERS_MAP } from './funders.js';
import type { HHMIGrantOption } from '../backend/hhmi-grants.server.js';

// Component for the initial HHMI grant row (first bullet point)
function InitialHHMIGrantRow({
  grantOptions,
  value,
  onSelect,
  onClear,
  error,
  disabled,
  readonly = false,
}: {
  grantOptions: HHMIGrantOption[];
  value?: string;
  onSelect?: (grantId: string, investigatorName: string) => void;
  onClear?: (grantId: string, investigatorName: string) => void;
  error?: string;
  disabled?: boolean;
  readonly?: boolean;
}) {
  const funder = PMC_FUNDERS_MAP['hhmi'];

  // Use the controlled value, defaulting to empty string if not provided
  const currentValue = value || '';

  const handleValueChange = (newValue: string) => {
    const selectedOption = grantOptions.find((option) => option.value === newValue);
    if (selectedOption) {
      onSelect?.(selectedOption.value, selectedOption.label);
    } else if (newValue === '') {
      const previousValue = currentValue;
      const optionToClear = grantOptions.find((option) => option.value === previousValue);
      if (optionToClear) {
        onClear?.(optionToClear.value, optionToClear.label);
      }
    }
  };

  return (
    <div className="flex items-center gap-4 py-1">
      <div className={readonly ? 'flex-1' : 'w-80'}>
        <span className="font-medium text-gray-900">{funder.name}</span>
        <span className="ml-1 text-sm text-gray-500">({funder.abbreviation})</span>
      </div>
      <div className={readonly ? 'flex-1 min-w-0' : 'w-64 min-w-0'}>
        {disabled ? (
          <span className="text-sm font-medium text-gray-900">
            {currentValue
              ? grantOptions.find((option) => option.value === currentValue)?.label ||
                'No investigator selected'
              : 'No investigator selected'}
          </span>
        ) : (
          <ui.ClientComboBox
            options={grantOptions}
            value={currentValue}
            onValueChange={handleValueChange}
            placeholder="Select HHMI investigator..."
            searchPlaceholder="Search investigators..."
            emptyMessage="No investigators found."
            error={error}
            disabled={disabled}
          />
        )}
      </div>
      <div className="flex justify-end">{error && <ui.SmallErrorTray error={error} />}</div>
    </div>
  );
}

// Component for selecting HHMI grant ID
function HHMIGrantSelect({
  grantOptions,
  value: controlledValue,
  defaultValue,
  disabled,
  onSelect,
  error,
}: {
  grantOptions: HHMIGrantOption[];
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
  onSelect?: (value: string) => void;
  error?: string;
}) {
  // Use controlled value if provided, otherwise fall back to internal state
  const [internalValue, setInternalValue] = useState(defaultValue || '');
  const value = controlledValue !== undefined ? controlledValue : internalValue;

  const handleValueChange = (newValue: string) => {
    if (controlledValue === undefined) {
      setInternalValue(newValue);
    }
    onSelect?.(newValue);
  };

  return (
    <div className="space-y-2">
      <ui.ClientComboBox
        options={grantOptions}
        value={value}
        onValueChange={handleValueChange}
        placeholder="Select HHMI Investigator..."
        searchPlaceholder="Search investigators..."
        emptyMessage="No investigators found."
        disabled={disabled}
        error={error}
      />
      {error && <ui.SmallErrorTray error={error} />}
    </div>
  );
}

// Component for selecting funder and entering grant ID
function GrantEntryForm({
  funders,
  grantOptions,
  disabled,
  error,
}: {
  funders: Funder[];
  grantOptions: HHMIGrantOption[];
  disabled?: boolean;
  error?: string;
}) {
  const [selectedFunder, setSelectedFunder] = useState<string>('');
  const [grantId, setGrantId] = useState('');
  const [selectedHHMIValue, setSelectedHHMIValue] = useState(''); // Track the selected HHMI investigator value
  const [isHHMI, setIsHHMI] = useState(false);

  const handleFunderChange = (funderKey: string) => {
    setSelectedFunder(funderKey);
    setIsHHMI(funderKey === 'hhmi');
    setGrantId(''); // Reset grant ID when funder changes
    setSelectedHHMIValue(''); // Reset HHMI selection when funder changes
  };

  const handleGrantIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const validatedValue = validateGrantIdInput(e.target.value);
    setGrantId(validatedValue);
  };

  const canSubmit = selectedFunder && normalizeGrantId(grantId) && !disabled;

  return (
    <div className="flex flex-row items-end w-full gap-4">
      {/* Funder Selection */}
      <div className="flex-1">
        <label className="block mb-1 text-sm font-medium text-gray-700">Add Funder</label>
        <ui.ClientComboBox
          options={funders.map((funder) => ({
            value: funder.key,
            label: funder.name,
            description: funder.abbreviation,
          }))}
          value={selectedFunder}
          onValueChange={handleFunderChange}
          placeholder="Select funder..."
          searchPlaceholder="Search funders..."
          emptyMessage="No funders found."
          disabled={disabled}
        />
      </div>

      {/* Grant ID Input */}
      <div className="flex-1">
        {isHHMI ? (
          <div>
            <label className="block mb-1 text-sm font-medium text-gray-700">
              HHMI Investigator
            </label>
            <HHMIGrantSelect
              grantOptions={grantOptions}
              value={selectedHHMIValue}
              onSelect={(selectedValue) => {
                setSelectedHHMIValue(selectedValue);
                setGrantId(selectedValue);
              }}
              disabled={disabled}
              error={error}
            />
          </div>
        ) : (
          <>
            <label className="block mb-1 text-sm font-medium text-gray-700">Grant ID</label>
            <ui.Input
              name="grantId"
              value={grantId}
              onChange={handleGrantIdChange}
              placeholder="Enter grant ID..."
              disabled={disabled}
              className={cn(error && 'border-red-500')}
            />
          </>
        )}
        {error && <ui.SmallErrorTray error={error} />}
      </div>

      {/* Hidden inputs for form submission */}
      {selectedFunder && <input type="hidden" name="funderKey" value={selectedFunder} />}
      {normalizeGrantId(grantId) && (
        <input type="hidden" name="grantId" value={normalizeGrantId(grantId)} />
      )}
      {/* For HHMI grants, also include the investigator name */}
      {isHHMI && selectedHHMIValue && (
        <input
          type="hidden"
          name="investigatorName"
          value={grantOptions.find((option) => option.value === selectedHHMIValue)?.label || ''}
        />
      )}

      {/* Add Button */}
      <ui.Button type="submit" disabled={!canSubmit} className="flex-shrink-0">
        <Plus className="w-4 h-4" />
        Add
      </ui.Button>
    </div>
  );
}

// Component for displaying a grant entry
function GrantEntryRow({
  grant,
  canDelete = true,
  isInitialHHMI = false,
  grantOptions,
  readonly = false,
}: {
  grant: GrantEntry;
  canDelete?: boolean;
  isInitialHHMI?: boolean;
  grantOptions: HHMIGrantOption[];
  readonly?: boolean;
}) {
  const removeFetcher = useFetcher();
  const funder = PMC_FUNDERS_MAP[grant.funderKey];

  return (
    <div className="flex items-center gap-4 py-1">
      <div className={readonly ? 'flex-1' : 'w-80'}>
        <span className="font-medium text-gray-900">{funder.name}</span>
        <span className="ml-1 text-sm text-gray-500">({funder.abbreviation})</span>
      </div>
      <div className="w-64 min-w-0">
        {grant.funderKey === 'hhmi' ? (
          <span className="text-sm font-medium text-gray-900">
            {grantOptions.find((option) => option.value === grant.grantId)?.label ||
              grant.investigatorName ||
              grant.grantId}
          </span>
        ) : (
          <span className="font-mono text-sm text-gray-900">{grant.grantId}</span>
        )}
      </div>
      <div className="flex justify-end">
        {canDelete && !isInitialHHMI && (
          <ui.SimpleTooltip title="Remove item" side="right" sideOffset={10} delayDuration={250}>
            <removeFetcher.Form method="post" className="inline">
              <input type="hidden" name="intent" value="grant-remove" />
              <input type="hidden" name="id" value={grant.id} />
              <ui.Button
                type="submit"
                variant="ghost"
                size="icon-sm"
                className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                disabled={removeFetcher.state !== 'idle'}
              >
                <Trash2 className="stroke-[1.5px]" />
                <span className="sr-only">Remove grant</span>
              </ui.Button>
            </removeFetcher.Form>
          </ui.SimpleTooltip>
        )}
      </div>
    </div>
  );
}

export function GrantsInfo({ readonly = false }: { readonly?: boolean }) {
  const { metadata, grantOptions } = useLoaderData<{
    metadata: PMCWorkVersionMetadataSection;
    grantOptions: HHMIGrantOption[];
  }>();
  const fetcher = useFetcher<{ success?: boolean; error?: GeneralError }>();
  const [resetKey, setResetKey] = useState(0);
  const [showAddForm, setShowAddForm] = useState(false);

  // All funders with HHMI first, NIH second, then alphabetical
  const availableFunders = Object.values(PMC_FUNDERS_MAP).sort((a, b) => {
    if (a.key === 'hhmi') return -1;
    if (b.key === 'hhmi') return 1;
    if (a.key === 'nih') return -1;
    if (b.key === 'nih') return 1;
    return a.name.localeCompare(b.name);
  });

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) {
      setResetKey((prev) => prev + 1);
    }
  }, [fetcher.state]);

  const handleAddGrant = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const funderKey = formData.get('funderKey') as string;
    const grantId = formData.get('grantId') as string;

    if (funderKey === 'hhmi') {
      const investigatorName = formData.get('investigatorName') as string;
      fetcher.submit(
        { intent: 'grant-add', funderKey, grantId, investigatorName },
        { method: 'post' },
      );
    } else {
      fetcher.submit({ intent: 'grant-add', funderKey, grantId }, { method: 'post' });
    }
  };

  const handleInitialHHMIGrantChange = (grantId: string, investigatorName: string) => {
    const formData = new FormData();
    formData.set('intent', 'initial-hhmi-grant-set');
    formData.set('grantId', grantId);
    formData.set('investigatorName', investigatorName);
    fetcher.submit(formData, { method: 'post' });
  };

  const handleInitialHHMIGrantClear = (grantId: string, _investigatorName: string) => {
    const formData = new FormData();
    formData.set('intent', 'initial-hhmi-grant-clear');
    formData.set('grantId', grantId);
    fetcher.submit(formData, { method: 'post' });
  };

  const grants = metadata.pmc?.grants ?? [];
  const firstHHMIGrantIndex = grants.findIndex((grant) => grant.funderKey === 'hhmi');
  const firstHHMIGrant = grants[firstHHMIGrantIndex]; // First HHMI grant is the initial one
  const otherGrants = [
    ...grants.slice(0, firstHHMIGrantIndex),
    ...grants.slice(firstHHMIGrantIndex + 1),
  ];

  // Handle optimistic updates from the initial HHMI grant form
  const formIntent = fetcher.formData?.get('intent');
  const optimisticFirstHHMIGrantSelectValue = String(fetcher.formData?.get('grantId') ?? '');
  let firstHHMIGrantSelectValue = firstHHMIGrant?.grantId ? firstHHMIGrant.grantId : undefined;
  if (fetcher.state !== 'idle' && formIntent === 'initial-hhmi-grant-set') {
    firstHHMIGrantSelectValue = optimisticFirstHHMIGrantSelectValue;
  } else if (fetcher.state !== 'idle' && formIntent === 'initial-hhmi-grant-clear') {
    firstHHMIGrantSelectValue = undefined;
  }

  return (
    <div id="grants-info" className="space-y-6">
      <h2>Funding Information</h2>
      <div className="max-w-full text-base prose text-stone-600 dark:text-stone-400">
        Please identify funding from any{' '}
        <ui.TooltipProvider>
          <ui.Tooltip delayDuration={100}>
            <ui.TooltipTrigger asChild>
              <a
                href="https://www.nihms.nih.gov/about/funders/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex gap-0.5 items-center text-inherit"
              >
                NIHMS Supported Funder
                <ExternalLink className="w-3 h-3" />
              </a>
            </ui.TooltipTrigger>
            <ui.TooltipContent side="top" sideOffset={5}>
              <div className="space-y-1 text-sm">
                <div className="font-semibold">NIHMS Supported Agencies:</div>
                <ul className="list-disc list-inside space-y-0.5 mb-1">
                  <li>Howard Hughes Medical Institute (HHMI)</li>
                  <li>National Institutes of Health (NIH)</li>
                  <li>Administration for Community Living (ACL)</li>
                  <li>Agency for Healthcare Research and Quality (AHRQ)</li>
                  <li>Centers for Disease Control and Prevention (CDC)</li>
                  <li>Food and Drug Administration (FDA)</li>
                  <li>Administration for Strategic Preparedness & Response (ASPR)</li>
                  <li>Environmental Protection Agency (EPA)</li>
                  <li>National Institute of Standards and Technology (NIST)</li>
                  <li>Department of Homeland Security (DHS)</li>
                  <li>Department of Veterans Affairs (VA)</li>
                </ul>
              </div>
            </ui.TooltipContent>
          </ui.Tooltip>
        </ui.TooltipProvider>
        . Funding from the Howard Hughes Medical Institute is included by default, please select the
        HHMI Investigator associated with the award.
      </div>

      <div className="flex flex-col gap-8">
        <ul className="list-disc pl-6 [&>li]:text-gray-900 dark:[&>li]:text-gray-100 [&>li]:pl-1 [&>li]:py-1">
          {/* Initial HHMI Grant Row */}
          <li key="initial-hhmi-grant">
            <InitialHHMIGrantRow
              grantOptions={grantOptions}
              value={firstHHMIGrantSelectValue}
              onSelect={readonly ? undefined : handleInitialHHMIGrantChange}
              onClear={readonly ? undefined : handleInitialHHMIGrantClear}
              error={fetcher.data?.error?.message}
              disabled={readonly}
              readonly={readonly}
            />
          </li>

          {/* Additional Grant Rows */}
          {otherGrants
            .filter((grant) => grant.funderKey && grant.grantId)
            .map((grant) => (
              <li key={grant.id ?? `${grant.funderKey}-${grant.grantId}`}>
                <GrantEntryRow
                  grant={grant}
                  canDelete={
                    readonly ? false : grant.funderKey !== 'hhmi' || otherGrants.length > 1
                  }
                  isInitialHHMI={false}
                  grantOptions={grantOptions}
                  readonly={readonly}
                />
              </li>
            ))}
        </ul>

        {/* Add Grant Form - only show if not readonly */}
        {!readonly && (
          <div className="w-full">
            {!showAddForm && (
              <ui.Button
                variant="secondary"
                className="py-[6px] px-6 font-medium text-gray-900 dark:text-gray-100 hover:no-underline"
                onClick={() => setShowAddForm(!showAddForm)}
              >
                Add Additional Funding Source
              </ui.Button>
            )}
            {showAddForm && (
              <div className="">
                <fetcher.Form className="w-full mt-0" method="post" onSubmit={handleAddGrant}>
                  <input type="hidden" name="intent" value="grant-add" />
                  <GrantEntryForm
                    key={resetKey}
                    funders={availableFunders}
                    grantOptions={grantOptions}
                    error={fetcher.data?.error?.message}
                  />
                </fetcher.Form>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
