import { describe, expect, test } from 'bun:test';
import { onePacketOrder, ONE_PACKET_CAPTION } from './one-packet';
import type { LessonPacket, PacketSection } from './lesson-packet';
import type { SlideDeck } from './slide-deck';

const deck = (title: string): SlideDeck =>
  ({ title, slides: [{ layout: 'title', title, speakerNotes: 'x', minutes: 1 }] }) as SlideDeck;

const section = (id: string, overrides: Partial<PacketSection> = {}): PacketSection => ({
  id,
  title: id,
  content: `${id} body`,
  audience: 'teacher',
  kind: 'plan',
  origin: 'material',
  materials: [],
  edited: false,
  deck: null,
  deckFailed: false,
  anchor: id,
  ...overrides,
});

const packet = (sections: PacketSection[]): LessonPacket => ({
  title: 'Day One',
  className: null,
  sections,
  outline: [],
  totalMinutes: 0,
});

describe("one packet: lesson plan, slides, handouts (Oct 24 handoff, task 2)", () => {
  test('in that order, whatever the stack order', () => {
    const ordered = onePacketOrder(
      packet([
        section('handout', { audience: 'student', kind: 'handout' }),
        section('hook'),
        section('deck', { kind: 'slides', deck: deck('Slides') }),
        section('closing'),
      ]),
      null
    );
    expect(ordered.sections.map((s) => s.id)).toEqual(['hook', 'closing', 'deck', 'handout']);
  });

  test('a deck built but never added to the stack still goes in', () => {
    const ordered = onePacketOrder(packet([section('hook'), section('handout', { audience: 'student' })]), deck('Built'));
    expect(ordered.sections.map((s) => s.id)).toEqual(['hook', 'built-deck', 'handout']);
    expect(ordered.sections[1]?.deck?.title).toBe('Built');
  });

  test("the stack's own deck wins over one built and not added", () => {
    const ordered = onePacketOrder(packet([section('deck', { kind: 'slides', deck: deck('Filed') })]), deck('Built'));
    expect(ordered.sections.map((s) => s.deck?.title)).toEqual(['Filed']);
  });

  test('the caption says so', () => {
    expect(ONE_PACKET_CAPTION).toBe('Lesson plan, slides and handouts, in that order.');
  });
});
