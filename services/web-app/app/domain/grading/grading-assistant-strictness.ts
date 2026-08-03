export const gradingAssistantStrictnessLevels = [
  'beginner',
  'intermediate',
  'advanced',
] as const;

export type GradingAssistantStrictnessLevel =
  (typeof gradingAssistantStrictnessLevels)[number];

export const DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL: GradingAssistantStrictnessLevel =
  'intermediate';

const gradingAssistantStrictnessPercentageAdjustments: Record<
  GradingAssistantStrictnessLevel,
  number
> = {
  beginner: 5,
  intermediate: 0,
  advanced: -5,
};

const gradingAssistantStrictnessActCompositeAdjustments: Record<
  GradingAssistantStrictnessLevel,
  number
> = {
  beginner: 1,
  intermediate: 0,
  advanced: -1,
};

export const gradingAssistantStrictnessHelpText =
  'Strictness only adjusts the overall grade number after Grading Assistant suggestions. Use beginner for a slightly higher grade, advanced for a slightly lower grade, and intermediate for no adjustment.';

export const gradingAssistantStrictnessOptions: Array<{
  value: GradingAssistantStrictnessLevel;
  label: string;
  description: string;
}> = [
  {
    value: 'beginner',
    label: 'Beginner',
    description: 'Adds 5 points to the overall grade percentage.',
  },
  {
    value: 'intermediate',
    label: 'Intermediate',
    description: 'Keeps the overall grade percentage unchanged.',
  },
  {
    value: 'advanced',
    label: 'Advanced',
    description: 'Subtracts 5 points from the overall grade percentage.',
  },
];

export function parseGradingAssistantStrictnessLevel(
  value: FormDataEntryValue | string | null | undefined
): GradingAssistantStrictnessLevel | null {
  const normalized = value?.toString().trim().toLowerCase();
  if (
    normalized === 'beginner' ||
    normalized === 'intermediate' ||
    normalized === 'advanced'
  ) {
    return normalized;
  }
  return null;
}

export function getGradingAssistantStrictnessLabel(
  level: GradingAssistantStrictnessLevel
) {
  return (
    gradingAssistantStrictnessOptions.find((option) => option.value === level)
      ?.label ?? 'Intermediate'
  );
}

export function applyGradingAssistantStrictnessToPercentage(
  percentage: number,
  level: GradingAssistantStrictnessLevel
) {
  const adjustment = gradingAssistantStrictnessPercentageAdjustments[level];
  return Math.max(0, Math.min(100, Math.round(percentage + adjustment)));
}

export function applyGradingAssistantStrictnessToActComposite(
  composite: number,
  level: GradingAssistantStrictnessLevel
) {
  const adjustment = gradingAssistantStrictnessActCompositeAdjustments[level];
  return Math.max(2, Math.min(12, composite + adjustment));
}
