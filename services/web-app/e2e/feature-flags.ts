import type { FeatureFlagKey } from '../app/domain/feature-flags/feature-flags';
import {
  featureFlagSettingName,
  serializeFeatureFlagValue,
  type FeatureFlagValueInput,
} from '../app/domain/feature-flags/feature-flags';
import {
  LESSON_PLANNER_REVIEW_FLAG_KEYS,
  type LessonPlannerReviewFlagKey,
} from '../app/domain/feature-flags/lesson-planner-review-flags';
import { createE2EPrismaClient } from './prisma-client';

export async function enableAllLessonPlannerReviewFlags() {
  await setLessonPlannerFlag(true);
  for (const flag of LESSON_PLANNER_REVIEW_FLAG_KEYS) {
    await setLessonPlannerReviewFlag(flag, true);
  }
}

const LESSON_PLANNER_SETTING = 'feature_flag.lesson_planner';
const FREE_TIER_SETTING = 'feature_flag.free_tier';
const FOLDED_FREE_TIER_SETTINGS = [
  'feature_flag.free-tier-onboarding-v2',
  'feature_flag.free-tier-inapp-v2',
] as const;

const FREE_TIER_ONBOARDING_V2_SETTING = 'feature_flag.free-tier-onboarding-v2';

export async function setFreeTierOnboardingV2(enabled: boolean) {
  const prisma = createE2EPrismaClient();
  try {
    const value = enabled ? 'true' : 'false';
    await prisma.setting.upsert({
      where: { name: FREE_TIER_ONBOARDING_V2_SETTING },
      create: {
        name: FREE_TIER_ONBOARDING_V2_SETTING,
        value,
        valueType: 'boolean',
        description: 'Set by e2e',
      },
      update: { value, updatedAt: new Date() },
    });
  } finally {
    await prisma.$disconnect();
  }
}

export async function setFreeTierFlag(enabled: boolean) {
  const prisma = createE2EPrismaClient();
  try {
    const value = serializeFeatureFlagValue({
      mode: enabled ? 'everyone' : 'off',
      orgIds: [],
    });
    for (const name of [FREE_TIER_SETTING, ...FOLDED_FREE_TIER_SETTINGS]) {
      await prisma.setting.upsert({
        where: { name },
        create: {
          name,
          value,
          valueType: 'json',
          description: 'Set by e2e',
        },
        update: { value, updatedAt: new Date() },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

export async function setLessonPlannerFlag(enabled: boolean) {
  const prisma = createE2EPrismaClient();
  try {
    const value = serializeFeatureFlagValue({
      mode: enabled ? 'everyone' : 'off',
      orgIds: [],
    });
    await prisma.setting.upsert({
      where: { name: LESSON_PLANNER_SETTING },
      create: {
        name: LESSON_PLANNER_SETTING,
        value,
        valueType: 'json',
        description: 'Set by e2e',
      },
      update: { value, valueType: 'json', updatedAt: new Date() },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/** Local test toggle for registered feature flags. */
export async function setFeatureFlag(
  key: FeatureFlagKey,
  enabled: boolean | FeatureFlagValueInput
) {
  const prisma = createE2EPrismaClient();
  try {
    const name = featureFlagSettingName(key);
    const value =
      typeof enabled === 'boolean'
        ? String(enabled)
        : serializeFeatureFlagValue(enabled);
    await prisma.setting.upsert({
      where: { name },
      create: {
        name,
        value,
        valueType: 'boolean',
        description: 'Set by e2e',
      },
      update: { value, updatedAt: new Date() },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/** @deprecated Review slices collapse into `lesson_planner` in production; e2e can still set legacy rows. */
export type LessonPlannerReviewFlag = LessonPlannerReviewFlagKey;

/** Clears legacy slice rows so honor-mode e2e starts from flags off. */
export async function clearLessonPlannerReviewFlags() {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.setting.deleteMany({
      where: {
        name: {
          in: LESSON_PLANNER_REVIEW_FLAG_KEYS.map(
            (key) => `feature_flag.${key}`
          ),
        },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

export async function setLessonPlannerReviewFlag(
  flag: LessonPlannerReviewFlag,
  enabled: boolean
) {
  await setLessonPlannerFlag(true);
  const prisma = createE2EPrismaClient();
  try {
    const name = `feature_flag.${flag}`;
    const value = String(enabled);
    await prisma.setting.upsert({
      where: { name },
      create: {
        name,
        value,
        valueType: 'boolean',
        description: 'Set by e2e',
      },
      update: { value, updatedAt: new Date() },
    });
  } finally {
    await prisma.$disconnect();
  }
}
