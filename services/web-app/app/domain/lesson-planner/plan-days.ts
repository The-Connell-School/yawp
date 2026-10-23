/**
 * The days of a multi-day plan (Brian's run 5, items 1 and 3).
 *
 * A week planned in one reply ("a 4-day flow") is one message, and its days
 * are only headings. Read as steps, Day 1 became one piece in the stack,
 * typed Context and given 5 minutes, and all four days piled into one stack.
 * Each day is a lesson of its own: its title, its minutes, and its text with
 * its steps as `##` headings, so the day reads exactly as a single lesson.
 */
import { withoutTrailingCommentary } from './plan-steps';

export type PlanDay = {
  day: number;
  /** "Lecture: the island", without "Day 1" or the minutes. */
  title: string;
  minutes: number | null;
  /** The day as a lesson: `# Day 1: …`, then its steps as `##` headings. */
  content: string;
};

const FENCE = /```[\s\S]*?```/g;
const DAY_HEADING = /^\s{0,3}(#{1,3})\s+(?:\*\*)?\s*Day\s+(\d{1,2})\b([^\n]*)$/gim;
const HEADING = /^(\s{0,3})(#{1,6})(\s+)/gm;
const MINUTES = /\(?\s*(\d{1,3})\s*(?:min|minutes?)\b\.?\s*\)?/i;

function dayTitle(rest: string): { title: string; minutes: number | null } {
  const text = rest.replace(/\*\*/g, '').replace(/\{[^}]*\}/g, '');
  const minutes = MINUTES.exec(text);
  const title = text
    .replace(MINUTES, '')
    .replace(/^\s*[:.—–-]\s*/, '')
    .replace(/\s*[·—–-]\s*$/, '')
    .trim();
  return { title, minutes: minutes ? Number(minutes[1]) : null };
}

/** Every heading in the day one level under the day's own: the steps at `##`. */
function asLesson(body: string): string {
  const masked = body.replace(FENCE, (fence) => fence.replace(/[^\n]/g, ' '));
  const levels = [...masked.matchAll(HEADING)].map((match) => match[2]!.length);
  if (!levels.length) return body.trim();
  const shift = Math.min(...levels) - 2;
  if (!shift) return body.trim();
  // Fences keep their text: only headings outside them move.
  let out = '';
  let at = 0;
  for (const fence of body.matchAll(FENCE)) {
    out += relevel(body.slice(at, fence.index), shift) + fence[0];
    at = fence.index! + fence[0].length;
  }
  return (out + relevel(body.slice(at), shift)).trim();
}

function relevel(text: string, shift: number): string {
  return text.replace(HEADING, (_, indent: string, hashes: string, space: string) =>
    `${indent}${'#'.repeat(Math.max(2, Math.min(6, hashes.length - shift)))}${space}`
  );
}

/** The plan's days, in order; empty when the reply is not two or more days. */
export function readPlanDays(content: string): PlanDay[] {
  const masked = content.replace(FENCE, (fence) => fence.replace(/[^\n]/g, ' '));
  const headings = [...masked.matchAll(DAY_HEADING)].map((match) => ({
    level: match[1]!.length,
    day: Number(match[2]),
    rest: match[3] ?? '',
    start: match.index!,
    end: match.index! + match[0].length,
  }));
  if (headings.length < 2) return [];
  // The days are the most common Day level; a "Day 3" inside a day is not one.
  const counts = new Map<number, number>();
  for (const heading of headings) counts.set(heading.level, (counts.get(heading.level) ?? 0) + 1);
  const level = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
  const days = headings.filter((heading) => heading.level === level);
  if (days.length < 2 || new Set(days.map((day) => day.day)).size !== days.length) return [];

  return days.map((heading, index) => {
    const next = days[index + 1];
    const raw = content.slice(heading.end, next?.start ?? content.length);
    const body = next ? raw : withoutTrailingCommentary(raw);
    const { title, minutes } = dayTitle(heading.rest);
    const name = title || `Day ${heading.day}`;
    const timed = minutes ? ` (${minutes} min)` : '';
    return {
      day: heading.day,
      title: name,
      minutes,
      content: `# Day ${heading.day}: ${name}${timed}\n\n${asLesson(body.replace(/^\s*(?:-{3,}|\*{3,})\s*$/gm, ''))}`.trim(),
    };
  });
}

/** What the unit is called: the reply's own `#` title, else "A 4-day plan". */
export function multiDayTitle(content: string, days: PlanDay[]): string {
  const firstDay = content.search(/^\s{0,3}#{1,3}\s+(?:\*\*)?\s*Day\s+\d/im);
  const before = firstDay > 0 ? content.slice(0, firstDay) : '';
  const heading = /^\s{0,3}#{1,2}\s+(.+)$/m.exec(before)?.[1]?.replace(/\*\*/g, '').trim();
  return (heading || `A ${days.length}-day plan`).slice(0, 120);
}
