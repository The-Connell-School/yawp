import { describe, expect, test } from 'bun:test';
import { shortTitle } from './short-title';

describe("shortTitle (Brian's run 3, item 11)", () => {
  test('the first clause, not the prompt cut mid-word', () => {
    expect(
      shortTitle('O’Brien lists what every soldier carries — down to the ounce. What would your list say about you?')
    ).toBe('O’Brien lists what every soldier carries');
  });

  test('a long clause ends at a word, with no ellipsis', () => {
    const title = shortTitle(
      'Think about something heavy that you once carried for somebody else without ever telling them about it'
    );
    expect(title.length).toBeLessThanOrEqual(48);
    expect(title).not.toContain('…');
    expect(title).toBe('Think about something heavy that you once');
  });

  test('short prompts stay whole', () => {
    expect(shortTitle('What do you carry?')).toBe('What do you carry');
    expect(shortTitle('> "Write about your bag."')).toBe('Write about your bag');
  });
});
