/**
 * The order of a lesson's stack (Brian's run 2, A1).
 *
 * A teacher sequences the lesson by dragging its pieces. Until they do, the
 * stack reads in the order its pieces were written — each reply, then what
 * that reply handed over — which is how every stack read before ordering
 * existed. Once they reorder it, every piece gets a place, and a piece filed
 * after that goes to the end.
 */

export type StackOrderInput<T> = {
  /** When the piece was written (its source reply's time). */
  at: number;
  /** 0 for a kept reply, 1 for a piece it handed over: the reply comes first. */
  order: number;
  /** The teacher's place for it, once they have reordered the stack. */
  position: number | null | undefined;
  item: T;
};

export function orderStackEntries<T>(entries: StackOrderInput<T>[]): T[] {
  const written = (a: StackOrderInput<T>, b: StackOrderInput<T>) =>
    a.at - b.at || a.order - b.order;
  const placed = entries
    .filter((entry) => entry.position != null)
    .sort((a, b) => a.position! - b.position! || written(a, b));
  const unplaced = entries
    .filter((entry) => entry.position == null)
    .sort(written);
  return [...placed, ...unplaced].map((entry) => entry.item);
}

/**
 * The place for a piece filed now: null while the stack has never been
 * reordered (it reads in written order, so the new piece lands where it was
 * written), otherwise the end.
 */
export function nextStackPosition(positions: Array<number | null>): number | null {
  const placed = positions.filter((position): position is number => position !== null);
  return placed.length ? Math.max(...placed) + 1 : null;
}

export type StackEntryRef = { origin: 'material' | 'reply'; id: string };

/** "m:<materialId>" or "r:<messageId>", as the reorder intent carries them. */
export function stackEntryKey(ref: StackEntryRef): string {
  return `${ref.origin === 'material' ? 'm' : 'r'}:${ref.id}`;
}

export function parseStackEntryKey(key: string): StackEntryRef | null {
  const match = /^([mr]):(.+)$/.exec(key);
  if (!match) return null;
  return { origin: match[1] === 'm' ? 'material' : 'reply', id: match[2]! };
}

/**
 * The order after a step is dropped into a gap of the run of show (Brian's
 * run 4, item 3). `slot` counts the gaps of the order as it was: 0 before
 * the first step, `keys.length` after the last.
 */
export function movedToSlot(keys: string[], moving: string, slot: number): string[] {
  const from = keys.indexOf(moving);
  if (from < 0) return keys;
  const rest = keys.filter((key) => key !== moving);
  const at = Math.max(0, Math.min(rest.length, slot > from ? slot - 1 : slot));
  rest.splice(at, 0, moving);
  return rest;
}
