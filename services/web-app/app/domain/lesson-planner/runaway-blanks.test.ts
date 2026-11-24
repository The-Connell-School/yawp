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
  test('a runaway of &nbsp; inside a sentence is a blank; one alone on its line is a line of room (rules test, Nov 23: the Odyssey deck lost)', () => {
    const reply = `Heroic reason: ${'&nbsp;'.repeat(6911)}\n\nNext.`;
    expect(withoutRunawayBlanks(reply)).toBe('Heroic reason: __________ \n\nNext.');
    expect(withoutRunawayBlanks(`Answer:\n${'&nbsp;&nbsp;&nbsp;&nbsp;'}\nNext.`)).toBe('Answer:\n&nbsp;\nNext.');
    const room = 'Write here:\n' + '&nbsp;\n'.repeat(5) + 'Next.';
    expect(withoutRunawayBlanks(room)).toBe(room);
    expect(withoutRunawayBlanks('Write:\n' + '&nbsp;\n'.repeat(40) + 'Next.')).toBe('Write:\n' + '&nbsp;\n'.repeat(8) + 'Next.');
  });
});
