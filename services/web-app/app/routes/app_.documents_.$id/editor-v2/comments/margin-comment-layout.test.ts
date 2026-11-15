import { describe, expect, test } from 'bun:test';
import { stackMarginCommentTops } from './margin-comment-layout';

describe('stackMarginCommentTops', () => {
  test('preserves order when cards are already separated', () => {
    expect(
      stackMarginCommentTops(
        ['a', 'b'],
        { a: 10, b: 200 },
        { a: 80, b: 80 }
      )
    ).toEqual({ a: 10, b: 200 });
  });

  test('nudges the lower card when anchors would overlap', () => {
    expect(
      stackMarginCommentTops(
        ['a', 'b'],
        { a: 100, b: 120 },
        { a: 80, b: 80 },
        8
      )
    ).toEqual({ a: 100, b: 188 });
  });

  test('places orphaned cards below the anchored stack', () => {
    const anchorTops: Record<string, number> = { a: 100, b: 400 };
    const cardHeights: Record<string, number> = {
      a: 80,
      b: 80,
      orphan1: 60,
      orphan2: 60,
    };
    const anchoredIds = ['a', 'b'];
    const stackedAnchored = stackMarginCommentTops(
      anchoredIds,
      anchorTops,
      cardHeights
    );
    let cursor = anchoredIds.reduce(
      (max, id) =>
        Math.max(
          max,
          (stackedAnchored[id] ?? anchorTops[id] ?? 0) +
            (cardHeights[id] ?? 0) +
            8
        ),
      8
    );
    const orphanTops = {
      orphan1: cursor,
      orphan2: cursor + 60 + 8,
    };
    expect(stackedAnchored.a).toBe(100);
    expect(stackedAnchored.b).toBe(400);
    expect(orphanTops.orphan1).toBe(488);
    expect(orphanTops.orphan2).toBe(556);
  });

  test('chains nudges for three tight anchors', () => {
    const stacked = stackMarginCommentTops(
      ['a', 'b', 'c'],
      { a: 0, b: 10, c: 20 },
      { a: 60, b: 60, c: 60 },
      8
    );
    expect(stacked.a).toBe(0);
    expect(stacked.b).toBe(68);
    expect(stacked.c).toBe(136);
  });
});