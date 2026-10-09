import {
  deckAsMaterial,
  DECK_SLOT,
  EXIT_TICKET_BLOCK_KEY,
  readLessonMaterials,
  type LessonMaterial,
} from './lesson-material';
import {
  readPlannedExitTickets,
  type PlannedExitTicket,
} from './exit-ticket-block';

export function exitTicketAsMaterial(
  ticket: PlannedExitTicket,
  key: string = EXIT_TICKET_BLOCK_KEY
): LessonMaterial {
  const title =
    ticket.config.mode === 'specific' && ticket.config.topic.trim()
      ? `Exit ticket: ${ticket.config.topic}`
      : 'Exit ticket';
  return {
    key,
    slot: EXIT_TICKET_BLOCK_KEY,
    kind: 'exit-ticket',
    title,
    audience: 'student',
    content: ticket.prompt,
  };
}

/** Re-read one artifact from a saved assistant reply for packet filing. */
export function artifactFromAssistantReply(
  content: string,
  materialKey: string
): LessonMaterial | null {
  if (materialKey === DECK_SLOT) {
    return deckAsMaterial(content);
  }
  if (
    materialKey === EXIT_TICKET_BLOCK_KEY ||
    materialKey.startsWith(`${EXIT_TICKET_BLOCK_KEY}:`)
  ) {
    const index =
      materialKey === EXIT_TICKET_BLOCK_KEY
        ? 0
        : Number(materialKey.slice(EXIT_TICKET_BLOCK_KEY.length + 1));
    const { tickets } = readPlannedExitTickets(content);
    const ticket = tickets[index];
    return ticket ? exitTicketAsMaterial(ticket, materialKey) : null;
  }
  const { materials } = readLessonMaterials(content);
  return materials.find((item) => item.key === materialKey) ?? null;
}
