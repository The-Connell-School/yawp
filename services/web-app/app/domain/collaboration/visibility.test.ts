import { describe, expect, test } from 'bun:test';
import { studentVisibleClassAssignmentWhere } from './visibility';

const ME = 'member-me';

/**
 * A tiny evaluator for the shape this predicate produces, so the tests can state
 * what a student SEES rather than restating the Prisma object back to itself. It
 * understands only the operators used here; anything else is a mistake worth
 * failing on rather than silently passing.
 */
function matches(
  where: ReturnType<typeof studentVisibleClassAssignmentWhere>,
  row: {
    collaborationEnabled: boolean;
    groups: { openedAt: Date | null; members: { membershipId: string; removedAt: Date | null }[] }[];
  }
) {
  const branches = where.OR;
  if (!Array.isArray(branches)) throw new Error('expected an OR of branches');

  return branches.some((branch: any) => {
    if (branch.assignment) {
      return (
        row.collaborationEnabled === branch.assignment.is.collaborationEnabled
      );
    }
    if (branch.documentGroups) {
      const some = branch.documentGroups.some;
      return row.groups.some(
        (group) =>
          group.openedAt !== null &&
          group.members.some(
            (member) =>
              member.membershipId === some.members.some.membershipId &&
              member.removedAt === null
          )
      );
    }
    throw new Error(`unrecognized branch: ${JSON.stringify(branch)}`);
  });
}

const visible = (row: Parameters<typeof matches>[1]) =>
  matches(studentVisibleClassAssignmentWhere(ME), row);

const openGroupWithMe = {
  openedAt: new Date('2026-08-17T12:00:00Z'),
  members: [{ membershipId: ME, removedAt: null }],
};

describe('studentVisibleClassAssignmentWhere', () => {
  test('a solo assignment is always visible', () => {
    // Every assignment that predates collaborative drafts lands here, so this
    // filter must be a no-op for all of them.
    expect(visible({ collaborationEnabled: false, groups: [] })).toBe(true);
  });

  test('a collaborative assignment is hidden before groups are arranged', () => {
    expect(visible({ collaborationEnabled: true, groups: [] })).toBe(false);
  });

  test('a collaborative assignment is hidden while groups are arranged but not opened', () => {
    // Arranging is a seating chart; opening is what creates the documents.
    expect(
      visible({
        collaborationEnabled: true,
        groups: [{ openedAt: null, members: [{ membershipId: ME, removedAt: null }] }],
      })
    ).toBe(false);
  });

  test('a collaborative assignment is visible once this student’s group is open', () => {
    expect(
      visible({ collaborationEnabled: true, groups: [openGroupWithMe] })
    ).toBe(true);
  });

  test('stays hidden from a student who is in no group, even after opening', () => {
    // The whole class's groups being open does not give this student a document
    // to open. Showing it would be an assignment that goes nowhere.
    expect(
      visible({
        collaborationEnabled: true,
        groups: [
          {
            openedAt: new Date('2026-08-17T12:00:00Z'),
            members: [{ membershipId: 'member-someone-else', removedAt: null }],
          },
        ],
      })
    ).toBe(false);
  });

  test('stays hidden from a student who was removed from their group', () => {
    expect(
      visible({
        collaborationEnabled: true,
        groups: [
          {
            openedAt: new Date('2026-08-17T12:00:00Z'),
            members: [
              { membershipId: ME, removedAt: new Date('2026-08-18T12:00:00Z') },
            ],
          },
        ],
      })
    ).toBe(false);
  });

  test('one open group among several unopened ones is enough', () => {
    expect(
      visible({
        collaborationEnabled: true,
        groups: [
          { openedAt: null, members: [] },
          openGroupWithMe,
        ],
      })
    ).toBe(true);
  });

  test('scopes the membership clause to the student it was built for', () => {
    const where = studentVisibleClassAssignmentWhere('member-other') as any;
    expect(where.OR[1].documentGroups.some.members.some.membershipId).toBe(
      'member-other'
    );
  });
});
