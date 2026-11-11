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

/** Teachers upload their own documents as source material for the planner (Oct 21). */
export const LESSON_PLANNER_UPLOADS_FLAG = 'lesson_planner_uploads' as const;

/** Stack page v2 (Oct 24 handoff, Part 1): Print it for class, Teach it, teacher notes, rename. Needs stack v3. */
export const LESSON_PLANNER_TEACH_NOTES_FLAG = 'lesson_planner_teach_notes' as const;

/** The library redesign (Oct 24 handoff, Part 2): courses, units, groups. Needs stack v3. */
export const LESSON_PLANNER_LIBRARY_V2_FLAG = 'lesson_planner_library_v2' as const;

/** An uploaded deck is kept whole, with its pictures and their alt text (Nov 1). Needs uploads. */
export const LESSON_PLANNER_UPLOAD_PICTURES_FLAG = 'lesson_planner_upload_pictures' as const;

/** "Teach with these slides": the planner builds around the teacher's own deck (Nov 1). Needs upload pictures. */
export const LESSON_PLANNER_TEACH_MY_SLIDES_FLAG = 'lesson_planner_teach_my_slides' as const;

/** "Refresh into a Yawp! deck": the teacher's pictures on Yawp! slides (Nov 1). Needs upload pictures. */
export const LESSON_PLANNER_REFRESH_MY_DECK_FLAG = 'lesson_planner_refresh_my_deck' as const;

/** "Planned in" counts the time the teacher was actually working on the lesson (Nov 3). */
export const LESSON_PLANNER_ACTIVE_TIME_FLAG = 'lesson_planner_active_time' as const;

/** The teacher's call on whether a stack step is writing time (Nov 4 follow-up). Needs the stack page redesign. */
export const LESSON_PLANNER_WRITING_OVERRIDE_FLAG = 'lesson_planner_writing_override' as const;

/** The Lesson Deck Kit, spec v4 (Nov 6): cream slides, split panels, labels. Needs the Lesson Deck Kit. */
export const LESSON_PLANNER_DECK_KIT_V4_FLAG = 'lesson_planner_deck_kit_v4' as const;

/**
 * The teacher's own deck flags as they apply (Nov 1): keeping the deck needs
 * uploads, and both choices work from the kept deck.
 */
export function deckUploadFlags(raw: {
  uploads: boolean;
  uploadPictures: boolean;
  teachMySlides: boolean;
  refreshMyDeck: boolean;
}): { uploadPictures: boolean; teachMySlides: boolean; refreshMyDeck: boolean } {
  const kept = raw.uploadPictures && raw.uploads;
  return { uploadPictures: kept, teachMySlides: raw.teachMySlides && kept, refreshMyDeck: raw.refreshMyDeck && kept };
}

/** @deprecated Registry key `free_tier` — use {@link FREE_TIER_FLAG}. */
export const FREE_TIER_FLAG_LEGACY_KEY = 'free_tier' as const;

/** Global class-code validation and Generate code controls. Default off. */
export const CLASS_CODE_UNIQUE_FLAG = 'classcode-unique' as const;

/**
 * Teacher's Lounge community board. On for a school: the Teacher's Lounge nav
 * item opens the community feed (/app/lounge), with the existing course grid
 * one tab away at its old URL. Off: the nav item opens the course grid as
 * before and every /app/lounge route returns 404. Posts are never deleted by
 * turning it off.
 */
export const LOUNGE_COMMUNITY_FLAG = 'teacher_lounge_community' as const;

/**
 * Thesis-Driven Essay slide decks and lesson plans (#452). On: each lesson
 * offers its deck three ways (present on YAWP!, copy to Google Slides,
 * download for PowerPoint) and its lesson plan, in the assignment type's
 * Modules and in the Faculty Lounge's Thesis-Driven Essay training; Day 1
 * adds the student handouts. Off: both pages are as before, and the deck,
 * presenter and asset routes return 404.
 */
export const THESIS_ESSAY_DECKS_FLAG = 'thesis_essay_decks' as const;

/** Demo feedback. Default off everywhere; only demo seed code opts in. */
export const DEMO_FEEDBACK_FLAG = 'demo-feedback-widget' as const;

export const GUIDED_TOURS_FLAG = 'guided-tours' as const;

/**
 * LLM "Generate a prompt" for Class Starter, Daily Pages, Exit Ticket, and
 * Thesis-Driven Essay. Off: the menu item and generator APIs are hidden.
 * Default off on production; on by default on demo and PR previews.
 */
export const TEACHER_PROMPT_GENERATOR_FLAG = 'teacher-prompt-generator' as const;

/**
 * Teacher's Lounge (`/app/teacher-trainings`). Off: hidden and redirected except
 * for emails on the `teacher_lounge` access list. Everyone: on for all teachers
 * (role checks unchanged). Targeted: on for listed schools only, with the same
 * access-list bypass when off for a school.
 */
export const TEACHER_LOUNGE_FLAG = 'teacher-lounge' as const;

/**
 * Exit ticket builder v3 (docs/plans/2026-11-02-exit-ticket-builder-v3.md):
 * no attachment, four "Have the students…" activities in two groups, a
 * teacher-written prompt, optional key points instead of a right-answer
 * question, completion or understanding grading. Off: the quick builder.
 * Tickets written by either builder open in both.
 */
export const EXIT_TICKET_BUILDER_V3_FLAG = 'exit-ticket-builder-v3' as const;

/**
 * Exit ticket class summary (v3 plan, phase 5): on the exit ticket's Class
 * read, a model-written summary of the responses — what landed, the shared
 * confusion, a reteach call and a suggested opening block — generated when
 * the teacher asks, and carried into "Plan tomorrow from this". Off: the
 * deterministic Class read only. Stored summaries are kept either way.
 */
export const EXIT_TICKET_CLASS_SUMMARY_FLAG = 'exit-ticket-class-summary' as const;

/**
 * Legacy Internal API / Setting names aliased to {@link FREE_TIER_FLAG}. Runtime
 * reads only `feature_flag.free_tier`; these rows are not OR-merged.
 */
export const FOLDED_FREE_TIER_LEGACY_SETTINGS = [
  'feature_flag.free-tier-onboarding-v2',
  'feature_flag.free-tier-inapp-v2',
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
      'Post to your class (one link to copy anywhere, or Google Classroom’s and Teams’ own share pages) and Send this lesson to a sub, student, family or admin. Needs the stack page redesign. Off: no sharing.',
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
  [LESSON_PLANNER_UPLOADS_FLAG]: {
    label: 'Lesson Planner: your own documents',
    description:
      'Teachers attach their own PDF, Word, PowerPoint or text files to a lesson, and the planner builds from them: their texts, terms and sequence. Only the text is kept, never the file. Off: no attach button.',
  },
  [LESSON_PLANNER_TEACH_NOTES_FLAG]: {
    label: 'Lesson Planner: stack page v2',
    description:
      'Brian’s stack page v2: Print it for class (Word, Google Docs and PDF for the plan and handouts; Present, Edit, Rebuild and PDF for the slides), Open slideshow and Run of show with teacher notes, full editable notes for every step, renaming a lesson, and no Teams button. Needs the stack page redesign. Off: Take it to class and Run the show, as before.',
  },
  [LESSON_PLANNER_LIBRARY_V2_FLAG]: {
    label: 'Lesson Planner: library redesign',
    description:
      'Brian’s library redesign: course tabs, units as tiles in groups with a writing meter, a page for each unit with day tabs and a lesson preview, Lessons on their own, and Plan a lesson. Needs the stack page redesign. Off: the folder list.',
  },
  [LESSON_PLANNER_UPLOAD_PICTURES_FLAG]: {
    label: 'Lesson Planner: keep uploaded decks and their pictures',
    description:
      'An uploaded PowerPoint is kept whole while it is attached to a lesson, its pictures are saved with their alt text, and the planner reads the deck slide by slide with a note where each picture sits. Removing the document deletes the file and its pictures. Needs your own documents. Off: only the text is kept, as before.',
  },
  [LESSON_PLANNER_TEACH_MY_SLIDES_FLAG]: {
    label: 'Lesson Planner: teach with my slides',
    description:
      'An attached PowerPoint can be marked “Teach with these slides”: the planner builds the lesson around the teacher’s own slide numbers instead of writing a new deck, and the original deck is in the lesson to download. Needs keep uploaded decks. Off: no choice on the document.',
  },
  [LESSON_PLANNER_REFRESH_MY_DECK_FLAG]: {
    label: 'Lesson Planner: refresh my deck',
    description:
      'An attached PowerPoint can be marked “Refresh into a Yawp! deck”: the planner rebuilds it as a Yawp! deck and keeps the teacher’s own pictures on picture slides, in Present, PowerPoint and PDF. A shared lesson shows a placeholder in place of the teacher’s pictures. Needs keep uploaded decks. Off: no refresh choice; decks already made still show their pictures.',
  },
  [LESSON_PLANNER_ACTIVE_TIME_FLAG]: {
    label: 'Lesson Planner: planning time is working time',
    description:
      'The planner pages count the time a teacher is actually working on a lesson (the page in front of them and in use, or waiting on the planner), and “Planned in” on a set lesson shows that instead of the clock time since the lesson was started. Lessons from before are estimated from their activity, with breaks left out. Off: “Planned in” is the time from the first message to set, and nothing is counted.',
  },
  [LESSON_PLANNER_WRITING_OVERRIDE_FLAG]: {
    label: 'Lesson Planner: teacher decides what counts as writing',
    description:
      'On the stack page, an opened step offers “Don’t count as writing” or “Count as writing”, with Undo: a lecture that introduces pre-writing can be taken out of the writing tally, and a step the rule missed can be counted. The teacher’s call drives the Writing badge, the writing minutes and percent, and Create in Yawp!. Needs the stack page redesign. Off: Yawp! decides, as before.',
  },
  [LESSON_PLANNER_DECK_KIT_V4_FLAG]: {
    label: 'Lesson Planner: Lesson Deck Kit v4',
    description:
      'The Lesson Deck Kit, spec v4 (Nov 6): every slide on cream, color only as a solid panel on split slides or as type, short Arial labels (Look, Talk, Hold this) instead of italic mode words, no rules, small caps, middle dots or roman numerals, a plain painting plate, a quiz template, and colors with no terracotta or brown. Applies to every gallery deck the school opens, in Present, Run the show, PowerPoint, the PDFs and shared links, and the planner writes to the v4 templates. Needs the Lesson Deck Kit. Off: spec v3, as before.',
  },
  [CLASS_CODE_UNIQUE_FLAG]: {
    label: 'Unique class codes',
    description:
      'Enforces global class-code availability and shows Generate code. Default off on demo and production. Only everyone mode is supported; targeted mode stays off because uniqueness spans all organizations.',
  },
  [LOUNGE_COMMUNITY_FLAG]: {
    label: "Teacher's Lounge community",
    description:
      "Teachers at these schools get the community board in the Teacher's Lounge: posts, replies, helpful votes, and questions for Brian. Off: the Lounge shows only the course grid and community pages return 404; posts are kept.",
  },
  [THESIS_ESSAY_DECKS_FLAG]: {
    label: 'Thesis-Driven Essay slide decks',
    description:
      "Each Thesis-Driven Essay lesson offers its slide deck (present on YAWP!, Google Slides, PowerPoint) and lesson plan, in the assignment's Modules and in the Faculty Lounge's Thesis-Driven Essay training. Off: both pages are as before and the deck pages return 404.",
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
  [TEACHER_PROMPT_GENERATOR_FLAG]: {
    label: 'Teacher prompt generator',
    description:
      'Shows New → Generate a prompt and the LLM drafting sheet on assignment types that support it (Class Starter, Daily Pages, Exit Ticket, Thesis-Driven Essay). Default off on production; on by default on demo and PR previews.',
  },
  [TEACHER_LOUNGE_FLAG]: {
    label: "Teacher's Lounge",
    description:
      "Controls Teacher's Lounge nav and `/app/teacher-trainings` access. Off: hidden for all teachers except the runtime access list. Everyone: on for all teachers. Targeted: on for listed schools only.",
  },
  [EXIT_TICKET_BUILDER_V3_FLAG]: {
    label: 'Exit ticket builder v3',
    description:
      'The simpler exit ticket form: no attachment, "Have the students…" activities (reflect or ask; explain a concept; answer a question; engage with a text or source), a prompt the teacher writes, and optional key points instead of "Is there a correct answer?". Off: the current quick builder. Tickets made with either open in both.',
  },
  [EXIT_TICKET_CLASS_SUMMARY_FLAG]: {
    label: 'Exit ticket class summary',
    description:
      'On an exit ticket’s Class read, teachers can ask for a summary of the responses: what the class understood, where the confusion is, whether to reteach, and a suggested opening block for tomorrow, which "Plan tomorrow from this" passes to the planner. One model call per request, only when new responses have arrived. Off: the Class read only.',
  },
} as const satisfies Record<string, { label: string; description: string }>;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

export const FEATURE_FLAG_KEYS = Object.keys(FEATURE_FLAGS) as FeatureFlagKey[];

const REGISTERED_FLAG_ALIASES: Record<string, FeatureFlagKey> = {
  [FREE_TIER_FLAG_LEGACY_KEY]: FREE_TIER_FLAG,
  'free-tier-onboarding-v2': FREE_TIER_FLAG,
  'free-tier-inapp-v2': FREE_TIER_FLAG,
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
