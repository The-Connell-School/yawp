/**
 * A chat line on the stack page changes the stack (Kevin's note on Brian's
 * run 3, item 7): "shorten the hook to 10 minutes" updates the hook card and
 * the total, and the answer is one line with Undo — never a long reply. The
 * long back-and-forth stays in the planner.
 *
 * This file is the pure half: the operations a line can turn into, a fast
 * path that needs no model for the common "make X N minutes", the checks every
 * operation passes before it touches the stack, and the one-line answer.
 */
import { z } from 'zod';
import { clampMinutes } from './stack-timing';
import { STEP_TYPES, STEP_TYPE_LABELS, type StepType } from './step-types';

export type CommandStep = {
  id: string;
  title: string;
  type: StepType;
  minutes: number;
  isWriting: boolean;
};

export const STACK_OPS = z.discriminatedUnion('op', [
  z.object({ op: z.literal('set_minutes'), stepId: z.string().min(1), minutes: z.number().int() }),
  z.object({ op: z.literal('rewrite_step'), stepId: z.string().min(1), content: z.string().min(1).max(6000) }),
  z.object({ op: z.literal('rename'), stepId: z.string().min(1), title: z.string().min(1).max(120) }),
  z.object({ op: z.literal('move'), stepId: z.string().min(1), toIndex: z.number().int().min(0) }),
  z.object({ op: z.literal('remove'), stepId: z.string().min(1) }),
]);

export type StackOp = z.infer<typeof STACK_OPS>;

/** A new piece the planner proposes, shown as a card the teacher can add. */
export const PROPOSED_PIECE = z.object({
  title: z.string().min(1).max(120),
  minutes: z.number().int().min(1).max(120),
  type: z.enum(STEP_TYPES),
  text: z.string().min(1).max(4000),
});

export type ProposedPiece = z.infer<typeof PROPOSED_PIECE>;

export const COMMAND_RESULT = z.object({
  reply: z.string().min(1).max(160),
  ops: z.array(STACK_OPS).max(12).default([]),
  pieces: z.array(PROPOSED_PIECE).max(3).default([]),
  /** The line is for the planner, not the stack: nothing is applied. */
  toPlanner: z.boolean().optional(),
});

export type CommandResult = z.infer<typeof COMMAND_RESULT>;

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, 'twenty-five': 25, thirty: 30,
};

function readNumber(raw: string): number | null {
  const value = Number(raw);
  if (Number.isFinite(value)) return value;
  return WORD_NUMBERS[raw.toLowerCase()] ?? null;
}

const STOP = new Set(['the', 'a', 'an', 'my', 'our', 'this', 'that', 'step', 'part', 'piece', 'one']);

/** The step a teacher means by "the hook", "read aloud", "the closing". */
export function findStep(phrase: string, steps: CommandStep[]): CommandStep | null {
  const words = phrase
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !STOP.has(word));
  if (!words.length) return null;
  const scored = steps
    .map((step) => {
      const haystack = `${step.title} ${STEP_TYPE_LABELS[step.type]}`.toLowerCase();
      const hits = words.filter((word) => haystack.includes(word)).length;
      return { step, hits };
    })
    .filter((entry) => entry.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  if (!scored.length) return null;
  // Two steps matching equally ("frame" with three framings) is a question,
  // not a guess.
  if (scored[1] && scored[1].hits === scored[0]!.hits) return null;
  return scored[0]!.step;
}

const SET_MINUTES =
  /^\s*(?:please\s+)?(?:shorten|cut|trim|lengthen|extend|make|set|give|change|bump|drop|reduce|increase)\s+(?:the\s+)?(.+?)\s+(?:(?:to|at|down to|up to)\s+)?(\d{1,3}|[a-z-]+)\s*(?:min(?:ute)?s?)\.?\s*$/i;
const REMOVE = /^\s*(?:please\s+)?(?:remove|drop|delete|cut|take out)\s+(?:the\s+)?(.+?)\.?\s*$/i;

/** The common changes, read without a model. Null: ask the model. */
export function quickCommand(line: string, steps: CommandStep[]): CommandResult | null {
  const timed = SET_MINUTES.exec(line);
  if (timed) {
    const step = findStep(timed[1]!, steps);
    const minutes = readNumber(timed[2]!);
    if (!step || minutes == null) return null;
    return {
      reply: `${shortName(step)} set to ${clampMinutes(minutes)} min.`,
      ops: [{ op: 'set_minutes', stepId: step.id, minutes: clampMinutes(minutes) }],
      pieces: [],
    };
  }
  const removed = REMOVE.exec(line);
  if (removed && !/\bmin(?:ute)?s?\b/i.test(line)) {
    const step = findStep(removed[1]!, steps);
    if (!step) return null;
    return { reply: `Removed ${shortName(step)}.`, ops: [{ op: 'remove', stepId: step.id }], pieces: [] };
  }
  return null;
}

function shortName(step: CommandStep): string {
  const title = step.title.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return title.length > 40 ? STEP_TYPE_LABELS[step.type] : title;
}

/**
 * Only operations on this stack's own steps, with sane values, survive. A
 * writing step is never removed or shortened by a model on its own say-so:
 * the teacher asked for it in so many words, or it stays.
 */
export function checkOps(
  ops: StackOp[],
  steps: CommandStep[],
  line: string
): StackOp[] {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const namesWriting = /\b(writ|daily pages|class starter|starter|exit ticket|thesis|journal)/i.test(line);
  return ops.flatMap((op): StackOp[] => {
    const step = byId.get(op.stepId);
    if (!step) return [];
    if (op.op === 'set_minutes') {
      const minutes = clampMinutes(op.minutes);
      if (step.isWriting && minutes < step.minutes && !namesWriting) return [];
      return [{ ...op, minutes }];
    }
    if (op.op === 'remove' && step.isWriting && !namesWriting) return [];
    if (op.op === 'move') return [{ ...op, toIndex: Math.min(op.toIndex, steps.length - 1) }];
    return [op];
  });
}

export const STACK_COMMAND_SYSTEM = [
  'You change a teacher’s lesson stack on their stack page. The teacher is refining the lesson, not exploring it.',
  'Return JSON only: {"reply": string, "ops": [...], "pieces": [...], "toPlanner": boolean}.',
  '- reply: one line, at most 12 words, saying what changed ("Hook shortened to 10 min."). No questions back, no suggestions, no lists.',
  '- ops: the changes, using only the step ids given. Each is one of:',
  '  {"op":"set_minutes","stepId":"…","minutes":10}',
  '  {"op":"rewrite_step","stepId":"…","content":"the step’s new text, in the same voice, only that step"}',
  '  {"op":"rename","stepId":"…","title":"…"}',
  '  {"op":"move","stepId":"…","toIndex":0}',
  '  {"op":"remove","stepId":"…"}',
  '- Change only what the teacher asked for. Never touch another step. Never cut or shorten a writing step unless the teacher names it.',
  '- pieces: when the teacher asks for something new ("a quick pair activity after the read aloud"), one to three new pieces, each {"title","minutes","type","text"} with type one of class_starter, activity, context, read_aloud, daily_pages, thesis_essay, closing. Do not add them to ops; the teacher adds the one they want.',
  '- toPlanner: true, with no ops and no pieces, when the line is a question or a bigger change that belongs in the planner chat (why something works, rethink the lesson). Then reply "That’s one for the planner."',
  '- Write the product name as Yawp!. Never write a library prompt id.',
].join('\n');

export function commandUserMessage({
  line,
  steps,
  periodMinutes,
  contentById,
  insertAfter,
}: {
  line: string;
  steps: CommandStep[];
  periodMinutes: number | null;
  contentById: Record<string, string>;
  insertAfter?: string | null;
}): string {
  return [
    periodMinutes ? `Period: ${periodMinutes} minutes.` : null,
    'Stack, in order:',
    ...steps.map((step, index) =>
      [
        `${index + 1}. id=${step.id} · ${STEP_TYPE_LABELS[step.type]}${step.isWriting ? ' · writing' : ''} · ${step.minutes} min · ${step.title}`,
        `   ${(contentById[step.id] ?? '').replace(/\s+/g, ' ').slice(0, 600)}`,
      ].join('\n')
    ),
    insertAfter ? `A new piece would go after: ${insertAfter}` : null,
    '',
    `Teacher: ${line}`,
  ]
    .filter((part): part is string => part !== null)
    .join('\n');
}

export function readCommandResult(text: string): CommandResult | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = COMMAND_RESULT.safeParse(JSON.parse(text.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** A proposed piece as the stack-surface reply carries it: a material block. */
export function fencePiece(piece: ProposedPiece): string {
  return [
    '```yawp-material',
    'kind: notes',
    'audience: teacher',
    `title: ${piece.title.replace(/\n/g, ' ')}`,
    `minutes: ${piece.minutes}`,
    `type: ${piece.type}`,
    `slot: piece:${Math.random().toString(36).slice(2, 10)}`,
    '---',
    piece.text.trim(),
    '```',
  ].join('\n');
}

export type { StepType };
