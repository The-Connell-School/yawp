import { prisma } from '~/utils/db.server';
import {
  featureFlagSettingName,
  parseFeatureFlagValue,
  UNIFIED_SIGN_ON_FLAG,
} from '~/domain/feature-flags/feature-flags';

/** Anonymous sign-on requires everyone mode. Preserve the management contract's
 * legacy booleans, but reject malformed optional organization lists as well. */
export async function isUnifiedSignOnEnabled(): Promise<boolean> {
  try {
    const row = await prisma.setting.findUnique({
      where: { name: featureFlagSettingName(UNIFIED_SIGN_ON_FLAG) },
      select: { value: true },
    });
    const raw = row?.value;
    if (!raw) return false;
    if (raw !== 'true' && raw !== 'false') {
      const value: unknown = JSON.parse(raw);
      if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
      const orgIds = (value as { orgIds?: unknown }).orgIds;
      if (
        orgIds !== undefined &&
        (!Array.isArray(orgIds) ||
          !orgIds.every((id) => typeof id === 'string'))
      )
        return false;
    }
    return parseFeatureFlagValue(raw).mode === 'everyone';
  } catch {
    return false;
  }
}
