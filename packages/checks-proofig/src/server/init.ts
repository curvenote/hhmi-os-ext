import type { ProofigDataSchema } from '../schema.js';

export function initialiseMetadataSection(): ProofigDataSchema {
  return {
    stages: {
      initialPost: { status: 'pending', history: [], timestamp: new Date().toISOString() },
    },
  };
}
