/**
 * "Create this … in YAWP!" from the stack (Brian's run 2, A5, item 5).
 *
 * A writing piece in the stack should become a real assignment from right
 * there, the same choice the chat offers, rather than only a handout.
 */
import { dailyPagesCreateHref } from './daily-pages-block';
import { exitTicketCreateHref, readPlannedExitTickets } from './exit-ticket-block';
import { EXIT_TICKET_BLOCK_KEY } from './lesson-material';
import { hidePromptIds } from './prompt-ids';

export type WritingTypeIds = {
  dailyPages: string | null;
  classStarter: string | null;
  exitTicket: string | null;
};

export type StackCreateLink = { label: string; href: string };

function exitTicketIndex(blockKey: string): number {
  if (blockKey === EXIT_TICKET_BLOCK_KEY) return 0;
  const index = Number(blockKey.slice(EXIT_TICKET_BLOCK_KEY.length + 1));
  return Number.isInteger(index) && index >= 0 ? index : 0;
}

export function stackCreateLink({
  kind,
  content,
  blockKey,
  sourceContent,
  typeIds,
  conversationId,
}: {
  kind: string;
  /** The piece as filed (or as the teacher edited it). */
  content: string;
  blockKey: string;
  /** The reply it came from, for an exit ticket's settings. */
  sourceContent: string | null;
  typeIds: WritingTypeIds;
  conversationId: string;
}): StackCreateLink | null {
  if (kind === 'class-starter' || kind === 'daily-pages') {
    const typeId = kind === 'class-starter' ? typeIds.classStarter : typeIds.dailyPages;
    const prompt = hidePromptIds(content).trim();
    if (!typeId || !prompt) return null;
    return {
      label:
        kind === 'class-starter'
          ? 'Create this class starter in YAWP!'
          : 'Create this Daily Pages prompt in YAWP!',
      href: dailyPagesCreateHref(typeId, prompt, conversationId),
    };
  }
  if (kind === 'exit-ticket') {
    if (!typeIds.exitTicket || !sourceContent) return null;
    const ticket = readPlannedExitTickets(sourceContent).tickets[exitTicketIndex(blockKey)];
    if (!ticket) return null;
    return {
      label: 'Create this exit ticket in YAWP!',
      href: exitTicketCreateHref(typeIds.exitTicket, ticket, conversationId),
    };
  }
  return null;
}
