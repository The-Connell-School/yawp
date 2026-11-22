/**
 * Handouts for any step (Brian's run 3, item 8): "If we're wanting to make
 * handouts, we should be able to make a handout for any part of the lesson."
 *
 * A step students already hold (a class starter, Daily Pages, an exit
 * ticket, a handout) prints as it is. A step written for the teacher (the
 * hook, a framing note, the closing) prints as a version written for
 * students: what to do, never the teacher's moves. Writing steps get answer
 * lines sized to the task.
 */
import { createHash } from 'node:crypto';
import { LESSON_STEP_KIND } from './lesson-material';
import { planStepIndexForKey, readPlanSteps } from './plan-steps';
import { stepBlockKeys } from './reply-pieces';
import type { StackStep } from './stack-steps';
import { passageFirst } from './handout-passage';

export { passageFirst };

const STUDENT_KINDS = new Set(['class-starter', 'daily-pages', 'exit-ticket', 'handout', 'sample']);

/** Prints as it is: it was written for students. */
export function isStudentFacing(kind: string): boolean {
  return STUDENT_KINDS.has(kind);
}

/** Lines to write on: about one and a half per minute of writing, 4 to 20. */
export function answerLinesFor(step: Pick<StackStep, 'isWriting' | 'minutes' | 'type' | 'kind'>): number {
  if (!step.isWriting && step.type !== 'closing' && step.kind !== 'exit-ticket') return 0;
  const minutes = step.minutes ?? (step.type === 'closing' ? 3 : 5);
  return Math.max(4, Math.min(20, Math.round(minutes * 1.5)));
}

/** Changes whenever the step's text does, so a stale version is rewritten. */
export function studentVersionKey(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 24);
}

export const STUDENT_VERSION_SYSTEM = [
  'You turn one step of a teacher’s lesson into the page students hold for it.',
  'Write to the students ("you"), in plain, warm language a 15-year-old reads at a glance.',
  'Keep only what students do and need: the directions, numbered and short; the question or prompt; anything they read.',
  'Use only what is in the step. Never invent a prompt, a question, a passage or an example that is not in it: when the step points to prompts or a reading that are not here ("pick one of the prompts below"), tell students where to find them ("Use the prompt your teacher shows") rather than writing new ones.',
  'When students read a passage, print the passage first, then the directions and questions about it.',
  'Leave out every teacher move: "push a little", "land the class on…", "circulate", "cold call", timing for the teacher, what to look for, answers.',
  'Never include an answer key or the point the teacher is driving at.',
  'A framing note becomes a one-page background sheet: three to six short points and one question to think about.',
  'A closing or exit ticket becomes a short slip: the question, and nothing else.',
  'At most 200 words. Markdown: a short heading is optional, then the page. Return only the page.',
  'Write the product name as Yawp!.',
].join('\n');

export function studentVersionUserMessage(step: Pick<StackStep, 'title' | 'type' | 'minutes' | 'content'>): string {
  return [
    `Step: ${step.title} (${step.type.replace('_', ' ')}${step.minutes ? `, ${step.minutes} min` : ''})`,
    '',
    step.content.slice(0, 4000),
  ].join('\n');
}

/** What a handout part prints: the student version, or the step as it is. */
export function handoutContent(
  step: Pick<StackStep, 'kind' | 'content'>,
  studentVersion: string | null
): string | null {
  const content = isStudentFacing(step.kind) ? step.content : studentVersion;
  return content === null ? null : passageFirst(content);
}

/** A filed piece, as the handout reads it: what it is and the reply card it came from. */
export type HandoutPiece = { id: string; kind: string; token: string | null };

export type HandoutPlan = {
  /**
   * Steps whose student task is their own blocks, there in the stack (the
   * "Class starter" step over its prompts, "Closing" over its exit ticket):
   * not a page of their own, or the page is the task twice.
   */
  covered: Set<string>;
  /** Options of one step (three class starters): one page, by piece id. */
  options: Map<string, { key: string; title: string }>;
};

/** Blocks under a step that are alternatives when there are two or more. */
const OPTION_KINDS = new Set(['class-starter', 'daily-pages', 'exit-ticket']);
const OPTION_TITLES: Record<string, string> = {
  'class-starter': 'Class starter',
  'daily-pages': 'Short Response',
  'exit-ticket': 'Exit ticket',
};

function readToken(token: string | null): { messageId: string; blockKey: string } | null {
  const at = token ? token.indexOf(':') : -1;
  return token && at > 0 ? { messageId: token.slice(0, at), blockKey: token.slice(at + 1) } : null;
}

/**
 * How the stack's pieces print as one handout (Nov 22 review): which steps
 * their own blocks already stand for, and which blocks are options of one
 * step, from the replies the pieces came from.
 */
export function handoutPlan(pieces: HandoutPiece[], replies: Record<string, string>): HandoutPlan {
  const covered = new Set<string>();
  const options = new Map<string, { key: string; title: string }>();
  const byCard = new Map<string, HandoutPiece>();
  for (const piece of pieces) if (piece.token) byCard.set(piece.token, piece);

  const messages = new Set(pieces.flatMap((piece) => readToken(piece.token)?.messageId ?? []));
  for (const messageId of messages) {
    const content = replies[messageId];
    if (!content) continue;
    const steps = readPlanSteps(content);
    for (const [stepKey, held] of Object.entries(stepBlockKeys(content))) {
      const students = held
        .map((key) => byCard.get(`${messageId}:${key}`))
        .filter((piece): piece is HandoutPiece => Boolean(piece && isStudentFacing(piece.kind)));
      const step = byCard.get(`${messageId}:${stepKey}`);
      if (step && step.kind === LESSON_STEP_KIND && students.length) covered.add(step.id);
      const index = planStepIndexForKey(stepKey);
      const stepTitle = index !== null ? steps[index]?.title : undefined;
      for (const kind of OPTION_KINDS) {
        const group = students.filter((piece) => piece.kind === kind);
        if (group.length < 2) continue;
        const key = `${messageId}:${stepKey}:${kind}`;
        const title = stepTitle?.trim() || OPTION_TITLES[kind]!;
        for (const piece of group) options.set(piece.id, { key, title });
      }
    }
  }
  return { covered, options };
}

type HandoutPage = { id: string; title: string; content: string; lines: number };

/**
 * One page per task (Nov 22 review): the options of one step, picked
 * together, print as one "choose one" page where the first of them sits.
 */
export function handoutPages<T extends HandoutPage>(parts: T[], plan: Pick<HandoutPlan, 'options'>): HandoutPage[] {
  const groups = new Map<string, T[]>();
  for (const part of parts) {
    const option = plan.options.get(part.id);
    if (option) groups.set(option.key, [...(groups.get(option.key) ?? []), part]);
  }
  const pages: HandoutPage[] = [];
  const done = new Set<string>();
  for (const part of parts) {
    const option = plan.options.get(part.id);
    const group = option ? groups.get(option.key)! : null;
    if (!option || !group || group.length < 2) {
      pages.push(part);
      continue;
    }
    if (done.has(option.key)) continue;
    done.add(option.key);
    pages.push({
      id: part.id,
      title: option.title,
      content: [
        'Choose one.',
        ...group.map((member, index) => `**${index + 1}. ${member.title.trim()}**\n\n${member.content.trim()}`),
      ].join('\n\n'),
      lines: Math.max(...group.map((member) => member.lines)),
    });
  }
  return pages;
}
