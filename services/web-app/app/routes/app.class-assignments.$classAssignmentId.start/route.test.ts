import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  classAssignment: { findFirst: mock() },
};

const requireUserId = mock();
const requireMembership = mock();
const createDocumentForAssignmentType = mock();
const findStudentGroupDocument = mock();
const redirectWithToast = mock();
class DocumentCreationError extends Error {}

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
mock.module('~/domain/documents.server', () => ({
  createDocumentForAssignmentType,
  DocumentCreationError,
}));
// Spread the pristine module: bun's mock.module is global to the test run, so
// replacing it wholesale would strip arrangeGroups/openGroups for other files
// (see the comment in test-preload.ts).
const actualGroups = globalThis.__realModules[
  '~/domain/collaboration/groups.server'
];
mock.module('~/domain/collaboration/groups.server', () => ({
  ...actualGroups,
  findStudentGroupDocument,
}));
mock.module('~/utils/toast.server', () => ({ redirectWithToast }));

const { action } = await import('./route');

afterAll(() => {
  mock.restore();
  mock.module('~/domain/collaboration/groups.server', () => actualGroups);
});

const call = () =>
  action({
    request: new Request('https://example.com/app/class-assignments/ca-1/start', {
      method: 'POST',
      body: new FormData(),
    }),
    params: { classAssignmentId: 'ca-1' },
  } as any);

const classAssignment = ({ collaborationEnabled = false } = {}) => ({
  id: 'ca-1',
  assignmentId: 'a-1',
  assignment: { assignmentTypeId: 'at-1', collaborationEnabled },
  class: {
    id: 'class-1',
    school: { id: 'school-1', organizationId: 'org-1' },
    teachers: [{ id: 'teacher-1' }],
  },
});

describe('class assignment start', () => {
  beforeEach(() => {
    prisma.classAssignment.findFirst.mockReset();
    requireUserId.mockReset().mockResolvedValue('user-1');
    requireMembership.mockReset().mockResolvedValue({
      id: 'member-1',
      role: 'STUDENT',
    });
    createDocumentForAssignmentType
      .mockReset()
      .mockResolvedValue({ documentId: 'doc-solo' });
    findStudentGroupDocument.mockReset().mockResolvedValue(null);
    redirectWithToast.mockReset().mockImplementation((to: string) => ({ to }));
  });

  describe('solo assignments (existing behavior)', () => {
    test('still creates a personal document and opens the solo editor', async () => {
      prisma.classAssignment.findFirst.mockResolvedValue(classAssignment());

      const result: any = await call();

      expect(createDocumentForAssignmentType).toHaveBeenCalledWith({
        membershipId: 'member-1',
        assignmentTypeId: 'at-1',
        assignmentId: 'a-1',
        classAssignmentId: 'ca-1',
      });
      expect(result.to).toContain('/app/documents/doc-solo');
      // The collaborative branch must not be consulted at all.
      expect(findStudentGroupDocument).not.toHaveBeenCalled();
    });
  });

  describe('collaborative assignments', () => {
    test('opens the group draft instead of creating a personal document', async () => {
      prisma.classAssignment.findFirst.mockResolvedValue(
        classAssignment({ collaborationEnabled: true })
      );
      findStudentGroupDocument.mockResolvedValue({ documentId: 'doc-group' });

      const result: any = await call();

      expect(result.to).toContain('/app/collab-documents/doc-group');
      // This is what removes the two-partners-click-Start race: no document is
      // created here at all.
      expect(createDocumentForAssignmentType).not.toHaveBeenCalled();
    });

    test('looks up the group for this student and class assignment', async () => {
      prisma.classAssignment.findFirst.mockResolvedValue(
        classAssignment({ collaborationEnabled: true })
      );
      findStudentGroupDocument.mockResolvedValue({ documentId: 'doc-group' });

      await call();

      expect(findStudentGroupDocument).toHaveBeenCalledWith({
        classAssignmentId: 'ca-1',
        membershipId: 'member-1',
      });
    });

    test('tells the student when their teacher has not opened groups yet', async () => {
      prisma.classAssignment.findFirst.mockResolvedValue(
        classAssignment({ collaborationEnabled: true })
      );
      findStudentGroupDocument.mockResolvedValue(null);

      await call();

      expect(createDocumentForAssignmentType).not.toHaveBeenCalled();
      const [, options] = redirectWithToast.mock.calls[0];
      expect(options.type).toBe('error');
      expect(options.description).toMatch(/not opened groups/i);
    });
  });

  test('non-students are still turned away', async () => {
    requireMembership.mockResolvedValue({ id: 'teacher-1', role: 'TEACHER' });

    await call();

    expect(prisma.classAssignment.findFirst).not.toHaveBeenCalled();
    const [, options] = redirectWithToast.mock.calls[0];
    expect(options.description).toMatch(/Only students/i);
  });
});

/**
 * Arrived on `main` while the collaboration branch was open, and both sides
 * created this file — so the two suites are merged here rather than one of them
 * being dropped.
 *
 * The block above mocks `~/utils/toast.server`, and bun's mock.module is global
 * to the test run, so this suite cannot get the real `redirectWithToast` back.
 * It stands in a passthrough that returns what the real helper returns — a 302
 * carrying `Location` — which leaves the assertions below testing the route
 * (where it sends a student, and that the query is gated on `postAt`) rather
 * than testing the toast helper.
 */
describe('student start is rejected when postAt is in the future', () => {
  beforeEach(() => {
    prisma.classAssignment.findFirst.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();
    redirectWithToast
      .mockReset()
      .mockImplementation(
        (to: string) =>
          new Response(null, { status: 302, headers: { Location: to } })
      );

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1' },
    });
  });

  test('findFirst applies postAt visibility gate and rejects', async () => {
    prisma.classAssignment.findFirst.mockResolvedValue(null);

    const response = await action({
      request: new Request(
        'https://example.test/app/class-assignments/ca-1/start',
        { method: 'POST', body: new FormData() }
      ),
      params: { classAssignmentId: 'ca-1' },
      context: {} as never,
    } as any);

    // Redirect back to assignments with a toast
    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response)) {
      throw new Error('Expected assignment-not-found redirect response');
    }
    expect(response.status).toBe(302);
    const location = response.headers.get('Location') || '';
    expect(location).toContain('/app?tab=assignments');

    // The query included the visibility gate on postAt
    const where = prisma.classAssignment.findFirst.mock.calls[0][0].where;
    expect(where).toEqual(
      expect.objectContaining({
        OR: [
          { postAt: null },
          { postAt: expect.objectContaining({ lte: expect.any(Date) }) },
        ],
      })
    );
  });
});
