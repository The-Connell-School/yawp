import { describe, expect, test } from 'bun:test';
import { parseRequiredAssignmentTitle } from './assignment-title-validation';

describe('parseRequiredAssignmentTitle', () => {
  test('rejects blank titles', () => {
    expect(parseRequiredAssignmentTitle('')).toEqual({
      ok: false,
      message: 'Add an assignment title.',
    });
    expect(parseRequiredAssignmentTitle('   ')).toEqual({
      ok: false,
      message: 'Add an assignment title.',
    });
  });

  test('accepts trimmed titles', () => {
    expect(parseRequiredAssignmentTitle('  Class Starter 11/25  ')).toEqual({
      ok: true,
      title: 'Class Starter 11/25',
    });
  });
});