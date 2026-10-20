import type { FeatureFlagKey } from '../app/domain/feature-flags/feature-flags';
import {
  featureFlagSettingName,
  serializeFeatureFlagValue,
  type FeatureFlagValueInput,
} from '../app/domain/feature-flags/feature-flags';
import { createE2EPrismaClient } from './prisma-client';

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
