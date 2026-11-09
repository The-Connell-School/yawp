import { prisma } from '~/utils/db.server';
import {
  type FeatureFlagKey,
  type FeatureFlagValue,
  featureFlagSettingName,
  normalizeFeatureFlagValue,
  parseFeatureFlagValue,
  sameFeatureFlagValue,
} from './feature-flags';
import { setFeatureFlag } from './feature-flags.server';

async function readFeatureFlagValue(
  key: FeatureFlagKey
): Promise<FeatureFlagValue> {
  const row = await prisma.setting.findUnique({
    where: { name: featureFlagSettingName(key) },
    select: { value: true },
  });
  return parseFeatureFlagValue(row?.value);
}

/**
 * Turn a flag on for one school without disturbing everyone mode or other
 * targeted schools.
 */
export async function enableFeatureFlagForOrganization(
  key: FeatureFlagKey,
  orgId: string,
  operatorEmail: string,
  audit: Parameters<typeof setFeatureFlag>[3] = {}
) {
  const previous = await readFeatureFlagValue(key);
  if (previous.mode === 'everyone') {
    return setFeatureFlag(key, previous, operatorEmail, {
      ...audit,
      reason: audit.reason ?? 'org_enable_noop',
    });
  }
  const orgIds = new Set(
    previous.mode === 'targeted' ? previous.orgIds : []
  );
  orgIds.add(orgId);
  const next = normalizeFeatureFlagValue('targeted', [...orgIds]);
  if (sameFeatureFlagValue(previous, next)) {
    return setFeatureFlag(key, next, operatorEmail, {
      ...audit,
      reason: audit.reason ?? 'org_enable_noop',
    });
  }
  return setFeatureFlag(key, next, operatorEmail, audit);
}

/**
 * Remove one school from a targeted flag. When it was the last school, the
 * flag returns to off.
 */
export async function disableFeatureFlagForOrganization(
  key: FeatureFlagKey,
  orgId: string,
  operatorEmail: string,
  audit: Parameters<typeof setFeatureFlag>[3] = {}
) {
  const previous = await readFeatureFlagValue(key);
  if (previous.mode !== 'targeted') {
    return setFeatureFlag(
      key,
      { mode: 'off', orgIds: [] },
      operatorEmail,
      { ...audit, reason: audit.reason ?? 'org_disable_noop' }
    );
  }
  const orgIds = previous.orgIds.filter((id) => id !== orgId);
  const next = normalizeFeatureFlagValue(
    orgIds.length === 0 ? 'off' : 'targeted',
    orgIds
  );
  return setFeatureFlag(key, next, operatorEmail, audit);
}

/** Release a flag to everyone (global on). */
export async function releaseFeatureFlagToEveryone(
  key: FeatureFlagKey,
  operatorEmail: string,
  audit: Parameters<typeof setFeatureFlag>[3] = {}
) {
  return setFeatureFlag(
    key,
    { mode: 'everyone', orgIds: [] },
    operatorEmail,
    audit
  );
}

/** Whether a registered flag is on for the organization. */
export async function isFeatureFlagEnabledForOrganization(
  key: FeatureFlagKey,
  orgId: string
) {
  const { isFeatureFlagEnabled } = await import('./feature-flags.server');
  return isFeatureFlagEnabled(key, orgId);
}
