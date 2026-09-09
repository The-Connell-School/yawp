import { describe, expect, test } from 'bun:test';
import { buildSubmissionTitleEditWhere } from './submission-access.server';

describe('buildSubmissionTitleEditWhere', () => {
  test('requires an active group membership and current class enrollment', () => {
    const where = buildSubmissionTitleEditWhere({
      submissionId: 'submission-1',
      membershipId: 'student-1',
      organizationId: 'org-1',
      isAdmin: false,
    });

    const groupAccess = (where.document as any).is.OR[1];
    expect(groupAccess).toEqual({
      group: {
        is: {
          members: {
            some: { membershipId: 'student-1', removedAt: null },
          },
        },
      },
      classAssignment: {
        is: {
          class: {
            school: { organizationId: 'org-1' },
            students: { some: { id: 'student-1' } },
          },
        },
      },
    });
  });
});
