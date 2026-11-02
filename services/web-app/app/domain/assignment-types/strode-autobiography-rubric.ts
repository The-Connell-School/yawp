import type {
  PromptConfigData,
  RubricData,
  RubricScoreLabel,
  ScoringScaleData,
} from './assignment-type-rubric.shared';
import { STRODE_AUTOBIOGRAPHY_GRADING_INSTRUCTIONS } from './strode-autobiography-grading-instructions';

export const STRODE_AUTOBIOGRAPHY_ASSIGNMENT_TYPE_KIND = 'strode_autobiography';

export const STRODE_AUTOBIOGRAPHY_LIBRARY_NAME =
  'strode-eng101-essay-2-autobiography';

const STRODE_LEVEL_LABELS: RubricScoreLabel[] = [
  { value: 55, label: 'Misses' },
  { value: 72, label: 'Satisfactory' },
  { value: 85, label: 'Somewhat better than satisfactory' },
  { value: 95, label: 'Does them very well' },
];

const fullRangeBand = [
  { min: 0, max: 100, label: 'Full range', description: '' },
] as const;

function strodeCategory(
  key: string,
  label: string,
  description: string
) {
  return {
    key,
    label,
    weight: 1,
    description,
    scoreLabels: STRODE_LEVEL_LABELS,
    bands: [...fullRangeBand],
    feedbackEnabled: true,
  };
}

export const STRODE_AUTOBIOGRAPHY_SCORING_SCALE: ScoringScaleData = {
  type: 'weighted_percent',
  minScore: 0,
  maxScore: 100,
  step: 1,
};

export const STRODE_AUTOBIOGRAPHY_RUBRIC: RubricData = {
  categories: [
    strodeCategory(
      'plot',
      'Plot',
      'Arresting opening scene, exposition, rising action, climax, and self-reflection; causally linked scenes scored as a whole.'
    ),
    strodeCategory(
      'character',
      'Character',
      'Individualizing traits, dialogue that reveals character, and a protagonist who changes through conflict.'
    ),
    strodeCategory(
      'theme',
      'Theme',
      'Clear arc with before/after change; central idea carried in the story and identified in self-reflection.'
    ),
    strodeCategory(
      'setting_scene_vs_summary',
      'Setting: Scene vs. Summary',
      'Concrete sensory scenes versus summary; video quality versus report-like chronology.'
    ),
    strodeCategory(
      'open_form_tools',
      'Open-Form Tools',
      'Figurative language, concrete description, sensory detail, and sentence craft carried from Project One.'
    ),
  ],
};

export const STRODE_AUTOBIOGRAPHY_PROMPT_CONFIG: PromptConfigData = {
  gradingInstructions: STRODE_AUTOBIOGRAPHY_GRADING_INSTRUCTIONS,
};

export const STRODE_AUTOBIOGRAPHY_CALIBRATION_NOTES =
  'Strode ENG 101 Essay 2 Autobiographical Narrative (Brian/Tim GA v1): five equal categories, anchors 95/85/72/55, summary caps at 64 and 74, Strode letter scale with +/- boundaries. Mechanics flagged, never scored.';

/** Library / migration schemaJson shape. */
export function buildStrodeAutobiographyRubricSchema() {
  return {
    name: STRODE_AUTOBIOGRAPHY_LIBRARY_NAME,
    title: 'Strode ENG 101: Autobiographical Narrative (Essay 2)',
    scoringScale: STRODE_AUTOBIOGRAPHY_SCORING_SCALE,
    rubric: STRODE_AUTOBIOGRAPHY_RUBRIC,
    promptConfig: STRODE_AUTOBIOGRAPHY_PROMPT_CONFIG,
    outputSchema: {
      responseShape: 'categories_overall_comment',
      schemaVersion: 1,
    },
    calibrationNotes: STRODE_AUTOBIOGRAPHY_CALIBRATION_NOTES,
  };
}

export function isStrodeAutobiographyAssignmentType(
  assignmentType: { kind?: string | null } | null | undefined
): boolean {
  return assignmentType?.kind === STRODE_AUTOBIOGRAPHY_ASSIGNMENT_TYPE_KIND;
}
