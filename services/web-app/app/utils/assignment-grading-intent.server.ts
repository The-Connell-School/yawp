export const DEFAULT_ASSIGNMENT_POINT_VALUE = 100;
export const MAX_ASSIGNMENT_POINT_VALUE = 1000;

import {
  DEFAULT_ASSIGNMENT_GRADING_MODE,
  parseAssignmentGradingMode,
  parseOptionalRubricTotalPoints,
  rubricOverrideError,
  type AssignmentGradingMode,
} from '~/domain/assignments/rubric-overrides';

export type AssignmentRubricOverrides = {
  rubricTotalPoints: number | null;
  gradingMode: AssignmentGradingMode;
};

export function parseAssignmentRubricOverrides(
  formData: FormData
): { success: true; data: AssignmentRubricOverrides } | { success: false; message: string } {
  const total = parseOptionalRubricTotalPoints(formData.get('rubricTotalPoints'));
  if (total === false) return { success: false, message: rubricOverrideError() };

  const rawMode = formData.get('gradingMode');
  const gradingMode = rawMode === null
    ? DEFAULT_ASSIGNMENT_GRADING_MODE
    : parseAssignmentGradingMode(rawMode.toString().trim());
  if (!gradingMode) {
    return { success: false, message: 'Grading mode is invalid.' };
  }

  return { success: true, data: { rubricTotalPoints: total, gradingMode } };
}

type AssignmentGradingIntent =
  | {
      success: true;
      data: {
        submitForGrade: boolean;
        pointValue: number | null;
      };
    }
  | {
      success: false;
      message: string;
    };

function parseSubmitForGrade(formData: FormData) {
  const values = formData
    .getAll('submitForGrade')
    .map((value) => value.toString().trim().toLowerCase())
    .filter(Boolean);
  const raw = values.at(-1);

  if (!raw) return { success: true as const, value: true };
  if (['true', 'on', '1', 'yes'].includes(raw)) {
    return { success: true as const, value: true };
  }
  if (['false', 'off', '0', 'no'].includes(raw)) {
    return { success: true as const, value: false };
  }

  return {
    success: false as const,
    message: 'Submit for grade value is invalid.',
  };
}

export function parseAssignmentGradingIntent(
  formData: FormData
): AssignmentGradingIntent {
  const submitForGrade = parseSubmitForGrade(formData);
  if (!submitForGrade.success) return submitForGrade;

  if (!submitForGrade.value) {
    return {
      success: true,
      data: { submitForGrade: false, pointValue: null },
    };
  }

  const hasPointValue = formData.has('pointValue');
  const rawPointValue = formData.get('pointValue')?.toString().trim() ?? '';

  if (!hasPointValue) {
    return {
      success: true,
      data: {
        submitForGrade: true,
        pointValue: DEFAULT_ASSIGNMENT_POINT_VALUE,
      },
    };
  }

  if (!rawPointValue) {
    return {
      success: false,
      message: 'Point value is required when submitting for grade.',
    };
  }

  if (!/^\d+$/.test(rawPointValue)) {
    return {
      success: false,
      message:
        'Point value must be a positive whole number no greater than 1000.',
    };
  }

  const pointValue = Number(rawPointValue);
  if (
    !Number.isSafeInteger(pointValue) ||
    pointValue < 1 ||
    pointValue > MAX_ASSIGNMENT_POINT_VALUE
  ) {
    return {
      success: false,
      message:
        'Point value must be a positive whole number no greater than 1000.',
    };
  }

  return {
    success: true,
    data: {
      submitForGrade: true,
      pointValue,
    },
  };
}
