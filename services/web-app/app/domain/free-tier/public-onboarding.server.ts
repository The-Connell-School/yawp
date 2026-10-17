import { FREE_TIER_ONBOARDING_V2_FLAG } from '~/domain/feature-flags/feature-flags';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';
import { isBelowHsGrade } from './grade-gate';

/** Public traffic has no organization context: only everyone enables v2. */
export function isPublicOnboardingV2Enabled() {
  return isFeatureFlagEnabled(FREE_TIER_ONBOARDING_V2_FLAG);
}

export function isSupportedSignupGrade(grade: string) {
  return isBelowHsGrade(grade) || ['9', '10', '11', '12'].includes(grade);
}
