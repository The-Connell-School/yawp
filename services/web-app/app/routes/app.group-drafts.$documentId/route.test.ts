import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = { document: { findFirst: mock() } };
const requireUserId = mock();
const requireMembership = mock();
const getIsPlatformAdmin = mock();
const buildContributionBreakdown = mock();
const readMemberGrades = mock();
const recordMemberGrade = mock();
class MemberGradeError extends Error {}

const actualDocumentAccess = globalThis.__realModules[
  '~/utils/document-access.server'
];

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
mock.module('~/utils/document-access.server', () => ({
  ...actualDocumentAccess,
  getIsPlatformAdmin,
}));
mock.module('~/domain/collaboration/contribution.server', () => ({
  buildContributionBreakdown,
}));
mock.module('~/domain/collaboration/member-grades.server', () => ({
  readMemberGrades,
  recordMemberGrade,
  MemberGradeError,
}));

const { action, loader } = await import('./route');

afterAll(() => {
  mock.restore();
  mock.module('~/utils/document-access.server', () => actualDocumentAccess);
});

const get = () =>
  loader({
    request: new Request('https://example.com/app/group-drafts/doc-1'),
    params: { documentId: 'doc-1' },
  } as any);

const readBody = (response: any) =>
  typeof response.json === 'function' ? response.json() : response.data;

const docRow = ({ classAssignmentId = 'ca-1' as string | null } = {}) => ({
  id: 'doc-1',
  title: 'Untitled',
  assignment: { id: 'a-1', title: 'Expansion Plan' },
  group: {
    id: 'group-1',
    label: 'Group 2',
    classAssignmentId,
    classAssignment: classAssignmentId ? { classId: 'class-1' } : null,
    members: [
      {
        membershipId: 'member-1',
        membership: { user: { name: 'Maya P.', email: 'maya@x.com' } },
      },
      {
        membershipId: 'member-2',
        membership: { user: { name: null, email: 'devon@x.com' } },
      },
    ],
  },
});

describe('app.group-drafts.$documentId loader', () => {
  beforeEach(() => {
    requireUserId.mockReset().mockResolvedValue('user-1');
    requireMembership
      .mockReset()
      .mockResolvedValue({ id: 'teacher-1', role: 'TEACHER' });
    getIsPlatformAdmin.mockReset().mockResolvedValue(false);
    prisma.document.findFirst.mockReset().mockResolvedValue(docRow());
    buildContributionBreakdown.mockReset().mockResolvedValue({
      members: [],
      paragraphs: [],
      unattributedChars: 0,
      totalChars: 0,
    });
    readMemberGrades.mockReset().mockResolvedValue(new Map());
    recordMemberGrade.mockReset().mockResolvedValue({ saved: true });
  });

  test('404s for a student', async () => {
    // A student must not see their partner's session times and character counts.
    // Their view of the draft is the collaborative editor.
    requireMembership.mockResolvedValue({ id: 'member-1', role: 'STUDENT' });

    await expect(get()).rejects.toBeDefined();
    expect(prisma.document.findFirst).not.toHaveBeenCalled();
  });

  test('404s when the document is not this teacher’s to see', async () => {
    prisma.document.findFirst.mockResolvedValue(null);

    await expect(get()).rejects.toBeDefined();
  });

  test('only serves an opened collaborative draft', async () => {
    // collaborationRoomWhere is what keeps every solo document off this page.
    await get();

    const where = prisma.document.findFirst.mock.calls[0][0].where;
    expect(where.group).toEqual({ is: { openedAt: { not: null } } });
    expect(where.assignmentType).toEqual({
      is: { collaborationSupported: true },
    });
  });

  test('applies the read scope alongside the room predicate', async () => {
    // Both, not either: the room predicate says "this is a group draft" and the
    // read scope says "and you are allowed to see it".
    await get();

    const where = prisma.document.findFirst.mock.calls[0][0].where;
    expect(Array.isArray(where.AND)).toBe(true);
    expect(where.AND).toHaveLength(1);
  });

  test('builds the breakdown from the group roster', async () => {
    await get();

    expect(buildContributionBreakdown).toHaveBeenCalledWith({
      documentId: 'doc-1',
      roster: [
        { membershipId: 'member-1', name: 'Maya P.' },
        // Falls back to email when a student has no name set.
        { membershipId: 'member-2', name: 'devon@x.com' },
      ],
    });
  });

  test('sends the teacher back to the groups page they came from', async () => {
    const body = await readBody(await get());

    expect(body.backTo).toBe('/app/class-assignments/ca-1/groups');
  });

  test('a student-share draft has no groups page to go back to', async () => {
    // Those belong to no class assignment, so the dashboard is the only sane
    // destination.
    prisma.document.findFirst.mockResolvedValue(
      docRow({ classAssignmentId: null })
    );

    const body = await readBody(await get());

    expect(body.backTo).toBe('/app');
  });

  test('prefers the assignment title over the document title', async () => {
    const body = await readBody(await get());

    expect(body.title).toBe('Expansion Plan');
  });

  test('serialises existing grades for the panel', async () => {
    readMemberGrades.mockResolvedValue(
      new Map([
        [
          'member-1',
          { score: '18/20', feedback: 'Strong.', releasedAt: null },
        ],
      ])
    );

    const body = await readBody(await get());

    expect(body.grades['member-1']).toEqual({
      score: '18/20',
      feedback: 'Strong.',
      releasedAt: null,
    });
  });

  test('a platform admin may read it without being the teacher', async () => {
    requireMembership.mockResolvedValue({ id: 'admin-1', role: 'OWNER' });
    getIsPlatformAdmin.mockResolvedValue(true);

    const body = await readBody(await get());

    expect(body.documentId).toBe('doc-1');
  });

  describe('grading', () => {
    const post = (fields: Record<string, string>) => {
      const form = new FormData();
      for (const [key, value] of Object.entries(fields)) form.append(key, value);
      return action({
        request: new Request('https://example.com/app/group-drafts/doc-1', {
          method: 'POST',
          body: form,
        }),
        params: { documentId: 'doc-1' },
      } as any);
    };

    test('records a grade against the group the document belongs to', async () => {
      await post({ membershipId: 'member-1', score: '18/20', feedback: 'Good.' });

      expect(recordMemberGrade).toHaveBeenCalledWith(
        expect.objectContaining({
          groupId: 'group-1',
          membershipId: 'member-1',
          gradedByMembershipId: 'teacher-1',
          score: '18/20',
        })
      );
    });

    test('re-derives the group rather than trusting a posted id', async () => {
      // The form is teacher-facing, but the group id must still come from the
      // document under the same scope the loader uses.
      await post({
        membershipId: 'member-1',
        score: '5',
        groupId: 'group-somebody-elses',
      });

      expect(recordMemberGrade).toHaveBeenCalledWith(
        expect.objectContaining({ groupId: 'group-1' })
      );
    });

    test('leaves release alone when the form does not mention it', async () => {
      // Saving a draft grade must not quietly publish it.
      await post({ membershipId: 'member-1', score: '18/20' });

      expect(recordMemberGrade.mock.calls[0][0].release).toBeUndefined();
    });

    test('shares a grade with the student when asked', async () => {
      await post({ membershipId: 'member-1', score: '18/20', release: 'true' });

      expect(recordMemberGrade.mock.calls[0][0].release).toBe(true);
    });

    test('takes a grade back when asked', async () => {
      await post({ membershipId: 'member-1', score: '18/20', release: 'false' });

      expect(recordMemberGrade.mock.calls[0][0].release).toBe(false);
    });

    test('refuses a student', async () => {
      requireMembership.mockResolvedValue({ id: 'member-1', role: 'STUDENT' });

      const response: any = await post({ membershipId: 'member-1', score: '5' });

      expect(recordMemberGrade).not.toHaveBeenCalled();
      expect((await readBody(response)).success).toBe(false);
    });

    test('refuses a document this teacher cannot see', async () => {
      prisma.document.findFirst.mockResolvedValue(null);

      const response: any = await post({ membershipId: 'member-1', score: '5' });

      expect(recordMemberGrade).not.toHaveBeenCalled();
      expect((await readBody(response)).success).toBe(false);
    });

    test('reports a refusal inline rather than throwing', async () => {
      recordMemberGrade.mockRejectedValue(
        new MemberGradeError('That student is not in this group.')
      );

      const response: any = await post({ membershipId: 'x', score: '5' });

      expect((await readBody(response)).message).toMatch(/not in this group/i);
    });

    test('does not swallow an unexpected failure as a refusal', async () => {
      recordMemberGrade.mockRejectedValue(new Error('connection reset'));

      await expect(
        post({ membershipId: 'member-1', score: '5' })
      ).rejects.toThrow(/connection reset/);
    });
  });
});
