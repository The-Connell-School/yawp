import { describe, expect, test } from 'bun:test';
import { hidePromptIds } from './prompt-ids';

describe("hidePromptIds (Brian's run 2, items 17, 21, 26)", () => {
  test('drops the footer a filed class starter used to carry', () => {
    expect(
      hidePromptIds('Write about something you carry.\n\n_Class Starter prompt FW-021_')
    ).toBe('Write about something you carry.');
    expect(hidePromptIds('Explain your claim.\n\n_Daily Pages prompt sf-ev-03_')).toBe(
      'Explain your claim.'
    );
  });

  test('takes an inline id out of plan prose and keeps the sentence', () => {
    expect(
      hidePromptIds('**Class starter (5 min)** — Daily Pages prompt FW-001: "What do you carry?"')
    ).toBe('**Class starter (5 min)** — "What do you carry?"');
    expect(hidePromptIds('Use prompt FW-093 here.')).toBe('Use this prompt here.');
    expect(hidePromptIds('- FW-024: "Name a weight."')).toBe('- "Name a weight."');
    expect(hidePromptIds('A prompt (FW-024) to open.')).toBe('A prompt to open.');
    expect(hidePromptIds('- **FW-093** — "What is heavy?"')).toBe('- "What is heavy?"');
  });

  test('leaves text with no ids alone', () => {
    const text = 'Read pages 1–5. Discuss in pairs for 5 minutes.';
    expect(hidePromptIds(text)).toBe(text);
  });

  test('leaves the fence header the app reads alone', () => {
    const fence = '```yawp-daily-pages\nid: FW-001\nWhat do you carry?\n```';
    expect(hidePromptIds(fence)).toBe(fence);
  });
});

describe('hidePromptIds around fences', () => {
  test('scrubs the prose on both sides of a fence and keeps the fence', () => {
    const text =
      'Open with prompt FW-001.\n\n```yawp-daily-pages\nid: FW-001\nWhat do you carry?\n```\n\nThen FW-002: "Next."';
    expect(hidePromptIds(text)).toBe(
      'Open with this prompt.\n\n```yawp-daily-pages\nid: FW-001\nWhat do you carry?\n```\n\nThen "Next."'
    );
  });

  test('a bare code mid-sentence goes too', () => {
    expect(hidePromptIds('Try FW-093 or sf-ev-03 next.')).toBe('Try or next.');
  });

  test('indentation of nested bullets survives', () => {
    expect(hidePromptIds('- Starter\n  - FW-001: "Carry."')).toBe('- Starter\n  - "Carry."');
  });
});
