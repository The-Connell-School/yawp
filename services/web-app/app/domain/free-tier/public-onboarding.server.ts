import { isFreeTierEnabled } from '~/domain/feature-flags/feature-flags.server';
import { isBelowHsGrade } from './grade-gate';

/** Public signup/waitlist v2 UI and {@link RELEASE_EMAIL_V2_COPY_VERSION} at signup ride on `free-tier` only. */
export function isPublicOnboardingV2Enabled() {
  return isFreeTierEnabled();
}

export function isSupportedSignupGrade(grade: string) {
  return isBelowHsGrade(grade) || ['9', '10', '11', '12'].includes(grade);
}
