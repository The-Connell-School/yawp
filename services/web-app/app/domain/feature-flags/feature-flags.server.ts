import { prisma } from '~/utils/db.server';
import {
  FREE_TIER_FLAG,
  LESSON_PLANNER_FLAG,
  UNIFIED_SIGN_ON_FLAG,
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
  /** Existing response mode, retained for backward compatibility. */
  mode: FeatureFlagMode;
  /** Parsed Setting value, before any deployment override. */
  persisted: FeatureFlagValue;
  /** Rollout used by the route gate; targeted still blocks anonymous entry. */
  effective: FeatureFlagValue;
  runtimeOverride: 'non_production_default' | null;
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
const EVERYONE: FeatureFlagValue = { mode: 'everyone', orgIds: [] };

export function isDemoDeployment(env: Record<string, string | undefined>) {
  return (
    env.PREVIEW_SLUG?.trim().toLowerCase() === 'demo' ||
    env.YAWP_ENVIRONMENT?.trim().toLowerCase() === 'demo'
  );
}

export function isPreviewDeployment(env: Record<string, string | undefined>) {
  return env.YAWP_ENVIRONMENT?.trim().toLowerCase() === 'preview';
}

/**
 * Demo and PR previews ship with free tier and unified sign-on on without Internal
 * changes. This replaces a separate demo-only route gate (`isDemoFreeTierRouteOpen`);
 * Internal may have surfaced that as a synthetic `demo_free_tier` override — runtime
 * and the management API use `free-tier` persisted/effective only.
 */
export function isNonProductionDefaultOnDeployment(
  env: Record<string, string | undefined>
) {
  return isDemoDeployment(env) || isPreviewDeployment(env);
}

function runtimeDefaultOn(key: FeatureFlagKey, env: Record<string, string | undefined>) {
  if (!isNonProductionDefaultOnDeployment(env)) return false;
  return key === FREE_TIER_FLAG || key === UNIFIED_SIGN_ON_FLAG;
}

async function readSettingValue(name: string): Promise<string | null | undefined> {
  const row = await prisma.setting.findUnique({
    where: { name },
    select: { value: true },
  });
  return row?.value;
}

type SettingReader = {
  setting: {
    findMany: (args: {
      where: { name: { in: string[] } };
      select: { name?: true; value: true };
    }) => Promise<Array<{ name?: string; value: string }>>;
  };
};

async function readParsedValues(
  names: readonly string[],
  client: SettingReader = prisma
) {
  if (names.length === 0) return [] as FeatureFlagValue[];
  if (typeof client.setting.findMany === 'function') {
    const rows = await client.setting.findMany({
      where: { name: { in: [...names] } },
      select: { name: true, value: true },
    });
    const byName = new Map(rows.map((row) => [row.name!, row.value]));
    return names.map((name) => parseFeatureFlagValue(byName.get(name)));
  }
  const findUnique = (
    client.setting as {
      findUnique?: (args: {
        where: { name: string };
        select: { value: true };
      }) => Promise<{ value: string } | null>;
    }
  ).findUnique;
  if (!findUnique) return names.map(() => parseFeatureFlagValue(undefined));
  return Promise.all(
    names.map(async (name) =>
      parseFeatureFlagValue(
        (await findUnique({ where: { name }, select: { value: true } }))?.value
      )
    )
  );
}

async function readPrimaryFlagValue(
  key: typeof FREE_TIER_FLAG | typeof UNIFIED_SIGN_ON_FLAG,
  client: SettingReader = prisma
): Promise<FeatureFlagValue> {
  const [value] = await readParsedValues([featureFlagSettingName(key)], client);
  return value ?? { mode: 'off', orgIds: [] };
}

/** Primary `feature_flag.free_tier` rollout (demo/preview default on). */
export async function resolvedFreeTierRollout(
  client: SettingReader = prisma
): Promise<FeatureFlagValue> {
  if (isNonProductionDefaultOnDeployment(process.env)) return EVERYONE;
  return readPrimaryFlagValue(FREE_TIER_FLAG, client);
}

function stateFor(
  key: FeatureFlagKey,
  row: { value: string; description: string | null; updatedAt: Date } | null
): FeatureFlagState {
  const description = row?.description ?? '';
  const { mode, orgIds } = parseFeatureFlagValue(row?.value);
  const persisted = { mode, orgIds };
  const defaultOn = runtimeDefaultOn(key, process.env);
  return {
    key,
    label: FEATURE_FLAGS[key].label,
    description: FEATURE_FLAGS[key].description,
    mode,
    orgIds,
    persisted,
    effective: defaultOn ? EVERYONE : persisted,
    runtimeOverride: defaultOn ? 'non_production_default' : null,
    enabled: mode === 'everyone',
    updatedAt: row ? row.updatedAt.toISOString() : null,
    lastChangedBy: description.startsWith(LAST_CHANGED_BY_PREFIX)
      ? description.slice(LAST_CHANGED_BY_PREFIX.length)
      : null,
  };
}

function applyRuntimeOverrides(state: FeatureFlagState): FeatureFlagState {
  if (!runtimeDefaultOn(state.key, process.env)) return state;
  return { ...state, mode: 'everyone', orgIds: [], enabled: true };
}

/** Whether free tier is on for a school from `feature_flag.free_tier` only. */
export async function isFreeTierCapabilityEnabled(
  orgId?: string | null,
  client: SettingReader = prisma
): Promise<boolean> {
  if (isNonProductionDefaultOnDeployment(process.env)) return true;
  try {
    const primary = await readPrimaryFlagValue(FREE_TIER_FLAG, client);
    if (isFreeTierGloballyEnabled(primary)) return true;
    return evaluateFeatureFlag(primary, orgId);
  } catch (error) {
    console.error('feature_flag_read_failed', {
      key: FREE_TIER_FLAG,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
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
  if (key === FREE_TIER_FLAG) return isFreeTierCapabilityEnabled(orgId);
  if (key === UNIFIED_SIGN_ON_FLAG) {
    if (isNonProductionDefaultOnDeployment(process.env)) return true;
    try {
      const primary = await readPrimaryFlagValue(UNIFIED_SIGN_ON_FLAG);
      if (primary.mode === 'everyone') return true;
      return evaluateFeatureFlag(primary, orgId);
    } catch (error) {
      console.error('feature_flag_read_failed', {
        key: UNIFIED_SIGN_ON_FLAG,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
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

/** Yawp! Lesson Planner for teachers at the given school. */
export function isLessonPlannerEnabled(
  orgId: string | null | undefined
): Promise<boolean> {
  return isFeatureFlagEnabled(LESSON_PLANNER_FLAG, orgId);
}

/**
 * Whether Free Tier is live for public/anonymous routes. Only `everyone`
 * counts as on; `targeted` is off for anonymous `/free` routes because there
 * is no school context. Demo and PR previews default on.
 */
export async function isFreeTierEnabled(
  { throwOnError = false }: { throwOnError?: boolean } = {}
): Promise<boolean> {
  if (isNonProductionDefaultOnDeployment(process.env)) return true;
  try {
    const row = await prisma.setting.findUnique({
      where: { name: featureFlagSettingName(FREE_TIER_FLAG) },
      select: { value: true },
    });
    return isFreeTierGloballyEnabled(parseFeatureFlagValue(row?.value));
  } catch (error) {
    // Personalized status checks must distinguish a failed read from flag off.
    if (throwOnError) throw error;
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
    applyRuntimeOverrides(stateFor(key, byName.get(featureFlagSettingName(key)) ?? null))
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

