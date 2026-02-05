import { prisma } from './db.server';

export const FEATURE_FLAGS = {
  DOCUMENT_SUBMISSION: 'document_submission_enabled',
} as const;

export async function getFeatureFlag(name: string): Promise<boolean> {
  const setting = await prisma.setting.findUnique({
    where: { name },
    select: { value: true, valueType: true },
  });

  if (!setting || setting.valueType !== 'boolean') {
    return false;
  }

  return setting.value === 'true';
}
