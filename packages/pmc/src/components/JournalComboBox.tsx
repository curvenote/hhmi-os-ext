import { useCallback } from 'react';
import { useParams } from 'react-router';
import { ui } from '@curvenote/scms-core';

export interface JournalComboBoxProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  error?: string;
  onErrorClear?: () => void;
}

interface SearchResult {
  id: number;
  journalTitle: string;
  pissn?: string;
  eissn?: string;
}

export function JournalComboBox({
  value,
  onValueChange,
  placeholder = 'Search by name or ISSN...',
  disabled = false,
  className,
  error,
  onErrorClear,
}: JournalComboBoxProps) {
  const params = useParams();
  const workId = params.workId;

  const searchJournals = useCallback(
    async (query: string): Promise<ui.ComboBoxOption[]> => {
      if (!workId) {
        throw new Error('Work ID is required for journal search');
      }

      const response = await fetch(
        `/app/works/${workId}/site/pmc/journal-search?q=${encodeURIComponent(query)}`,
      );

      if (!response.ok) {
        throw new Error(`Search failed with status: ${response.status}`);
      }

      const data = await response.json();

      if (!data || !Array.isArray(data.journals)) {
        throw new Error('Invalid response format from journal search');
      }

      return (data.journals || []).map((journal: SearchResult) => ({
        value: journal.journalTitle,
        label: journal.journalTitle,
        description:
          journal.pissn || journal.eissn
            ? `${journal.eissn ? `eISSN: ${journal.eissn}` : ''}${journal.eissn && journal.pissn ? ' • ' : ''}${journal.pissn ? `pISSN: ${journal.pissn}` : ''}`
            : undefined,
      }));
    },
    [workId],
  );

  return (
    <ui.AsyncComboBox
      boxed
      value={value}
      onValueChange={onValueChange}
      onSearch={searchJournals}
      placeholder={placeholder}
      searchPlaceholder="Type at least 3 characters to search by name or ISSN..."
      emptyMessage="No journals found. Try a different search term."
      loadingMessage="Searching..."
      minSearchLength={3}
      disabled={disabled}
      className={className}
      error={error}
      onErrorClear={onErrorClear}
    />
  );
}
