// Group planning for collaborative drafts: the pure part, safe for the browser.
// Persistence lives in `groups.server.ts`.

import {
  MAX_COLLABORATION_GROUP_SIZE,
  MIN_COLLABORATION_GROUP_SIZE,
} from '~/domain/assignments/collaboration';

/**
 * Splits a roster into groups of roughly `groupSize`.
 *
 * The remainder is **distributed**, not left as a stub group. Ten students in
 * groups of three becomes 3/3/2/2, never 3/3/3/1 — a group of one is not
 * collaboration, and it is the outcome a naive chunker produces most often. The
 * only way to get a group of one is a roster of one.
 *
 * `groupSize` of `null` means whole-class: a single group holding everyone.
 * Order is preserved, so the caller decides whether to shuffle first.
 */
export function planGroups({
  membershipIds,
  groupSize,
}: {
  membershipIds: string[];
  groupSize: number | null;
}): string[][] {
  if (membershipIds.length === 0) return [];

  // Whole class, or a target so large it collapses to one group anyway.
  if (groupSize === null || membershipIds.length <= groupSize) {
    return [[...membershipIds]];
  }

  // `ceil(n / groupSize)` is the group count that gets closest to the target
  // size, but on its own it orphans people: 3 students in groups of 2 becomes
  // 2/1. `floor(n / 2)` is the most groups you can have while every group still
  // holds at least two, so taking the smaller of the two trades a slightly
  // oversized group for never leaving anyone writing alone — 3 students become
  // one group of 3, and 5 in pairs become 3/2.
  const groupCount = Math.max(
    1,
    Math.min(
      Math.ceil(membershipIds.length / groupSize),
      Math.floor(membershipIds.length / MIN_COLLABORATION_GROUP_SIZE)
    )
  );
  const base = Math.floor(membershipIds.length / groupCount);
  // The first `remainder` groups take one extra member, which is what spreads
  // the leftover instead of stranding it.
  let remainder = membershipIds.length % groupCount;

  const groups: string[][] = [];
  let cursor = 0;
  for (let index = 0; index < groupCount; index += 1) {
    const size = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    groups.push(membershipIds.slice(cursor, cursor + size));
    cursor += size;
  }

  return groups;
}

/**
 * Fisher-Yates, on a copy. `random` is injectable so tests can pin the order —
 * a shuffle that cannot be made deterministic cannot be tested.
 */
export function shuffleMemberships(
  membershipIds: string[],
  random: () => number = Math.random
): string[] {
  const shuffled = [...membershipIds];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** Human label for a group, one-indexed to match what a teacher would say. */
export function groupLabel(ordinal: number): string {
  return `Group ${ordinal + 1}`;
}

/**
 * Students on the roster who are not in any active group. Derived rather than
 * stored: this is the "not in a group" bucket, and it is how a student who joined
 * the class after groups were built becomes visible to the teacher instead of a
 * silent failure.
 */
export function unassignedMembershipIds({
  rosterMembershipIds,
  groups,
}: {
  rosterMembershipIds: string[];
  groups: { members: { membershipId: string; removedAt: Date | null }[] }[];
}): string[] {
  const placed = new Set<string>();
  for (const group of groups) {
    for (const member of group.members) {
      if (member.removedAt === null) placed.add(member.membershipId);
    }
  }
  return rosterMembershipIds.filter((id) => !placed.has(id));
}

/** Clamps a requested size into the supported range. */
export function clampGroupSize(size: number): number {
  return Math.min(
    MAX_COLLABORATION_GROUP_SIZE,
    Math.max(MIN_COLLABORATION_GROUP_SIZE, Math.floor(size))
  );
}
