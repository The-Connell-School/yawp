/**
 * "Create this … in Yawp!" from the stack (Brian's run 2, A5, item 5).
 *
 * A writing piece in the stack should become a real assignment from right
 * there, the same choice the chat offers, rather than only a handout.
 */
import { dailyPagesCreateHref } from './daily-pages-block';
import { exitTicketCreateHref, readPlannedExitTickets } from './exit-ticket-block';
import { EXIT_TICKET_BLOCK_KEY } from './lesson-material';
import { createdWhere, materialRef, type CreatedFrom } from './assignment-links';
import { lessonPlaceHref, readLessonPlace } from './lesson-return';
import { hidePromptIds } from './prompt-ids';

export type WritingTypeIds = {
  dailyPages: string | null;
  classStarter: string | null;
  exitTicket: string | null;
  /** The Thesis-Driven Essay's type, for its modules (run 3). */
  thesis?: string | null;
};

export type StackCreateLink = {
  label: string;
  href: string;
  created?: boolean;
  /** Where it was made: "in the planner chat" / "on the stack" (Oct 24 handoff). */
  where?: string | null;
};

/** Which lesson piece a create link came from, so the sheet can say so back. */
export const FROM_PIECE_PARAM = 'fromPiece';

/**
 * Where "Back to your lesson" goes (Brian's run 4, item 4): a sheet opened
 * from the stack page returns to the run of show, not to the chat.
 */
export const BACK_PARAM = 'back';

export function lessonBackHref(conversationId: string, back: string | null): string {
  return lessonPlaceHref(conversationId, readLessonPlace(back, 'chat'));
}

/** Set on the way back once a piece is made, so the lesson can say so (Kevin's note 6b). */
export const MADE_PARAM = 'made';
export const MADE_NOTICE = 'Created in Yawp! and added to your lesson.';

export function lessonMadeHref(conversationId: string, back: string | null): string {
  const url = new URL(lessonBackHref(conversationId, back), 'http://local');
  url.searchParams.set(MADE_PARAM, '1');
  return `${url.pathname}?${url.searchParams}`;
}

/**
 * The Create link names the piece it came from, so the lesson can record the
 * assignment once it exists: "b:<messageId>:<blockKey>" from the chat (filed
 * or not), "m:<materialId>" from the stack (Oct 24 handoff, task 1).
 */
export function withPiece(href: string, pieceRef?: string | null): string {
  if (!pieceRef) return href;
  const url = new URL(href, 'http://local');
  url.searchParams.set(FROM_PIECE_PARAM, pieceRef);
  return `${url.pathname}?${url.searchParams}`;
}

/**
 * What students write in a step written as prose (Brian's run 3, item 4: "if
 * students write during a step, the step gets the button"): an exit ticket,
 * or a quick write. Null when nobody writes.
 */
export function proseWritingTask(
  title: string,
  content: string
): { kind: 'exit-ticket' | 'quick-write'; prompt: string } | null {
  const text = hidePromptIds(content).replace(/\*\*|__/g, '');
  const ticket = /\bexit (?:ticket|slip)\b\s*[:—–-]\s*([^\n]+)/i.exec(text);
  if (ticket) return { kind: 'exit-ticket', prompt: ticket[1]!.trim() };
  if (/\bexit (?:ticket|slip)\b/i.test(title) && text.trim()) {
    return { kind: 'exit-ticket', prompt: firstLine(text) };
  }
  // Brian's run 5 (item 6): reflections and pre-writes are writing too.
  const writes =
    /\b(?:quick[- ]?write|free[- ]?write|pre[- ]?write|journal|(?:written|writing a) reflection|reflection (?:writing|paragraph|prompt)|written (?:response|answer)|(?:one|a)[- ]sentence (?:written )?(?:answer|response)|(?:write|jot)s?\b[^.\n]{0,40}\bin (?:their|your) (?:notes|notebooks?)|\d+\s*(?:seconds?|minutes?|min) of writing|students write|write for (?:\d+|one|two|three|four|five|a few) min)/i;
  if (writes.test(title) || writes.test(text)) {
    const quoted = /["“]([^"”]{8,300})["”]/.exec(text)?.[1];
    return { kind: 'quick-write', prompt: (quoted ?? firstLine(text)).trim() };
  }
  return null;
}

function firstLine(text: string): string {
  return (text.split('\n').find((line) => line.trim()) ?? '').replace(/^[-*>\s]+/, '').trim();
}

/** A ticket the planner wrote in prose, as the sheet's own custom ticket. */
function proseTicketHref(typeId: string, prompt: string, conversationId: string): string | null {
  const fence = `\`\`\`yawp-exit-ticket\nmode: basic\nprompt: custom\npromptText: ${prompt.replace(/\n/g, ' ')}\n\`\`\``;
  const ticket = readPlannedExitTickets(fence).tickets[0];
  return ticket ? exitTicketCreateHref(typeId, ticket, conversationId) : null;
}

function exitTicketIndex(blockKey: string): number {
  if (blockKey === EXIT_TICKET_BLOCK_KEY) return 0;
  const index = Number(blockKey.slice(EXIT_TICKET_BLOCK_KEY.length + 1));
  return Number.isInteger(index) && index >= 0 ? index : 0;
}

export function stackCreateLink({
  kind,
  title = '',
  stepType = null,
  content,
  blockKey,
  sourceContent,
  typeIds,
  conversationId,
  materialId = null,
  created = null,
}: {
  kind: string;
  /** The piece's title, which can say what students do ("Quick write"). */
  title?: string;
  /** The planner's type for a step, e.g. a Thesis Essay module. */
  stepType?: string | null;
  /** The filed piece, so the sheet can tell the stack it was created. */
  materialId?: string | null;
  /** Already created from this piece: where to open it, and where it was made. */
  created?: { href: string; from?: CreatedFrom | null } | null;
  /** The piece as filed (or as the teacher edited it). */
  content: string;
  blockKey: string;
  /** The reply it came from, for an exit ticket's settings. */
  sourceContent: string | null;
  typeIds: WritingTypeIds;
  conversationId: string;
}): StackCreateLink | null {
  if (created) {
    return { label: 'Assignment created', href: created.href, created: true, where: createdWhere(created.from ?? null) };
  }
  const link = createLinkFor({ kind, title, stepType, content, blockKey, sourceContent, typeIds, conversationId });
  if (!link) return null;
  const url = new URL(withPiece(link.href, materialId ? materialRef(materialId) : null), 'http://local');
  url.searchParams.set(BACK_PARAM, 'stack');
  return { ...link, href: `${url.pathname}?${url.searchParams}` };
}

function createLinkFor({
  kind,
  title,
  stepType,
  content,
  blockKey,
  sourceContent,
  typeIds,
  conversationId,
}: {
  kind: string;
  title: string;
  stepType: string | null;
  content: string;
  blockKey: string;
  sourceContent: string | null;
  typeIds: WritingTypeIds;
  conversationId: string;
}): StackCreateLink | null {
  if (kind === 'step' && (stepType === 'thesis_essay' || /\bthesis\b/i.test(title))) {
    const prompt = hidePromptIds(content).trim();
    if (!typeIds.thesis || !prompt) return null;
    return {
      label: 'Create this Thesis Essay assignment in Yawp!',
      href: dailyPagesCreateHref(typeIds.thesis, firstLine(prompt), conversationId),
    };
  }
  if (kind === 'step') {
    const task = proseWritingTask(title, content);
    if (task?.kind === 'exit-ticket' && typeIds.exitTicket) {
      const href = proseTicketHref(typeIds.exitTicket, task.prompt, conversationId);
      return href ? { label: 'Create this exit ticket in Yawp!', href } : null;
    }
    const shortWriting = typeIds.classStarter ?? typeIds.dailyPages;
    if (task?.kind === 'quick-write' && shortWriting) {
      return {
        label: 'Create this quick write in Yawp!',
        href: dailyPagesCreateHref(shortWriting, task.prompt, conversationId),
      };
    }
    return null;
  }
  if (kind === 'class-starter' || kind === 'daily-pages') {
    const typeId = kind === 'class-starter' ? typeIds.classStarter : typeIds.dailyPages;
    const prompt = hidePromptIds(content).trim();
    if (!typeId || !prompt) return null;
    return {
      label:
        kind === 'class-starter'
          ? 'Create this class starter in Yawp!'
          : 'Create this Daily Pages prompt in Yawp!',
      href: dailyPagesCreateHref(typeId, prompt, conversationId),
    };
  }
  if (kind === 'exit-ticket') {
    if (!typeIds.exitTicket || !sourceContent) return null;
    const ticket = readPlannedExitTickets(sourceContent).tickets[exitTicketIndex(blockKey)];
    if (!ticket) return null;
    return {
      label: 'Create this exit ticket in Yawp!',
      href: exitTicketCreateHref(typeIds.exitTicket, ticket, conversationId),
    };
  }
  return null;
}
