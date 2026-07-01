import { useNavigate } from 'react-router';
import { primitives, usePingEvent } from '@curvenote/scms-core';
import pmcGraphic from './assets/pmc-task-graphic.svg';
import { PMCTrackEvent } from './analytics/events.js';

export function PMCDepositTaskCard() {
  const navigate = useNavigate();
  const pingEvent = usePingEvent();

  const handleCardClick = () => {
    pingEvent(
      PMCTrackEvent.PMC_DEPOSIT_TASK_CARD_CLICKED,
      {},
      { anonymous: true, ignoreAdmin: true },
    );
    navigate('/app/works/pmc');
  };

  return (
    <primitives.Card
      lift
      className="relative p-0 h-full bg-white transition-colors border-stone-400"
    >
      <button
        type="button"
        onClick={handleCardClick}
        className="px-2 py-4 w-full h-full cursor-pointer hover:bg-accent/50"
      >
        <div className="flex gap-2 items-center mx-2 h-full">
          <div className="flex-shrink-0">
            <img src={pmcGraphic} alt="PMC Deposit" className="w-20 h-20" />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-lg font-normal">PubMed Central Submission Tool</h3>
            <p className="text-sm text-muted-foreground line-clamp-3">
              Upload your final draft and HHMI will deposit it on PubMed Central on your behalf.
            </p>
          </div>
        </div>
      </button>
    </primitives.Card>
  );
}
