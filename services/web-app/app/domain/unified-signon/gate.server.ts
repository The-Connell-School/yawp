import { prisma } from '~/utils/db.server';
import {
  featureFlagSettingName,
  parseFeatureFlagValue,
  UNIFIED_SIGN_ON_FLAG,
} from '~/domain/feature-flags/feature-flags';
import { isNonProductionDefaultOnDeployment } from '~/domain/feature-flags/feature-flags.server';

/** Anonymous /auth/login unified UI: primary row in everyone mode, or demo/preview default on. */
export async function isUnifiedSignOnEnabled(): Promise<boolean> {
  if (isNonProductionDefaultOnDeployment(process.env)) return true;
  try {
    const row = await prisma.setting.findUnique({
      where: { name: featureFlagSettingName(UNIFIED_SIGN_ON_FLAG) },
      select: { value: true },
    });
    return parseFeatureFlagValue(row?.value).mode === 'everyone';
  } catch {
    return false;
  }
}
