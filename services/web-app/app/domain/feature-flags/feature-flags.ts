/**
 * Global on/off switches for features that are built and merged but not yet
 * released. One switch for every school, stored as a `Setting` row so it can
 * be flipped from the internal app (through the management API) without a
 * deploy.
 *
 * Every flag defaults OFF: no row, or any value other than exactly "true",
 * reads as off. Turning a flag off never deletes or rewrites data a feature
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

/** Off unless the stored value is exactly "true". */
export function parseFeatureFlagValue(value: string | null | undefined): boolean {
  return value === 'true';
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
