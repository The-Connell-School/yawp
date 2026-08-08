export const gradingAssistantStrictnessLevels = [
  'beginner',
  'intermediate',
  'advanced',
] as const;

export type GradingAssistantStrictnessLevel =
  (typeof gradingAssistantStrictnessLevels)[number];

export const DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL: GradingAssistantStrictnessLevel =
  'intermediate';

// The Beginner/Intermediate/Advanced picker is hidden from teachers pending
// product review of the ±5 percentage / ±1 ACT-composite adjustment it
// applies. This is the single switch every render site consults; flip it
// back to `true` to re-enable the control. Stored strictness values and the
// apply-functions below are unaffected by this flag and keep working for any
// assignment that already carries a non-default level.
export const GRADING_ASSISTANT_STRICTNESS_UI_ENABLED = false;

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

export const gradingAssistantStrictnessOptions: Array<{
  value: GradingAssistantStrictnessLevel;
  label: string;
}> = [
  {
    value: 'beginner',
    label: 'Beginner',
  },
  {
    value: 'intermediate',
    label: 'Intermediate',
  },
  {
    value: 'advanced',
    label: 'Advanced',
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
