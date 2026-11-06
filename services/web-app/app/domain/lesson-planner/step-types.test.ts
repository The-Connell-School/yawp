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
    // Brian, Nov 4: a step named for a writing act is writing (it gets Create assignment too).
    expect(isWritingStep({ kind: 'step', stepType: 'activity', title: 'Quick write (5 min)' })).toBe(true);
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

test("students writing is writing, the same steps that get Create assignment (Brian, Nov 4, over round 3, 1.3)", () => {
  const step = (content: string) => isWritingStep({ kind: 'step', stepType: 'activity', title: 'Step', content });
  expect(step('A one-sentence written answer.')).toBe(true);
  expect(step('90 seconds of writing on the conch.')).toBe(true);
  // Passing words about notes are not.
  expect(step('One sentence in their notes.')).toBe(false);
});

describe("one rule for writing (Brian, Nov 4): if the teacher is talking, it's not an assignment; if the students are writing, it is", () => {
  const brian = [
    { title: 'What pre-writing is and why', content: 'Walk through slides 3–8: what pre-writing is, and why we do it before we draft. Students take notes as you go.' },
    { title: 'Find the diamonds + close', content: 'Pairs trade pre-writes and circle the best idea in each. Close by sharing two out loud.' },
    { title: 'Pre-write in Yawp!', content: 'Students pre-write for 20 minutes on the prompt from slide 9.' },
  ];

  test('Brian’s Pre-Writing lesson: only the pre-write is writing', async () => {
    const { studentWritingTask } = await import('./step-types');
    expect(brian.map((step) => Boolean(studentWritingTask(step.title, step.content)))).toEqual([false, false, true]);
    expect(brian.map((step) => isWritingStep({ kind: 'step', stepType: 'activity', ...step }))).toEqual([false, false, true]);
  });

  test('a teacher-led step never is, whatever it says about writing', async () => {
    const { studentWritingTask } = await import('./step-types');
    for (const title of ['Mini-lesson: thesis statements', 'Model the quick write', 'Explain the prompt', 'How a thesis works', 'Introduce the essay']) {
      expect({ title, writing: studentWritingTask(title, 'Students write a quick write after.') }).toEqual({ title, writing: null });
    }
  });

  test('a step whose name is a writing act is', async () => {
    const { studentWritingTask } = await import('./step-types');
    for (const title of ['Pre-write', 'Quick write (5 min)', 'Free write', 'Journal', 'Exit ticket', 'Draft the body paragraphs', 'Essay drafting']) {
      expect({ title, writing: Boolean(studentWritingTask(title, '')) }).toEqual({ title, writing: true });
    }
  });

  test("Kevin's lecture steps (Nov 6): a context step about writing is the teacher talking", async () => {
    const { studentWritingTask } = await import('./step-types');
    const kevin = [
      { title: 'The shape of a critical essay', content: 'Walk through the critical essay form on the slide: intro, thesis as its last sentence, body paragraphs, conclusion.' },
      { title: 'Pre-writing: what it is and why', content: 'Explain that pre-writing is where students find what they think. The three-friends-at-a-movie example. Students follow along on the slides.' },
    ];
    for (const step of kevin) {
      // Tagged context by the planner: not writing, and no Create button, however the title reads.
      expect({ title: step.title, writing: studentWritingTask(step.title, step.content, 'context') }).toEqual({ title: step.title, writing: null });
      expect(isWritingStep({ kind: 'step', stepType: 'context', ...step })).toBe(false);
      expect(isWritingStep({ kind: 'step', stepType: 'read_aloud', ...step })).toBe(false);
      // The teacher-talk patterns catch them on their own too, whatever the tag.
      expect(isWritingStep({ kind: 'step', stepType: 'activity', ...step })).toBe(false);
    }
    // A context step whose title is not the teacher talking still counts when
    // students actually write in it; a title about the thing never does (Brian, Nov 4).
    expect(
      studentWritingTask('The critical essay form', 'Pre-write: what is the first thing you notice about the form?', 'context')?.kind
    ).toBe('quick-write');
    expect(isWritingStep({ kind: 'step', stepType: 'context', title: 'Pre-writing slides', content: 'Students write for 5 minutes on the prompt.' })).toBe(true);
    expect(isWritingStep({ kind: 'step', stepType: 'context', title: 'Pre-writing slides', content: 'Go over the slides; students follow along.' })).toBe(false);
    expect(isWritingStep({ kind: 'step', stepType: 'context', title: 'Pre-writing: what it is and why', content: 'Students write for 5 minutes on the prompt.' })).toBe(false);
    // And the same words on an activity students do are writing, as before.
    expect(isWritingStep({ kind: 'step', stepType: 'activity', title: 'Pre-write on the prompt', content: 'Students pre-write for 10 minutes.' })).toBe(true);
  });

  test('more ways a title says the teacher is talking (Nov 6)', async () => {
    const { isTeacherTalk } = await import('./step-types');
    for (const title of [
      'Pre-writing: what it is and why',
      'The shape of a critical essay',
      'The structure of a body paragraph',
      'Overview of the essay',
      'Intro to the thesis statement',
      'Defining the thesis',
      'Essay drafting: what it is',
    ]) {
      expect({ title, talk: isTeacherTalk(title) }).toEqual({ title, talk: true });
    }
    for (const title of ['Pre-write', 'Draft the body paragraphs', 'Quick write (5 min)', 'Essay drafting']) {
      expect({ title, talk: isTeacherTalk(title) }).toEqual({ title, talk: false });
    }
  });

  test('a discussion or a closing is only with a written prompt in it', async () => {
    const { studentWritingTask } = await import('./step-types');
    expect(studentWritingTask('Wrap-up', 'Exit ticket: what is your thesis, in one sentence?')?.kind).toBe('exit-ticket');
    expect(studentWritingTask('Wrap-up', 'Pre-write: who should lead the boys, and why?')?.kind).toBe('quick-write');
    expect(studentWritingTask('Close Reading Discussion', 'Connect it to your class starter writing.')).toBeNull();
    expect(studentWritingTask('Pair talk', 'Exit ticket ideas come later.')).toBeNull();
  });
});
