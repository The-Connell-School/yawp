import { describe, expect, test } from 'bun:test';
import {
  clampGroupSize,
  groupLabel,
  planGroups,
  shuffleMemberships,
  unassignedMembershipIds,
} from './groups';

const roster = (count: number) =>
  Array.from({ length: count }, (_, index) => `m${index + 1}`);

const sizesOf = (groups: string[][]) => groups.map((group) => group.length);

describe('planGroups', () => {
  test('splits evenly when the roster divides cleanly', () => {
    expect(sizesOf(planGroups({ membershipIds: roster(9), groupSize: 3 }))).toEqual([
      3, 3, 3,
    ]);
  });

  test('distributes the remainder instead of stranding a group of one', () => {
    // The naive chunker gives 3/3/3/1. A group of one is not collaboration, and
    // it is the single most likely bad outcome of this function.
    expect(sizesOf(planGroups({ membershipIds: roster(10), groupSize: 3 }))).toEqual([
      3, 3, 2, 2,
    ]);
  });

  test('never produces a group of one unless the roster has one student', () => {
    for (let count = 2; count <= 40; count += 1) {
      for (let size = 2; size <= 8; size += 1) {
        const groups = planGroups({ membershipIds: roster(count), groupSize: size });
        const smallest = Math.min(...sizesOf(groups));
        expect(smallest).toBeGreaterThanOrEqual(2);
      }
    }
  });

  test('makes one oversized group rather than orphaning a student', () => {
    // Three students in pairs: 2/1 leaves someone writing alone, so one group
    // of three is the better answer. Found by the exhaustive case below.
    expect(planGroups({ membershipIds: roster(3), groupSize: 2 })).toEqual([
      ['m1', 'm2', 'm3'],
    ]);
    expect(sizesOf(planGroups({ membershipIds: roster(5), groupSize: 2 }))).toEqual([
      3, 2,
    ]);
  });

  test('prefers smaller groups over an oversized one', () => {
    // 4 students in groups of 3 is better as 2/2 than 3/1.
    expect(sizesOf(planGroups({ membershipIds: roster(4), groupSize: 3 }))).toEqual([
      2, 2,
    ]);
  });

  test('places every student exactly once', () => {
    const groups = planGroups({ membershipIds: roster(23), groupSize: 4 });
    const placed = groups.flat();
    expect(placed).toHaveLength(23);
    expect(new Set(placed).size).toBe(23);
  });

  test('preserves the incoming order so the caller controls shuffling', () => {
    expect(planGroups({ membershipIds: ['a', 'b', 'c', 'd'], groupSize: 2 })).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  test('a null group size means one whole-class group', () => {
    expect(planGroups({ membershipIds: roster(30), groupSize: null })).toEqual([
      roster(30),
    ]);
  });

  test('a roster smaller than the group size becomes one group', () => {
    expect(sizesOf(planGroups({ membershipIds: roster(2), groupSize: 5 }))).toEqual([
      2,
    ]);
  });

  test('a single student still gets a group', () => {
    // Degenerate but real: they still need a document to write in.
    expect(planGroups({ membershipIds: ['solo'], groupSize: 3 })).toEqual([['solo']]);
  });

  test('an empty roster produces no groups', () => {
    expect(planGroups({ membershipIds: [], groupSize: 3 })).toEqual([]);
  });
});

describe('shuffleMemberships', () => {
  test('returns a permutation, not a mutation of the input', () => {
    const input = roster(6);
    const shuffled = shuffleMemberships(input, () => 0.5);

    expect(input).toEqual(roster(6));
    expect([...shuffled].sort()).toEqual([...input].sort());
  });

  test('is deterministic given a fixed random source', () => {
    const first = shuffleMemberships(roster(8), () => 0.42);
    const second = shuffleMemberships(roster(8), () => 0.42);
    expect(first).toEqual(second);
  });

  test('actually reorders', () => {
    // random() === 0 sends every swap to index 0, which rotates the array.
    expect(shuffleMemberships(['a', 'b', 'c'], () => 0)).not.toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});

describe('unassignedMembershipIds', () => {
  test('finds a student who joined the class after groups were built', () => {
    expect(
      unassignedMembershipIds({
        rosterMembershipIds: ['a', 'b', 'c'],
        groups: [{ members: [{ membershipId: 'a', removedAt: null }] }],
      })
    ).toEqual(['b', 'c']);
  });

  test('a removed member counts as unassigned again', () => {
    // Being moved out of a group puts a student back in the bucket, which is
    // what makes the teacher place them somewhere.
    expect(
      unassignedMembershipIds({
        rosterMembershipIds: ['a', 'b'],
        groups: [
          {
            members: [
              { membershipId: 'a', removedAt: new Date('2026-08-01') },
              { membershipId: 'b', removedAt: null },
            ],
          },
        ],
      })
    ).toEqual(['a']);
  });

  test('returns nothing when everyone is placed', () => {
    expect(
      unassignedMembershipIds({
        rosterMembershipIds: ['a', 'b'],
        groups: [
          { members: [{ membershipId: 'a', removedAt: null }] },
          { members: [{ membershipId: 'b', removedAt: null }] },
        ],
      })
    ).toEqual([]);
  });

  test('ignores group members who are no longer on the roster', () => {
    // A transferred-out student still has a row; they must not appear as
    // unassigned, because they are not in this class to place.
    expect(
      unassignedMembershipIds({
        rosterMembershipIds: ['a'],
        groups: [
          {
            members: [
              { membershipId: 'a', removedAt: null },
              { membershipId: 'gone', removedAt: null },
            ],
          },
        ],
      })
    ).toEqual([]);
  });

  test('the whole roster is unassigned before any groups exist', () => {
    expect(
      unassignedMembershipIds({ rosterMembershipIds: ['a', 'b'], groups: [] })
    ).toEqual(['a', 'b']);
  });
});

describe('groupLabel', () => {
  test('is one-indexed, matching what a teacher would say', () => {
    expect(groupLabel(0)).toBe('Group 1');
    expect(groupLabel(4)).toBe('Group 5');
  });
});

describe('clampGroupSize', () => {
  test('clamps into the supported range', () => {
    expect(clampGroupSize(1)).toBe(2);
    expect(clampGroupSize(0)).toBe(2);
    expect(clampGroupSize(99)).toBe(8);
    expect(clampGroupSize(4)).toBe(4);
  });

  test('floors a fractional size', () => {
    expect(clampGroupSize(3.7)).toBe(3);
  });
});
