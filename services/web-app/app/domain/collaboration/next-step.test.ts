import { describe, expect, test } from 'bun:test';
import { groupSetupNextStep } from './next-step';

describe('groupSetupNextStep', () => {
  test('a solo assignment has no group setup to do', () => {
    expect(
      groupSetupNextStep({
        assignmentId: 'a-1',
        collaborationEnabled: false,
        deployments: [{ classAssignmentId: 'ca-1', classId: 'c-1' }],
      })
    ).toBeNull();
  });

  test('one class goes straight to that class’s seating chart', () => {
    // There is no choice to present, so presenting one is a wasted click.
    expect(
      groupSetupNextStep({
        assignmentId: 'a-1',
        collaborationEnabled: true,
        deployments: [{ classAssignmentId: 'ca-1', classId: 'c-1' }],
      })
    ).toEqual({
      url: '/app/class-assignments/ca-1/groups',
      classCount: 1,
    });
  });

  test('several classes start a required setup sequence at the first class', () => {
    expect(
      groupSetupNextStep({
        assignmentId: 'a-1',
        collaborationEnabled: true,
        deployments: [
          { classAssignmentId: 'ca-1', classId: 'c-1' },
          { classAssignmentId: 'ca-2', classId: 'c-2' },
        ],
      })
    ).toEqual({
      url: '/app/class-assignments/ca-1/groups',
      classCount: 2,
    });
  });

  test('no deployments means nowhere to send them', () => {
    expect(
      groupSetupNextStep({
        assignmentId: 'a-1',
        collaborationEnabled: true,
        deployments: [],
      })
    ).toBeNull();
  });
});
