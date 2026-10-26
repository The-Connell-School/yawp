import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  lessonPlanConversation: { findFirst: mock() },
  lessonPlanUpload: { count: mock(), create: mock() },
};
const requireMutableRequest = mock();
const requireLessonPlannerAccess = mock();
const getLessonPlannerReviewFlags = mock();
const readSourceDocument = mock();

class SourceDocumentError extends Error {}

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireMutableRequest }));
mock.module('~/utils/lesson-planner/lesson-planner-access.server', () => ({
  requireLessonPlannerAccess,
}));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  getLessonPlannerReviewFlags,
}));
mock.module('~/domain/lesson-planner/source-documents.server', () => ({
  MAX_SOURCE_BYTES: 10 * 1024 * 1024,
  MAX_SOURCES_PER_LESSON: 10,
  readSourceDocument,
  SourceDocumentError,
}));

const { action } = await import('./route');

function uploadRequest() {
  const form = new FormData();
  form.set('intent', 'upload');
  form.set('file', new File(['hello'], 'notes.txt', { type: 'text/plain' }));
  return new Request('https://yawp.school/api/domain/lesson-planner/uploads', {
    method: 'POST',
    body: form,
  });
}

describe('api.domain.lesson-planner.uploads', () => {
  beforeEach(() => {
    requireMutableRequest.mockResolvedValue(undefined);
    requireLessonPlannerAccess.mockResolvedValue({
      membership: { id: 'member-1', organization: { id: 'org-1' } },
    });
    getLessonPlannerReviewFlags.mockResolvedValue({ uploads: true });
    prisma.lessonPlanConversation.findFirst.mockResolvedValue(null);
    prisma.lessonPlanUpload.count.mockResolvedValue(0);
  });

  test('unexpected read failures return stable copy without raw exception text', async () => {
    const sensitive =
      'Invalid `prisma.user.findMany()` token=SECRET-TOKEN teacher@school.edu';
    readSourceDocument.mockRejectedValue(new Error(sensitive));

    const response = await action({
      request: uploadRequest(),
    } as any);

    const body =
      typeof response.json === 'function' ? await response.json() : response.data;
    const serialized = JSON.stringify(body);
    expect(response.status ?? response.init?.status).toBe(422);
    expect(serialized).not.toContain('SECRET-TOKEN');
    expect(body.error).toBe('Could not read that document. Try another file.');
  });
});
