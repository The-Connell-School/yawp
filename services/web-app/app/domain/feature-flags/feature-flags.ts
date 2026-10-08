/**
 * Switches for features that are built and merged but not yet released.
 * Each flag is off, on for everyone, or on for a list of schools
 * (organizations), stored as a `Setting` row so it can be changed from the
 * internal app (through the management API) without a deploy.
 *
 * Every flag defaults OFF: no row, or any value that does not parse, reads as
 * off. The legacy values "true" and "false" still read as everyone and off. Turning a flag off never deletes or rewrites data a feature
 * stored while it was on; readers simply stop reading it, so turning the flag
 * back on restores it.
 *
 * YAWP does not use feature flags as a rule. A flag here is a deliberate,
 * temporary exception and should be removed once its feature ships for good.
 */

/**
 * The Daily Pages "Paragraph type" and "Time students have to write" settings
 * (PR #382 and PR #355). Off: the assignment form hides both, the server
 * ignores both, and the tutor, grading assistant, grammar checker and class
 * summary read every assignment as if neither were set.
 */
export const DAILY_PAGES_WRITING_CONDITIONS_FLAG =
  'daily_pages_paragraph_type_and_writing_time' as const;

/**
 * YAWP! Lesson Planner (#374). Off: nav and deep links are hidden and every
 * planner route/API returns 404. Existing lesson data is kept.
 */
export const LESSON_PLANNER_FLAG = 'lesson_planner' as const;

export const FEATURE_FLAGS = {
  [DAILY_PAGES_WRITING_CONDITIONS_FLAG]: {
    label: 'Daily Pages: paragraph type and writing time',
    description:
      'Shows "Paragraph type" and "Time students have to write" on the assignment form, and lets the tutor, grading assistant, grammar checker and class summary use them. Off: both are hidden and ignored; values already saved are kept and come back when it is turned on.',
  },
  [LESSON_PLANNER_FLAG]: {
    label: 'Lesson Planner',
    description:
      'Shows the Lesson Planner in the teacher nav and allows planner pages, exports, and AI generation. Off: entry points are hidden and direct URLs are blocked; saved lessons are not deleted.',
  },
} as const satisfies Record<string, { label: string; description: string }>;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

export const FEATURE_FLAG_KEYS = Object.keys(FEATURE_FLAGS) as FeatureFlagKey[];

export function isFeatureFlagKey(value: unknown): value is FeatureFlagKey {
  return (
    typeof value === 'string' &&
    (FEATURE_FLAG_KEYS as readonly string[]).includes(value)
  );
}

export function featureFlagSettingName(key: FeatureFlagKey): string {
  return `feature_flag.${key}`;
}

export const FEATURE_FLAG_MODES = ['off', 'everyone', 'targeted'] as const;
export type FeatureFlagMode = (typeof FEATURE_FLAG_MODES)[number];

/** Most schools one flag can be targeted at. */
export const MAX_FEATURE_FLAG_ORG_IDS = 2000;

/**
 * A flag's stored value. `orgIds` only means something for `targeted` and is
 * always empty otherwise.
 */
export type FeatureFlagValue = { mode: FeatureFlagMode; orgIds: string[] };
export type FeatureFlagValueInput = {
  readonly mode: FeatureFlagMode;
  readonly orgIds: readonly string[];
};

const OFF: FeatureFlagValue = { mode: 'off', orgIds: [] };

function isFeatureFlagMode(value: unknown): value is FeatureFlagMode {
  return (
    typeof value === 'string' &&
    (FEATURE_FLAG_MODES as readonly string[]).includes(value)
  );
}

/**
 * The value to store: schools are kept only for `targeted`, deduplicated
 * (first occurrence wins) and capped.
 */
export function normalizeFeatureFlagValue(
  mode: FeatureFlagMode,
  orgIds: readonly string[] = []
): FeatureFlagValue {
  if (mode !== 'targeted') return { mode, orgIds: [] };
  return {
    mode,
    orgIds: [...new Set(orgIds)].slice(0, MAX_FEATURE_FLAG_ORG_IDS),
  };
}

/**
 * Read a stored value. JSON `{"mode","orgIds"}`, or the legacy "true"
 * (everyone) / "false" (off). Anything else is off.
 */
export function parseFeatureFlagValue(
  value: string | null | undefined
): FeatureFlagValue {
  if (value === 'true') return { mode: 'everyone', orgIds: [] };
  if (!value || value === 'false') return { ...OFF };
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { ...OFF };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ...OFF };
  }
  const { mode, orgIds } = parsed as { mode?: unknown; orgIds?: unknown };
  if (!isFeatureFlagMode(mode)) return { ...OFF };
  if (mode !== 'targeted') return { mode, orgIds: [] };
  if (
    !Array.isArray(orgIds) ||
    !orgIds.every((id): id is string => typeof id === 'string')
  ) {
    return { ...OFF };
  }
  return normalizeFeatureFlagValue(mode, orgIds.filter(Boolean));
}

export function serializeFeatureFlagValue(value: FeatureFlagValueInput): string {
  const { mode, orgIds } = normalizeFeatureFlagValue(value.mode, value.orgIds);
  return JSON.stringify({ mode, orgIds });
}

/**
 * Whether a flag is on for a school. Everyone: always. Targeted: only for a
 * listed school, never without one. Off: never.
 */
export function evaluateFeatureFlag(
  value: FeatureFlagValueInput,
  orgId?: string | null
): boolean {
  if (value.mode === 'everyone') return true;
  if (value.mode === 'targeted') return !!orgId && value.orgIds.includes(orgId);
  return false;
}

/** Same mode and the same set of schools, in any order. */
export function sameFeatureFlagValue(
  a: FeatureFlagValueInput,
  b: FeatureFlagValueInput
): boolean {
  if (a.mode !== b.mode) return false;
  const left = new Set(a.orgIds);
  const right = new Set(b.orgIds);
  return left.size === right.size && [...left].every((id) => right.has(id));
}

/**
 * An assignment's paragraph type and writing time as the AI features may read
 * them. With the flag off both read as null (exactly how an assignment
 * created before either setting existed reads), while the stored record is left
 * untouched.
 */
export function readableWritingConditions<
  T extends {
    paragraphMode?: string | null;
    writingTimeMinutes?: number | null;
  },
>(assignment: T, enabled: boolean): T;
export function readableWritingConditions<
  T extends {
    paragraphMode?: string | null;
    writingTimeMinutes?: number | null;
  },
>(assignment: T | null | undefined, enabled: boolean): T | null | undefined;
export function readableWritingConditions<
  T extends {
    paragraphMode?: string | null;
    writingTimeMinutes?: number | null;
  },
>(assignment: T | null | undefined, enabled: boolean): T | null | undefined {
  if (!assignment || enabled) return assignment;
  return { ...assignment, paragraphMode: null, writingTimeMinutes: null };
}
