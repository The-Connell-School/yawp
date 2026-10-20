import { isFreeTierEnabled } from '~/domain/feature-flags/feature-flags.server';
import { isBelowHsGrade } from './grade-gate';

/** Public traffic has no organization context: only global free tier enables v2 flows. */
export function isPublicOnboardingV2Enabled() {
  return isFreeTierEnabled();
}

export function isSupportedSignupGrade(grade: string) {
  return isBelowHsGrade(grade) || ['9', '10', '11', '12'].includes(grade);
}
