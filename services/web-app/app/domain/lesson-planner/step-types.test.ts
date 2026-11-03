import { describe, expect, test } from 'bun:test';
import { isLectureStep, isWritingStep, writingName, parseStepType, stepChipText, stepTypeFor } from './step-types';

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
    expect(isWritingStep({ kind: 'step', title: 'Pair talk', content: 'Partners compare what Holden says about Pencey.' })).toBe(false);
  });
  test("only real writing counts: a Yawp! assignment type, by kind, tag or title (Brian's round 3, 1.3)", () => {
    const step = (title: string, content = '') => isWritingStep({ kind: 'step', title, content });
    expect(isWritingStep({ kind: 'step', stepType: 'class_starter' })).toBe(true);
    expect(isWritingStep({ kind: 'step', stepType: 'daily_pages' })).toBe(true);
    expect(step('Daily Pages', 'Ten minutes, any prompt.')).toBe(true);
    expect(step('Thesis workshop')).toBe(true);
    expect(step('Exit ticket')).toBe(true);
    expect(step('Five-paragraph essay: draft the body')).toBe(true);
    expect(step('AP essay practice: the DBQ')).toBe(true);
    expect(step('ACT writing practice')).toBe(true);
    expect(isWritingStep({ kind: 'step', stepType: 'closing', title: 'Closing', content: 'Exit ticket: what does Holden avoid saying?' })).toBe(true);
  });

  test('a discussion is not writing, even when it mentions writing', () => {
    const closeReading = [
      'Pairs for 4 minutes, then whole class for 11.',
      'When students make connections to their own class starter writing, follow those threads.',
    ].join('\n');
    expect(isWritingStep({ kind: 'step', stepType: 'activity', title: 'Close Reading Discussion', content: closeReading })).toBe(false);
    expect(isWritingStep({ kind: 'step', stepType: 'activity', title: 'Wrap-up', content: 'Students write a short reflection on paper.' })).toBe(false);
    expect(isWritingStep({ kind: 'step', stepType: 'activity', title: 'Quick write (5 min)' })).toBe(false);
    expect(isWritingStep({ kind: 'step', stepType: 'activity', title: 'Pair talk', content: 'Exit ticket ideas come later.' })).toBe(false);
  });

  test('a handout made for students to fill in counts; a reading handout does not', () => {
    expect(isWritingStep({ kind: 'handout', stepType: 'activity', title: 'Virtues tracker' })).toBe(true);
    expect(isWritingStep({ kind: 'handout', stepType: 'read_aloud', title: 'The excerpt' })).toBe(false);
    expect(isWritingStep({ kind: 'handout', stepType: 'context', title: 'Who was Franklin?' })).toBe(false);
  });
});

test('a Thesis Essay module shows its name in the chip', () => {
  expect(stepChipText('thesis_essay', 'Module 1')).toBe('Thesis Essay · Module 1');
  expect(stepChipText('context')).toBe('Context');
});

describe('isLectureStep: a step the teacher talks through, which earns its own slides', () => {
  test('lectures and mini-lessons, however they are written', () => {
    for (const title of ['Mini-lesson: Girard’s three ideas', 'Mini lecture (12 min)', 'Lecture: the war at home', 'Direct instruction — thesis moves', 'Minilesson']) {
      expect(isLectureStep(title)).toBe(true);
    }
  });

  test('not a discussion, a reading, or writing', () => {
    for (const title of ['Group work: Find Girard', 'Read aloud', 'Class Starter: Wanting', 'Closing']) {
      expect(isLectureStep(title)).toBe(false);
    }
  });
});

describe('a sticky-note check is a check for understanding, not an exit ticket (Oct 21)', () => {
  test('its type is not the closing, and nothing offers to create an exit ticket for it', async () => {
    const { proseWritingTask } = await import('./stack-create-link');
    const title = 'Sticky-note check: which axis?';
    const content = 'Each student puts a sticky note on the axis they think the quote belongs on. Circulate and count.';
    expect(stepTypeFor({ kind: 'step', title })).not.toBe('closing');
    expect(proseWritingTask(title, content)).toBeNull();
  });
});

test("what a writing step's writing is called (Brian's run 4, item 6)", () => {
  expect(writingName({ kind: 'class-starter', stepType: 'class_starter' })).toBe('Class Starter');
  expect(writingName({ kind: 'step', stepType: 'closing', title: 'Closing', content: 'Exit ticket: what does Holden avoid?' })).toBe('Exit Ticket');
  expect(writingName({ kind: 'step', stepType: 'activity', title: 'Wrap-up', content: 'A written reflection on paper.' })).toBe('Reflection');
  expect(writingName({ kind: 'step', stepType: 'thesis_essay', title: 'Module 1' })).toBe('Thesis Essay');
});

test("a step's passing words about writing are not writing (Brian's round 3, 1.3, over run 5)", () => {
  const step = (content: string) => isWritingStep({ kind: 'step', stepType: 'activity', title: 'Step', content });
  expect(step('A one-sentence written answer.')).toBe(false);
  expect(step('90 seconds of writing on the conch.')).toBe(false);
  expect(step('One sentence in their notes.')).toBe(false);
});
