import type { GrantEntry, FunderKey } from './metadata.schema.js';

// ==============================
// Grant ID Input Validation
// ==============================

/**
 * Allowed characters for grant ID input
 * Letters (upper and lower case), numbers, forward slashes, hyphens, underscores, spaces
 */
const GRANT_ID_ALLOWED_CHARS = /^[a-zA-Z0-9/\-_\s]*$/;

/**
 * Validate and filter grant ID input to only allow valid characters
 */
export function validateGrantIdInput(input: string): string {
  return input
    .split('')
    .filter((char) => GRANT_ID_ALLOWED_CHARS.test(char))
    .join('');
}

/**
 * Check if a grant ID is valid (non-empty after trimming)
 */
export function isValidGrantId(grantId: string): boolean {
  return grantId.trim().length > 0;
}

/**
 * Normalize a grant ID (trim whitespace)
 */
export function normalizeGrantId(grantId: string): string {
  return grantId.trim();
}

/**
 * Canonical HHMI grant option / storage key: investigator name + grant id.
 * Matches the historical format so existing submissions with `uniqueId` keep working.
 * Example: "Sarah Ayroles" + "HHMI_Kocher_S" → "sarah_ayroles_hhmi_kocher_s"
 */
export function createHhmiGrantUniqueId(grantId: string, investigatorName: string): string {
  const namePart = investigatorName.trim().toLowerCase().replace(/\s+/g, '_');
  const grantPart = normalizeGrantId(grantId).toLowerCase();
  return `${namePart}_${grantPart}`;
}

/**
 * Resolve the select value for a stored HHMI grant (prefer persisted uniqueId).
 */
export function resolveHhmiGrantUniqueId(grant: {
  grantId: string;
  investigatorName?: string | null;
  uniqueId?: string | null;
}): string | undefined {
  if (grant.uniqueId?.trim()) return grant.uniqueId.trim();
  if (grant.investigatorName?.trim() && normalizeGrantId(grant.grantId)) {
    return createHhmiGrantUniqueId(grant.grantId, grant.investigatorName);
  }
  return undefined;
}

// ==============================
// Grant Validation
// ==============================

/**
 * Check if a grant has a valid grant ID
 */
export function hasValidGrantId(grant: GrantEntry): boolean {
  return isValidGrantId(grant.grantId);
}

/**
 * Check if an HHMI grant has a valid grant ID
 */
export function hasValidHhmiGrantId(grant: GrantEntry): boolean {
  return grant.funderKey === 'hhmi' && hasValidGrantId(grant);
}

/**
 * Check if grants array has at least one HHMI grant with valid grant ID
 */
export function hasValidHhmiGrant(grants: GrantEntry[]): boolean {
  const hhmiGrant = grants.find((grant) => grant.funderKey === 'hhmi');
  return hhmiGrant ? hasValidGrantId(hhmiGrant) : false;
}

/**
 * Check if grants array contains HHMI funder (regardless of grant ID)
 */
export function hasHhmiFunder(grants: GrantEntry[]): boolean {
  return grants.some((grant) => grant.funderKey === 'hhmi');
}

// ==============================
// Duplicate Detection
// ==============================

/**
 * Create a unique key for a grant entry
 */
export function createGrantKey(grant: GrantEntry): string {
  return `${grant.funderKey}-${normalizeGrantId(grant.grantId)}`;
}

/**
 * Create a unique key for funder and grant ID
 */
export function createGrantKeyFromParts(funderKey: FunderKey, grantId: string): string {
  return `${funderKey}-${normalizeGrantId(grantId)}`;
}

/**
 * Check if a grant ID is already used for a specific funder
 */
export function isDuplicateGrant(
  grants: GrantEntry[],
  funderKey: FunderKey,
  grantId: string,
): boolean {
  const normalizedGrantId = normalizeGrantId(grantId);
  return grants.some(
    (grant) =>
      grant.funderKey === funderKey && normalizeGrantId(grant.grantId) === normalizedGrantId,
  );
}

/**
 * Find duplicate grants in an array
 */
export function findDuplicateGrants(grants: GrantEntry[]): GrantEntry[] {
  const seen = new Set<string>();
  const duplicates: GrantEntry[] = [];

  for (const grant of grants) {
    const key = createGrantKey(grant);
    if (seen.has(key) && hasValidGrantId(grant)) {
      duplicates.push(grant);
    }
    seen.add(key);
  }

  return duplicates;
}

// ==============================
// Comprehensive Validation
// ==============================

/**
 * Validate grants array for business rules
 */
export function validateGrants(grants: GrantEntry[]): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (grants.length === 0) {
    errors.push('At least one grant is required');
  }

  // Check for HHMI requirement
  if (!hasHhmiFunder(grants)) {
    errors.push('HHMI funding is required');
  }

  // Check for valid HHMI grant ID
  const hhmiGrant = grants.find((grant) => grant.funderKey === 'hhmi');
  if (hhmiGrant && !hasValidGrantId(hhmiGrant)) {
    errors.push('HHMI grant ID is required');
  }

  // Check for duplicates
  const duplicates = findDuplicateGrants(grants);
  for (const duplicate of duplicates) {
    errors.push(`Duplicate grant: ${duplicate.grantId} for ${duplicate.funderKey}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate migration result
 */
export function validateMigrationResult(grants: GrantEntry[]): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (grants.length === 0) {
    errors.push('At least one grant is required');
  }

  // Check for duplicate funder-grant combinations
  const duplicates = findDuplicateGrants(grants);
  for (const duplicate of duplicates) {
    errors.push(`Duplicate grant ID "${duplicate.grantId}" for funder "${duplicate.funderKey}"`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
