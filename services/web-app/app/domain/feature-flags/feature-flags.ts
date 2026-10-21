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
 * Yawp! Lesson Planner (#374). Off: nav and deep links are hidden and every
 * planner route/API returns 404. Existing lesson data is kept.
 */
export const LESSON_PLANNER_FLAG = 'lesson_planner' as const;

/**
 * Rubrics managed in Yawp Internal instead of the code-seeded/static content.
 * On: a new assignment pins to the rubric version Yawp Internal released for
 * its rubric (`RubricRelease`, written by the rubric catalog `stage`
 * endpoint), when there is one. Off: it pins to the rubric's current version
 * as before. Existing assignments always keep the version they were created
 * with.
 */
export const INTERNAL_RUBRICS_FLAG = 'internal_rubrics' as const;

/**
 * Free Tier (signup, admin approval, onboarding, create-class, timeline,
 * locked preview, in-app limits/reports, QR/event landing, and related APIs).
 * Stored under the legacy Setting name `feature_flag.free_tier`.
 */
export const FREE_TIER_FLAG = 'free-tier' as const;

/**
 * Lesson Planner intake v2 (Brian's review, plan A): the ask card asks which
 * classes from the teacher's real class list, a length per class with no
 * pre-filled default, then how to fill the time. Off: the original
 * minutes-slider intake.
 */
export const LESSON_PLANNER_INTAKE_V2_FLAG = 'lesson_planner_intake_v2' as const;

/**
 * Lesson Planner stack v2 (plan B): whole-reply "Add the whole lesson" only on
 * plans, no "Add all as a handout" in the chat, remove from the stack screen,
 * and build outputs from the stack. Off: the original stack controls.
 */
export const LESSON_PLANNER_STACK_V2_FLAG = 'lesson_planner_stack_v2' as const;

/**
 * Lesson Planner deck v2 (plan E): the Yawp! tile template for PowerPoint and
 * Present, and the deck editor. Off: the original deck look, no editor.
 */
export const LESSON_PLANNER_DECK_V2_FLAG = 'lesson_planner_deck_v2' as const;

/**
 * Lesson Planner stack panel (Brian's run 2, A7): the stack shows beside the
 * chat as it takes shape, with remove and reorder right there. Needs stack
 * v2. Off: the "Open the stack" bar only.
 */
export const LESSON_PLANNER_STACK_PANEL_FLAG = 'lesson_planner_stack_panel' as const;

/**
 * Lesson Planner plan export v2 (Brian's run 2, D1, D2): the lesson plan
 * downloads as a concise plan (overview, goals, materials, numbered steps
 * with what each is for) in Word and PDF. Off: the full packet PDF only.
 */
export const LESSON_PLANNER_PLAN_EXPORT_V2_FLAG = 'lesson_planner_plan_export_v2' as const;

/**
 * Lesson Planner stack page redesign (Brian's run 3, Kevin's redesign): the
 * stack page as the run of show — time bar, one-tap fixes, writing meter,
 * Add a piece panel, finish line, take it to class. Needs stack v2. Off: the
 * stack v2 page.
 */
export const LESSON_PLANNER_STACK_V3_FLAG = 'lesson_planner_stack_v3' as const;

/** Post to your class and Send this lesson (run 3). Needs stack v3. */
export const LESSON_PLANNER_SHARE_FLAG = 'lesson_planner_share' as const;

/** Run the show: the teacher's view during class (run 3). Needs stack v3. */
export const LESSON_PLANNER_RUN_SHOW_FLAG = 'lesson_planner_run_show' as const;

/** Lesson templates: save a stack's shape, build from it (run 3). Needs stack v3. */
export const LESSON_PLANNER_TEMPLATES_FLAG = 'lesson_planner_templates' as const;

/** The Yawp! Lesson Deck Kit: decks, the lesson plan spec and handouts. Needs deck v2. */
export const LESSON_PLANNER_DECK_GALLERY_FLAG = 'lesson_planner_deck_gallery' as const;

/** @deprecated Registry key `free_tier` — use {@link FREE_TIER_FLAG}. */
export const FREE_TIER_FLAG_LEGACY_KEY = 'free_tier' as const;

/** Unified sign-on UI and signed-in teacher prompt flows. Default off. */
export const UNIFIED_SIGN_ON_FLAG = 'unified-sign-on' as const;

/** Global class-code validation and Generate code controls. Default off. */
export const CLASS_CODE_UNIQUE_FLAG = 'classcode-unique' as const;

/** Demo feedback. Default off everywhere; only demo seed code opts in. */
export const DEMO_FEEDBACK_FLAG = 'demo-feedback-widget' as const;

export const GUIDED_TOURS_FLAG = 'guided-tours' as const;

/**
 * Legacy Internal API / Setting names aliased to {@link FREE_TIER_FLAG}. Runtime
 * reads only `feature_flag.free_tier`; these rows are not OR-merged.
 */
export const FOLDED_FREE_TIER_LEGACY_SETTINGS = [
  'feature_flag.free-tier-onboarding-v2',
  'feature_flag.free-tier-inapp-v2',
] as const;

/**
 * Legacy Setting name aliased to {@link UNIFIED_SIGN_ON_FLAG}. Runtime reads only
 * `feature_flag.unified-sign-on`.
 */
export const FOLDED_UNIFIED_SIGNON_LEGACY_SETTINGS = [
  'feature_flag.signon-teacher-prompts',
] as const;

export const FEATURE_FLAGS = {
  [LESSON_PLANNER_FLAG]: {
    label: 'Lesson Planner',
    description:
      'Shows the Lesson Planner in the teacher nav and allows planner pages, exports, and lesson generation. Off: entry points are hidden and direct URLs are blocked; saved lessons are not deleted.',
  },
  [INTERNAL_RUBRICS_FLAG]: {
    label: 'Rubrics from Yawp Internal',
    description:
      "Schools with this on get the rubric version Yawp Internal released for each rubric when a new assignment is created. Off: new assignments use the platform's current rubric. Existing assignments keep the version they were created with.",
  },
  [FREE_TIER_FLAG]: {
    label: 'Free tier',
    description:
      'Enables Free Tier teacher onboarding, school-admin approval, operator release tools, in-app limits, locked preview, create-class, and related UI. Off: those routes and release APIs return 404; waitlist/token APIs behave as on main until yawp-internal turns this on for everyone.',
  },
  [LESSON_PLANNER_INTAKE_V2_FLAG]: {
    label: 'Lesson Planner: new intake',
    description:
      'The planner asks which of the teacher’s real classes, a length per class (no 50-minute default), then how to fill the time, one decision per step. Off: the original length slider.',
  },
  [LESSON_PLANNER_STACK_V2_FLAG]: {
    label: 'Lesson Planner: stack v2',
    description:
      'Remove pieces from the stack screen, build a deck or plan from the stack, and show "Add the whole lesson" only under full plans. Off: the original stack controls. Stacked data is unchanged either way.',
  },
  [LESSON_PLANNER_DECK_V2_FLAG]: {
    label: 'Lesson Planner: deck template and editor',
    description:
      'Planner decks use the Yawp! tile template in PowerPoint and Present, and teachers can edit and delete slides. Off: the original deck look and no editor.',
  },
  [LESSON_PLANNER_STACK_PANEL_FLAG]: {
    label: 'Lesson Planner: stack beside the chat',
    description:
      'While planning, the stack shows in a panel beside the chat as pieces are added, with remove and reorder there. Needs stack v2. Off: the "Open the stack" bar only.',
  },
  [LESSON_PLANNER_PLAN_EXPORT_V2_FLAG]: {
    label: 'Lesson Planner: concise lesson plan (Word and PDF)',
    description:
      'The stack downloads a concise lesson plan (overview, goals, materials, numbered steps with what each is for) as a Word file and a PDF. Off: the full packet PDF only.',
  },
  [LESSON_PLANNER_STACK_V3_FLAG]: {
    label: 'Lesson Planner: stack page redesign',
    description:
      'The stack page becomes the run of show: a time bar against the period, at most two one-tap fixes when it runs long, a writing meter, adding pieces in place, and a finish line. Needs stack v2. Off: the stack v2 page. Stacked data is unchanged either way.',
  },
  [LESSON_PLANNER_SHARE_FLAG]: {
    label: 'Lesson Planner: post and send a lesson',
    description:
      'Post to your class (one share link, Google Classroom, Canvas, Schoology, Teams) and Send this lesson to a sub, student, family or admin. Needs the stack page redesign. Off: no sharing.',
  },
  [LESSON_PLANNER_RUN_SHOW_FLAG]: {
    label: 'Lesson Planner: run the show',
    description:
      "The teacher's view during class, with the slides following on the projector. Needs the stack page redesign. Off: no Run the show.",
  },
  [LESSON_PLANNER_TEMPLATES_FLAG]: {
    label: 'Lesson Planner: templates',
    description:
      'Save a lesson’s shape as a template and start a new lesson from it. Needs the stack page redesign. Off: no templates.',
  },
  [LESSON_PLANNER_DECK_GALLERY_FLAG]: {
    label: 'Lesson Planner: Lesson Deck Kit',
    description:
      'The Yawp! Lesson Deck Kit (spec v3): decks in Georgia and Arial on paper and pine, two or three colors from the lesson’s painting, mode words only where they do a job, and twelve slide templates, in Present, Run the show and PowerPoint; with the lesson plan export on, the lesson plan to the kit’s lesson plan spec; and handouts in the lesson’s fonts and color. Needs deck v2. Off: the tile deck, and gallery slides are drawn as their nearest tile slide.',
  },
  [UNIFIED_SIGN_ON_FLAG]: {
    label: 'Unified sign-on',
    description:
      'Shows unified sign-on at /auth/login and signed-in teacher classroom entry prompts. Default off on production; on by default on demo and PR previews.',
  },
  [CLASS_CODE_UNIQUE_FLAG]: {
    label: 'Unique class codes',
    description:
      'Enforces global class-code availability and shows Generate code. Default off on demo and production. Only everyone mode is supported; targeted mode stays off because uniqueness spans all organizations.',
  },
  [DEMO_FEEDBACK_FLAG]: {
    label: 'Demo feedback widget',
    description:
      'Shows the feedback note panel for signed-in demo users. Default off; production submissions are always denied.',
  },
  [GUIDED_TOURS_FLAG]: {
    label: 'Free classroom page tours',
    description:
      'Welcome cards, page replay and tour progress for free classroom teachers. Default off on demo and production; free tier must also be enabled.',
  },
} as const satisfies Record<string, { label: string; description: string }>;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

export const FEATURE_FLAG_KEYS = Object.keys(FEATURE_FLAGS) as FeatureFlagKey[];

const REGISTERED_FLAG_ALIASES: Record<string, FeatureFlagKey> = {
  [FREE_TIER_FLAG_LEGACY_KEY]: FREE_TIER_FLAG,
  'free-tier-onboarding-v2': FREE_TIER_FLAG,
  'free-tier-inapp-v2': FREE_TIER_FLAG,
  'signon-teacher-prompts': UNIFIED_SIGN_ON_FLAG,
};

export function resolveFeatureFlagKey(
  value: unknown
): FeatureFlagKey | undefined {
  if (typeof value !== 'string') return undefined;
  if (Object.hasOwn(FEATURE_FLAGS, value)) return value as FeatureFlagKey;
  if (Object.hasOwn(REGISTERED_FLAG_ALIASES, value))
    return REGISTERED_FLAG_ALIASES[value];
  return undefined;
}

export function isFeatureFlagKey(value: unknown): value is FeatureFlagKey {
  return resolveFeatureFlagKey(value) !== undefined;
}

export function featureFlagSettingName(key: FeatureFlagKey): string {
  if (key === FREE_TIER_FLAG) return 'feature_flag.free_tier';
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
  if (mode !== 'targeted') {
    if (
      orgIds !== undefined &&
      (!Array.isArray(orgIds) ||
        !orgIds.every((id): id is string => typeof id === 'string'))
    )
      return { ...OFF };
    return { mode, orgIds: [] };
  }
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

/** Free tier public flows are global; only `everyone` turns them on. */
export function isFreeTierGloballyEnabled(
  value: FeatureFlagValueInput
): boolean {
  return value.mode === 'everyone';
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
