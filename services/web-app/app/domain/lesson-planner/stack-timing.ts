/**
 * The time of a stack (Brian's run 3, items 6, 9, 10; Kevin's stack page
 * redesign): when each step starts, the total against the period, the
 * writing minutes, and at most two fixes when the stack runs long. One place
 * for all of it, so the header, the time bar, the meter, Run the show and the
 * lesson plan never disagree.
 */
import {
  DEFAULT_STEP_MINUTES,
  STEP_TYPE_LABELS,
  type StepType,
} from './step-types';

export const MIN_STEP_MINUTES = 1;
export const MAX_STEP_MINUTES = 120;
/** A fix never trims a step below this. */
export const FIX_FLOOR_MINUTES = 3;

export type TimedStep = {
  id: string;
  title: string;
  type: StepType;
  /** Null: the planner gave no time; the type's default is suggested. */
  minutes: number | null;
  isWriting: boolean;
};

export type TimedBlock = TimedStep & {
  minutes: number;
  /** True when the minutes are the type's default, not a planned time. */
  suggested: boolean;
  startsAt: number;
};

export type StackTiming = {
  blocks: TimedBlock[];
  total: number;
  period: number | null;
  /** Minutes left in the period; 0 when over or no period. */
  leftover: number;
  /** Minutes past the period; 0 when it fits. */
  over: number;
  status: string;
  writingMinutes: number;
  /** Writing ÷ the period, or ÷ the total when the stack runs longer. */
  writingPercent: number;
  /** "Class Starter + Daily Pages": the types the writing comes from. */
  writingSources: string;
};

export function clampMinutes(value: number): number {
  if (!Number.isFinite(value)) return MIN_STEP_MINUTES;
  return Math.min(MAX_STEP_MINUTES, Math.max(MIN_STEP_MINUTES, Math.round(value)));
}

export function statusText(total: number, period: number | null): string {
  if (!period) return `${total} min planned`;
  if (total === period) return 'Right on time';
  if (total < period) return `${period - total} min to spare`;
  return `${total - period} min over`;
}

export function stackTiming(steps: TimedStep[], period: number | null): StackTiming {
  let startsAt = 0;
  const blocks = steps.map((step) => {
    const suggested = step.minutes == null;
    const minutes = suggested ? DEFAULT_STEP_MINUTES[step.type] : step.minutes!;
    const block = { ...step, minutes, suggested, startsAt };
    startsAt += minutes;
    return block;
  });
  const total = startsAt;
  const writing = blocks.filter((block) => block.isWriting);
  const writingMinutes = writing.reduce((sum, block) => sum + block.minutes, 0);
  const base = Math.max(period ?? 0, total);
  const sources = [...new Set(writing.map((block) => STEP_TYPE_LABELS[block.type]))];
  return {
    blocks,
    total,
    period,
    leftover: period ? Math.max(0, period - total) : 0,
    over: period ? Math.max(0, total - period) : 0,
    status: statusText(total, period),
    writingMinutes,
    writingPercent: base > 0 ? Math.round((writingMinutes / base) * 100) : 0,
    writingSources: sources.join(' + '),
  };
}

export type TimeFix =
  | {
      id: 'trim';
      stepId: string;
      toMinutes: number;
      /** Minutes still over after this fix; 0 when it closes the gap. */
      leaves: number;
      text: string;
    }
  | {
      id: 'tomorrow';
      stepId: string;
      leaves: number;
      text: string;
    };

/**
 * At most two ways back on time, only when over. Fix 1 trims the longest
 * step that is not writing (never below 3 min). Fix 2 moves a Context step to
 * tomorrow. Neither ever touches writing time. Deterministic: the same stack
 * always gets the same fixes, and the teacher makes the call.
 */
export function timeFixes(timing: StackTiming): TimeFix[] {
  const { over } = timing;
  if (over <= 0) return [];
  const fixes: TimeFix[] = [];
  const reading = timing.blocks.filter((block) => !block.isWriting);

  const longest = [...reading].sort(
    (a, b) => b.minutes - a.minutes || a.startsAt - b.startsAt
  )[0];
  if (longest && longest.minutes > FIX_FLOOR_MINUTES) {
    const cut = Math.min(over, longest.minutes - FIX_FLOOR_MINUTES);
    const toMinutes = longest.minutes - cut;
    const leaves = over - cut;
    fixes.push({
      id: 'trim',
      stepId: longest.id,
      toMinutes,
      leaves,
      text:
        `Trim “${longest.title}” to ${toMinutes} min` +
        (leaves > 0 ? ` · gets you to ${leaves} over` : ''),
    });
  }

  const context = reading.filter((block) => block.type === 'context');
  const covering = context
    .filter((block) => block.minutes >= over)
    .sort((a, b) => a.minutes - b.minutes || a.startsAt - b.startsAt)[0];
  const moved =
    covering ??
    [...context].sort((a, b) => b.minutes - a.minutes || a.startsAt - b.startsAt)[0];
  if (moved) {
    const leaves = Math.max(0, over - moved.minutes);
    fixes.push({
      id: 'tomorrow',
      stepId: moved.id,
      leaves,
      text:
        `Move “${moved.title}” to tomorrow` +
        (leaves > 0 ? ` · gets you to ${leaves} over` : ''),
    });
  }
  return fixes;
}
