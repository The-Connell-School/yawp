/**
 * The steps of a plan, each one a piece the teacher can put in the stack
 * (Brian's run 2, A3).
 *
 * "I should be able to add this activity, even though it's not a writing
 * assignment. The function of the stack is to build an outline of my lesson
 * with everything that's going to happen." A reading, a pair talk, a quick
 * write: each step of a plan is its own piece, read straight from the plan's
 * own headings, so it works on any reply without the planner doing anything
 * special.
 */
import { hidePromptIds } from './prompt-ids';

export type PlanStep = {
  /** "st", "st:1", … — the packet API caps a key at 8 characters. */
  key: string;
  title: string;
  minutes: number | null;
  /** The step's own text: its blocks are pieces of their own. */
  content: string;
  /** Where the step starts in the reply, to keep pieces in reply order. */
  at: number;
};

export const PLAN_STEP_BLOCK_KEY = 'st';

export function planStepKey(index: number): string {
  return index === 0 ? PLAN_STEP_BLOCK_KEY : `${PLAN_STEP_BLOCK_KEY}:${index}`;
}

export function planStepIndexForKey(key: string): number | null {
  if (key === PLAN_STEP_BLOCK_KEY) return 0;
  const match = /^st:(\d{1,4})$/.exec(key);
  return match ? Number(match[1]) : null;
}

const MINUTES = /\(?\s*(\d{1,3})\s*(?:[–—-]\s*(\d{1,3})\s*)?(?:min|minutes?)\b\.?\s*\)?/i;
const FENCE = /```[\s\S]*?```/g;

function cleanTitle(raw: string): { title: string; minutes: number | null } {
  const text = raw.replace(/\*\*|__|`/g, '').trim();
  const match = MINUTES.exec(text);
  const minutes = match ? Number(match[2] ?? match[1]) : null;
  const title = (match ? text.replace(match[0], ' ') : text)
    .replace(/\s*[—–:-]\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { title, minutes };
}

function stepText(raw: string): string {
  return hidePromptIds(raw.replace(FENCE, '').replace(/\n{3,}/g, '\n\n').trim());
}

/** The plan's steps, in order. A reply with fewer than two is not a plan. */
export function readPlanSteps(content: string): PlanStep[] {
  // Headings inside a fence are not the plan's.
  const masked = content.replace(FENCE, (fence) => fence.replace(/[^\n]/g, ' '));
  const headings = [...masked.matchAll(/^\s{0,3}(#{2,3})\s+(.+)$/gm)].map((match) => ({
    level: match[1]!.length,
    text: match[2]!,
    start: match.index!,
    end: match.index! + match[0].length,
  }));
  for (const level of [2, 3]) {
    const steps = headings.filter((heading) => heading.level === level);
    if (steps.length < 2) continue;
    return steps.map((heading, index) => {
      // A step runs to the next heading at its own level or above.
      const next = headings.find(
        (other) => other.start > heading.start && other.level <= level
      );
      const { title, minutes } = cleanTitle(heading.text);
      return {
        key: planStepKey(index),
        title: title || `Step ${index + 1}`,
        minutes,
        content: stepText(content.slice(heading.end, next?.start ?? content.length)),
        at: heading.start,
      };
    });
  }
  return readBoldSteps(content, masked);
}

const BOLD_STEP =
  /^\s{0,3}(?:(?:[-*+]|\d+[.)])\s+)?\*\*([^*\n]{1,80})\*\*([^\n]*)$/gm;

function readBoldSteps(content: string, masked: string): PlanStep[] {
  const starts = [...masked.matchAll(BOLD_STEP)]
    .map((match) => ({
      label: match[1]!,
      rest: match[2]!,
      start: match.index!,
      end: match.index! + match[0].length,
    }))
    // Only a bold label that names its minutes, inside it or right after.
    .filter((match) => MINUTES.test(match.label) || MINUTES.test(match.rest.slice(0, 40)));
  if (starts.length < 2) return [];
  return starts.map((step, index) => {
    const timed = MINUTES.test(step.label) ? step.label : `${step.label} ${step.rest.slice(0, 40)}`;
    const { minutes } = cleanTitle(timed);
    const { title } = cleanTitle(step.label);
    const restOfLine = step.rest
      .replace(MINUTES, '')
      .replace(/^\s*[—–:-]\s*/, '')
      .trim();
    const body = content.slice(step.end, starts[index + 1]?.start ?? content.length);
    return {
      key: planStepKey(index),
      title: title || `Step ${index + 1}`,
      minutes,
      content: stepText([restOfLine, body].filter((part) => part.trim()).join('\n')),
      at: step.start,
    };
  });
}
