import { describe, expect, test } from 'bun:test';
import { sortByTop, topScore } from './ranking';

const now = new Date('2026-10-13T12:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

describe('topScore', () => {
  test('more helpful votes score higher at the same age', () => {
    expect(topScore(10, hoursAgo(5), now)).toBeGreaterThan(topScore(2, hoursAgo(5), now));
  });

  test('a newer post outranks an older one with the same votes', () => {
    expect(topScore(5, hoursAgo(2), now)).toBeGreaterThan(topScore(5, hoursAgo(48), now));
  });

  test('replies count a little so a lively thread with no votes still rises', () => {
    expect(topScore(0, hoursAgo(2), now, 4)).toBeGreaterThan(topScore(0, hoursAgo(2), now, 0));
  });
});

describe('sortByTop', () => {
  test('a week-old post with many votes falls below a fresh popular one', () => {
    const posts = [
      { id: 'old', helpful: 30, replies: 0, createdAt: hoursAgo(24 * 7) },
      { id: 'fresh', helpful: 8, replies: 2, createdAt: hoursAgo(3) },
      { id: 'quiet', helpful: 0, replies: 0, createdAt: hoursAgo(1) },
    ];
    expect(sortByTop(posts, now).map((p) => p.id)).toEqual(['fresh', 'old', 'quiet']);
  });

  test('does not reorder the input array', () => {
    const posts = [
      { id: 'a', helpful: 0, replies: 0, createdAt: hoursAgo(1) },
      { id: 'b', helpful: 5, replies: 0, createdAt: hoursAgo(1) },
    ];
    sortByTop(posts, now);
    expect(posts.map((p) => p.id)).toEqual(['a', 'b']);
  });
});
