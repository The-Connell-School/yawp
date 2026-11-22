import { describe, expect, test } from 'bun:test';
import { withoutRunawayBlanks } from './runaway-blanks';

describe('withoutRunawayBlanks', () => {
  test('thousands of escaped underscores become one short blank', () => {
    const reply = `Name: __________\n\nWrite here: ${'\\_'.repeat(3000)}\n\nNext.`;
    const out = withoutRunawayBlanks(reply);
    expect(out).toBe('Name: __________\n\nWrite here: __________\n\nNext.');
  });
  test('a short blank, a rule and a name line are left alone', () => {
    const reply = 'Name: ____________________\n\n---\n\n[__________]';
    expect(withoutRunawayBlanks(reply)).toBe(reply);
  });
});
