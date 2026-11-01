import type { RubricCategory } from './assignment-type-rubric.shared';
import { CLASS_STARTER_THREE_BAND_SCORE_LABELS } from './class-starter-three-band-rubric';
import { EXIT_TICKET_SCORE_BANDS } from './exit-ticket-rubric';
import { rubricCategories as THESIS_ESSAY_CATEGORIES } from '~/domain/grading/rubric';

/**
 * What "a current rubric on every assignment type" means, as checks.
 *
 * Each of the five types the Grading Assistant leans on is held to what its
 * rubric has to look like for grading to work: the right categories, the right
 * bands, a scale that scores on every whole number, and — for a library
 * rubric — a current revision that new assignments can pin to. The checks read
 * the resolved grading config, the same object grading reads, so a type that
 * falls back to its built-in rubric is judged on that built-in rubric.
 */

export type GradingAssistantAuditType = {
  name:
    | 'Thesis-Driven Essay'
    | 'Pre-Writing'
    | 'Thesis Statement'
    | 'Class Starter'
    | 'Exit Ticket';
  /** `AssignmentType.kind`; null for the Thesis-Driven Essay, matched by title. */
  kind: string | null;
};

export const GRADING_ASSISTANT_AUDIT_TYPES: GradingAssistantAuditType[] = [
  { name: 'Thesis-Driven Essay', kind: null },
  { name: 'Pre-Writing', kind: 'prewriting' },
  { name: 'Thesis Statement', kind: 'thesis_statement' },
  { name: 'Class Starter', kind: 'class_starter' },
  { name: 'Exit Ticket', kind: 'exit_ticket' },
];

export type AuditedGradingConfig = {
  source: string;
  label: string;
  scoringType: string;
  minScore: number;
  maxScore: number;
  step: number;
  rubricCategories: Pick<
    RubricCategory,
    'key' | 'label' | 'weight' | 'scoreLabels' | 'bands'
  >[];
  rubricIncomplete: boolean;
};

export type AuditFinding = {
  code:
    | 'missing'
    | 'rubric-incomplete'
    | 'scale-step'
    | 'library-rubric-no-revision'
    | 'thesis-categories'
    | 'class-starter-bands'
    | 'exit-ticket-bands';
  /** `action`: needs fixing before grading can be relied on. */
  level: 'action' | 'warning';
  message: string;
};

function labelsOf(category: AuditedGradingConfig['rubricCategories'][number]) {
  return [...(category.scoreLabels ?? [])]
    .sort((a, b) => a.value - b.value)
    .map((entry) => entry.label);
}

function sameBands(
  actual: AuditedGradingConfig['rubricCategories'][number]['bands'],
  expected: typeof EXIT_TICKET_SCORE_BANDS
) {
  if (!actual || actual.length !== expected.length) return false;
  const sorted = [...actual].sort((a, b) => a.min - b.min);
  return sorted.every(
    (band, index) =>
      band.min === expected[index]!.min &&
      band.max === expected[index]!.max &&
      band.label === expected[index]!.label
  );
}

export function auditGradingAssistantRubric(
  type: GradingAssistantAuditType,
  config: AuditedGradingConfig,
  library: {
    libraryRubricTitle: string | null;
    /** Null when the type uses no library rubric. */
    libraryRubricHasCurrentRevision: boolean | null;
  }
): AuditFinding[] {
  const findings: AuditFinding[] = [];

  if (config.rubricIncomplete) {
    findings.push({
      code: 'rubric-incomplete',
      level: 'action',
      message:
        'Some rubric categories are missing a key, label, description or weight. Grading uses them as saved.',
    });
  }

  if (config.step > 1) {
    findings.push({
      code: 'scale-step',
      level: 'action',
      message: `The scale scores in steps of ${config.step}, so the Grading Assistant cannot land on every whole number.`,
    });
  }

  if (library.libraryRubricHasCurrentRevision === false) {
    findings.push({
      code: 'library-rubric-no-revision',
      level: 'action',
      message: `The library rubric "${library.libraryRubricTitle ?? 'selected'}" has no current revision, so new assignments pin to the type's previous rubric instead of this one.`,
    });
  }

  if (type.name === 'Thesis-Driven Essay') {
    const keys = config.rubricCategories.map((category) => category.key);
    const expected = THESIS_ESSAY_CATEGORIES.map((category) => category.key);
    if (JSON.stringify(keys) !== JSON.stringify(expected)) {
      findings.push({
        code: 'thesis-categories',
        level: 'action',
        message: `Expected the five essay categories (${expected.join(', ')}); found ${keys.join(', ') || 'none'}.`,
      });
    }
  }

  if (type.name === 'Class Starter') {
    const labels = config.rubricCategories.flatMap(labelsOf);
    const expected = CLASS_STARTER_THREE_BAND_SCORE_LABELS.map(
      (entry) => entry.label
    );
    if (
      config.rubricCategories.length !== 1 ||
      JSON.stringify(labels) !== JSON.stringify(expected)
    ) {
      findings.push({
        code: 'class-starter-bands',
        level: 'action',
        message: `Expected three bands (${expected.join(', ')}); found ${labels.join(', ') || 'no score words'}. Select "Class Starter (Excellent / Partial Credit / No Credit)" in Admin → Assignment Types.`,
      });
    }
  }

  if (type.name === 'Exit Ticket') {
    const category = config.rubricCategories[0];
    if (
      config.rubricCategories.length !== 1 ||
      category?.key !== 'understanding' ||
      !sameBands(category.bands, EXIT_TICKET_SCORE_BANDS) ||
      config.minScore !== 0 ||
      config.maxScore !== 100
    ) {
      findings.push({
        code: 'exit-ticket-bands',
        level: 'action',
        message:
          'Expected one Understanding category on the 0-100 Exit Ticket bands (No evidence, Names it only, Partly there, Explains it). Reflection and check-for-understanding tickets both grade on these.',
      });
    }
  }

  return findings;
}
