import { describe, expect, test } from 'bun:test';
import { buildTemplateSection, slotsFromSteps, templateShape, templateTiming } from './lesson-templates';

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
