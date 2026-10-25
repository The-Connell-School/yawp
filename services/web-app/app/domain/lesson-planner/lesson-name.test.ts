import { describe, expect, test } from 'bun:test';
import {
  cleanLessonTitle,
  deriveLessonName,
  minutesInTitle,
  firstMessageTitle,
  nameIsProvisional,
  shouldRenameLesson,
} from './lesson-name';

const PLAN = [
  '## Evidence That Earns Its Place',
  '',
  'English 10 · Period 3 · 50 minutes',
  '',
  '## Lesson Sequence',
  '',
  '1. Warm-up',
].join('\n');

describe('deriveLessonName', () => {
  test('names the lesson after the plan it delivered', () => {
    expect(deriveLessonName(PLAN)).toBe('Evidence That Earns Its Place');
  });

  test('ignores a reply that is not a plan', () => {
    expect(deriveLessonName('Which class is this for?')).toBeNull();
    expect(deriveLessonName('## Two options\n\nWhich do you want?')).toBeNull();
  });

  test('drops the label the planner puts in front of the name', () => {
    expect(
      deriveLessonName(
        '## Lesson Plan: Conclusions that land\n\n## Sequence\n\nGo'
      )
    ).toBe('Conclusions that land');
  });

  test('refuses a heading that identifies nothing', () => {
    // "Lesson Plan" as a whole title is no better than the teacher's message.
    for (const heading of ['Lesson Plan', 'Overview', 'Objective', 'Plan']) {
      expect(
        deriveLessonName(`## ${heading}\n\n## Sequence\n\nDo the thing`)
      ).toBeNull();
    }
  });

  test('strips the emphasis a heading was written with', () => {
    expect(
      deriveLessonName('## **Conclusions** that land\n\n## Sequence\n\nGo')
    ).toBe('Conclusions that land');
  });

  test('keeps a long name short enough for a sidebar row', () => {
    const name = deriveLessonName(
      `## ${'Integrating quotations without dropping them '.repeat(4)}\n\n## Sequence\n\nGo`
    );
    expect(name!.length).toBeLessThanOrEqual(70);
    expect(name!.endsWith('…')).toBe(true);
  });

  test('does not fall back to a positional name', () => {
    // deriveSectionTitle answers "Section 1" when it has nothing; that is not
    // a lesson name.
    expect(deriveLessonName('#\n\n#\n\n')).toBeNull();
  });
});

describe('shouldRenameLesson', () => {
  test('renames on the first plan', () => {
    expect(
      shouldRenameLesson({
        reply: PLAN,
        priorReplies: ['Which class is this for?'],
        teacherNamedIt: false,
      })
    ).toBe('Evidence That Earns Its Place');
  });

  test('leaves the name alone once a plan has already landed', () => {
    // A teacher revising a plan should not watch it rename itself each round.
    expect(
      shouldRenameLesson({
        reply: '## Evidence, shorter\n\n## Sequence\n\nCut the warm-up',
        priorReplies: [PLAN],
        teacherNamedIt: false,
      })
    ).toBeNull();
  });

  test('never overrides a name the teacher typed', () => {
    expect(
      shouldRenameLesson({
        reply: PLAN,
        priorReplies: [],
        teacherNamedIt: true,
      })
    ).toBeNull();
  });

  test('stays quiet while the planner is still asking questions', () => {
    expect(
      shouldRenameLesson({
        reply: 'How long is your period?',
        priorReplies: [],
        teacherNamedIt: false,
      })
    ).toBeNull();
  });
});

describe("a lesson still named after the teacher's first message (Brian's review, B5)", () => {
  const first = "I'm teaching 'the things they carried' for the first time and I don't really know how to begin.";

  test('firstMessageTitle is the old 57-character cut', () => {
    expect(firstMessageTitle(first)).toBe(`${first.slice(0, 57)}…`);
    expect(firstMessageTitle('  short  ')).toBe('short');
    expect(firstMessageTitle('   ')).toBe('New lesson');
  });

  test('is provisional while the title is still that cut', () => {
    expect(
      nameIsProvisional({
        title: firstMessageTitle(first),
        packetTitle: null,
        firstUserMessage: first,
        unitDay: null,
      })
    ).toBe(true);
  });

  test('is not provisional once the plan renamed it', () => {
    expect(
      nameIsProvisional({
        title: 'The Things They Carried — Day 1',
        packetTitle: null,
        firstUserMessage: first,
        unitDay: null,
      })
    ).toBe(false);
  });

  test('a name the teacher typed always counts', () => {
    expect(
      nameIsProvisional({
        title: firstMessageTitle(first),
        packetTitle: 'TTTC day one',
        firstUserMessage: first,
        unitDay: null,
      })
    ).toBe(false);
  });

  test('a unit day is named by its unit, never provisional', () => {
    expect(
      nameIsProvisional({
        title: firstMessageTitle(first),
        packetTitle: null,
        firstUserMessage: first,
        unitDay: 2,
      })
    ).toBe(false);
  });
});

describe("a lesson still named after its first message takes the next plan's name (Brian's run 4)", () => {
  const plan = '# Catcher, chapters 1–4\n\n## Discussion (20 min)\n\nTalk.\n\n## Closing (5 min)\n\nWrap up.';
  test('an earlier plan named nothing: this one names it', () => {
    expect(shouldRenameLesson({ reply: plan, priorReplies: [plan.replace('# Catcher, chapters 1–4', '# Lesson Plan')], teacherNamedIt: false, stillPlaceholder: true })).toBe('Catcher, chapters 1–4');
  });
  test('already named from a plan: a revision does not rename it', () => {
    expect(shouldRenameLesson({ reply: plan, priorReplies: [plan], teacherNamedIt: false })).toBeNull();
  });
});

describe("no backstage language in titles (Brian's round 3, 1.1)", () => {
  test('drops the type tag and the duration the planner wrote', () => {
    expect(cleanLessonTitle('Day 1: The Man Who Made Himself (50 min) {type: context}')).toBe(
      'Day 1: The Man Who Made Himself'
    );
    expect(cleanLessonTitle('Read aloud (12 min) {type: read_aloud}')).toBe('Read aloud');
    expect(cleanLessonTitle('Day 2 — The Virtues · 50 min')).toBe('Day 2 — The Virtues');
    expect(cleanLessonTitle('Holden and the ducks (45–50 minutes)')).toBe('Holden and the ducks');
    expect(cleanLessonTitle('The essay [type: thesis_essay]')).toBe('The essay');
  });

  test("leaves a teacher's own words alone", () => {
    expect(cleanLessonTitle('Franklin: the self-made man')).toBe('Franklin: the self-made man');
    expect(cleanLessonTitle('Act 2 (scenes 1–3)')).toBe('Act 2 (scenes 1–3)');
    expect(cleanLessonTitle('[Draft] Gatsby')).toBe('[Draft] Gatsby');
    expect(cleanLessonTitle('2 mini-lessons on commas')).toBe('2 mini-lessons on commas');
  });

  test('never empties a title', () => {
    expect(cleanLessonTitle('{type: context}')).toBe('{type: context}');
    expect(cleanLessonTitle('  ')).toBe('');
  });

  test('a plan names the lesson without its tags', () => {
    const reply = ['# Day 1: The Man Who Made Himself (50 min) {type: context}', '', '## Class starter (5 min)', '', 'Write.', '', '## Read aloud (12 min)', '', 'Read.'].join('\n');
    expect(deriveLessonName(reply)).toBe('Day 1: The Man Who Made Himself');
  });

  test('the minutes a title gave, for a lesson that has no period', () => {
    expect(minutesInTitle('Day 1: The Man Who Made Himself (50 min) {type: context}')).toBe(50);
    expect(minutesInTitle('Day 1 — Franklin (45–50 minutes)')).toBe(50);
    expect(minutesInTitle('Franklin')).toBeNull();
    expect(minutesInTitle('Day 1 (5 min)')).toBeNull();
    // A step's length is not a period: a lesson named "Hook (15 min)" keeps none.
    expect(minutesInTitle('Hook (15 min) {type: activity}')).toBeNull();
  });
});
