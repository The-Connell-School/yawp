import { describe, expect, test } from 'bun:test';
import {
  adminExtras,
  AUDIENCE_SETUP,
  classroomShareUrl,
  fallbackLessonText,
  parseShareItems,
  REWRITE_SYSTEM,
  teamsShareUrl,
  lessonEmail,
  withoutWritingShare,
} from './lesson-share';

describe('Post to your class and Send this lesson (stack page redesign)', () => {
  test('each tab changes the recipient, what they get, the note and the button', () => {
    expect(AUDIENCE_SETUP.sub).toMatchObject({
      tab: 'Substitute',
      recipientLabel: 'Substitute’s email',
      noteLabel: 'Special instructions for your sub',
      button: 'Send sub plan',
    });
    expect(AUDIENCE_SETUP.sub.items.map((item) => [item.label, item.checked])).toEqual([
      ['Sub-ready lesson plan', true],
      ['Handouts to print', true],
      ['Slide deck link', true],
      ['Class roster', false],
    ]);
    expect(AUDIENCE_SETUP.family.button).toBe('Send to family');
  });

  test('family: what we did and why, and ways to talk about it at dinner', () => {
    expect(AUDIENCE_SETUP.family.items.map((item) => item.label)).toEqual(['What we did and why', 'Talking about it at dinner', 'The slides from class']);
    expect(REWRITE_SYSTEM.family).toContain('two or three');
    expect(REWRITE_SYSTEM.family).toContain('## Talking about it at dinner');
  });

  test('admin: the plan, writing time, standards only as named, and an invitation to observe', () => {
    expect(AUDIENCE_SETUP.admin.items.map((item) => item.item)).toEqual(['plan', 'writing', 'standards', 'deck', 'observe']);
    const standards = AUDIENCE_SETUP.admin.items.find((item) => item.item === 'standards')!;
    expect(standards.hint).toBe('The ones you named in the planner');
    expect(REWRITE_SYSTEM.admin).toContain('Never name a standard');
    expect(parseShareItems('observe')).toEqual(['observe']);
  });

  test('only known items are kept', () => {
    expect(parseShareItems('deck,handouts,evil,deck')).toEqual(['deck', 'handouts']);
  });

  test('Classroom and Teams share links carry the lesson link', () => {
    expect(classroomShareUrl('https://yawp.school/l/abc', 'Day One')).toBe(
      'https://classroom.google.com/share?url=https%3A%2F%2Fyawp.school%2Fl%2Fabc&title=Day+One'
    );
    expect(teamsShareUrl('https://yawp.school/l/abc', 'Day One')).toContain('href=https%3A%2F%2Fyawp.school%2Fl%2Fabc');
  });

  test('without a rewrite, the page is the steps with their times', () => {
    expect(fallbackLessonText([{ title: 'Hook', minutes: 15, startsAt: 5, excerpt: 'Bags out.' }])).toBe(
      '## Minute 5 · Hook (15 min)\n\nBags out.'
    );
  });
});

describe('adminExtras: only what the teacher said', () => {
  test('the named standards, and the invitation with the class and day', () => {
    const text = adminExtras({
      standards: ['RL.9-10.1'],
      observe: true,
      className: 'English 10 · Period 3',
      lessonDate: '2026-10-27T00:00:00.000Z',
    });
    expect(text).toContain('## Standards');
    expect(text).toContain('- RL.9-10.1');
    expect(text).toContain('with English 10 · Period 3 on Tuesday, October 27');
  });

  test('no standards named: no Standards section at all', () => {
    expect(adminExtras({ standards: [], observe: false, className: null, lessonDate: null })).toBe('');
  });
});

describe("withoutWritingShare: one writing number, from the stack (Brian's run 4, item 6)", () => {
  test("the model's own percentage goes; the rest of the sentence's paragraph stays", () => {
    const text = [
      '## The lesson',
      '',
      'Students read chapter 3 closely. About 29% of the period is spent writing. They finish with an exit ticket.',
      '',
      '- Writing: 29% of class',
      '- Discussion: 20 min',
    ].join('\n');
    const out = withoutWritingShare(text);
    expect(out).not.toContain('29%');
    expect(out).toContain('Students read chapter 3 closely. They finish with an exit ticket.');
    expect(out).toContain('- Discussion: 20 min');
  });
  test('the admin rewrite is not asked for a writing share', () => {
    // It may name a writing assignment in Yawp! (round 5), never a share of time.
    expect(REWRITE_SYSTEM.admin.replace(/writing assignments? in Yawp!/gi, '')).not.toMatch(/writing/i);
  });
});

describe("lessonEmail: each audience's email (Brian's run 4, item 5)", () => {
  const base = { title: 'Catcher, ch. 1–4', className: 'English 11', link: 'https://yawp.example/l/abc', note: null, teacherName: 'Brian' };
  test('says who sent it, what it is for, and the link, with no login needed', () => {
    for (const audience of ['sub', 'student', 'family', 'admin'] as const) {
      const email = lessonEmail({ ...base, audience });
      expect(email.text).toContain('Brian sent you');
      expect(email.text).toContain('https://yawp.example/l/abc');
      expect(email.html).toContain('Sent with Yawp! No login needed.');
    }
    expect(lessonEmail({ ...base, audience: 'sub' }).subject).toBe('Sub plan: Catcher, ch. 1–4');
    expect(lessonEmail({ ...base, audience: 'family' }).text).toContain('talk about it at home');
  });
  test('an admin invited to observe is told so in the subject', () => {
    expect(lessonEmail({ ...base, audience: 'admin', observe: true }).subject).toBe('Invitation to observe: Catcher, ch. 1–4');
  });
  test("the teacher's note is escaped in the HTML", () => {
    expect(lessonEmail({ ...base, audience: 'sub', note: 'Seats <b>fixed</b>' }).html).toContain('Seats &lt;b&gt;fixed&lt;/b&gt;');
  });
});

describe("share rewrites follow Brian's run 4 notes", () => {
  test('family: about the class, for any family; student: never "Hey!"', () => {
    expect(REWRITE_SYSTEM.family).toContain('Today in class, students');
    expect(REWRITE_SYSTEM.family).toContain('never "Your student…"');
    expect(REWRITE_SYSTEM.student).toContain('We missed you in class.');
    expect(REWRITE_SYSTEM.student).toContain('Never "Hey!"');
  });
  test('every rewrite: the class and step names as given, plain voice, Yawp!', () => {
    for (const system of Object.values(REWRITE_SYSTEM)) {
      expect(system).toContain('Use the class name exactly as given');
      expect(system).toContain('not "Do Now"');
      expect(system).toContain('No "not this, but that" contrasts');
      expect(system).toContain('The product is written Yawp!');
    }
  });
});

describe("share pages name the writing by type (Brian's round 3, 1.7–1.9)", () => {
  test('"The writing prompt" for one, "The writing prompts" for more', async () => {
    const { writingPromptsHeading } = await import('./lesson-share');
    expect(writingPromptsHeading(1)).toBe('The writing prompt');
    expect(writingPromptsHeading(2)).toBe('The writing prompts');
  });

  test('a handout from a writing prompt says its type, once', async () => {
    const { handoutHeading } = await import('./lesson-share');
    expect(handoutHeading('Franklin’s self-made method', 'Daily Pages')).toBe('Daily Pages: Franklin’s self-made method');
    expect(handoutHeading('Daily Pages: the method', 'Daily Pages')).toBe('Daily Pages: the method');
    expect(handoutHeading('The excerpt', null)).toBe('The excerpt');
  });

  test('a family is told what is expected and by when', async () => {
    const { inYawpLead } = await import('./lesson-share');
    expect(inYawpLead('family')).toBe(
      'These assignments are available to your student in Yawp! and should be completed before the next class session (or by an agreed-upon time):'
    );
    expect(inYawpLead('student')).toBe('These writing exercises are available to students as assignments in Yawp!');
  });
});

describe("every audience follows the stack (Brian's round 5, items 7–10)", () => {
  const steps = [
    { name: 'Reading Annotation', title: 'Common Sense', minutes: 1, startsAt: 0, excerpt: 'Take out your copy.', content: 'Take out your copy.', yawp: false },
    { name: 'Class Starter', title: 'When rules stop making sense', minutes: 5, startsAt: 1, excerpt: 'Think of a rule…', content: 'Think of a rule — at school, at home, anywhere.', yawp: true },
    { name: 'Class Discussion', title: 'Whole-Class Discussion', minutes: 28, startsAt: 6, excerpt: 'Two rounds.', content: 'Two rounds.', yawp: false },
    { name: 'Exit Ticket', title: 'the single most effective rhetorical move in Common Sense', minutes: 5, startsAt: 34, excerpt: 'In your own words…', content: 'In your own words…', yawp: true },
  ];

  test("a step's heading is its stack name, then its title, never the name twice", async () => {
    const { stepHeading } = await import('./lesson-share');
    expect(stepHeading('Class Starter', 'When rules stop making sense')).toBe('Class Starter: When rules stop making sense');
    expect(stepHeading('Class Discussion', 'Whole-Class Discussion')).toBe('Class Discussion');
    expect(stepHeading('Exit Ticket', 'Exit Ticket')).toBe('Exit Ticket');
    expect(stepHeading('Daily Pages', 'Daily Pages: the method')).toBe('Daily Pages: the method');
  });

  test('the rewrite is given each step by its stack name, with its Yawp! writing marked', async () => {
    const { rewriteInput } = await import('./lesson-share');
    const input = rewriteInput({ title: 'Day 2: Common Sense', className: 'English 10 · Period 3', steps });
    expect(input).toContain('Lesson: Day 2: Common Sense (English 10 · Period 3)');
    expect(input).toContain('## Class Starter: When rules stop making sense');
    expect(input).toContain('## Class Discussion');
    expect(input).toContain('## Exit Ticket: the single most effective rhetorical move in Common Sense');
    expect(input).toContain('A writing assignment in Yawp!: students open Yawp! and find the Class Starter. 5 minutes to write.');
    expect(input).toContain('A writing assignment in Yawp!: students open Yawp! and find the Exit Ticket. 5 minutes to write.');
    expect(input.indexOf('Class Starter')).toBeLessThan(input.indexOf('Class Discussion'));
    expect(input.indexOf('Class Discussion')).toBeLessThan(input.indexOf('Exit Ticket'));
  });

  test('every audience is told to keep the stack’s headings, in order, and never "Step 2" or "Yawp!"', () => {
    for (const system of Object.values(REWRITE_SYSTEM)) {
      expect(system).toContain('one "## " heading per step, in the order given');
      expect(system).toContain('never "Step 2"');
      expect(system).toContain('never call a step "Yawp!"');
      expect(system).toContain('never paraphrase');
      expect(system).toContain('never a discussion');
    }
  });

  test('the sub is told to send students to Yawp! for each writing assignment', () => {
    expect(REWRITE_SYSTEM.sub).toContain('This is a writing assignment in Yawp!');
    expect(REWRITE_SYSTEM.sub).toContain('Have students open Yawp! and find the');
    expect(REWRITE_SYSTEM.sub).toContain('never a discussion');
  });

  test('the student page names the Class Starter and the Exit Ticket, never "To catch up on the Yawp!"', () => {
    expect(REWRITE_SYSTEM.student).toContain('Never write "To catch up on the Yawp!"');
    expect(REWRITE_SYSTEM.student).toContain('in Yawp!');
  });

  test('without a rewrite, the steps are headed the same way', () => {
    const text = fallbackLessonText(steps);
    expect(text).toContain('## Minute 1 · Class Starter: When rules stop making sense (5 min)');
    expect(text).toContain('## Minute 6 · Class Discussion (28 min)');
  });

  test('the purple box lists assignments by type, with a title only to tell two apart', async () => {
    const { inYawpNames } = await import('./lesson-share');
    expect(inYawpNames([
      { name: 'Class Starter', title: 'When rules stop making sense' },
      { name: 'Exit Ticket', title: 'the single most effective rhetorical move' },
    ])).toEqual(['Class Starter', 'Exit Ticket']);
    expect(inYawpNames([
      { name: 'Class Starter', title: 'One' },
      { name: 'Class Starter', title: 'Two' },
    ])).toEqual(['Class Starter: One', 'Class Starter: Two']);
  });
});
