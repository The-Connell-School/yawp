import { FREE_TIER_FLAG } from '~/domain/feature-flags/feature-flags';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';

export type FreeTierInappProfile = {
  role: string;
  organization: { id: string; plan: string };
};

/** Presentation gate only; existing entitlement and onboarding enforcement is unchanged. */
export async function isFreeTierInappV2Enabled(
  profile: FreeTierInappProfile,
  freeTierRouteOpen?: boolean
): Promise<boolean> {
  if (
    profile.role !== 'TEACHER' ||
    profile.organization.plan !== 'FREE_CLASSROOM'
  )
    return false;
  if (freeTierRouteOpen === false) return false;
  return isFeatureFlagEnabled(FREE_TIER_FLAG, profile.organization.id);
}
