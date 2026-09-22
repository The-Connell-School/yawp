import { describe, expect, test } from 'bun:test';

import { parseAssignmentGrammarGrading } from './assignment-grammar-grading.server';

function form(...values: string[]) {
  const formData = new FormData();
  for (const value of values) {
    formData.append('grammarGradingEnabled', value);
  }
  return formData;
}

describe('parseAssignmentGrammarGrading', () => {
  /**
   * Absent means the teacher was never shown the toggle — the assignment type
   * does not grade grammar. That has to store null, not false: null lets the
   * rubric decide, while false is a deliberate instruction to drop a category.
   */
  test('an absent field records no preference', () => {
    expect(parseAssignmentGrammarGrading(new FormData())).toEqual({
      success: true,
      value: null,
    });
  });

  test('reads the affirmative spellings a checkbox can send', () => {
    for (const value of ['true', 'on', '1', 'yes', 'TRUE', ' On ']) {
      expect(parseAssignmentGrammarGrading(form(value))).toEqual({
        success: true,
        value: true,
      });
    }
  });

  test('reads the negative spellings', () => {
    for (const value of ['false', 'off', '0', 'no']) {
      expect(parseAssignmentGrammarGrading(form(value))).toEqual({
        success: true,
        value: false,
      });
    }
  });

  /**
   * An unchecked checkbox sends only its hidden "false" companion; a checked
   * one sends both. Taking the last value is what makes that pair read
   * correctly, and it matches how tutorEnabled is parsed.
   */
  test('a checked checkbox wins over its hidden false companion', () => {
    expect(parseAssignmentGrammarGrading(form('false', 'true'))).toEqual({
      success: true,
      value: true,
    });
    expect(parseAssignmentGrammarGrading(form('false'))).toEqual({
      success: true,
      value: false,
    });
  });

  test('rejects a value it cannot read rather than guessing', () => {
    const result = parseAssignmentGrammarGrading(form('maybe'));

    expect(result.success).toBe(false);
    expect(result.success === false && result.message).toMatch(/grammar/i);
  });
});
