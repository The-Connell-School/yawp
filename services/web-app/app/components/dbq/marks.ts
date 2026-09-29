import type { MarkKind, TextMark, TextSegment } from './types';

/**
 * Clamp a raw text selection to the body and drop empty/out-of-range picks.
 * Returns ordered { start, end } offsets, or null when there is nothing to mark.
 */
export function clampOffsets(
  bodyLength: number,
  a: number,
  b: number
): { start: number; end: number } | null {
  const start = Math.max(0, Math.min(a, b));
  const end = Math.min(bodyLength, Math.max(a, b));
  if (start >= end) return null;
  return { start, end };
}

/**
 * Break the body text into contiguous segments split at every mark boundary.
 * Each segment reports which marks (and mark kinds) cover it, so overlapping
 * highlights and underlines can render stacked on the same run of text.
 */
export function buildSegments(
  bodyLength: number,
  marks: TextMark[]
): TextSegment[] {
  if (bodyLength <= 0) return [];

  const clamped = marks
    .map((mark) => ({
      mark,
      start: Math.max(0, Math.min(mark.start, bodyLength)),
      end: Math.max(0, Math.min(mark.end, bodyLength)),
    }))
    .filter((entry) => entry.start < entry.end);

  const boundaries = new Set<number>([0, bodyLength]);
  for (const entry of clamped) {
    boundaries.add(entry.start);
    boundaries.add(entry.end);
  }
  const points = Array.from(boundaries).sort((a, b) => a - b);

  const segments: TextSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    if (start >= end) continue;

    const markIds: string[] = [];
    const kinds: MarkKind[] = [];
    for (const entry of clamped) {
      if (entry.start <= start && entry.end >= end) {
        markIds.push(entry.mark.id);
        kinds.push(entry.mark.kind);
      }
    }
    segments.push({ start, end, markIds, kinds });
  }

  return segments;
}
