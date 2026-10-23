import { describe, expect, mock, test } from 'bun:test';

mock.module('~/utils/db.server', () => ({ prisma: {} }));
const { classKeyFor, titleWithMinutes } = await import('./stack-actions.server');

describe('stack actions — the small rules', () => {
  test('a step keeps its minutes in its title for the old page', () => {
    expect(titleWithMinutes('Hook activity (15 min)', 10)).toBe('Hook activity (10 min)');
    expect(titleWithMinutes('Frame — Historical context', 4)).toBe('Frame — Historical context (4 min)');
  });

  test('tomorrow is keyed by the class, however its label is typed', () => {
    expect(classKeyFor({ lessonClassLabel: 'English 10 · Period 3' })).toBe('label:english 10 period 3');
    expect(classKeyFor({ lessonClassLabel: 'english 10 - period 3' })).toBe('label:english 10 period 3');
    expect(classKeyFor({ classId: 'c1', lessonClassLabel: 'x' })).toBe('class:c1');
    expect(classKeyFor({})).toBe('any');
  });
});
