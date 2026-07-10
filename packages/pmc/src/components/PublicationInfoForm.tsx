import React, { useRef, useState } from 'react';
import { useFetcher, useLoaderData } from 'react-router';
import { ui } from '@curvenote/scms-core';
import type { GeneralError } from '@curvenote/scms-core';
import type { PMCCombinedMetadataSection } from '../common/metadata.schema.js';
import { PublicationInfoCard } from './PublicationInfoCard.js';
import { ValidationErrors } from './ValidationErrors.js';
import { JournalComboBox } from './JournalComboBox.js';

function PublicationManualEntry({ doiFormRef }: { doiFormRef: React.RefObject<HTMLFormElement> }) {
  const { metadata } = useLoaderData<{ metadata: PMCCombinedMetadataSection }>();
  let { title, journalName } = metadata.pmc ?? {};
  const titleFetcher = useFetcher<{ success: boolean; error: GeneralError }>();
  const journalFetcher = useFetcher<{ success: boolean; error: GeneralError }>();
  const [articleTitle, setArticleTitle] = useState(title ?? '');

  // Keep articleTitle in sync with metadata reset
  React.useEffect(() => {
    setArticleTitle(title ?? '');
  }, [title]);

  if (titleFetcher.formData?.get('title')) {
    title = String(titleFetcher.formData?.get('title'));
  }

  if (journalFetcher.formData?.get('journalName')) {
    journalName = String(journalFetcher.formData?.get('journalName'));
  }

  return (
    <>
      <div>
        <titleFetcher.Form className="flex flex-col gap-4" ref={doiFormRef} method="post">
          <ui.TextField
            id="articleTitle"
            name="articleTitle"
            label="Article title"
            type="text"
            className="w-full"
            value={articleTitle}
            error={titleFetcher.data?.error?.message}
            onChange={(e) => setArticleTitle(e.target.value)}
            onBlur={(e) => {
              e.preventDefault();
              titleFetcher.submit(
                { intent: 'publication-title-update', title: e.currentTarget.value },
                { method: 'post' },
              );
            }}
          />
        </titleFetcher.Form>
      </div>
      <div>
        <journalFetcher.Form
          className="flex flex-col gap-4"
          ref={doiFormRef}
          method="post"
          onSubmit={(e) => {
            e.preventDefault(); // Prevent default browser/Remix form submission
          }}
        >
          <div className="flex flex-col gap-[2px]">
            <label htmlFor="journalName" className="block text-sm font-medium">
              Journal Name
            </label>
            <JournalComboBox
              value={journalName}
              onValueChange={(value) => {
                // Submit for both setting and clearing values
                if (value !== journalName) {
                  journalFetcher.submit(
                    { intent: 'publication-journal-name-update', journalName: value },
                    { method: 'post' },
                  );
                }
              }}
              placeholder="Search by name or ISSN..."
              className="max-w-md"
              error={journalFetcher.data?.error?.message}
              onErrorClear={() => {
                // Clear any validation errors when user makes a selection
                if (journalFetcher.data?.error) {
                  journalFetcher.submit(
                    { intent: 'publication-journal-name-update', journalName: journalName || '' },
                    { method: 'post' },
                  );
                }
              }}
            />
          </div>
        </journalFetcher.Form>
      </div>
    </>
  );
}

function DoiBasedLookup({
  formRef,
  onNoDoiClick,
}: {
  formRef: React.RefObject<HTMLFormElement>;
  onNoDoiClick: () => void;
}) {
  const { metadata } = useLoaderData<{ metadata: PMCCombinedMetadataSection }>();
  const { doiUrl } = metadata.pmc ?? {};
  const fetcher = useFetcher<{ success: boolean; error: GeneralError }>();
  const resetFetcher = useFetcher();
  const [doiError, setDoiError] = useState<string | undefined>(undefined);

  // Set local error from fetcher after submission
  React.useEffect(() => {
    if (fetcher.state === 'idle') {
      if (fetcher.data?.error) {
        setDoiError(fetcher.data.error.message);
      } else if (doiError) {
        setDoiError('');
      }
    }
  }, [fetcher.state, fetcher.data]);

  // Clear error when form is submitted
  React.useEffect(() => {
    if (fetcher.state === 'submitting') {
      setDoiError('');
    }
  }, [fetcher.state]);

  return (
    <div className="flex flex-col items-start grow">
      <fetcher.Form className="flex w-full gap-2 p-1" method="post" ref={formRef}>
        <input type="hidden" name="intent" value="publication-doi-lookup" />
        <ui.TextField
          id="doi"
          name="doi"
          type="text"
          placeholder="For example, https://doi.org/10.1038/nmeth.4637"
          className="w-full max-w-md"
          required
          defaultValue={doiUrl}
          error={doiError}
          onBlur={(e) => {
            e.target.value = e.target.value.trim();
          }}
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData('text').trim();
            document.execCommand('insertText', false, text);
          }}
        />
        <ui.StatefulButton
          type="submit"
          variant="default"
          overlayBusy
          busy={fetcher.state === 'submitting'}
        >
          Search
        </ui.StatefulButton>
        <ui.Button
          type="button"
          variant="secondary"
          onClick={() => {
            setDoiError(undefined);
            onNoDoiClick();
          }}
        >
          Article does not have a DOI
        </ui.Button>
        {doiUrl && (
          <ui.Button
            type="button"
            variant="outline"
            onClick={() => {
              setDoiError(undefined); // Clear DOI error
              resetFetcher.submit({ intent: 'publication-reset' }, { method: 'post' });
              formRef.current?.reset();
            }}
          >
            Reset
          </ui.Button>
        )}
      </fetcher.Form>
    </div>
  );
}

export function PublicationInfoForm() {
  const { metadata, journalValidationError } = useLoaderData<{
    metadata: PMCCombinedMetadataSection;
    journalValidationError?: GeneralError;
  }>();
  const clearDoiFetcher = useFetcher();
  const { doiSuccess, title, journalName } = metadata.pmc ?? {};
  const doiFormRef = useRef<HTMLFormElement>(null);
  const [showManualEntry, setShowManualEntry] = useState(
    !doiSuccess && Boolean(title || journalName),
  );

  const switchToManualEntry = () => {
    clearDoiFetcher.submit({ intent: 'publication-clear-doi-lookup' }, { method: 'post' });
    setShowManualEntry(true);
  };

  return (
    <div id="publication-info" className="space-y-4">
      <h2>Publication Info</h2>
      {!showManualEntry && (
        <label htmlFor="doi" className="block mb-1 text-base">
          Do you have a <span className="font-medium">DOI</span> from a journal?{' '}
          <ui.Button variant="link" onClick={switchToManualEntry}>
            Enter information manually
          </ui.Button>
        </label>
      )}
      {showManualEntry && (
        <p className="block mb-1 text-base">
          <>
            Please provide the following information about your publication.{' '}
            <ui.Button variant="link" onClick={() => setShowManualEntry(false)}>
              Look up by DOI instead
            </ui.Button>
          </>
        </p>
      )}

      {journalValidationError && <ValidationErrors error={journalValidationError} />}

      {!showManualEntry && (
        <div className="flex gap-4">
          <DoiBasedLookup
            formRef={doiFormRef}
            onNoDoiClick={() => {
              doiFormRef.current?.reset();
              switchToManualEntry();
            }}
          />
        </div>
      )}

      {showManualEntry && <PublicationManualEntry doiFormRef={doiFormRef} />}
      {!showManualEntry && doiSuccess && <PublicationInfoCard />}
    </div>
  );
}
