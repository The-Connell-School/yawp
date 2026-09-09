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

// The descriptions explain the reading posture the assistant takes at each
// level -- how demanding it is of the writing in front of it. They must not
// describe a point adjustment.
export const gradingAssistantStrictnessOptions: Array<{
  value: GradingAssistantStrictnessLevel;
  label: string;
  description: string;
}> = [
  {
    value: 'beginner',
    label: 'Beginner',
    description:
      'The assistant reads gently, expecting a writer still learning the fundamentals.',
  },
  {
    value: 'intermediate',
    label: 'Intermediate',
    description:
      'The assistant reads at the standard expected for the grade level.',
  },
  {
    value: 'advanced',
    label: 'Advanced',
    description:
      'The assistant reads demandingly, expecting polished and precise writing.',
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

export function getGradingAssistantStrictnessInstructions(
  level: GradingAssistantStrictnessLevel
) {
  if (level === 'beginner') {
    return 'Use beginner calibration. Apply the rubric supportively for a younger student, early-year assignment, or first attempt. Reward partial control of each rubric skill, avoid unnecessarily harsh penalties for developing work, and make the next step feel achievable.';
  }

  if (level === 'advanced') {
    return 'Use advanced calibration. Hold the student to an advanced standard for this rubric. Expect precise claims, controlled organization, specific evidence, mature voice, and clean conventions before awarding top scores.';
  }

  return 'Use intermediate calibration. Apply the rubric at the normal course-level expectation for this assignment.';
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
