import { Link } from 'react-router';
import { primitives } from '@curvenote/scms-core';
import journalCoverageIcon from './assets/journal-coverage-icon.svg';

const JOURNAL_SEARCH_PATH = '/app/task/journal-search';

export function JournalSearchTaskCard() {
  return (
    <primitives.Card
      lift
      className="relative p-0 h-full bg-white transition-colors cursor-pointer border-stone-400 hover:bg-accent/50"
    >
      <Link to={JOURNAL_SEARCH_PATH} className="block px-2 py-4 w-full h-full cursor-pointer">
        <div className="flex gap-2 items-center mx-2 h-full">
          <div className="flex-shrink-0">
            <img src={journalCoverageIcon} alt="Journal Coverage" className="w-20 h-20" />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-lg font-normal">Journal Payment Lookup Tool</h3>
            <p className="text-sm text-muted-foreground">
              Look up a journal to see whether HHMI lab budgets can be used to pay open access or
              other fees.
            </p>
          </div>
        </div>
      </Link>
    </primitives.Card>
  );
}
