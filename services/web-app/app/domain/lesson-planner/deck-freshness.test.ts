import { describe, expect, test } from 'bun:test';
import { deckFreshness, deckKeyOf, stackKeyOf } from './deck-freshness';

const steps = [
  { id: 'a', minutes: 5, kind: 'class-starter' },
  { id: 'b', minutes: 20, kind: 'step' },
];
const deck = { id: 'deck-1', content: 'slides v1' };

describe("deck freshness (Kevin's note 9)", () => {
  test('a first deck is stored, not stale', () => {
    expect(deckFreshness(null, deckKeyOf(deck, steps))).toEqual({ stale: false, store: deckKeyOf(deck, steps) });
  });

  test('the same deck and steps: fresh, nothing to store', () => {
    const key = deckKeyOf(deck, steps);
    expect(deckFreshness(key, key)).toEqual({ stale: false, store: null });
  });

  test('steps reordered, retimed or added after the deck: stale', () => {
    const key = deckKeyOf(deck, steps);
    expect(deckFreshness(key, deckKeyOf(deck, [steps[1]!, steps[0]!])).stale).toBe(true);
    expect(deckFreshness(key, deckKeyOf(deck, [steps[0]!, { ...steps[1]!, minutes: 25 }])).stale).toBe(true);
    expect(deckFreshness(key, deckKeyOf(deck, [...steps, { id: 'c', minutes: 5, kind: 'exit-ticket' }])).stale).toBe(true);
  });

  test('a rebuilt deck starts again', () => {
    const key = deckKeyOf(deck, steps);
    const rebuilt = deckKeyOf({ id: 'deck-1', content: 'slides v2' }, [steps[0]!]);
    expect(deckFreshness(key, rebuilt)).toEqual({ stale: false, store: rebuilt });
  });

  test('the deck in the steps does not count', () => {
    expect(stackKeyOf([...steps, { id: 'deck-1', minutes: null, kind: 'slides' }])).toBe(stackKeyOf(steps));
  });

  test('no deck: nothing to say', () => {
    expect(deckFreshness('old', null)).toEqual({ stale: false, store: null });
  });
});
