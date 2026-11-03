// PLAN item 15: with no Setting rows on production, every Lesson Planner and
// free-tier flag is off for every school. Locks in "dark by default".
import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { featureFlagPrismaTables } from './feature-flags.server.test-support';

const prisma = featureFlagPrismaTables();
mock.module('~/utils/db.server', () => ({ prisma }));

const {
  isFeatureFlagEnabled,
  isFreeTierCapabilityEnabled,
  isFreeTierEnabled,
  isLessonPlannerEnabled,
  getLessonPlannerReviewFlags,
} = await import('./feature-flags.server');
const { FEATURE_FLAG_KEYS, FREE_TIER_FLAG } = await import('./feature-flags');

const ORG_IDS = [null, undefined, 'org_any', 'cmsitj7uc000a01lc5k7sa3tu'];
const saved = {
  YAWP_ENVIRONMENT: process.env.YAWP_ENVIRONMENT,
  PREVIEW_SLUG: process.env.PREVIEW_SLUG,
};

const lpKeys = FEATURE_FLAG_KEYS.filter((k) => k.startsWith('lesson_planner'));

describe('production is dark by default (no Setting rows)', () => {
  beforeEach(() => {
    mock.module('~/utils/db.server', () => ({ prisma }));
    process.env.YAWP_ENVIRONMENT = 'production';
    delete process.env.PREVIEW_SLUG;
    prisma.setting.findUnique.mockReset().mockResolvedValue(null);
    prisma.setting.findMany.mockReset().mockResolvedValue([]);
  });
  afterAll(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  test('there are 14 lesson_planner* flags registered', () => {
    expect(lpKeys.length).toBe(14);
  });

  test('every lesson_planner* flag is off for every org', async () => {
    for (const key of lpKeys) {
      for (const orgId of ORG_IDS) {
        expect({ key, orgId, on: await isFeatureFlagEnabled(key, orgId) }).toEqual({ key, orgId, on: false });
      }
    }
  });

  test('free tier is off globally and per org', async () => {
    expect(await isFreeTierEnabled()).toBe(false);
    for (const orgId of ORG_IDS) {
      expect(await isFreeTierCapabilityEnabled(orgId)).toBe(false);
      expect(await isFeatureFlagEnabled(FREE_TIER_FLAG, orgId)).toBe(false);
    }
  });

  test('Lesson Planner gate and every review flag are off', async () => {
    for (const orgId of ORG_IDS) {
      expect(await isLessonPlannerEnabled(orgId)).toBe(false);
      const review = await getLessonPlannerReviewFlags(orgId);
      expect(Object.values(review).every((v) => v === false)).toBe(true);
    }
  });
});
