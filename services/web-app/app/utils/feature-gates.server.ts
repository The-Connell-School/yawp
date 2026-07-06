import { prisma } from '~/utils/db.server';

const GLOBAL_SCOPE = {
  kind: 'global',
  id: '*',
} as const;

export const FEATURE_KEYS = {
  WRITING_PRACTICE: 'writing_practice',
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

export async function isFeatureEnabledForOrganization(
  key: FeatureKey,
  organizationId: string | null | undefined
): Promise<boolean> {
  const scopes: Array<{ scopeKind: string; scopeId: string }> = [
    { scopeKind: GLOBAL_SCOPE.kind, scopeId: GLOBAL_SCOPE.id },
  ];

  if (organizationId) {
    scopes.push({ scopeKind: 'organization', scopeId: organizationId });
  }

  const flags = await prisma.featureFlag.findMany({
    where: {
      key,
      OR: scopes,
    },
    select: { scopeKind: true, scopeId: true, enabled: true },
  });

  const organizationOverride = organizationId
    ? flags.find(
        (flag) =>
          flag.scopeKind === 'organization' && flag.scopeId === organizationId
      )
    : undefined;
  if (organizationOverride) return organizationOverride.enabled;

  return (
    flags.find(
      (flag) =>
        flag.scopeKind === GLOBAL_SCOPE.kind && flag.scopeId === GLOBAL_SCOPE.id
    )?.enabled ?? false
  );
}

export function isWritingPracticeEnabledForOrganization(
  organizationId: string | null | undefined
) {
  return isFeatureEnabledForOrganization(
    FEATURE_KEYS.WRITING_PRACTICE,
    organizationId
  );
}
