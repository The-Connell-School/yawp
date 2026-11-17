/** Exact copy when a free teacher taps locked How to Teach It materials. */
export const SITE_LICENSE_HOW_TO_TEACH_LOCK_MESSAGE =
  'Comes with a school site license.' as const;

const LOCKED_COURSE_ASSET_PREFIX = '/courses/thesis-driven-essay/';

export function isSiteLicenseLockedCourseAssetPath(pathname: string) {
  return pathname === '/courses/thesis-driven-essay' ||
    pathname.startsWith(LOCKED_COURSE_ASSET_PREFIX);
}