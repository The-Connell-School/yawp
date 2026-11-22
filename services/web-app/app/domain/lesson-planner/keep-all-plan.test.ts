/**
 * "Add everything to the lesson" files one lesson, not every option
 * (13-lesson review, Nov 22). The fixtures are real planner replies from that
 * review: their stacks came to 80 and 141 minutes for 50-minute lessons.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { fileableMaterial } from './fileable-material';
import { readPlanSteps } from './plan-steps';
import { keepAllPlan, pieceKeysInReply } from './reply-pieces';
import { stackTiming, timeFixes } from './stack-timing';

const fixture = (name: string) => readFileSync(join(import.meta.dir, 'fixtures', name), 'utf8');
const MACBETH = fixture('reply-macbeth-1-3.md');
const ACHEBE = fixture('reply-things-fall-apart-day-1.md');
const GATSBY = fixture('reply-gatsby-ch-1.md');

/** What the stack would hold: each kept piece and its minutes, as filed. */
function filed(content: string) {
  const plan = keepAllPlan(content);
  return plan.keys.map((key) => {
    const material = fileableMaterial(content, key)!;
    return { key, kind: material.kind, title: material.title, minutes: plan.minutes[key] ?? material.minutes ?? null };
  });
}

describe('keepAllPlan: one lesson, not every option', () => {
  for (const [name, content] of [['Macbeth', MACBETH], ['Things Fall Apart', ACHEBE], ['Gatsby', GATSBY]] as const) {
    test(`${name}: one class starter, one exit ticket, no writing counted twice`, () => {
      const pieces = filed(content);
      expect(pieces.filter((piece) => piece.kind === 'class-starter').length).toBeLessThanOrEqual(1);
      expect(pieces.filter((piece) => piece.kind === 'exit-ticket').length).toBe(1);
      // Every option and every exit ticket were offered; only one of each is filed.
      expect(pieceKeysInReply(content).length).toBeGreaterThan(pieces.length);
    });

    test(`${name}: the stack adds up to the plan's 50 minutes, give or take the deck`, () => {
      const total = filed(content)
        .filter((piece) => piece.kind !== 'slides')
        .reduce((sum, piece) => sum + (piece.minutes ?? 0), 0);
      expect(total).toBeGreaterThanOrEqual(45);
      expect(total).toBeLessThanOrEqual(55);
    });
  }

  test('the exit ticket filed is the first, the one that checks the objective, not the "wondering" reflection', () => {
    const ticket = filed(MACBETH).find((piece) => piece.kind === 'exit-ticket')!;
    expect(ticket.key).toBe('ticket');
  });

  test('a step that is one writing prompt and its directions is filed as the prompt, with the step’s minutes (re-test: no 0-minute twin)', () => {
    const pieces = filed(MACBETH);
    const writing = pieces.filter((piece) => /ambition costs|short response/i.test(piece.title));
    expect(writing.map((piece) => piece.minutes)).toEqual([12]);
    expect(writing[0]!.kind).not.toBe('step');
  });

  test('no assignment is filed twice, and none at 0 minutes beside its own step', () => {
    for (const content of [MACBETH, ACHEBE, GATSBY]) {
      const pieces = filed(content);
      const starters = pieces.filter((piece) => piece.kind === 'class-starter');
      expect(starters.every((piece) => (piece.minutes ?? 0) > 0)).toBe(true);
    }
  });
});

describe('a subtitle written as a heading is not a step', () => {
  test('"## *Things Fall Apart* · English 10 · 50 minutes" is not a 50-minute step', () => {
    const steps = readPlanSteps(ACHEBE);
    expect(steps.some((step) => /English 10/.test(step.title))).toBe(false);
    expect(steps.map((step) => step.title)).toContain('Class starter');
  });
});

describe('the ways back on time never cut the reading', () => {
  test('the longest non-writing step that is not reading is the one trimmed', () => {
    const timing = stackTiming(
      [
        { id: 'a', title: 'Close reading: the aside', type: 'activity', minutes: 15, isWriting: false },
        { id: 'b', title: 'Read aloud', type: 'read_aloud', minutes: 14, isWriting: false },
        { id: 'c', title: 'Context: the scene so far', type: 'context', minutes: 12, isWriting: false },
        { id: 'd', title: 'Short Response', type: 'daily_pages', minutes: 15, isWriting: true },
      ] as never,
      50
    );
    const trim = timeFixes(timing).find((fix) => fix.id === 'trim');
    expect(trim?.text).toContain('Context: the scene so far');
  });
});
