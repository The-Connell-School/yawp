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
  /** The planner's `{type: …}` tag on the heading (run 3), when it gave one. */
  stepType: string | null;
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

// `## Hook (15 min) {type: activity}` — the planner tags each step (run 3).
const TYPE_TAG = /\{\s*type\s*:\s*([a-z _-]{2,24})\s*\}/i;

function readTypeTag(raw: string): string | null {
  return TYPE_TAG.exec(raw)?.[1]?.trim().toLowerCase() ?? null;
}

function cleanTitle(raw: string): { title: string; minutes: number | null } {
  const text = raw.replace(TYPE_TAG, '').replace(/\*\*|__|`/g, '').trim();
  const match = MINUTES.exec(text);
  const minutes = match ? Number(match[2] ?? match[1]) : null;
  const title = (match ? text.replace(match[0], ' ') : text)
    .replace(/\s*[—–:-]\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { title, minutes };
}

/**
 * A step's heading line, as the chat shows it (Kevin's notes): the level the
 * plan wrote, the title, and the minutes pulled out to sit in their own chip.
 */
export function readStepHeading(line: string): { level: 2 | 3; title: string; minutes: number | null } {
  const match = /^\s{0,3}(#{2,3})\s+(.+)$/.exec(line);
  const { title, minutes } = cleanTitle(match ? match[2]! : line);
  return { level: match?.[1] === '###' ? 3 : 2, title, minutes };
}

function stepText(raw: string): string {
  return hidePromptIds(raw.replace(FENCE, '').replace(/\n{3,}/g, '\n\n').trim());
}

// What the planner writes after the last step is about the plan, not part of
// it (Brian's run 3, item 5): a rule it puts there, the running total, the
// "you don't have to use all of these" invite, and its closing question.
const AFTER_PLAN = [
  /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/,
  /^\s*(?:\*\*|__)?\s*total\b/i,
  /\d+\s*\+\s*\d+[^\n]*=\s*\d+\s*min/i,
  /^\s*(?:\*\*|_)?you don[’']?t have to use (?:all|every)/i,
];
const TEACHER_QUESTION =
  /^\s*(?:want (?:me|to)|would you like|shall i|should i|let me know|anything else|how does (?:this|that) (?:look|sound)|does (?:this|that) (?:look|work|fit))\b[^\n]*$/i;

/**
 * The last step's text without the planner's commentary after it. Only the
 * last step runs to the end of the reply, so only it can pick that up.
 */
export function withoutTrailingCommentary(text: string): string {
  const paragraphs = text.split(/\n{2,}/);
  const cut = paragraphs.findIndex((paragraph, index) => {
    const firstLine = paragraph.trim().split('\n')[0] ?? '';
    // Never cut the step's own first paragraph to nothing.
    return index > 0 && AFTER_PLAN.some((pattern) => pattern.test(firstLine));
  });
  const kept = cut === -1 ? paragraphs : paragraphs.slice(0, cut);
  while (kept.length > 1 && TEACHER_QUESTION.test(kept.at(-1)!.trim())) kept.pop();
  return kept.join('\n\n').trim();
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
      const text = stepText(content.slice(heading.end, next?.start ?? content.length));
      return {
        key: planStepKey(index),
        title: title || `Step ${index + 1}`,
        minutes,
        stepType: readTypeTag(heading.text),
        content: next ? text : withoutTrailingCommentary(text),
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
    const last = index === starts.length - 1;
    const body = content.slice(step.end, starts[index + 1]?.start ?? content.length);
    const text = stepText([restOfLine, body].filter((part) => part.trim()).join('\n'));
    return {
      key: planStepKey(index),
      title: title || `Step ${index + 1}`,
      minutes,
      stepType: readTypeTag(`${step.label} ${step.rest.slice(0, 60)}`),
      content: last ? withoutTrailingCommentary(text.replace(TYPE_TAG, '').trim()) : text.replace(TYPE_TAG, '').trim(),
      at: step.start,
    };
  });
}

export type StepChunk =
  | { kind: 'markdown'; text: string }
  | { kind: 'step'; index: number; heading: string };

/**
 * One run of a reply's prose, cut at the plan's step headings, so each step
 * can carry its own Add to stack right where it appears (Brian's run 3, item
 * 1). `from` is the next step to look for; prose parts are cut in reply
 * order, so steps are matched in order too.
 */
export function splitAtStepHeadings(
  text: string,
  steps: Pick<PlanStep, 'title'>[],
  from: number
): { chunks: StepChunk[]; next: number } {
  const chunks: StepChunk[] = [];
  let next = from;
  let buffer: string[] = [];
  const flush = () => {
    const joined = buffer.join('\n');
    if (joined.trim()) chunks.push({ kind: 'markdown', text: joined });
    buffer = [];
  };
  for (const line of text.split('\n')) {
    const heading = /^\s{0,3}#{2,3}\s+(.+)$/.exec(line);
    const wanted = steps[next];
    if (heading && wanted && cleanTitle(heading[1]!).title === wanted.title) {
      flush();
      chunks.push({ kind: 'step', index: next, heading: line.replace(TYPE_TAG, '').trimEnd() });
      next += 1;
      continue;
    }
    buffer.push(line);
  }
  flush();
  return { chunks, next };
}
