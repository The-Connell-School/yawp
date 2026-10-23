import { describe, expect, test } from 'bun:test';
import { answerLinesFor, handoutContent, isStudentFacing, studentVersionKey, STUDENT_VERSION_SYSTEM } from './step-handout';

describe("handouts for any step (Brian's run 3, item 8)", () => {
  test('what students already hold prints as it is; a teacher step needs its student version', () => {
    expect(isStudentFacing('class-starter')).toBe(true);
    expect(isStudentFacing('step')).toBe(false);
    expect(handoutContent({ kind: 'daily-pages', content: 'Write.' }, null)).toBe('Write.');
    expect(handoutContent({ kind: 'step', content: 'Push a little.' }, null)).toBeNull();
    expect(handoutContent({ kind: 'step', content: 'Push a little.' }, 'Pick one object.')).toBe('Pick one object.');
  });

  test('answer lines sized to the writing', () => {
    expect(answerLinesFor({ isWriting: true, minutes: 5, type: 'class_starter', kind: 'class-starter' })).toBe(8);
    expect(answerLinesFor({ isWriting: true, minutes: 15, type: 'daily_pages', kind: 'daily-pages' })).toBe(20);
    expect(answerLinesFor({ isWriting: false, minutes: 3, type: 'closing', kind: 'step' })).toBe(5);
    expect(answerLinesFor({ isWriting: false, minutes: 15, type: 'activity', kind: 'step' })).toBe(0);
  });

  test('a changed step gets a new version key', () => {
    expect(studentVersionKey('a')).not.toBe(studentVersionKey('b'));
  });

  test('the student version leaves teacher moves out', () => {
    expect(STUDENT_VERSION_SYSTEM).toContain('Leave out every teacher move');
    expect(STUDENT_VERSION_SYSTEM).toContain('"push a little"');
  });
});
