import type { dbListPMCSubmissionsWithLatestNonDraftVersion } from './db.server.js';

export type ListingPromise = ReturnType<typeof dbListPMCSubmissionsWithLatestNonDraftVersion>;
export type ResolvedListing = Awaited<ListingPromise>;
