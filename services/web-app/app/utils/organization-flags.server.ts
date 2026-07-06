import { prisma } from '~/utils/db.server';

export const ORGANIZATION_FLAG_KEYS = {
  WRITING_PRACTICE: 'writing_practice',
} as const;

export type OrganizationFlagKey =
  (typeof ORGANIZATION_FLAG_KEYS)[keyof typeof ORGANIZATION_FLAG_KEYS];

export async function isOrganizationFlagEnabledForOrganization(
  key: OrganizationFlagKey,
  organizationId: string | null | undefined
): Promise<boolean> {
  if (!organizationId) return false;

  const flag = await prisma.organizationFlag.findUnique({
    where: {
      key_organizationId: {
        key,
        organizationId,
      },
    },
    select: { enabled: true },
  });

  return flag?.enabled ?? false;
}

export function isWritingPracticeEnabledForOrganization(
  organizationId: string | null | undefined
) {
  return isOrganizationFlagEnabledForOrganization(
    ORGANIZATION_FLAG_KEYS.WRITING_PRACTICE,
    organizationId
  );
}
