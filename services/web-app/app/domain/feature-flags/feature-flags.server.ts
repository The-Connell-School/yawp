import { prisma } from '~/utils/db.server';
import {
  DAILY_PAGES_WRITING_CONDITIONS_FLAG,
  FEATURE_FLAGS,
  FEATURE_FLAG_KEYS,
  type FeatureFlagKey,
  featureFlagSettingName,
  parseFeatureFlagValue,
} from './feature-flags';

export type FeatureFlagState = {
  key: FeatureFlagKey;
  label: string;
  description: string;
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
  return {
    key,
    label: FEATURE_FLAGS[key].label,
    description: FEATURE_FLAGS[key].description,
    enabled: parseFeatureFlagValue(row?.value),
    updatedAt: row ? row.updatedAt.toISOString() : null,
    lastChangedBy: description.startsWith(LAST_CHANGED_BY_PREFIX)
      ? description.slice(LAST_CHANGED_BY_PREFIX.length)
      : null,
  };
}

/**
 * Whether a flag is on. One indexed read of its Setting row, no cache, so a
 * toggle takes effect on the next request in every instance. Fails closed: if
 * the row cannot be read the feature stays off, which is how it was before it
 * shipped.
 */
export async function isFeatureFlagEnabled(key: FeatureFlagKey): Promise<boolean> {
  try {
    const row = await prisma.setting.findUnique({
      where: { name: featureFlagSettingName(key) },
      select: { value: true },
    });
    return parseFeatureFlagValue(row?.value);
  } catch (error) {
    console.error('feature_flag_read_failed', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/** Paragraph type and writing time on Daily Pages (and every assignment form). */
export function isDailyPagesWritingConditionsEnabled(): Promise<boolean> {
  return isFeatureFlagEnabled(DAILY_PAGES_WRITING_CONDITIONS_FLAG);
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

/**
 * Turn a flag on or off. Upserts only the flag's own Setting row; nothing a
 * feature stored is touched either way.
 */
export async function setFeatureFlag(
  key: FeatureFlagKey,
  enabled: boolean,
  operatorEmail: string
): Promise<{ flag: FeatureFlagState; previousEnabled: boolean; changed: boolean }> {
  const name = featureFlagSettingName(key);
  const previous = await prisma.setting.findUnique({
    where: { name },
    select: { value: true },
  });
  const previousEnabled = parseFeatureFlagValue(previous?.value);
  const value = enabled ? 'true' : 'false';
  const description = `${LAST_CHANGED_BY_PREFIX}${operatorEmail}`;
  const row = await prisma.setting.upsert({
    where: { name },
    create: { name, value, valueType: 'boolean', description },
    update: { value, description, updatedAt: new Date() },
    select: { name: true, value: true, description: true, updatedAt: true },
  });
  return {
    flag: stateFor(key, row),
    previousEnabled,
    changed: previousEnabled !== enabled,
  };
}
