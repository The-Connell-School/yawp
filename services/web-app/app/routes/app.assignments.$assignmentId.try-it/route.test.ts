import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const resolveTeacherTryItClassAssignment = mock();
const createTeacherAssignmentTestDocument = mock();
const redirectWithToast = mock();

class DocumentCreationError extends Error {}

mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/domain/assignments/teacher-assignment-try-it.server', () => ({
  resolveTeacherTryItClassAssignment,
}));
mock.module('~/domain/documents.server', () => ({
  DocumentCreationError,
  documentCreationErrorTextForClient: (_e: Error, fallback: string) => fallback,
}));
mock.module('~/domain/assignments/teacher-assignment-preview.server', () => ({
  createTeacherAssignmentTestDocument,
}));
mock.module('~/utils/toast.server', () => ({ redirectWithToast }));

const { loader } = await import('./route');

afterAll(() => mock.restore());

const baseRequest = (search = '') =>
  new Request(
    `https://example.test/app/assignments/a-1/try-it${search}`,
    { method: 'GET' }
  );

describe('assignment try-it loader', () => {
  beforeEach(() => {
    requireUserId.mockReset().mockResolvedValue('user-1');
    requireMembership.mockReset().mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
    });
    resolveTeacherTryItClassAssignment.mockReset().mockResolvedValue({
      id: 'ca-1',
      assignmentId: 'a-1',
      assignment: { assignmentTypeId: 'at-1', collaborationEnabled: false },
    });
    createTeacherAssignmentTestDocument
      .mockReset()
      .mockResolvedValue({ documentId: 'doc-try' });
    redirectWithToast.mockReset();
  });

  test('creates a new teacher test document and redirects to the editor', async () => {
    const response = await loader({
      request: baseRequest('?returnTo=%2Fapp%2Fassignments'),
      params: { assignmentId: 'a-1' },
    } as any);

    expect(createTeacherAssignmentTestDocument).toHaveBeenCalledWith({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      assignmentId: 'a-1',
      teacherPreviewClassAssignmentId: 'ca-1',
    });
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).headers.get('Location')).toContain(
      '/app/documents/doc-try'
    );
  });

  test('rejects non-teachers', async () => {
    requireMembership.mockResolvedValue({ id: 'student-1', role: 'STUDENT' });

    await loader({
      request: baseRequest(),
      params: { assignmentId: 'a-1' },
    } as any);

    expect(redirectWithToast).toHaveBeenCalled();
    expect(createTeacherAssignmentTestDocument).not.toHaveBeenCalled();
  });
});
