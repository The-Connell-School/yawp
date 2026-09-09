import { describe, expect, test } from 'bun:test';
import { buildClassDocumentScope } from './class-document-where.server';

describe('buildClassDocumentScope', () => {
  test('uses class assignment deployments for class work', () => {
    expect(buildClassDocumentScope('class-1', [])).toEqual({
      OR: [{ classAssignment: { classId: 'class-1' } }],
    });
  });

  test('includes practice docs for enrolled students when unfiltered', () => {
    expect(
      buildClassDocumentScope('class-1', [], {
        enrolledMembershipIds: ['membership-1', 'membership-2'],
      })
    ).toEqual({
      OR: [
        { classAssignment: { classId: 'class-1' } },
        {
          classAssignmentId: null,
          membershipId: { in: ['membership-1', 'membership-2'] },
        },
      ],
    });
  });

  test('narrows to one student assignment and practice docs when filtered', () => {
    expect(
      buildClassDocumentScope('class-1', [], { membershipId: 'membership-1' })
    ).toEqual({
      OR: [
        {
          classAssignment: {
            classId: 'class-1',
          },
          membershipId: 'membership-1',
        },
        {
          classAssignment: {
            classId: 'class-1',
            OR: [
              { postAt: null },
              { postAt: { lte: expect.any(Date) } },
            ],
          },
          group: {
            is: {
              members: {
                some: {
                  membershipId: 'membership-1',
                  removedAt: null,
                },
              },
            },
          },
        },
        { classAssignmentId: null, membershipId: 'membership-1' },
      ],
    });
  });

  test('also includes legacy documents preserved by DocumentClassForensic', () => {
    expect(
      buildClassDocumentScope('class-1', ['doc-legacy-1', 'doc-legacy-2'])
    ).toEqual({
      OR: [
        { classAssignment: { classId: 'class-1' } },
        { id: { in: ['doc-legacy-1', 'doc-legacy-2'] } },
      ],
    });
  });
});
