/**
 * The class packet (Oct 24 handoff, task 2; "Print a packet for class" since
 * Brian's round 4, item 5): the lesson
 * plan, then the slides, then the handouts, in that order. The packet used to
 * print in stack order and only a deck filed in the stack, so a deck built
 * and never added was missing from it.
 */
import type { LessonPacket, PacketSection } from './lesson-packet';
import type { SlideDeck } from './slide-deck';

/** Under the checklist: what's checked prints as one PDF, in this order. */
export const ONE_PACKET_CAPTION = 'One PDF, in this order.';

/** The parts of "Print a packet for class" (Brian's round 4, item 5), in packet order. */
export const PACKET_PARTS = ['plan', 'slides', 'handouts'] as const;
export type PacketPart = (typeof PACKET_PARTS)[number];

/** `?parts=plan,handouts`; none, or none known, is everything (old links). */
export function packetParts(raw: string | null | undefined): PacketPart[] {
  const asked = new Set((raw ?? '').split(','));
  const parts = PACKET_PARTS.filter((part) => asked.has(part));
  return parts.length ? parts : [...PACKET_PARTS];
}

/** Slides printed 2 or 4 to a page; 4 keeps the packet short. */
export type SlidesPerPage = 2 | 4;
export function slidesPerPage(raw: string | null | undefined): SlidesPerPage {
  return raw === '2' ? 2 : 4;
}

export function onePacketOrder(
  packet: LessonPacket,
  builtDeck: SlideDeck | null,
  parts: readonly PacketPart[] = PACKET_PARTS
): LessonPacket {
  const slides = packet.sections.filter((section) => section.deck);
  const handouts = packet.sections.filter((section) => !section.deck && section.audience === 'student');
  const plan = packet.sections.filter((section) => !section.deck && section.audience !== 'student');
  if (!slides.length && builtDeck) slides.push(builtDeckSection(builtDeck));
  return {
    ...packet,
    sections: [
      ...(parts.includes('plan') ? plan : []),
      ...(parts.includes('slides') ? slides : []),
      ...(parts.includes('handouts') ? handouts : []),
    ],
  };
}

function builtDeckSection(deck: SlideDeck): PacketSection {
  return {
    id: 'built-deck',
    title: deck.title,
    content: '',
    audience: 'teacher',
    kind: 'slides',
    origin: 'material',
    materials: [],
    edited: false,
    deck,
    deckFailed: false,
    anchor: 'built-deck',
  };
}
