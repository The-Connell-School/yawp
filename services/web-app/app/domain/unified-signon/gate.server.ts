import { prisma } from '~/utils/db.server';
import {
  FOLDED_UNIFIED_SIGNON_LEGACY_SETTINGS,
  featureFlagSettingName,
  parseFeatureFlagValue,
  UNIFIED_SIGN_ON_FLAG,
} from '~/domain/feature-flags/feature-flags';
import { isNonProductionDefaultOnDeployment } from '~/domain/feature-flags/feature-flags.server';

/** Anonymous sign-on requires everyone mode. Preserve the management contract's
 * legacy booleans, but reject malformed optional organization lists as well. */
export async function isUnifiedSignOnEnabled(): Promise<boolean> {
  if (isNonProductionDefaultOnDeployment(process.env)) return true;
  try {
    const names = [
      featureFlagSettingName(UNIFIED_SIGN_ON_FLAG),
      ...FOLDED_UNIFIED_SIGNON_LEGACY_SETTINGS,
    ];
    const rows = await prisma.setting.findMany({
      where: { name: { in: names } },
      select: { value: true },
    });
    for (const row of rows) {
      const raw = row.value;
      if (!raw) continue;
      if (raw !== 'true' && raw !== 'false') {
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== 'object' || Array.isArray(value))
          continue;
        const orgIds = (value as { orgIds?: unknown }).orgIds;
        if (
          orgIds !== undefined &&
          (!Array.isArray(orgIds) ||
            !orgIds.every((id) => typeof id === 'string'))
        )
          continue;
      }
      if (parseFeatureFlagValue(raw).mode === 'everyone') return true;
    }
    return false;
  } catch {
    return false;
  }
}
