import { describe, expect, test } from 'bun:test';
import {
  nextStackPosition,
  orderStackEntries,
  parseStackEntryKey,
  stackEntryKey,
  movedToSlot,
} from './stack-order';

const at = (minute: number) => Date.UTC(2026, 9, 12, 10, minute);

describe('orderStackEntries (Brian\'s run 2, A1)', () => {
  test('a stack nobody reordered reads in the order it was written, reply first', () => {
    const ordered = orderStackEntries([
      { at: at(2), order: 1, position: null, item: 'handout from reply 2' },
      { at: at(1), order: 1, position: null, item: 'starter from reply 1' },
      { at: at(1), order: 0, position: null, item: 'reply 1' },
    ]);
    expect(ordered).toEqual(['reply 1', 'starter from reply 1', 'handout from reply 2']);
  });

  test('a reordered stack reads in the teacher\'s order', () => {
    const ordered = orderStackEntries([
      { at: at(1), order: 1, position: 2, item: 'starter' },
      { at: at(2), order: 1, position: 0, item: 'exit ticket' },
      { at: at(3), order: 1, position: 1, item: 'deck' },
    ]);
    expect(ordered).toEqual(['exit ticket', 'deck', 'starter']);
  });

  test('a piece with no place yet goes after the placed ones, in written order', () => {
    const ordered = orderStackEntries([
      { at: at(5), order: 1, position: null, item: 'late b' },
      { at: at(1), order: 1, position: 1, item: 'placed second' },
      { at: at(4), order: 1, position: null, item: 'late a' },
      { at: at(2), order: 1, position: 0, item: 'placed first' },
    ]);
    expect(ordered).toEqual(['placed first', 'placed second', 'late a', 'late b']);
  });
});

describe('nextStackPosition', () => {
  test('null while the stack has never been reordered', () => {
    expect(nextStackPosition([null, null])).toBeNull();
    expect(nextStackPosition([])).toBeNull();
  });

  test('one past the last place once it has', () => {
    expect(nextStackPosition([0, 3, null, 1])).toBe(4);
  });
});

describe('stack entry keys', () => {
  test('round-trip a material and a kept reply', () => {
    expect(parseStackEntryKey(stackEntryKey({ origin: 'material', id: 'm1' }))).toEqual({
      origin: 'material',
      id: 'm1',
    });
    expect(parseStackEntryKey(stackEntryKey({ origin: 'reply', id: 'r1' }))).toEqual({
      origin: 'reply',
      id: 'r1',
    });
  });

  test('reject anything else', () => {
    expect(parseStackEntryKey('x:1')).toBeNull();
    expect(parseStackEntryKey('m:')).toBeNull();
    expect(parseStackEntryKey('')).toBeNull();
  });
});

describe("movedToSlot: dragging a step in the run of show (Brian's run 4, item 3)", () => {
  const keys = ['a', 'b', 'c', 'd'];
  test('down by one: into the gap after the next step', () => {
    expect(movedToSlot(keys, 'a', 2)).toEqual(['b', 'a', 'c', 'd']);
  });
  test('up by one, to the start, to the end', () => {
    expect(movedToSlot(keys, 'c', 1)).toEqual(['a', 'c', 'b', 'd']);
    expect(movedToSlot(keys, 'd', 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(movedToSlot(keys, 'a', 4)).toEqual(['b', 'c', 'd', 'a']);
  });
  test('a gap beside the step leaves the order as it was', () => {
    expect(movedToSlot(keys, 'b', 1)).toEqual(keys);
    expect(movedToSlot(keys, 'b', 2)).toEqual(keys);
  });
});
