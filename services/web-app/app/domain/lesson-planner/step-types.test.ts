import { describe, expect, test } from 'bun:test';
import { isWritingStep, parseStepType, stepChipText, stepTypeFor } from './step-types';

describe('stepTypeFor (stack page redesign, writing time)', () => {
  test('kinds that say what they are', () => {
    expect(stepTypeFor({ kind: 'class-starter', title: 'Four minutes of writing' })).toBe('class_starter');
    expect(stepTypeFor({ kind: 'daily-pages', title: 'O’Brien lists what they carried' })).toBe('daily_pages');
    expect(stepTypeFor({ kind: 'exit-ticket', title: 'One object, one sentence' })).toBe('closing');
    expect(stepTypeFor({ kind: 'notes', title: 'Historical Context' })).toBe('context');
  });

  test("a plan step is read by its title, Brian's day one lesson", () => {
    const type = (title: string) => stepTypeFor({ kind: 'step', title });
    expect(type('Hook activity: What’s in your bag?')).toBe('activity');
    expect(type('Frame — Historical context')).toBe('context');
    expect(type('Read aloud: the opening of the title story')).toBe('read_aloud');
    expect(type('Closing')).toBe('closing');
    expect(type('Pair talk')).toBe('activity');
  });

  test("the planner's tag wins", () => {
    expect(stepTypeFor({ kind: 'step', title: 'Closing', stored: 'activity' })).toBe('activity');
    expect(parseStepType('Read aloud')).toBe('read_aloud');
    expect(parseStepType('nonsense')).toBeNull();
  });
});

describe('isWritingStep: set from Yawp!, never by the teacher', () => {
  test('writing kinds count before anything is created', () => {
    expect(isWritingStep({ kind: 'class-starter' })).toBe(true);
    expect(isWritingStep({ kind: 'daily-pages' })).toBe(true);
    expect(isWritingStep({ kind: 'exit-ticket' })).toBe(true);
  });
  test('a step counts once an assignment is created from it', () => {
    expect(isWritingStep({ kind: 'step' })).toBe(false);
    expect(isWritingStep({ kind: 'step', yawpAssignmentId: 'a1' })).toBe(true);
  });
  test('the hook is not writing', () => {
    expect(isWritingStep({ kind: 'step', stepType: 'activity' })).toBe(false);
  });
});

test('a Thesis Essay module shows its name in the chip', () => {
  expect(stepChipText('thesis_essay', 'Module 1')).toBe('Thesis Essay · Module 1');
  expect(stepChipText('context')).toBe('Context');
});
