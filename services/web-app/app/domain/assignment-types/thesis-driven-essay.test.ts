import { describe, expect, test } from 'bun:test';
import { isThesisDrivenEssayTitle } from './thesis-driven-essay';

describe('isThesisDrivenEssayTitle', () => {
  test('matches the title however it is cased or padded', () => {
    expect(isThesisDrivenEssayTitle('The Thesis-Driven Essay')).toBe(true);
    expect(isThesisDrivenEssayTitle('  the thesis-driven essay ')).toBe(true);
  });

  test('does not match other essay types', () => {
    expect(isThesisDrivenEssayTitle('The 5-Paragraph Essay')).toBe(false);
    expect(isThesisDrivenEssayTitle('Daily Pages')).toBe(false);
  });
});
