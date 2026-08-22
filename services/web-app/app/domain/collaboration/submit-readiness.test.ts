import { describe, expect, test } from 'bun:test';

import {
  describeGroupSubmitProgress,
  describeGroupSubmitWaiting,
  describeTeacherSubmitConfirmation,
  summarizeBoardSubmitProgress,
  summarizeGroupSubmitReadiness,
  type BoardGroupSubmitStatus,
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

describe('what the teacher is told and asked', () => {
  test('names who the group is waiting on, rather than counting them', () => {
    // "Waiting on Devon" is something a teacher can act on now; "1 of 2" is not.
    expect(describeGroupSubmitWaiting(['Devon', 'Maya'])).toContain(
      'Devon and Maya'
    );
  });

  test('says when nobody has pressed at all', () => {
    expect(describeGroupSubmitWaiting([])).toMatch(/nobody/i);
  });

  test('the confirmation names the students who have not pressed', () => {
    const sentence = describeTeacherSubmitConfirmation(['Devon']);

    expect(sentence).toContain('Devon has not pressed Submit');
  });

  test('the confirmation says what it costs the group', () => {
    // Two things a teacher should not discover afterwards: what gets handed in
    // is the draft as it stands now, and the group is told who submitted it.
    const sentence = describeTeacherSubmitConfirmation(['Devon', 'Maya']);

    expect(sentence).toMatch(/what the group has written so far/i);
    expect(sentence).toMatch(/see that you submitted it for them/i);
    expect(sentence).toContain('Devon and Maya have not pressed');
  });
});

/**
 * The groups board's one line: how many groups are in, and how many students
 * are holding the rest up. The teacher's entry point to the whole rule — before
 * this, a group stuck on one student was invisible until someone opened that
 * group's draft page and counted.
 */
describe('summarizeBoardSubmitProgress', () => {
  const status = (
    overrides: Partial<BoardGroupSubmitStatus> = {}
  ): BoardGroupSubmitStatus => ({
    total: 3,
    submittedCount: 0,
    everyoneSubmitted: false,
    outstanding: ['Devon', 'Maya', 'Ada'],
    submittedAt: null,
    submittedByTeacherName: null,
    ...overrides,
  });

  const submitted = () =>
    status({
      submittedCount: 3,
      everyoneSubmitted: true,
      outstanding: [],
      submittedAt: '2026-08-22T11:00:00.000Z',
    });

  test('counts the groups that are actually in', () => {
    const summary = summarizeBoardSubmitProgress([submitted(), status()]);

    expect(summary.groupsSubmitted).toBe(1);
    expect(summary.groupsTotal).toBe(2);
  });

  test('counts the students the class is waiting on', () => {
    // Only in groups that have not submitted: a submitted group's roster is
    // settled, whoever pressed.
    const summary = summarizeBoardSubmitProgress([
      submitted(),
      status({ outstanding: ['Devon'] }),
      status({ outstanding: ['Maya', 'Ada'] }),
    ]);

    expect(summary.studentsOutstanding).toBe(3);
  });

  test('says both numbers in one line', () => {
    const summary = summarizeBoardSubmitProgress([
      submitted(),
      status({ outstanding: ['Devon'] }),
    ]);

    expect(summary.sentence).toContain('1 of 2 groups');
    expect(summary.sentence).toContain('1 student');
  });

  test('pluralises the students it is waiting on', () => {
    const summary = summarizeBoardSubmitProgress([
      status({ outstanding: ['Devon', 'Maya'] }),
    ]);

    expect(summary.sentence).toContain('2 students');
  });

  test('says so when every group is in', () => {
    const summary = summarizeBoardSubmitProgress([submitted(), submitted()]);

    expect(summary.sentence).toMatch(/all 2 groups/i);
    expect(summary.studentsOutstanding).toBe(0);
  });

  test('an unopened board has nothing to report', () => {
    // Groups exist before they are opened; there is nothing to press yet.
    const summary = summarizeBoardSubmitProgress([]);

    expect(summary.sentence).toBe('');
    expect(summary.groupsTotal).toBe(0);
  });
});
