import { describe, expect, test } from 'bun:test';
import { syncAgendaToStack, type AgendaStep } from './deck-agenda';
import type { SlideDeck } from './slide-deck';

function deckWith(agenda: Array<{ title: string; minutes?: number }>): SlideDeck {
  return {
    title: 'The Man Who Made Himself',
    slides: [
      { layout: 'title', title: 'The Man Who Made Himself', speakerNotes: 'Settle.' },
      { layout: 'agenda', title: "Today's program", speakerNotes: 'The plan.', agenda },
      { layout: 'bullets', title: 'We meet Franklin', speakerNotes: 'Five things.', bullets: ['One'], minutes: 7 },
    ],
  } as unknown as SlideDeck;
}

// Brian's lesson, with the times he set on the stack.
const STACK: AgendaStep[] = [
  { title: 'The version of yourself you’re building', type: 'class_starter', minutes: 5 },
  { title: 'Context: Who Is Franklin, and Why Does He Matter Here?', type: 'context', minutes: 7 },
  { title: 'Read Aloud', type: 'read_aloud', minutes: 12 },
  { title: 'Close Reading Discussion', type: 'activity', minutes: 15 },
  { title: 'Franklin’s self-made method', type: 'daily_pages', minutes: 10 },
  { title: 'Closing', type: 'closing', minutes: 3 },
];

const AGENDA = [
  { title: 'Class starter', minutes: 5 },
  { title: 'Who is Franklin?', minutes: 7 },
  { title: 'Read aloud', minutes: 12 },
  { title: 'Close reading discussion', minutes: 16 },
  { title: 'Daily Pages', minutes: 8 },
  { title: 'Closing', minutes: 3 },
];

describe("the agenda slide keeps the stack's times (Brian's round 3, 1.4)", () => {
  test("Today's program matches the stack: 15 and 10, not 16 and 8", () => {
    const synced = syncAgendaToStack(deckWith(AGENDA), STACK);
    expect(synced.slides[1]!.agenda!.map((item) => [item.title, item.minutes])).toEqual([
      ['Class starter', 5],
      ['Who is Franklin?', 7],
      ['Read aloud', 12],
      ['Close reading discussion', 15],
      ['Daily Pages', 10],
      ['Closing', 3],
    ]);
  });

  test('matches by name and type when the agenda leaves steps out', () => {
    const synced = syncAgendaToStack(
      deckWith([
        { title: 'Daily Pages', minutes: 8 },
        { title: 'Close reading', minutes: 16 },
      ]),
      STACK
    );
    expect(synced.slides[1]!.agenda!.map((item) => item.minutes)).toEqual([10, 15]);
  });

  test('an item with no step keeps its own minutes; other slides are untouched', () => {
    const deck = deckWith([{ title: 'Gallery walk', minutes: 6 }, { title: 'Closing', minutes: 4 }]);
    const synced = syncAgendaToStack(deck, STACK);
    expect(synced.slides[1]!.agenda!.map((item) => item.minutes)).toEqual([6, 3]);
    expect(synced.slides[2]).toEqual(deck.slides[2]!);
    expect(synced.slides[0]).toBe(deck.slides[0]!);
  });

  test('nothing to sync: the same deck back', () => {
    const deck = deckWith(AGENDA);
    expect(syncAgendaToStack(deck, [])).toBe(deck);
    const noAgenda = { ...deck, slides: [deck.slides[0]!] } as SlideDeck;
    expect(syncAgendaToStack(noAgenda, STACK)).toBe(noAgenda);
  });

  test('a stack in the same order as the agenda fills a name that matches nothing', () => {
    const synced = syncAgendaToStack(
      deckWith([
        { title: 'Warm up', minutes: 4 },
        { title: 'Talk it out', minutes: 20 },
      ]),
      [
        { title: 'Bell ringer', type: 'activity', minutes: 6 },
        { title: 'Pair share', type: 'activity', minutes: 18 },
      ]
    );
    expect(synced.slides[1]!.agenda!.map((item) => item.minutes)).toEqual([6, 18]);
  });
});
