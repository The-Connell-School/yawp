import { describe, expect, test } from 'bun:test';
import { buildTemplateSection, frameworkShape, slotsFromSteps, TEMPLATE_DAYS, templateDaysFromFramework, templateShape, templateTiming } from './lesson-templates';
import { DEFAULT_STEP_MINUTES } from './step-types';

const SLOTS = slotsFromSteps([
  { type: 'class_starter', minutes: 5, isWriting: true },
  { type: 'context', minutes: 4, isWriting: false },
  { type: 'context', minutes: 3, isWriting: false },
  { type: 'read_aloud', minutes: 15, isWriting: false },
  { type: 'daily_pages', minutes: 12, isWriting: true },
  { type: 'closing', minutes: 11, isWriting: false },
]);

describe('lesson templates (stack page redesign)', () => {
  test('the shape, with repeats folded', () => {
    expect(templateShape(SLOTS)).toBe('Class Starter → Context → Read aloud → Daily Pages → Closing');
  });

  test('the shape keeps the order and timing, and its writing share', () => {
    const timing = templateTiming({ slots: SLOTS, periodMinutes: 50 });
    expect(timing.total).toBe(50);
    expect(timing.writingPercent).toBe(34);
  });

  test('the planner fills the slots for the new topic and does not ask the length', () => {
    const section = buildTemplateSection({ id: 't1', name: 'Read & write day', slots: SLOTS, periodMinutes: 50 }).join('\n');
    expect(section).toContain('"Read & write day"');
    expect(section).toContain('1. Class Starter, 5 min');
    expect(section).toContain('Do not ask how long the period is');
    expect(buildTemplateSection(null)).toEqual([]);
  });
});

describe("a week's framework (Brian's run 5, round 2)", () => {
  const framework = {
    sourceMessageId: 'm1',
    days: [
      { day: 1, title: 'The Brian Connell Show', minutes: 50, steps: [{ title: 'Hook', minutes: 5, type: 'activity' as const }, { title: 'Mini-lecture', minutes: 25, type: 'context' as const }] },
      { day: 2, title: 'Close reading', minutes: 50, steps: [{ title: 'Close reading', minutes: null, type: null }] },
    ],
  };
  test('days keep their steps’ types and minutes, never their words', () => {
    const days = templateDaysFromFramework(framework);
    expect(days[0]!.slots).toEqual([
      { type: 'activity', minutes: 5, label: 'Hook' },
      { type: 'context', minutes: 25, label: 'Mini-lecture' },
    ]);
    expect(days[1]!.slots[0]).toMatchObject({ type: 'activity', minutes: DEFAULT_STEP_MINUTES.activity });
    expect(frameworkShape(days)).toBe('Day 1 The Brian Connell Show · Day 2 Close reading');
    expect(TEMPLATE_DAYS.safeParse(days).success).toBe(true);
  });
  test('the planner is told to keep the week and write it one # Day heading per day', () => {
    const days = templateDaysFromFramework(framework);
    const section = buildTemplateSection({ id: 't', name: 'Weekly Flow', slots: days[0]!.slots, periodMinutes: 50, days }).join('\n');
    expect(section).toContain('their 2-day framework "Weekly Flow"');
    expect(section).toContain('Day 1: The Brian Connell Show');
    expect(section).toContain('  - Mini-lecture (Context), 25 min');
    expect(section).toContain('Do not ask how long the period is or what the structure is');
  });
});
