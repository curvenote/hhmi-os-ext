import { primitives, usePingEvent } from '@curvenote/scms-core';
import { FileText } from 'lucide-react';
import { HHMITrackEvent } from './analytics/events.js';

interface NoticeToJournalsTaskCardProps {
  pdfUrl: string;
}

export function NoticeToJournalsTaskCard({ pdfUrl }: NoticeToJournalsTaskCardProps) {
  const pingEvent = usePingEvent();

  return (
    <a
      href={pdfUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        pingEvent(
          HHMITrackEvent.COMPLIANCE_WIZARD_NOTICE_TO_JOURNALS_CLICKED,
          { url: pdfUrl },
          { anonymous: true, ignoreAdmin: true },
        );
      }}
    >
      <primitives.Card
        lift
        className="p-4 border-stone-400 min-h-[120px] relative w-[360px] not-prose"
      >
        <div className="absolute inset-0 w-full h-full cursor-pointer hover:bg-accent/50">
          <div className="flex gap-4 items-center mr-2 ml-3 h-full">
            <div className="flex-shrink-0">
              <FileText className="w-20 h-20 text-green-800" strokeWidth={1} />
            </div>
            <div className="flex-1 text-left">
              <h3 className="text-lg font-normal">Notice to Journals</h3>
              <p className="text-sm text-muted-foreground line-clamp-3">
                If you submit this article to a journal, remember to include this standard notice
                with your submission materials.
              </p>
            </div>
          </div>
        </div>
      </primitives.Card>
    </a>
  );
}
