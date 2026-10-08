/**
 * A reply, in the order it was written.
 *
 * Everything the planner hands over used to be lifted out of the plan and
 * stacked underneath it: the warm-up prompt, the Lounge deck, the handouts.
 * So a step saying "Warm-up — Daily Pages (7 min)" sat several inches above
 * the prompt it was talking about, and the button to assign it was further
 * down still, in a pile with everything else.
 *
 * Reading a lesson plan is following a sequence. The material belongs at the
 * step that uses it, which means the reply has to keep its own order rather
 * than being sorted into prose and not-prose.
 */
import { readLessonMaterials, type LessonMaterial } from './lesson-material';
import {
  readDailyPagesExercises,
  type DailyPagesExercise,
} from './daily-pages-block';
import {
  readPlannedExitTickets,
  type PlannedExitTicket,
} from './exit-ticket-block';
import { readLessonResources, type LessonResource } from './lesson-resource';
import { readPlannedPractice, type PlannedPractice } from './practice-block';

export type ReplyPart =
  | { kind: 'markdown'; text: string }
  | { kind: 'material'; material: LessonMaterial }
  | { kind: 'daily-pages'; exercise: DailyPagesExercise }
  | { kind: 'exit-ticket'; ticket: PlannedExitTicket }
  | { kind: 'resource'; resource: LessonResource }
  | { kind: 'practice'; practice: PlannedPractice };

/** Every fence that becomes something to look at, in one pass. */
const ANY_BLOCK =
  /```+(yawp-material|yawp-daily-pages|yawp-exit-ticket|yawp-resource|yawp-practice)[^\n]*\n[\s\S]*?```+/g;

/**
 * Split a reply into prose and the things it hands over, in document order.
 *
 * Each block is parsed by its own reader, one block at a time, so a block the
 * reader rejects simply produces nothing and never shifts the numbering of the
 * ones after it — material keys have to keep matching what the packet stored.
 */
export function splitReplyParts(content: string): ReplyPart[] {
  const parts: ReplyPart[] = [];
  let cursor = 0;
  let materialCount = 0;

  const pushText = (text: string) => {
    const trimmed = text.trim();
    if (trimmed) parts.push({ kind: 'markdown', text: trimmed });
  };

  for (const match of content.matchAll(ANY_BLOCK)) {
    const start = match.index ?? 0;
    pushText(content.slice(cursor, start));
    cursor = start + match[0].length;

    const block = match[0];
    if (match[1] === 'yawp-material') {
      const [material] = readLessonMaterials(block).materials;
      if (material) {
        // Re-key by position among the materials that parsed, exactly as
        // readLessonMaterials numbers them across the whole reply.
        parts.push({
          kind: 'material',
          material: { ...material, key: String(materialCount) },
        });
        materialCount += 1;
      }
    } else if (match[1] === 'yawp-daily-pages') {
      const [exercise] = readDailyPagesExercises(block).exercises;
      if (exercise) parts.push({ kind: 'daily-pages', exercise });
    } else if (match[1] === 'yawp-exit-ticket') {
      const [ticket] = readPlannedExitTickets(block).tickets;
      if (ticket) parts.push({ kind: 'exit-ticket', ticket });
    } else if (match[1] === 'yawp-practice') {
      const [practice] = readPlannedPractice(block).practices;
      if (practice) parts.push({ kind: 'practice', practice });
    } else {
      const [resource] = readLessonResources(block).resources;
      if (resource) parts.push({ kind: 'resource', resource });
    }
  }

  pushText(content.slice(cursor));
  return parts;
}

/** Everything the reply handed over, for the offers that depend on it. */
export function partsSummary(parts: ReplyPart[]): {
  materials: LessonMaterial[];
  hasHandout: boolean;
} {
  const materials = parts
    .filter(
      (part): part is Extract<ReplyPart, { kind: 'material' }> =>
        part.kind === 'material'
    )
    .map((part) => part.material);

  return {
    materials,
    hasHandout: materials.some((material) => material.audience === 'student'),
  };
}

/** Prose this long reads as advice worth filing even without headings. */
const KEEPABLE_PROSE_CHARS = 600;

/**
 * Whether "Add all of this" belongs under a reply.
 *
 * Most turns before a plan are questions — "Where are they in the book?" —
 * and offering to file one as a page of the lesson is noise under every
 * message. A reply earns the offer by handing something over: a card, a deck,
 * a map, a plan with structure, or advice long enough to want back.
 */
export function replyWorthKeeping(
  parts: ReplyPart[],
  {
    hasDeck = false,
    hasUnit = false,
  }: { hasDeck?: boolean; hasUnit?: boolean } = {}
): boolean {
  if (hasDeck || hasUnit) return true;
  if (parts.some((part) => part.kind !== 'markdown')) return true;
  const prose = parts
    .map((part) => (part.kind === 'markdown' ? part.text : ''))
    .join('\n\n');
  if (/^\s{0,3}#{1,3}\s+\S/m.test(prose)) return true;
  if (/^\s*\|.*\|\s*$/m.test(prose)) return true;
  return prose.length >= KEEPABLE_PROSE_CHARS;
}
