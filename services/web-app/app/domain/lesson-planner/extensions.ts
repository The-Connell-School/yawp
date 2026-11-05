/**
 * "If you have extra time" (Kevin, Oct 25, notes 8b and 8c).
 *
 * A lesson can set steps aside as extensions: out of the timed run of show,
 * kept after the closing for a class that finishes early. When the lesson runs
 * over, one step is suggested to move there: something students can start and
 * stop at any point. Writing first, then reading on, then discussion.
 */
import type { TimedBlock } from './stack-timing';

export const MAX_EXTENSIONS = 6;

/** The stored ids, as a list, whatever the JSON column holds. */
export function readExtensionIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === 'string' && id.length > 0).slice(0, MAX_EXTENSIONS);
}

export function splitExtensions<T extends { id: string }>(
  steps: T[],
  extensionIds: string[]
): { steps: T[]; extensions: T[] } {
  const marked = new Set(extensionIds);
  return {
    steps: steps.filter((step) => !marked.has(step.id)),
    extensions: extensionIds.flatMap((id) => steps.filter((step) => step.id === id)),
  };
}

const DISCUSSION = /\b(discuss|discussion|seminar|conversation|debate|talk|share)\b/i;
const NEVER = /\b(exit ticket|closing|wrap[- ]?up)\b/i;

function rank(block: TimedBlock): number | null {
  if (block.type === 'class_starter' || block.type === 'closing' || NEVER.test(block.title)) return null;
  if (block.isWriting || block.type === 'daily_pages' || block.type === 'thesis_essay') return 0;
  if (block.type === 'read_aloud') return 1;
  if (DISCUSSION.test(block.title)) return 2;
  return null;
}

/**
 * The step to suggest moving to the extensions, or null. Never the first
 * step, the class starter or the closing. Within the best kind, the smallest
 * step that brings the lesson back on time, else the longest.
 */
export function suggestedExtension(blocks: TimedBlock[], over: number): TimedBlock | null {
  if (over <= 0) return null;
  const ranked = blocks
    .slice(1)
    .map((block) => ({ block, rank: rank(block) }))
    .filter((entry): entry is { block: TimedBlock; rank: number } => entry.rank !== null);
  if (!ranked.length) return null;
  const best = Math.min(...ranked.map((entry) => entry.rank));
  const kind = ranked.filter((entry) => entry.rank === best).map((entry) => entry.block);
  const covering = kind.filter((block) => block.minutes >= over).sort((a, b) => a.minutes - b.minutes)[0];
  return covering ?? [...kind].sort((a, b) => b.minutes - a.minutes)[0] ?? null;
}

/** The fix box's first line, said calmly and with the numbers. */
export function overLead(over: number, period: number | null): string {
  const minutes = `${over} ${over === 1 ? 'minute' : 'minutes'}`;
  return period
    ? `You've added some great pieces, but this runs ${minutes} over your ${period}.`
    : `You've added some great pieces, but this runs ${minutes} over.`;
}
