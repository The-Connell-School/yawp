export const ASSIGNMENT_GRADING_MODES = ['step', 'bands'] as const;

export type AssignmentGradingMode = (typeof ASSIGNMENT_GRADING_MODES)[number];

export const DEFAULT_ASSIGNMENT_GRADING_MODE: AssignmentGradingMode = 'step';

export const gradingModeOptions: Array<{
  value: AssignmentGradingMode;
  label: string;
  description: string;
}> = [
  {
    value: 'step',
    label: 'Steps',
    description:
      'A score lands on one of the rubric labels and never between two of them.',
  },
  {
    value: 'bands',
    label: 'Bands',
    description:
      "A score can land anywhere inside the range a rubric label covers.",
  },
];

export const MAX_RUBRIC_TOTAL_POINTS = 1000;

export function parseAssignmentGradingMode(value: unknown): AssignmentGradingMode | null {
  return typeof value === 'string' && ASSIGNMENT_GRADING_MODES.includes(value as AssignmentGradingMode)
    ? (value as AssignmentGradingMode)
    : null;
}

export function parseOptionalRubricTotalPoints(value: unknown): number | null | false {
  const raw = value?.toString().trim() ?? '';
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) return false;

  const total = Number(raw);
  return Number.isSafeInteger(total) && total > 0 && total <= MAX_RUBRIC_TOTAL_POINTS
    ? total
    : false;
}

export function rubricOverrideError() {
  return `Rubric total points must be a positive whole number no greater than ${MAX_RUBRIC_TOTAL_POINTS}.`;
}
