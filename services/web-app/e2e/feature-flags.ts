import type { FeatureFlagKey } from '../app/domain/feature-flags/feature-flags';
import { createE2EPrismaClient } from './prisma-client';

// Mirrors featureFlagSettingName(LESSON_PLANNER_FLAG) in
// app/domain/feature-flags/feature-flags.ts. Specs that exercise the planner
// turn it on for themselves and back off afterwards. Playwright runs with one
// worker, so a spec's setting cannot leak into another running at the same time.
const LESSON_PLANNER_SETTING = 'feature_flag.lesson_planner';
const FREE_TIER_SETTING = 'feature_flag.free_tier';

export async function setFreeTierFlag(enabled: boolean) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.setting.upsert({
      where: { name: FREE_TIER_SETTING },
      create: {
        name: FREE_TIER_SETTING,
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

// Mirrors featureFlagSettingName(ASSIGNMENT_SUMMARY_MODELS_FLAG).
const ASSIGNMENT_SUMMARY_MODELS_SETTING = 'feature_flag.assignment_summary_models';

export async function setAssignmentSummaryModelsFlag(enabled: boolean) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.setting.upsert({
      where: { name: ASSIGNMENT_SUMMARY_MODELS_SETTING },
      create: {
        name: ASSIGNMENT_SUMMARY_MODELS_SETTING,
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
export async function setFeatureFlag(key: FeatureFlagKey, enabled: boolean) {
  const prisma = createE2EPrismaClient();
  try {
    const name = `feature_flag.${key}`;
    await prisma.setting.upsert({
      where: { name },
      create: {
        name,
        value: String(enabled),
        valueType: 'boolean',
        description: 'Set by e2e',
      },
      update: { value: String(enabled), updatedAt: new Date() },
    });
  } finally {
    await prisma.$disconnect();
  }
}
