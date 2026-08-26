import type { ProofigStage } from '../schema.js';
import { ui } from '@curvenote/scms-core';
import { SimplifiedError } from './SimplifiedError.js';
import { SimplifiedProgressAlertMessage } from './SimplifiedProgressAlertMessage.js';

export function SimplifiedDocumentPreparation({ data }: { data: ProofigStage }) {
  if (data.status === 'error') {
    return <SimplifiedError data={data} message="Document preparation failed" />;
  }
  switch (data.status) {
    case 'pending':
    case 'processing':
      return (
        <ui.SimpleAlert
          type="info"
          message={
            <SimplifiedProgressAlertMessage text="Preparing your document… converting Word to PDF." />
          }
        />
      );
    default:
      return (
        <ui.SimpleAlert type="info" message={<SimplifiedProgressAlertMessage text="Pending" />} />
      );
  }
}
