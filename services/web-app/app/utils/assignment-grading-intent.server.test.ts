import { describe, expect, test } from 'bun:test';

import { parseAssignmentGradingIntent } from './assignment-grading-intent.server';

function formFor(entries: Record<string, string | string[]>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) {
      for (const item of value) form.append(key, item);
    } else {
      form.append(key, value);
    }
  }
  return form;
}

describe('parseAssignmentGradingIntent', () => {
  test('defaults legacy assignment forms to graded 100-point assignments', () => {
    expect(parseAssignmentGradingIntent(formFor({}))).toEqual({
      success: true,
      data: { submitForGrade: true, pointValue: 100 },
    });
  });

  test('parses an explicit graded positive integer point value', () => {
    expect(
      parseAssignmentGradingIntent(
        formFor({ submitForGrade: ['false', 'true'], pointValue: '25' })
      )
    ).toEqual({
      success: true,
      data: { submitForGrade: true, pointValue: 25 },
    });
  });

  test('allows ungraded assignments with no point value', () => {
    expect(
      parseAssignmentGradingIntent(
        formFor({ submitForGrade: 'false', pointValue: '' })
      )
    ).toEqual({
      success: true,
      data: { submitForGrade: false, pointValue: null },
    });
  });

  test('rejects blank, fractional, zero, negative, and oversized graded point values', () => {
    for (const pointValue of ['', '1.5', '0', '-4', '1001']) {
      const result = parseAssignmentGradingIntent(
        formFor({ submitForGrade: 'true', pointValue })
      );

      expect(result).toMatchObject({
        success: false,
        message:
          pointValue === ''
            ? 'Point value is required when submitting for grade.'
            : 'Point value must be a positive whole number no greater than 1000.',
      });
    }
  });
});
