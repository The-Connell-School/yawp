import { FREE_TIER_INAPP_V2_FLAG } from '~/domain/feature-flags/feature-flags';
import {
  isFeatureFlagEnabled,
  isFreeTierEnabled,
} from '~/domain/feature-flags/feature-flags.server';
import { isDemoFreeTierRouteOpen } from '~/utils/free-tier/free-tier-feature-gate.server';

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
  const freeTierAvailable =
    freeTierRouteOpen ??
    (isDemoFreeTierRouteOpen(process.env) || (await isFreeTierEnabled()));
  return (
    freeTierAvailable &&
    (await isFeatureFlagEnabled(
      FREE_TIER_INAPP_V2_FLAG,
      profile.organization.id
    ))
  );
}
