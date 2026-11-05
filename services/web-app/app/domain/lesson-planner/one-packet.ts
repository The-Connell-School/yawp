/**
 * "Get everything in one packet (PDF)" (Oct 24 handoff, task 2): the lesson
 * plan, then the slides, then the handouts, in that order. The packet used to
 * print in stack order and only a deck filed in the stack, so a deck built
 * and never added was missing from it.
 */
import type { LessonPacket, PacketSection } from './lesson-packet';
import type { SlideDeck } from './slide-deck';

export const ONE_PACKET_CAPTION = 'Lesson plan, slides and handouts, in that order.';

export function onePacketOrder(packet: LessonPacket, builtDeck: SlideDeck | null): LessonPacket {
  const slides = packet.sections.filter((section) => section.deck);
  const handouts = packet.sections.filter((section) => !section.deck && section.audience === 'student');
  const plan = packet.sections.filter((section) => !section.deck && section.audience !== 'student');
  if (!slides.length && builtDeck) slides.push(builtDeckSection(builtDeck));
  return { ...packet, sections: [...plan, ...slides, ...handouts] };
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
