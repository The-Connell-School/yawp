const HOUR_MS = 3_600_000;

/**
 * "Top" for the Lounge feed: helpful votes (and a little credit for replies)
 * decayed by age, so a lively post from this week outranks a classic from
 * last month. Deliberately gentle so a well-loved post stays visible for days.
 */
export function topScore(
  helpful: number,
  createdAt: Date,
  now: Date,
  replies = 0
): number {
  const ageHours = Math.max(0, (now.getTime() - createdAt.getTime()) / HOUR_MS);
  return (helpful + 0.5 * replies) / Math.pow(ageHours + 2, 0.8);
}

export function sortByTop<T extends { helpful: number; replies: number; createdAt: Date }>(
  posts: readonly T[],
  now: Date
): T[] {
  return [...posts].sort((a, b) => {
    const diff =
      topScore(b.helpful, b.createdAt, now, b.replies) -
      topScore(a.helpful, a.createdAt, now, a.replies);
    return diff !== 0 ? diff : b.createdAt.getTime() - a.createdAt.getTime();
  });
}
