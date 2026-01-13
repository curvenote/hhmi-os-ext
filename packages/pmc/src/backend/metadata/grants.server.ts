import { zfd } from 'zod-form-data';
import { z } from 'zod';
import { uuidv7 } from 'uuidv7';
import { withValidFormData } from '@curvenote/scms-server';
import { safelyUpdatePMCMetadata } from './utils.server.js';
import type {
  GrantEntry,
  FunderKey,
  PMCWorkVersionMetadata,
} from '../../common/metadata.schema.js';
import { funderType, HHMI } from '../../common/metadata.schema.js';
import { ensureGrantsStructure, ensureHhmiFirst } from '../grants-migration.server.js';
import { normalizeGrantId } from '../../common/validation.js';

/**
 * Grant Actions for PMC Metadata
 *
 * Handles adding and removing grant entries in the new grant-centric model.
 * Maintains HHMI special handling and ensures proper data structure.
 */

// ==============================
// Schema Definitions
// ==============================

const AddGrantSchema = zfd.formData({
  funderKey: funderType,
  grantId: z.string().min(1, 'Grant ID is required'),
  investigatorName: z.string().optional(), // For HHMI grants
  uniqueId: z.string().optional(),
});

const RemoveGrantSchema = zfd.formData({
  id: z.string().min(1, 'A UID is required'), // Grant UUID for identification
});

const UpdateGrantSchema = zfd.formData({
  index: z.coerce.number().min(0, 'Invalid grant index'),
  grantId: z.string().min(1, 'Grant ID is required'),
});

const SetInitialHHMIGrantSchema = zfd.formData({
  grantId: z.string().min(1, 'Grant ID is required'),
  investigatorName: z.string().optional(),
  uniqueId: z.string().optional(),
});

const ClearInitialHHMIGrantSchema = zfd.formData({
  uniqueId: z.string(),
});

// ==============================
// Grant Management Functions
// ==============================

/**
 * Add a new grant entry to the grants array
 */
export async function addGrant(formData: FormData, workVersionId: string) {
  return withValidFormData(
    AddGrantSchema,
    formData,
    async ({ funderKey, grantId, investigatorName, uniqueId }) => {
      return safelyUpdatePMCMetadata(workVersionId, (currentMetadata: PMCWorkVersionMetadata) => {
        // Ensure grants structure exists (migrate from funders if needed)
        const migratedMetadata = ensureGrantsStructure(currentMetadata) || currentMetadata;
        const currentGrants = migratedMetadata.grants || [];

        // Check for duplicate funder-grant combination
        const normalizedGrantId = normalizeGrantId(grantId);
        const existingGrant = currentGrants.find(
          (grant) =>
            grant.funderKey === funderKey && normalizeGrantId(grant.grantId) === normalizedGrantId,
        );

        if (existingGrant) {
          throw new Error(`Grant "${grantId}" for ${funderKey} already exists`);
        }

        // Create new grant entry
        const newGrant: GrantEntry = {
          id: uuidv7(),
          funderKey,
          grantId: normalizedGrantId,
          ...(funderKey === 'hhmi' && investigatorName && { investigatorName }),
          ...(funderKey === 'hhmi' && uniqueId && { uniqueId }),
        };

        // Add new grant to array
        const updatedGrants = [...currentGrants, newGrant];

        // Ensure HHMI is always first
        const finalGrants = ensureHhmiFirst(updatedGrants);

        const updatedMetadata: PMCWorkVersionMetadata = {
          ...migratedMetadata,
          grants: finalGrants,
        };

        return updatedMetadata;
      });
    },
    { errorFields: { type: 'general', intent: 'grant-add' } },
  );
}

/**
 * Remove a grant entry by UUID
 */
export async function removeGrant(formData: FormData, workVersionId: string) {
  return withValidFormData(
    RemoveGrantSchema,
    formData,
    async ({ id }) => {
      return safelyUpdatePMCMetadata(workVersionId, (currentMetadata: PMCWorkVersionMetadata) => {
        // Ensure grants structure exists
        const migratedMetadata = ensureGrantsStructure(currentMetadata) || currentMetadata;
        const currentGrants = migratedMetadata.grants || [];

        // Find grant by UUID
        const grantIndex = currentGrants.findIndex((grant) => grant.id === id);
        if (grantIndex === -1) {
          throw new Error(`Grant not found with ID: ${id}`);
        }

        const grantToRemove = currentGrants[grantIndex];

        // Prevent removing the only HHMI grant
        const hhmiGrants = currentGrants.filter((grant) => grant.funderKey === 'hhmi');
        if (grantToRemove.funderKey === 'hhmi' && hhmiGrants.length === 1) {
          throw new Error('Cannot remove the only HHMI grant');
        }

        // Remove grant by UUID
        const updatedGrants = currentGrants.filter((grant) => grant.id !== id);

        // Ensure HHMI is still first
        const finalGrants = ensureHhmiFirst(updatedGrants);

        const updatedMetadata: PMCWorkVersionMetadata = {
          ...migratedMetadata,
          grants: finalGrants,
        };

        return updatedMetadata;
      });
    },
    { errorFields: { type: 'general', intent: 'grant-remove' } },
  );
}

/**
 * Update grant ID for an existing grant entry
 */
export async function updateGrantId(formData: FormData, workVersionId: string) {
  return withValidFormData(
    UpdateGrantSchema,
    formData,
    async ({ index, grantId }) => {
      return safelyUpdatePMCMetadata(workVersionId, (currentMetadata: PMCWorkVersionMetadata) => {
        // Ensure grants structure exists
        const migratedMetadata = ensureGrantsStructure(currentMetadata) || currentMetadata;
        const currentGrants = migratedMetadata.grants || [];

        // Validate index
        if (index < 0 || index >= currentGrants.length) {
          throw new Error('Invalid grant index');
        }

        const grantToUpdate = currentGrants[index];
        const normalizedGrantId = normalizeGrantId(grantId);

        // Check for duplicate (but allow updating to same value)
        const existingGrant = currentGrants.find(
          (grant, i) =>
            i !== index &&
            grant.funderKey === grantToUpdate.funderKey &&
            normalizeGrantId(grant.grantId) === normalizedGrantId,
        );

        if (existingGrant) {
          throw new Error(
            `Grant "${normalizedGrantId}" for ${grantToUpdate.funderKey} already exists`,
          );
        }

        // Update the grant ID
        const updatedGrants = currentGrants.map((grant, i) =>
          i === index ? { ...grant, grantId: normalizedGrantId } : grant,
        );

        const updatedMetadata: PMCWorkVersionMetadata = {
          ...migratedMetadata,
          grants: updatedGrants,
        };

        return updatedMetadata;
      });
    },
    { errorFields: { type: 'general', intent: 'grant-update' } },
  );
}

/**
 * Set the initial HHMI grant (creates or updates the first HHMI grant)
 */
export async function setInitialHHMIGrant(formData: FormData, workVersionId: string) {
  return withValidFormData(
    SetInitialHHMIGrantSchema,
    formData,
    async ({ grantId, investigatorName, uniqueId }) => {
      return safelyUpdatePMCMetadata(workVersionId, (currentMetadata: PMCWorkVersionMetadata) => {
        // Ensure grants structure exists
        const migratedMetadata = ensureGrantsStructure(currentMetadata) || currentMetadata;
        const currentGrants = migratedMetadata.grants || [];

        // Find existing HHMI grant
        const hhmiGrantIndex = currentGrants.findIndex((grant) => grant.funderKey === 'hhmi');

        if (hhmiGrantIndex !== -1) {
          // Update existing HHMI grant
          const updatedGrants = [...currentGrants];
          updatedGrants[hhmiGrantIndex] = {
            ...updatedGrants[hhmiGrantIndex], // Preserve existing id
            funderKey: 'hhmi',
            grantId: normalizeGrantId(grantId),
            investigatorName,
            uniqueId,
          };
          return {
            ...migratedMetadata,
            grants: updatedGrants,
          };
        } else {
          // Create new HHMI grant and ensure it's first
          const newGrant: GrantEntry = {
            id: uuidv7(),
            funderKey: 'hhmi',
            grantId: normalizeGrantId(grantId),
            investigatorName,
            uniqueId,
          };
          const updatedGrants = [newGrant, ...currentGrants];
          return {
            ...migratedMetadata,
            grants: updatedGrants,
          };
        }
      });
    },
    { errorFields: { type: 'general', intent: 'initial-hhmi-grant-set' } },
  );
}

/**
 * Clear the initial HHMI grant (removes the first HHMI grant)
 */
export async function clearInitialHHMIGrant(formData: FormData, workVersionId: string) {
  return withValidFormData(ClearInitialHHMIGrantSchema, formData, async ({ uniqueId }) => {
    return safelyUpdatePMCMetadata(workVersionId, (currentMetadata: PMCWorkVersionMetadata) => {
      // Ensure grants structure exists
      const migratedMetadata = ensureGrantsStructure(currentMetadata) || currentMetadata;
      const currentGrants = migratedMetadata.grants || [];

      // Find existing HHMI grant
      const hhmiGrantIndex = currentGrants.findIndex(
        (grant) => grant.funderKey === 'hhmi' && grant.uniqueId === uniqueId,
      );

      if (hhmiGrantIndex === -1) {
        return migratedMetadata;
      }

      // Remove the HHMI grant
      const updatedGrants = [...currentGrants];
      updatedGrants.splice(hhmiGrantIndex, 1);

      return {
        ...migratedMetadata,
        grants: updatedGrants,
      };
    });
  });
}

// ==============================
// Legacy Compatibility Functions
// ==============================

/**
 * Add funder function for backward compatibility
 * Converts to grant with empty grant ID
 *
 * @deprecated Use addGrant instead
 */
export async function addFunderAsGrant(formData: FormData, workVersionId: string) {
  const funderData = zfd.formData({ funder: funderType }).parse(formData);

  // Convert to grant format
  const grantFormData = new FormData();
  grantFormData.set('funderKey', funderData.funder);
  grantFormData.set('grantId', ''); // Empty grant ID - user needs to fill

  return addGrant(grantFormData, workVersionId);
}

/**
 * Remove funder function for backward compatibility
 * Removes first grant matching the funder key
 *
 * @deprecated Use removeGrant instead
 */
export async function removeFunderAsGrant(formData: FormData, workVersionId: string) {
  const funderData = zfd.formData({ funder: funderType }).parse(formData);

  return safelyUpdatePMCMetadata(workVersionId, (currentMetadata: PMCWorkVersionMetadata) => {
    // Ensure grants structure exists
    const migratedMetadata = ensureGrantsStructure(currentMetadata) || currentMetadata;
    const currentGrants = migratedMetadata.grants || [];

    // Find first grant matching funder
    const grantIndex = currentGrants.findIndex((grant) => grant.funderKey === funderData.funder);

    if (grantIndex === -1) {
      throw new Error(`No grant found for funder: ${funderData.funder}`);
    }

    // Prevent removing HHMI if it's the only one
    if (funderData.funder === HHMI) {
      const hhmiGrants = currentGrants.filter((grant) => grant.funderKey === 'hhmi');
      if (hhmiGrants.length === 1) {
        throw new Error('Cannot remove the only HHMI grant');
      }
    }

    // Remove the grant
    const updatedGrants = currentGrants.filter((_, i) => i !== grantIndex);

    // Ensure at least one grant remains
    if (updatedGrants.length === 0) {
      throw new Error('At least one grant must remain');
    }

    // Ensure HHMI is still first
    const finalGrants = ensureHhmiFirst(updatedGrants);

    const updatedMetadata: PMCWorkVersionMetadata = {
      ...migratedMetadata,
      grants: finalGrants,
    };

    return updatedMetadata;
  });
}

// ==============================
// Utility Functions
// ==============================

/**
 * Gets all grants for a specific funder.
 * @param grants - Array of grant entries
 * @param funderKey - Funder key to filter by
 * @returns Array of grants for the specified funder
 */
export function getGrantsForFunder(grants: GrantEntry[], funderKey: FunderKey): GrantEntry[] {
  return grants.filter((grant) => grant.funderKey === funderKey);
}

/**
 * Check if a grant ID is already used for a specific funder
 * @deprecated Use the centralized validation from '../../common/validation'
 */
export function isDuplicateGrant(
  grants: GrantEntry[],
  funderKey: FunderKey,
  grantId: string,
): boolean {
  return grants.some(
    (grant) =>
      grant.funderKey === funderKey &&
      normalizeGrantId(grant.grantId) === normalizeGrantId(grantId),
  );
}

/**
 * Validate grants array for business rules
 * @deprecated Use the centralized validation from '../../common/validation'
 */
export function validateGrants(grants: GrantEntry[]): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (grants.length === 0) {
    errors.push('At least one grant is required');
  }

  // Check for HHMI requirement
  const hasHhmi = grants.some((grant) => grant.funderKey === 'hhmi');
  if (!hasHhmi) {
    errors.push('HHMI funding is required');
  }

  // Check for valid HHMI grant ID
  const hhmiGrant = grants.find((grant) => grant.funderKey === 'hhmi');
  if (hhmiGrant && !normalizeGrantId(hhmiGrant.grantId)) {
    errors.push('HHMI grant ID is required');
  }

  // Check for duplicates
  const seen = new Set<string>();
  for (const grant of grants) {
    const key = `${grant.funderKey}-${normalizeGrantId(grant.grantId)}`;
    if (seen.has(key) && normalizeGrantId(grant.grantId)) {
      errors.push(`Duplicate grant: ${grant.grantId} for ${grant.funderKey}`);
    }
    seen.add(key);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
