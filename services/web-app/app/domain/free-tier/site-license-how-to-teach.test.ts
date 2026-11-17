import { describe, expect, test } from 'bun:test';
import {
  isSiteLicenseLockedCourseAssetPath,
  SITE_LICENSE_HOW_TO_TEACH_LOCK_MESSAGE,
} from './site-license-how-to-teach';

describe('site-license how-to-teach helpers', () => {
  test('pins the license message copy', () => {
    expect(SITE_LICENSE_HOW_TO_TEACH_LOCK_MESSAGE).toBe(
      'Comes with a school site license.'
    );
  });

  test('recognizes thesis-driven-essay course assets', () => {
    expect(isSiteLicenseLockedCourseAssetPath('/courses/thesis-driven-essay/01.pdf')).toBe(true);
    expect(isSiteLicenseLockedCourseAssetPath('/courses/other/page.pdf')).toBe(false);
  });
});