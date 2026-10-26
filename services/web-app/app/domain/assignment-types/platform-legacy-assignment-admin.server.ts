import {
  PLATFORM_LEGACY_ASSIGNMENT_ADMIN_FLAG,
} from '~/domain/feature-flags/feature-flags';
import {
  isFeatureFlagEnabled,
  isNonProductionDefaultOnDeployment,
} from '~/domain/feature-flags/feature-flags.server';
import { requireAdmin } from '~/utils/auth.server';

/** Demo-first (PKG-14 A16): on for demo and PR previews; production requires the flag. */
export async function isPlatformLegacyAssignmentAdminEnabled(): Promise<boolean> {
  if (isNonProductionDefaultOnDeployment(process.env)) return true;
  return isFeatureFlagEnabled(PLATFORM_LEGACY_ASSIGNMENT_ADMIN_FLAG, null);
}

export async function requirePlatformLegacyAssignmentAdmin(request: Request) {
  await requireAdmin(request);
  if (!(await isPlatformLegacyAssignmentAdminEnabled())) {
    throw new Response('Not Found', { status: 404 });
  }
}

export { PLATFORM_LEGACY_ASSIGNMENT_ADMIN_FLAG };
