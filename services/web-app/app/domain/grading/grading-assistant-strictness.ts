export const gradingAssistantStrictnessLevels = [
  'beginner',
  'intermediate',
  'advanced',
] as const;

export type GradingAssistantStrictnessLevel =
  (typeof gradingAssistantStrictnessLevels)[number];

export const DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL: GradingAssistantStrictnessLevel =
  'intermediate';

export const gradingAssistantStrictnessHelpText =
  'Use beginner level for younger students or at the beginning of the year, and increase for older students or upper level classes or to increase standards as the year progresses. You can always change this during the act of grading.';

export const gradingAssistantStrictnessOptions: Array<{
  value: GradingAssistantStrictnessLevel;
  label: string;
  description: string;
}> = [
  {
    value: 'beginner',
    label: 'Beginner',
    description:
      'Use a more supportive calibration for younger students, early-year work, or first attempts.',
  },
  {
    value: 'intermediate',
    label: 'Intermediate',
    description:
      'Use the normal course-level expectation for this assignment and rubric.',
  },
  {
    value: 'advanced',
    label: 'Advanced',
    description:
      'Use a stricter calibration for older students, upper-level classes, or raised standards.',
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
