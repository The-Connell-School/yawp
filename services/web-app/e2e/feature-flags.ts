import type { FeatureFlagKey } from '../app/domain/feature-flags/feature-flags';
import {
  featureFlagSettingName,
  serializeFeatureFlagValue,
  type FeatureFlagValueInput,
} from '../app/domain/feature-flags/feature-flags';
import { createE2EPrismaClient } from './prisma-client';

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
    const value = enabled ? 'true' : 'false';
    for (const name of [FREE_TIER_SETTING, ...FOLDED_FREE_TIER_SETTINGS]) {
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
    }
  } finally {
    await prisma.$disconnect();
  }
}

export async function setLessonPlannerFlag(enabled: boolean) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.setting.upsert({
      where: { name: LESSON_PLANNER_SETTING },
      create: {
        name: LESSON_PLANNER_SETTING,
        value: enabled ? 'true' : 'false',
        valueType: 'boolean',
        description: 'Set by e2e',
      },
      update: { value: enabled ? 'true' : 'false', updatedAt: new Date() },
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

/** Lesson Planner review flags (intake v2, stack v2, deck v2, run 2). */
export type LessonPlannerReviewFlag = Extract<
  FeatureFlagKey,
  | 'lesson_planner_intake_v2'
  | 'lesson_planner_stack_v2'
  | 'lesson_planner_deck_v2'
  | 'lesson_planner_stack_panel'
  | 'lesson_planner_plan_export_v2'
  | 'lesson_planner_stack_v3'
  | 'lesson_planner_share'
  | 'lesson_planner_run_show'
  | 'lesson_planner_templates'
  | 'lesson_planner_deck_gallery'
>;

export async function setLessonPlannerReviewFlag(
  flag: LessonPlannerReviewFlag,
  enabled: boolean
) {
  await setFeatureFlag(flag, enabled);
}
