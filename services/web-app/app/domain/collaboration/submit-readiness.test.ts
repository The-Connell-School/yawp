import { describe, expect, test } from 'bun:test';

import {
  describeGroupSubmitProgress,
  summarizeGroupSubmitReadiness,
  type GroupSubmitMemberInput,
} from './submit-readiness';

const members = (
  ...entries: [id: string, name: string, submittedAt: Date | string | null][]
): GroupSubmitMemberInput[] =>
  entries.map(([membershipId, name, submittedAt]) => ({
    membershipId,
    name,
    submittedAt,
  }));

describe('summarizeGroupSubmitReadiness', () => {
  test('nobody has pressed submit yet', () => {
    const readiness = summarizeGroupSubmitReadiness({
      members: members(
        ['m1', 'Sam Reyes', null],
        ['m2', 'Taylor Nguyen', null]
      ),
      viewerMembershipId: 'm1',
    });

    expect(readiness.total).toBe(2);
    expect(readiness.submittedCount).toBe(0);
    expect(readiness.everyoneSubmitted).toBe(false);
    expect(readiness.viewerSubmitted).toBe(false);
    expect(readiness.waitingOn.map((member) => member.name)).toEqual([
      'Sam Reyes',
      'Taylor Nguyen',
    ]);
  });

  test('one member pressing submit does not submit the draft', () => {
    // The whole point of the change: a single press is a promise to the group,
    // not a submission to the teacher.
    const readiness = summarizeGroupSubmitReadiness({
      members: members(
        ['m1', 'Sam Reyes', '2026-08-22T10:00:00.000Z'],
        ['m2', 'Taylor Nguyen', null]
      ),
      viewerMembershipId: 'm1',
    });

    expect(readiness.submittedCount).toBe(1);
    expect(readiness.everyoneSubmitted).toBe(false);
    expect(readiness.viewerSubmitted).toBe(true);
    expect(readiness.waitingOn.map((member) => member.name)).toEqual([
      'Taylor Nguyen',
    ]);
  });

  test('the last press is what makes the group ready', () => {
    const readiness = summarizeGroupSubmitReadiness({
      members: members(
        ['m1', 'Sam Reyes', '2026-08-22T10:00:00.000Z'],
        ['m2', 'Taylor Nguyen', new Date('2026-08-22T10:01:00.000Z')]
      ),
      viewerMembershipId: 'm2',
    });

    expect(readiness.everyoneSubmitted).toBe(true);
    expect(readiness.waitingOn).toEqual([]);
  });

  test('a viewer who is not in the group — a teacher reading it — is never counted as ready', () => {
    const readiness = summarizeGroupSubmitReadiness({
      members: members(['m1', 'Sam Reyes', '2026-08-22T10:00:00.000Z']),
      viewerMembershipId: 'teacher-1',
    });

    expect(readiness.viewerSubmitted).toBe(false);
    expect(readiness.viewerIsMember).toBe(false);
  });

  test('a removed member is not waited on: the caller passes active members only', () => {
    // Removal is filtered in the query (`removedAt: null`), so a group of one
    // active member is ready as soon as that one member presses.
    const readiness = summarizeGroupSubmitReadiness({
      members: members(['m1', 'Sam Reyes', '2026-08-22T10:00:00.000Z']),
      viewerMembershipId: 'm1',
    });

    expect(readiness.everyoneSubmitted).toBe(true);
  });

  test('a group with no active members is not held open forever', () => {
    // Defensive: nobody is left to press, so nothing should be able to wedge a
    // draft into a state where it can never be submitted.
    const readiness = summarizeGroupSubmitReadiness({
      members: [],
      viewerMembershipId: 'm1',
    });

    expect(readiness.everyoneSubmitted).toBe(true);
    expect(readiness.waitingOn).toEqual([]);
  });

  test('members keep the order they were given, so the roster does not jump around', () => {
    const readiness = summarizeGroupSubmitReadiness({
      members: members(
        ['m1', 'Sam Reyes', null],
        ['m2', 'Taylor Nguyen', '2026-08-22T10:00:00.000Z'],
        ['m3', 'Alex Diaz', null]
      ),
      viewerMembershipId: 'm3',
    });

    expect(readiness.members.map((member) => member.membershipId)).toEqual([
      'm1',
      'm2',
      'm3',
    ]);
    expect(readiness.members.map((member) => member.submitted)).toEqual([
      false,
      true,
      false,
    ]);
  });

  test('an unnamed student still reads as a person', () => {
    const readiness = summarizeGroupSubmitReadiness({
      members: members(['m1', '   ', null]),
      viewerMembershipId: 'm1',
    });

    expect(readiness.members[0].name).toBe('A classmate');
  });
});

describe('describeGroupSubmitProgress', () => {
  const readinessFor = (
    entries: [id: string, name: string, submittedAt: Date | string | null][],
    viewerMembershipId: string
  ) =>
    summarizeGroupSubmitReadiness({
      members: members(...entries),
      viewerMembershipId,
    });

  test('says plainly that one press is not enough', () => {
    const sentence = describeGroupSubmitProgress(
      readinessFor(
        [
          ['m1', 'Sam Reyes', '2026-08-22T10:00:00.000Z'],
          ['m2', 'Taylor Nguyen', null],
          ['m3', 'Alex Diaz', null],
        ],
        'm1'
      )
    );

    expect(sentence).toContain('1 of 3');
    expect(sentence).toMatch(/nothing goes to your teacher|not submitted/i);
    expect(sentence).toContain('Taylor Nguyen');
    expect(sentence).toContain('Alex Diaz');
  });

  test('names the classmates still to press, joined readably', () => {
    const sentence = describeGroupSubmitProgress(
      readinessFor(
        [
          ['m1', 'Sam Reyes', '2026-08-22T10:00:00.000Z'],
          ['m2', 'Taylor Nguyen', null],
          ['m3', 'Alex Diaz', null],
        ],
        'm1'
      )
    );

    expect(sentence).toContain('Taylor Nguyen and Alex Diaz');
  });

  test('tells a student who has not pressed that the group is waiting on them', () => {
    const sentence = describeGroupSubmitProgress(
      readinessFor(
        [
          ['m1', 'Sam Reyes', '2026-08-22T10:00:00.000Z'],
          ['m2', 'Taylor Nguyen', null],
        ],
        'm2'
      )
    );

    expect(sentence).toMatch(/you/i);
    expect(sentence).toContain('1 of 2');
  });

  test('says so once everyone has pressed', () => {
    const sentence = describeGroupSubmitProgress(
      readinessFor(
        [
          ['m1', 'Sam Reyes', '2026-08-22T10:00:00.000Z'],
          ['m2', 'Taylor Nguyen', '2026-08-22T10:05:00.000Z'],
        ],
        'm1'
      )
    );

    expect(sentence).toMatch(/everyone/i);
  });

  test('a solo shared draft is not told it is waiting on a group', () => {
    const sentence = describeGroupSubmitProgress(
      readinessFor([['m1', 'Sam Reyes', null]], 'm1')
    );

    expect(sentence).not.toMatch(/1 of 1/);
  });
});
