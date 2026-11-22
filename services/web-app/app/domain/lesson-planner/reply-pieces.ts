/**
 * Everything a reply hands over, as the keys the packet API files them by, in
 * the order the reply has them (Brian's run 2, A4: "add everything, then
 * refine in the stack").
 *
 * Steps come from the plan's headings; each block inside a step (a framing,
 * a class starter, an exit ticket) is a piece of its own and follows the step
 * it sits in. Keys are numbered exactly as `artifactFromAssistantReply` reads
 * them, so filing by key finds the same piece.
 */
import { readLessonMaterials } from './lesson-material';
import { readDailyPagesExercises, dailyPagesBlockKey } from './daily-pages-block';
import { readPlannedExitTickets } from './exit-ticket-block';
import { EXIT_TICKET_BLOCK_KEY, DECK_SLOT, deckAsMaterial } from './lesson-material';
import { readPlanSteps } from './plan-steps';
import { practiceBlockKey, readPlannedPractice } from './practice-block';

const FILEABLE_BLOCK =
  /```+(yawp-material|yawp-daily-pages|yawp-exit-ticket|yawp-practice|yawp-slides)[^\n]*\n[\s\S]*?```+/g;

export function pieceKeysInReply(content: string): string[] {
  return placedPieces(content)
    .filter((piece) => !piece.emptyStep)
    .map((piece) => piece.key);
}

/**
 * What "Add everything to the lesson" files: one lesson, not every option
 * (13-lesson review, Nov 22: stacks of 70 to 141 minutes for 50-minute
 * lessons, three class starters in a row, two Short Responses, and the
 * "wondering" exit ticket in place of the one that checks the objective).
 *
 * - A step offering a choice files its first option of each kind; the others
 *   stay one click away in the chat.
 * - One exit ticket: the first, which checks the lesson's objective.
 * - A step's minutes are spent once. A step with its own directions keeps
 *   its minutes, and what it holds (its prompt, its exit ticket, its lecture
 *   frames) is filed at 0 minutes, inside it. A step that is nothing but its
 *   blocks hands its minutes to them, shared out.
 */
export function keepAllPlan(content: string): { keys: string[]; minutes: Record<string, number> } {
  const pieces = placedPieces(content);
  const choices = stepsOfferingChoice(content);
  const skip = new Set<string>();
  const minutes: Record<string, number> = {};
  pieces.forEach((piece, index) => {
    if (!piece.step) return;
    const under = blocksUnder(pieces, index).map((key) => pieces.find((other) => other.key === key)!);
    // Of several Short Responses offered, the one written for this lesson
    // comes first: a general library prompt ("What ambition costs") is not
    // the lesson's writing (round 3, Nov 22: Macbeth's aside went unwritten).
    const held = choices.has(piece.key) ? [...under.filter((block) => block.ownPrompt), ...under.filter((block) => !block.ownPrompt)] : under;
    const kept: Placed[] = [];
    const seen = new Set<string>();
    for (const block of held) {
      const option = Boolean(block.block && OPTION_BLOCKS.has(block.block));
      if (choices.has(piece.key) && option && seen.has(block.block!)) skip.add(block.key);
      else {
        if (option) seen.add(block.block!);
        kept.push(block);
      }
    }
    if (!kept.length) return;
    if (piece.minutes == null) {
      // An untimed step ("## Passage handout") holding a printable: the page
      // is used in the timed steps, and takes none of the class's minutes
      // (re-test, Nov 22: Macbeth's passage handout added 20 minutes, filed
      // as its step and as itself). With nothing else to say, the step is
      // the printable.
      for (const block of kept) if (block.block === 'yawp-material') minutes[block.key] = 0;
      if (!piece.emptyStep && kept.length === 1 && kept[0]!.block === 'yawp-material') skip.add(piece.key);
      return;
    }
    // A step that is one writing assignment and its directions ("Quick write:
    // pick one of the three…") is that assignment: filing both reads as the
    // starter twice, once at 0 minutes (re-test, Nov 22). The assignment
    // stands for the step and takes its minutes.
    // A handout under the step is a page, not the step's work: it does not
    // keep the step from being its one assignment.
    const work = kept.filter((block) => !block.printable);
    for (const block of kept) if (block.printable) minutes[block.key] = 0;
    const sole = work.length === 1 ? work[0]! : null;
    if (!piece.emptyStep && sole && (sole.block === 'yawp-daily-pages' || sole.key === EXIT_TICKET_BLOCK_KEY)) {
      skip.add(piece.key);
      minutes[sole.key] = piece.minutes;
      return;
    }
    if (!piece.emptyStep) for (const block of kept) minutes[block.key] = 0;
    else if (work.length < kept.length) {
      for (const block of work) minutes[block.key] = work.length === 1 ? piece.minutes : 0;
    } else {
      const share = Math.max(1, Math.floor(piece.minutes / kept.length));
      kept.forEach((block, i) => {
        minutes[block.key] = i === kept.length - 1 ? Math.max(1, piece.minutes! - share * (kept.length - 1)) : share;
      });
    }
  });
  let ticketKept = false;
  const keys = pieces
    .filter((piece) => !piece.emptyStep && !skip.has(piece.key))
    .filter((piece) => {
      if (piece.block !== 'yawp-exit-ticket') return true;
      if (ticketKept) return false;
      ticketKept = true;
      return true;
    })
    .map((piece) => piece.key);
  return { keys: withHandoutsWhereRead(keys, pieces), minutes };
}

const READS = /\b(read|reading|annotat|close|passage|aside|soliloquy|stanza|sonnet|poem|prologue|excerpt|model)/i;

/**
 * A handout filed with the step that reads it, not at the end of the lesson
 * because the reply printed it last (round 3, Nov 22: Hamlet's soliloquy and
 * Macbeth's passage came after the exit ticket, at 0 minutes).
 */
function withHandoutsWhereRead(keys: string[], pieces: Placed[]): string[] {
  const byKey = new Map(pieces.map((piece) => [piece.key, piece]));
  const reading = keys.find((key) => byKey.get(key)?.step && READS.test(byKey.get(key)!.title ?? ''));
  if (!reading) return keys;
  const moving = keys.filter((key, i) => byKey.get(key)?.printable && i > keys.indexOf(reading));
  if (!moving.length) return keys;
  const rest = keys.filter((key) => !moving.includes(key));
  const at = rest.indexOf(reading) + 1;
  return [...rest.slice(0, at), ...moving, ...rest.slice(at)];
}

/**
 * Minutes for the blocks that stand for their step: under "## Exit ticket
 * (10 min)" with nothing but the ticket, the ticket is the step, and its 10
 * minutes should not be lost when it is filed (Brian's run 2, B2).
 */
export function blockMinutesInReply(content: string): Record<string, number> {
  const minutes: Record<string, number> = {};
  const pieces = placedPieces(content);
  pieces.forEach((piece, index) => {
    if (!piece.emptyStep || piece.minutes == null) return;
    const held = blocksUnder(pieces, index);
    // A step holding several blocks (three framing notes under "Framing
    // (10 min)") does not hand its whole time to the first of them.
    if (held.length === 1) minutes[held[0]!] = piece.minutes;
  });
  return minutes;
}

/**
 * Minutes for a block that is the only one under a step with its own words
 * ("## Mini-lecture (12 min)", a line of directions, then the notes). Only
 * for a card the teacher adds on its own (Kevin's notes): filed with the rest
 * of the reply, the step itself carries those minutes.
 */
export function soleBlockStepMinutes(content: string): Record<string, number> {
  const minutes: Record<string, number> = {};
  const pieces = placedPieces(content);
  pieces.forEach((piece, index) => {
    if (!piece.step || piece.emptyStep || piece.minutes == null) return;
    const held = blocksUnder(pieces, index);
    if (held.length === 1) minutes[held[0]!] = piece.minutes;
  });
  return minutes;
}

/** Where a piece sits in its reply, counting steps and blocks in reading order. */
export function pieceRankInReply(content: string, key: string): number {
  const keys = placedPieces(content).map((piece) => piece.key);
  const at = keys.indexOf(key);
  return at < 0 ? keys.length : at;
}

/** The block keys that sit under the step at `index`, up to the next step. */
function blocksUnder(pieces: Placed[], index: number): string[] {
  const keys: string[] = [];
  for (const piece of pieces.slice(index + 1)) {
    if (piece.step) break;
    // The deck belongs to the lesson, not to the step it happens to follow.
    if (piece.key !== DECK_SLOT) keys.push(piece.key);
  }
  return keys;
}

/**
 * What each plan step files as, for its one Add to lesson button and its one
 * status, wherever it appears (Brian's run 3, items 1, 2). A step with its own
 * text is itself; a step that is nothing but its blocks ("## Class starter"
 * over the prompt, "## Framing" over three notes) is those blocks, so adding
 * from the step or from the block card is the same add.
 */
export function stepSegments(content: string): Record<string, string[]> {
  const segments: Record<string, string[]> = {};
  const pieces = placedPieces(content);
  pieces.forEach((piece, index) => {
    if (!piece.step) return;
    segments[piece.key] = piece.emptyStep ? blocksUnder(pieces, index) : [piece.key];
  });
  return segments;
}

/** The blocks under each step, the deck aside, by step key. */
export function stepBlockKeys(content: string): Record<string, string[]> {
  const under: Record<string, string[]> = {};
  const pieces = placedPieces(content);
  pieces.forEach((piece, index) => {
    if (piece.step) under[piece.key] = blocksUnder(pieces, index);
  });
  return under;
}

/** Blocks that are alternatives when a step holds more than one: the teacher picks one. */
const OPTION_BLOCKS = new Set(['yawp-daily-pages', 'yawp-exit-ticket', 'yawp-practice']);

/**
 * The steps that offer a choice: two or more class starters, Daily Pages
 * prompts, exit tickets or practice sets under one step (Kevin, Oct 22). Each
 * option has its own Add to lesson, and the step's own button cannot know
 * which one is meant, so it is not shown.
 */
export function stepsOfferingChoice(content: string): Set<string> {
  const offering = new Set<string>();
  const pieces = placedPieces(content);
  pieces.forEach((piece, index) => {
    if (!piece.step) return;
    const counts = new Map<string, number>();
    for (const held of pieces.slice(index + 1)) {
      if (held.step) break;
      if (held.block && OPTION_BLOCKS.has(held.block)) counts.set(held.block, (counts.get(held.block) ?? 0) + 1);
    }
    if ([...counts.values()].some((count) => count > 1)) offering.add(piece.key);
  });
  return offering;
}

/**
 * Minutes for an option picked on its own from a step that offers a choice
 * (Brian's run 4, item 2). Only one of "## Closing (5 min)"'s three exit
 * tickets will be used, so the one picked carries the Closing's 5 minutes
 * and the lesson still adds up, without a second card for the step.
 */
export function optionStepMinutes(content: string): Record<string, number> {
  const minutes: Record<string, number> = {};
  const pieces = placedPieces(content);
  const choices = stepsOfferingChoice(content);
  pieces.forEach((piece, index) => {
    if (!piece.step || piece.minutes == null || !choices.has(piece.key)) return;
    for (const key of blocksUnder(pieces, index)) {
      const block = pieces.find((other) => other.key === key)?.block;
      if (block && OPTION_BLOCKS.has(block)) minutes[key] = piece.minutes;
    }
  });
  return minutes;
}

/** A segment is in the stack when every piece it files as is. */
export function segmentInStack(
  messageId: string,
  keys: string[],
  added: ReadonlySet<string>
): boolean {
  return keys.length > 0 && keys.every((key) => added.has(`${messageId}:${key}`));
}

type Placed = {
  at: number;
  order: number;
  key: string;
  /** The fence a block came from, for telling options apart from a set. */
  block?: string;
  step?: boolean;
  emptyStep?: boolean;
  minutes?: number | null;
  /** A step's heading. */
  title?: string;
  /** A handout: a page students hold, used in whichever step reads it. */
  printable?: boolean;
  /** A Short Response written for this lesson (no library id). */
  ownPrompt?: boolean;
};

function placedPieces(content: string): Placed[] {
  const placed: Placed[] = [];
  for (const step of readPlanSteps(content)) {
    // A step that is nothing but its block ("## Class starter" over the
    // prompt) is that block; filing an empty step beside it says nothing.
    placed.push({
      at: step.at,
      order: 0,
      key: step.key,
      step: true,
      emptyStep: !step.content.trim(),
      minutes: step.minutes,
      title: step.title,
    });
  }

  let materials = 0;
  let exercises = 0;
  let tickets = 0;
  let practices = 0;
  let deckFiled = false;
  for (const match of content.matchAll(FILEABLE_BLOCK)) {
    const at = match.index ?? 0;
    const block = match[0];
    const push = (key: string, order: number) => placed.push({ at, order, key, block: match[1] });
    if (match[1] === 'yawp-material') {
      const read = readLessonMaterials(block).materials;
      if (read.length) {
        push(String(materials++), 1);
        if (read[0]!.kind === 'handout') placed[placed.length - 1]!.printable = true;
      }
    } else if (match[1] === 'yawp-daily-pages') {
      readDailyPagesExercises(block).exercises.forEach((exercise, index) => {
        push(dailyPagesBlockKey(exercises++), 1 + index / 100);
        if (exercise.kind === 'daily-pages' && !exercise.promptId) placed[placed.length - 1]!.ownPrompt = true;
      });
    } else if (match[1] === 'yawp-exit-ticket') {
      if (readPlannedExitTickets(block).tickets.length) {
        push(tickets === 0 ? EXIT_TICKET_BLOCK_KEY : `${EXIT_TICKET_BLOCK_KEY}:${tickets}`, 1);
        tickets += 1;
      }
    } else if (match[1] === 'yawp-practice') {
      if (readPlannedPractice(block).practices.length) push(practiceBlockKey(practices++), 1);
    } else if (!deckFiled && deckAsMaterial(content)) {
      // A lesson has one deck: the reply's first.
      push(DECK_SLOT, 1);
      deckFiled = true;
    }
  }

  return placed.sort((a, b) => a.at - b.at || a.order - b.order);
}
