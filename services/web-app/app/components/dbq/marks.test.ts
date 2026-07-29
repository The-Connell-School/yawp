import { describe, expect, it } from 'bun:test';
import { buildSegments, clampOffsets } from './marks';
import type { TextMark } from './types';

function mark(overrides: Partial<TextMark>): TextMark {
  return {
    id: 'm1',
    sourceId: 'src-a',
    kind: 'highlight',
    start: 0,
    end: 1,
    quote: '',
    note: '',
    createdAt: 0,
    ...overrides,
  };
}

describe('buildSegments', () => {
  it('returns one unmarked segment when there are no marks', () => {
    expect(buildSegments(10, [])).toEqual([
      { start: 0, end: 10, markIds: [], kinds: [] },
    ]);
  });

  it('splits the body around a single mark', () => {
    const segments = buildSegments(10, [mark({ id: 'a', start: 2, end: 5 })]);
    expect(segments).toEqual([
      { start: 0, end: 2, markIds: [], kinds: [] },
      { start: 2, end: 5, markIds: ['a'], kinds: ['highlight'] },
      { start: 5, end: 10, markIds: [], kinds: [] },
    ]);
  });

  it('handles marks that touch the body edges', () => {
    const segments = buildSegments(6, [
      mark({ id: 'a', start: 0, end: 3 }),
      mark({ id: 'b', kind: 'underline', start: 3, end: 6 }),
    ]);
    expect(segments).toEqual([
      { start: 0, end: 3, markIds: ['a'], kinds: ['highlight'] },
      { start: 3, end: 6, markIds: ['b'], kinds: ['underline'] },
    ]);
  });

  it('stacks overlapping marks on shared segments', () => {
    const segments = buildSegments(10, [
      mark({ id: 'a', start: 1, end: 6 }),
      mark({ id: 'b', kind: 'underline', start: 4, end: 8 }),
    ]);
    expect(segments).toEqual([
      { start: 0, end: 1, markIds: [], kinds: [] },
      { start: 1, end: 4, markIds: ['a'], kinds: ['highlight'] },
      { start: 4, end: 6, markIds: ['a', 'b'], kinds: ['highlight', 'underline'] },
      { start: 6, end: 8, markIds: ['b'], kinds: ['underline'] },
      { start: 8, end: 10, markIds: [], kinds: [] },
    ]);
  });

  it('ignores marks outside the body and clamps ones that spill over', () => {
    const segments = buildSegments(5, [
      mark({ id: 'a', start: 3, end: 99 }),
      mark({ id: 'b', start: 90, end: 95 }),
    ]);
    expect(segments).toEqual([
      { start: 0, end: 3, markIds: [], kinds: [] },
      { start: 3, end: 5, markIds: ['a'], kinds: ['highlight'] },
    ]);
  });
});

describe('clampOffsets', () => {
  it('orders and clamps offsets to the body', () => {
    expect(clampOffsets(8, 3, 12)).toEqual({ start: 3, end: 8 });
    expect(clampOffsets(8, 6, 2)).toEqual({ start: 2, end: 6 });
  });

  it('returns null for empty or out-of-range selections', () => {
    expect(clampOffsets(8, 4, 4)).toBeNull();
    expect(clampOffsets(8, 9, 12)).toBeNull();
    expect(clampOffsets(8, -3, 0)).toBeNull();
  });
});
