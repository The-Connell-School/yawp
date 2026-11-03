import { describe, expect, test } from 'bun:test';
import { stripPlanPreamble } from './plan-framing';

describe("stripPlanPreamble (Brian's run 3, item 3)", () => {
  test('drops the model’s opener above the plan', () => {
    expect(stripPlanPreamble("I have everything I need. Here's the plan.\n\n# Day One\n\n## Hook")).toBe(
      '# Day One\n\n## Hook'
    );
    expect(stripPlanPreamble('Perfect — that helps.\nHere’s your lesson:\n\n## Hook')).toBe('## Hook');
  });

  test('leaves real opening prose alone', () => {
    const text = 'Students meet O’Brien through the things they carry.\n\n## Hook';
    expect(stripPlanPreamble(text)).toBe(text);
  });
});
