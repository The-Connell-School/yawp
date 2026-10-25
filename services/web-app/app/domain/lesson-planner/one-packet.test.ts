import { describe, expect, test } from 'bun:test';
import { onePacketOrder, ONE_PACKET_CAPTION, packetParts, slidesPerPage } from './one-packet';
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
    expect(ONE_PACKET_CAPTION).toBe('One PDF, in this order.');
  });
});

// Brian's round 4, item 5: Print a packet for class.
describe('the class packet: the parts the teacher checked', () => {
  const lesson = () =>
    packet([
      section('handout', { audience: 'student', kind: 'handout' }),
      section('hook'),
      section('deck', { kind: 'slides', deck: deck('Slides') }),
    ]);

  test('no parts asked for is everything, as before', () => {
    expect(packetParts(null)).toEqual(['plan', 'slides', 'handouts']);
    expect(onePacketOrder(lesson(), null, packetParts(null)).sections.map((s) => s.id)).toEqual(['hook', 'deck', 'handout']);
  });

  test('skipping the slides prints the plan and the handouts in one go', () => {
    const parts = packetParts('plan,handouts');
    expect(parts).toEqual(['plan', 'handouts']);
    expect(onePacketOrder(lesson(), deck('Built'), parts).sections.map((s) => s.id)).toEqual(['hook', 'handout']);
  });

  test('parts keep the packet order, and unknown ones are dropped', () => {
    expect(packetParts('handouts,nonsense,plan')).toEqual(['plan', 'handouts']);
    expect(packetParts('nonsense')).toEqual(['plan', 'slides', 'handouts']);
  });

  test('slides per page: 4 unless 2 was asked for', () => {
    expect(slidesPerPage('2')).toBe(2);
    expect(slidesPerPage('4')).toBe(4);
    expect(slidesPerPage(null)).toBe(4);
    expect(slidesPerPage('9')).toBe(4);
  });
});
