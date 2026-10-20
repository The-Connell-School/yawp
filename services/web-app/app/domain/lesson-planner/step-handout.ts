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
import type { StackStep } from './stack-steps';

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
  if (isStudentFacing(step.kind)) return step.content;
  return studentVersion;
}
