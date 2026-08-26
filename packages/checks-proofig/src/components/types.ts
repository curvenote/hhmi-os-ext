import type { ProofigDataSchema } from '../schema.js';

// Define the checks metadata section type
// This matches the structure in the main app's checks.schema.ts
export interface ChecksMetadataSection {
  checks?: {
    enabled?: string[];
    proofig?: ProofigDataSchema;
    'curvenote-structure'?: { dispatched: boolean };
    textIntegrity?: { dispatched: boolean };
  };
}
