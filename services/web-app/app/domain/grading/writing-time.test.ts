import { describe, expect, test } from 'bun:test';

import {
  MAX_WRITING_TIME_MINUTES,
  buildGrammarCheckerRetryUserPrompt,
  buildGrammarCheckerSystemPrompt,
  buildGrammarCheckerUserPrompt,
  buildWritingTimeGradingBlock,
  defaultWritingTimeMinutesForKind,
  describeWritingTime,
  parseWritingTimeMinutes,
} from './writing-time';

function form(entries: Array<[string, string]>) {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe('parseWritingTimeMinutes', () => {
  /**
   * Absent and blank are different answers. Absent means the form never sent
   * the field — an older caller — so an edit must leave the stored value
   * alone. Blank means the teacher cleared it: no time context.
   */
  test('reports an absent field as not sent', () => {
    expect(parseWritingTimeMinutes(form([]))).toEqual({
      success: true,
      sent: false,
      value: null,
    });
  });

  test('reads a blank field as no writing time', () => {
    expect(
      parseWritingTimeMinutes(form([['writingTimeMinutes', '  ']]))
    ).toEqual({ success: true, sent: true, value: null });
  });

  test('reads whole minutes', () => {
    expect(
      parseWritingTimeMinutes(form([['writingTimeMinutes', '15']]))
    ).toEqual({ success: true, sent: true, value: 15 });
  });

  test.each(['0', '-5', '7.5', 'ten', String(MAX_WRITING_TIME_MINUTES + 1)])(
    'rejects %p',
    (raw) => {
      const result = parseWritingTimeMinutes(
        form([['writingTimeMinutes', raw]])
      );
      expect(result.success).toBe(false);
    }
  );
});

describe('defaultWritingTimeMinutesForKind', () => {
  test('suggests fifteen minutes for Daily Pages, as its about page says', () => {
    expect(defaultWritingTimeMinutesForKind('daily_pages')).toBe(15);
  });

  test('suggests ten minutes for a Class Starter', () => {
    expect(defaultWritingTimeMinutesForKind('class_starter')).toBe(10);
  });

  test('suggests nothing for other kinds, or none', () => {
    expect(defaultWritingTimeMinutesForKind('thesis_driven_essay')).toBeNull();
    expect(defaultWritingTimeMinutesForKind(null)).toBeNull();
  });
});

describe('describeWritingTime', () => {
  test.each([
    [1, '1 minute'],
    [10, '10 minutes'],
    [60, '1 hour'],
    [90, '1 hour 30 minutes'],
    [120, '2 hours'],
  ])('%p minutes reads as %p', (minutes, expected) => {
    expect(describeWritingTime(minutes)).toBe(expected);
  });
});

describe('buildWritingTimeGradingBlock', () => {
  test('is empty without a writing time, so the prompt is unchanged', () => {
    expect(buildWritingTimeGradingBlock(null)).toBe('');
    expect(buildWritingTimeGradingBlock(undefined)).toBe('');
  });

  test('tells the assistant how long the student had and to calibrate to it', () => {
    const block = buildWritingTimeGradingBlock(10);
    expect(block).toContain('10 minutes');
    expect(block).toMatch(/not .*revised/i);
    // Calibration is not leniency: the thinking is still held to account.
    expect(block).toMatch(/errors that get in the reader's way still count/i);
  });
});

describe('buildGrammarCheckerSystemPrompt', () => {
  test('without a writing time, is the checker prompt used before this setting', () => {
    const prompt = buildGrammarCheckerSystemPrompt(null);
    expect(prompt.startsWith('You are the Grammar/Usage Checker.')).toBe(true);
    expect(prompt.endsWith('Style:\n(10) Omit needless words.')).toBe(true);
    expect(prompt).not.toContain('Writing time');
  });

  test('with a writing time, stops marking deliberate fragments', () => {
    const prompt = buildGrammarCheckerSystemPrompt(10);
    expect(prompt).toContain('10 minutes');
    expect(prompt).toMatch(/fragment used on purpose/i);
    expect(prompt).toMatch(/do not mark/i);
  });

  test('skips style notes for short timed writing', () => {
    expect(buildGrammarCheckerSystemPrompt(15)).toMatch(
      /do not return any issue of kind "style"/i
    );
  });

  test('keeps style notes when the student had real time to revise', () => {
    expect(buildGrammarCheckerSystemPrompt(90)).not.toMatch(
      /do not return any issue of kind "style"/i
    );
  });
});

describe('grammar checker user prompts', () => {
  test('without a writing time, are the prompts used before this setting', () => {
    expect(buildGrammarCheckerUserPrompt('Text.', null)).toBe(
      'Essay:\nText.\n\nReturn up to 15 issues.'
    );
    expect(buildGrammarCheckerRetryUserPrompt('Text.', null)).toBe(
      'Essay:\nText.\n\nReturn 8-12 issues using the exact schema. Do not include markdown.'
    );
  });

  /**
   * The retry used to demand eight to twelve issues. On a ten-minute
   * paragraph that is an instruction to invent errors.
   */
  test('with a writing time, never asks for a minimum number of issues', () => {
    const retry = buildGrammarCheckerRetryUserPrompt('Text.', 10);
    expect(retry).not.toMatch(/8-12/);
    expect(retry).toMatch(/only real issues/i);
    expect(buildGrammarCheckerUserPrompt('Text.', 10)).toContain(
      'Written in 10 minutes'
    );
  });
});
