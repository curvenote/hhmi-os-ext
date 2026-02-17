import { getPrismaClient } from '@curvenote/scms-server';
import type { ComplianceUserMetadata } from './types.js';

/**
 * Update user's compliance metadata in the database
 */
export async function updateUserComplianceMetadata(
  userId: string,
  metadata: Partial<ComplianceUserMetadata>,
): Promise<void> {
  if (!metadata || Object.keys(metadata).length === 0) {
    return;
  }

  try {
    const prisma = await getPrismaClient();

    // Get current user data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { data: true },
    });

    if (!user) {
      console.error(`User not found: ${userId}`);
      return;
    }

    const currentData = (user.data as any) || {};
    const updatedData = {
      ...currentData,
      compliance: {
        ...currentData.compliance,
        ...metadata,
      },
    };

    await prisma.user.update({
      where: { id: userId },
      data: { data: updatedData },
    });
  } catch (error) {
    console.error(`Failed to update user compliance metadata for user ${userId}:`, error);
    // Don't throw - this is a background update, shouldn't break the loader
  }
}
