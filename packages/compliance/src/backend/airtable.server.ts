import {
  fetchPreprintsCoveredByPolicy,
  fetchPreprintsNotCoveredByPolicy,
} from './airtable.preprints.server.js';
import {
  fetchPublicationsCoveredByPolicy,
  fetchPublicationsNotCoveredByPolicy,
} from './airtable.publications.server.js';

/**
 * Fetches all articles (preprints and publications) covered by the compliance policy for a given ORCID.
 * Results are sorted by year in descending order.
 * @param orcid - ORCID identifier
 * @returns Array of normalized article records sorted by year
 */
export async function fetchEverythingCoveredByPolicy(orcid: string) {
  return Promise.all([
    fetchPreprintsCoveredByPolicy(orcid),
    fetchPublicationsCoveredByPolicy(orcid),
  ]).then((AoA) => AoA.flat().sort((a, b) => Number(b.year ?? 0) - Number(a.year ?? 0)));
}

/**
 * Fetches all articles (preprints and publications) not covered by the compliance policy for a given ORCID.
 * Results are sorted by year in descending order.
 * @param orcid - ORCID identifier
 * @returns Array of normalized article records sorted by year
 */
export async function fetchEverythingNotCoveredByPolicy(orcid: string) {
  return Promise.all([
    fetchPreprintsNotCoveredByPolicy(orcid),
    fetchPublicationsNotCoveredByPolicy(orcid),
  ]).then((AoA) => AoA.flat().sort((a, b) => Number(b.year ?? 0) - Number(a.year ?? 0)));
}
