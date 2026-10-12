import { describe, expect, test } from 'bun:test';
import { planStepKey, planStepIndexForKey, readPlanSteps } from './plan-steps';

const PLAN = [
  '# The Things They Carried — Day 1 (50 min)',
  '',
  'Intro line.',
  '',
  '## Class starter (5 min)',
  '',
  'Students write on the prompt below.',
  '',
  '```yawp-daily-pages',
  'kind: class-starter',
  'id: FW-021',
  'What do you carry?',
  '```',
  '',
  '## Read aloud (20 min)',
  '',
  'If you like reading aloud yourself, take the first pages.',
  '',
  '### Questions to ask',
  '',
  '- What does Cross carry?',
  '',
  '## Pair talk (8 min)',
  '',
  'Pairs compare one item.',
].join('\n');

describe("readPlanSteps (Brian's run 2, A3)", () => {
  test('one step per ## heading, with its minutes and its own text', () => {
    const steps = readPlanSteps(PLAN);
    expect(steps.map((step) => step.title)).toEqual(['Class starter', 'Read aloud', 'Pair talk']);
    expect(steps.map((step) => step.minutes)).toEqual([5, 20, 8]);
    expect(steps.map((step) => step.key)).toEqual(['st', 'st:1', 'st:2']);
    expect(steps[1]!.content).toContain('If you like reading aloud yourself');
    // Sub-headings belong to their step.
    expect(steps[1]!.content).toContain('### Questions to ask');
    expect(steps[1]!.content).toContain('What does Cross carry?');
  });

  test("a step's blocks are pieces of their own, not part of its text", () => {
    const [starter] = readPlanSteps(PLAN);
    expect(starter!.content).toBe('Students write on the prompt below.');
    expect(starter!.content).not.toContain('yawp-daily-pages');
  });

  test('a plan written in bold, timed steps', () => {
    const steps = readPlanSteps(
      '**Class starter (5 min)** — write about what you carry.\n\n**Read aloud** (20 min): the first pages.\nAsk who carries what.\n\n**Pair talk (8 min)**\nCompare.'
    );
    expect(steps.map((step) => step.title)).toEqual(['Class starter', 'Read aloud', 'Pair talk']);
    expect(steps[1]!.content).toContain('Ask who carries what.');
  });

  test('a reply that is not a plan has no steps', () => {
    expect(readPlanSteps('Which class is this for?')).toEqual([]);
    expect(readPlanSteps('## Only one heading (5 min)\n\nText.')).toEqual([]);
  });

  test('keys fit the packet API and round-trip', () => {
    expect(planStepKey(0)).toBe('st');
    expect(planStepKey(12)).toBe('st:12');
    expect(planStepKey(99).length).toBeLessThanOrEqual(8);
    expect(planStepIndexForKey('st')).toBe(0);
    expect(planStepIndexForKey('st:3')).toBe(3);
    expect(planStepIndexForKey('dp:3')).toBeNull();
  });
});
