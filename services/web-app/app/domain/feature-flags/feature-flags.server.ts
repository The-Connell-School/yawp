import { prisma } from '~/utils/db.server';
import {
  LESSON_PLANNER_FLAG,
  FREE_TIER_FLAG,
  FEATURE_FLAGS,
  FEATURE_FLAG_KEYS,
  type FeatureFlagKey,
  type FeatureFlagMode,
  type FeatureFlagValue,
  type FeatureFlagValueInput,
  evaluateFeatureFlag,
  isFreeTierGloballyEnabled,
  featureFlagSettingName,
  normalizeFeatureFlagValue,
  parseFeatureFlagValue,
  sameFeatureFlagValue,
  serializeFeatureFlagValue,
} from './feature-flags';

export type FeatureFlagState = {
  key: FeatureFlagKey;
  label: string;
  description: string;
  mode: FeatureFlagMode;
  /** Schools the flag is on for; empty unless mode is "targeted". */
  orgIds: string[];
  /** On for everyone. Kept for readers that predate per-school targeting. */
  enabled: boolean;
  /** When the flag was last set, or null if it never has been (default off). */
  updatedAt: string | null;
  /** The operator who last set it, as recorded by the management API. */
  lastChangedBy: string | null;
};

const LAST_CHANGED_BY_PREFIX = 'Last changed by ';

function stateFor(
  key: FeatureFlagKey,
  row: { value: string; description: string | null; updatedAt: Date } | null
): FeatureFlagState {
  const description = row?.description ?? '';
  const { mode, orgIds } = parseFeatureFlagValue(row?.value);
  return {
    key,
    label: FEATURE_FLAGS[key].label,
    description: FEATURE_FLAGS[key].description,
    mode,
    orgIds,
    enabled: mode === 'everyone',
    updatedAt: row ? row.updatedAt.toISOString() : null,
    lastChangedBy: description.startsWith(LAST_CHANGED_BY_PREFIX)
      ? description.slice(LAST_CHANGED_BY_PREFIX.length)
      : null,
  };
}

/**
 * Whether a flag is on for a school (organization). One indexed read of its
 * Setting row, no cache, so a change takes effect on the next request in
 * every instance. A flag targeted at schools is off when no school is given.
 * Fails closed: if the row cannot be read the feature stays off, which is
 * how it was before it shipped.
 */
export async function isFeatureFlagEnabled(
  key: FeatureFlagKey,
  orgId?: string | null
): Promise<boolean> {
  try {
    const row = await prisma.setting.findUnique({
      where: { name: featureFlagSettingName(key) },
      select: { value: true },
    });
    return evaluateFeatureFlag(parseFeatureFlagValue(row?.value), orgId);
  } catch (error) {
    console.error('feature_flag_read_failed', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/** YAWP! Lesson Planner for teachers at the given school. */
export function isLessonPlannerEnabled(
  orgId: string | null | undefined
): Promise<boolean> {
  return isFeatureFlagEnabled(LESSON_PLANNER_FLAG, orgId);
}

/**
 * Whether Free Tier C is live. Only `everyone` counts as on; `targeted` is off
 * for anonymous `/free` routes because there is no school context.
 */
export async function isFreeTierEnabled(): Promise<boolean> {
  try {
    const row = await prisma.setting.findUnique({
      where: { name: featureFlagSettingName(FREE_TIER_FLAG) },
      select: { value: true },
    });
    return isFreeTierGloballyEnabled(parseFeatureFlagValue(row?.value));
  } catch (error) {
    console.error('feature_flag_read_failed', {
      key: FREE_TIER_FLAG,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/** Every registered flag with its current state. */
export async function listFeatureFlags(): Promise<FeatureFlagState[]> {
  const rows = await prisma.setting.findMany({
    where: { name: { in: FEATURE_FLAG_KEYS.map(featureFlagSettingName) } },
    select: { name: true, value: true, description: true, updatedAt: true },
  });
  const byName = new Map(rows.map((row) => [row.name, row]));
  return FEATURE_FLAG_KEYS.map((key) =>
    stateFor(key, byName.get(featureFlagSettingName(key)) ?? null)
  );
}

/** The given organization ids that do not exist, in one query. */
export async function findUnknownOrganizationIds(
  orgIds: readonly string[]
): Promise<string[]> {
  const unique = [...new Set(orgIds)];
  if (unique.length === 0) return [];
  const rows = await prisma.organization.findMany({
    where: { id: { in: unique } },
    select: { id: true },
  });
  const known = new Set(rows.map((row) => row.id));
  return unique.filter((id) => !known.has(id));
}

/**
 * Set a flag to off, everyone, or a list of schools. Upserts only the flag's
 * own Setting row; nothing a feature stored is touched either way. Callers
 * validate that targeted schools exist.
 */
export async function setFeatureFlag(
  key: FeatureFlagKey,
  next: FeatureFlagValueInput,
  operatorEmail: string
): Promise<{
  flag: FeatureFlagState;
  previous: FeatureFlagValue;
  changed: boolean;
}> {
  const name = featureFlagSettingName(key);
  const existing = await prisma.setting.findUnique({
    where: { name },
    select: { value: true },
  });
  const previous = parseFeatureFlagValue(existing?.value);
  const normalized = normalizeFeatureFlagValue(next.mode, next.orgIds);
  const value = serializeFeatureFlagValue(normalized);
  const description = `${LAST_CHANGED_BY_PREFIX}${operatorEmail}`;
  const row = await prisma.setting.upsert({
    where: { name },
    create: { name, value, valueType: 'json', description },
    update: { value, valueType: 'json', description, updatedAt: new Date() },
    select: { name: true, value: true, description: true, updatedAt: true },
  });
  return {
    flag: stateFor(key, row),
    previous,
    changed: !sameFeatureFlagValue(previous, normalized),
  };
}
