/**
 * Lesson Planner capability slices formerly gated by separate feature flags.
 * Rollout is controlled only by {@link LESSON_PLANNER_FLAG}; these keys remain
 * for e2e helpers and harmless legacy Setting rows.
 */
export const LESSON_PLANNER_INTAKE_V2_FLAG = 'lesson_planner_intake_v2' as const;
export const LESSON_PLANNER_STACK_V2_FLAG = 'lesson_planner_stack_v2' as const;
export const LESSON_PLANNER_DECK_V2_FLAG = 'lesson_planner_deck_v2' as const;
export const LESSON_PLANNER_STACK_PANEL_FLAG = 'lesson_planner_stack_panel' as const;
export const LESSON_PLANNER_PLAN_EXPORT_V2_FLAG =
  'lesson_planner_plan_export_v2' as const;
export const LESSON_PLANNER_STACK_V3_FLAG = 'lesson_planner_stack_v3' as const;
export const LESSON_PLANNER_SHARE_FLAG = 'lesson_planner_share' as const;
export const LESSON_PLANNER_RUN_SHOW_FLAG = 'lesson_planner_run_show' as const;
export const LESSON_PLANNER_TEMPLATES_FLAG = 'lesson_planner_templates' as const;
export const LESSON_PLANNER_DECK_GALLERY_FLAG =
  'lesson_planner_deck_gallery' as const;
export const LESSON_PLANNER_UPLOADS_FLAG = 'lesson_planner_uploads' as const;
export const LESSON_PLANNER_TEACH_NOTES_FLAG =
  'lesson_planner_teach_notes' as const;
export const LESSON_PLANNER_LIBRARY_V2_FLAG = 'lesson_planner_library_v2' as const;

export const LESSON_PLANNER_REVIEW_FLAG_KEYS = [
  LESSON_PLANNER_INTAKE_V2_FLAG,
  LESSON_PLANNER_STACK_V2_FLAG,
  LESSON_PLANNER_DECK_V2_FLAG,
  LESSON_PLANNER_STACK_PANEL_FLAG,
  LESSON_PLANNER_PLAN_EXPORT_V2_FLAG,
  LESSON_PLANNER_STACK_V3_FLAG,
  LESSON_PLANNER_SHARE_FLAG,
  LESSON_PLANNER_RUN_SHOW_FLAG,
  LESSON_PLANNER_TEMPLATES_FLAG,
  LESSON_PLANNER_DECK_GALLERY_FLAG,
  LESSON_PLANNER_UPLOADS_FLAG,
  LESSON_PLANNER_TEACH_NOTES_FLAG,
  LESSON_PLANNER_LIBRARY_V2_FLAG,
] as const;

export type LessonPlannerReviewFlagKey =
  (typeof LESSON_PLANNER_REVIEW_FLAG_KEYS)[number];

/** Legacy Internal / Setting rows; runtime ignores them. */
export const FOLDED_LESSON_PLANNER_REVIEW_FLAG_SETTINGS = [
  'feature_flag.lesson_planner_intake_v2',
  'feature_flag.lesson_planner_stack_v2',
  'feature_flag.lesson_planner_deck_v2',
  'feature_flag.lesson_planner_stack_panel',
  'feature_flag.lesson_planner_plan_export_v2',
  'feature_flag.lesson_planner_stack_v3',
  'feature_flag.lesson_planner_share',
  'feature_flag.lesson_planner_run_show',
  'feature_flag.lesson_planner_templates',
  'feature_flag.lesson_planner_deck_gallery',
  'feature_flag.lesson_planner_uploads',
  'feature_flag.lesson_planner_teach_notes',
  'feature_flag.lesson_planner_library_v2',
] as const;
