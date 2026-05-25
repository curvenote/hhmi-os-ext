import { getPrismaClient, safeObjectDataUpdate } from '@curvenote/scms-server';
import { randomUUID } from 'node:crypto';

/**
 * HHMI Scientists Management
 *
 * This module manages HHMI scientists data stored in the generic Object table.
 * Scientists data is synced from Airtable and provides grant IDs for funding UI.
 */

// ==============================
// Type Definitions
// ==============================

export interface HHMIScientist {
  id: string; // Airtable row ID (as string to preserve precision)
  fullName: string; // Scientist's full name
  grantId: string; // HHMI grant ID (e.g., "HHMI_Smith_J")
  orcid: string; // ORCID identifier
}

export interface HHMIGrantsData extends Record<string, any> {
  scientists: HHMIScientist[];
}

// ==============================
// Constants
// ==============================

export const HHMI_GRANTS_OBJECT_TYPE = 'hhmi-grants';

// ==============================
// Core Functions
// ==============================

/**
 * Get the latest HHMI grants object record
 */
async function getLatestHHMIGrantsObject() {
  const prisma = await getPrismaClient();

  return await prisma.object.findFirst({
    where: {
      type: HHMI_GRANTS_OBJECT_TYPE,
    },
    orderBy: {
      date_modified: 'desc',
    },
  });
}

/**
 * Get all HHMI scientists from the Object table
 */
export async function getHHMIScientists(): Promise<HHMIScientist[]> {
  const objectRecord = await getLatestHHMIGrantsObject();

  if (!objectRecord || !objectRecord.data) {
    return [];
  }

  const data = objectRecord.data as HHMIGrantsData;
  return data.scientists || [];
}

/**
 * Get HHMI scientists as grant options for UI components
 */
export async function getHHMIGrantOptions(): Promise<
  Array<{
    value: string;
    label: string;
    description: string;
  }>
> {
  const scientists = await getHHMIScientists();

  return scientists.map((scientist) => {
    // Create unique ID: investigator_name_grant_id (lowercase, underscores)
    const uniqueId = `${scientist.fullName.toLowerCase().replace(/\s+/g, '_')}_${scientist.grantId.toLowerCase()}`;

    return {
      value: uniqueId, // Use unique ID instead of Airtable ID
      label: scientist.fullName,
      description: scientist.grantId,
    };
  });
}

/**
 * Update HHMI scientists data with OCC protection
 * Used primarily by the Airtable sync job
 */
export async function updateHHMIScientists(
  scientists: HHMIScientist[],
  mergeStrategy: 'replace' | 'merge' = 'merge',
): Promise<void> {
  const prisma = await getPrismaClient();

  // Check if any HHMI grants object exists
  const existingObject = await getLatestHHMIGrantsObject();

  if (!existingObject) {
    // Create the initial record with a generated UUID
    const now = new Date().toISOString();

    await prisma.object.create({
      data: {
        id: randomUUID(),
        type: HHMI_GRANTS_OBJECT_TYPE,
        date_created: now,
        date_modified: now,
        data: {
          scientists: scientists,
        } as HHMIGrantsData,
        occ: 0,
      },
      select: { id: true },
    });
    return;
  }

  // Update existing record with OCC using the found object's ID
  await safeObjectDataUpdate<HHMIGrantsData>(existingObject.id, (currentData) => {
    const current = (currentData as unknown as HHMIGrantsData) || { scientists: [] };

    console.log(
      `🔄 Merge operation: ${current.scientists.length} existing + ${scientists.length} new scientists`,
    );

    let updatedScientists: HHMIScientist[];

    if (mergeStrategy === 'replace') {
      console.log(`📝 Using replace strategy`);
      updatedScientists = scientists;
    } else {
      console.log(`📝 Using merge strategy`);
      // Merge strategy: map-based merge
      updatedScientists = mergeScientists(current.scientists, scientists);
      console.log(`📊 Merge result: ${updatedScientists.length} total scientists`);
    }

    return {
      scientists: updatedScientists,
    };
  });
}

/**
 * Get a specific HHMI scientist by grant ID
 */
export async function getHHMIScientistByGrantId(grantId: string): Promise<HHMIScientist | null> {
  const scientists = await getHHMIScientists();
  return scientists.find((scientist) => scientist.grantId === grantId) || null;
}

/**
 * Check if a grant ID is a valid HHMI grant
 */
export async function isValidHHMIGrantId(grantId: string): Promise<boolean> {
  const scientist = await getHHMIScientistByGrantId(grantId);
  return scientist !== null;
}

// ==============================
// Helper Functions
// ==============================

/**
 * Airtable ID-based merge strategy for efficient merging of scientists arrays
 * Uses Airtable record ID as primary key to prevent duplicates from different Airtable records
 */
function mergeScientists(existing: HHMIScientist[], incoming: HHMIScientist[]): HHMIScientist[] {
  // Convert to Map using Airtable ID as key for proper deduplication
  const scientistsMap = new Map<string, HHMIScientist>();

  // Add existing scientists
  for (const scientist of existing) {
    scientistsMap.set(scientist.id, scientist);
  }

  // Update/add incoming scientists (overwrites existing by Airtable ID)
  for (const scientist of incoming) {
    // Filter out scientists with missing essential data
    if (scientist.grantId && scientist.fullName) {
      scientistsMap.set(scientist.id, scientist);
    } else {
      console.log(
        `🚫 Skipped scientist: grantId="${scientist.grantId}", name="${scientist.fullName}"`,
      );
    }
  }

  // Convert back to array, sorted by grant ID for consistency
  return Array.from(scientistsMap.values()).sort((a, b) => a.grantId.localeCompare(b.grantId));
}

// ==============================
// Administrative Functions
// ==============================

/**
 * Get statistics about HHMI scientists data
 */
export async function getHHMIScientistsStats(): Promise<{
  totalScientists: number;
  lastUpdated: string | null;
}> {
  const objectRecord = await getLatestHHMIGrantsObject();

  if (!objectRecord) {
    return {
      totalScientists: 0,
      lastUpdated: null,
    };
  }

  const data = objectRecord.data as HHMIGrantsData;
  const scientists = data?.scientists || [];

  return {
    totalScientists: scientists.length,
    lastUpdated: objectRecord.date_modified,
  };
}

/**
 * Reset HHMI scientists data (admin function)
 */
export async function resetHHMIScientists(): Promise<void> {
  const prisma = await getPrismaClient();

  await prisma.object.deleteMany({
    where: {
      type: HHMI_GRANTS_OBJECT_TYPE,
    },
  });
}
