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
import { isTeacherTalk, studentWritingTask } from './step-types';

export type WritingTypeIds = {
  dailyPages: string | null;
  classStarter: string | null;
  exitTicket: string | null;
  /** The Thesis-Driven Essay's type, for its modules (run 3). */
  thesis?: string | null;
  /** The Pre-Writing type, for a pre-write step (Kevin, Nov 6). */
  prewriting?: string | null;
};

/** The writing types a prompt can become, as the chooser names them. */
export type CreateType = 'class-starter' | 'daily-pages' | 'prewriting' | 'thesis-statement' | 'exit-ticket';

export type CreateOption = {
  type: CreateType;
  /** "Class Starter", "Pre-Writing": the type's name. */
  name: string;
  href: string;
};

export type StackCreateLink = {
  label: string;
  href: string;
  created?: boolean;
  /** Where it was made: "in the planner chat" / "on the stack" (Oct 24 handoff). */
  where?: string | null;
  /**
   * The same prompt as each other writing type the school has (Kevin, Nov 6):
   * the teacher's way out when the guess is wrong, a pre-write made into a
   * Class Starter. The default keeps `href`; these are the alternatives.
   */
  options?: CreateOption[];
};

const CREATE_TYPE_NAMES: Record<CreateType, string> = {
  'class-starter': 'Class Starter',
  'daily-pages': 'Daily Pages',
  prewriting: 'Pre-Writing',
  'thesis-statement': 'Thesis Statement',
  'exit-ticket': 'Exit Ticket',
};

/** The prompt types this school has, in the order the chooser lists them. */
function promptTypes(typeIds: WritingTypeIds): Array<{ type: CreateType; id: string }> {
  return (
    [
      ['class-starter', typeIds.classStarter],
      ['daily-pages', typeIds.dailyPages],
      ['prewriting', typeIds.prewriting ?? null],
      ['thesis-statement', typeIds.thesis ?? null],
    ] as Array<[CreateType, string | null]>
  ).flatMap(([type, id]) => (id ? [{ type, id }] : []));
}

/** A pre-write, by its title or its prompt line (Kevin, Nov 6). */
const PRE_WRITE = /\bpre[- ]?writ(?:e|es|ing)\b/i;

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

/** What students write in a step written as prose: the one rule in step-types (Brian, Nov 4). */
export function proseWritingTask(title: string, content: string, stepType?: string | null) {
  return studentWritingTask(title, hidePromptIds(content), stepType);
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
  const fromStack = (href: string) => {
    const url = new URL(withPiece(href, materialId ? materialRef(materialId) : null), 'http://local');
    url.searchParams.set(BACK_PARAM, 'stack');
    return `${url.pathname}?${url.searchParams}`;
  };
  const { type, prompt, ...rest } = link;
  // The same prompt as each other type the school has (Kevin, Nov 6).
  const options = prompt
    ? promptTypes(typeIds)
        .filter((candidate) => candidate.type !== type)
        .map((candidate) => ({
          type: candidate.type,
          name: CREATE_TYPE_NAMES[candidate.type],
          href: fromStack(dailyPagesCreateHref(candidate.id, prompt, conversationId)),
        }))
    : [];
  return { ...rest, href: fromStack(link.href), ...(options.length ? { options } : {}) };
}

/** A link with what made it: the type it goes to and the prompt it carries. */
type ChosenLink = StackCreateLink & { type: CreateType; prompt: string | null };

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
}): ChosenLink | null {
  // The teacher talking is not an assignment (Brian, Nov 4).
  if (kind === 'step' && isTeacherTalk(title)) return null;
  const talk = stepType === 'context' || stepType === 'read_aloud';
  if (kind === 'step' && (stepType === 'thesis_essay' || (!talk && /\bthesis\b/i.test(title)))) {
    const prompt = hidePromptIds(content).trim();
    if (!typeIds.thesis || !prompt) return null;
    return {
      type: 'thesis-statement',
      prompt: firstLine(prompt),
      label: 'Create this Thesis Essay assignment in Yawp!',
      href: dailyPagesCreateHref(typeIds.thesis, firstLine(prompt), conversationId),
    };
  }
  if (kind === 'step') {
    const task = proseWritingTask(title, content, stepType);
    if (task?.kind === 'exit-ticket' && typeIds.exitTicket) {
      const href = proseTicketHref(typeIds.exitTicket, task.prompt, conversationId);
      return href ? { type: 'exit-ticket', prompt: task.prompt, label: 'Create this exit ticket in Yawp!', href } : null;
    }
    if (task?.kind === 'quick-write') {
      // A pre-write goes to Pre-Writing where the school has it (Kevin, Nov 6);
      // any quick write to Class Starter, else Daily Pages, as before.
      if (typeIds.prewriting && (PRE_WRITE.test(title) || PRE_WRITE.test(firstLine(content)))) {
        return {
          type: 'prewriting',
          prompt: task.prompt,
          label: 'Create this pre-write in Yawp!',
          href: dailyPagesCreateHref(typeIds.prewriting, task.prompt, conversationId),
        };
      }
      const shortWriting = typeIds.classStarter
        ? { type: 'class-starter' as const, id: typeIds.classStarter }
        : typeIds.dailyPages
          ? { type: 'daily-pages' as const, id: typeIds.dailyPages }
          : null;
      if (shortWriting) {
        return {
          type: shortWriting.type,
          prompt: task.prompt,
          label: 'Create this quick write in Yawp!',
          href: dailyPagesCreateHref(shortWriting.id, task.prompt, conversationId),
        };
      }
    }
    return null;
  }
  if (kind === 'class-starter' || kind === 'daily-pages') {
    const typeId = kind === 'class-starter' ? typeIds.classStarter : typeIds.dailyPages;
    const prompt = hidePromptIds(content).trim();
    if (!typeId || !prompt) return null;
    return {
      type: kind,
      prompt,
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
      type: 'exit-ticket',
      prompt: ticket.prompt,
      label: 'Create this exit ticket in Yawp!',
      href: exitTicketCreateHref(typeIds.exitTicket, ticket, conversationId),
    };
  }
  return null;
}
