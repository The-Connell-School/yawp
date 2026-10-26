import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { MAX_SOURCE_BYTES } from '~/domain/lesson-planner/source-documents.server';

const requireMutableRequest = mock();
const requireLessonPlannerAccess = mock();
const getLessonPlannerReviewFlags = mock();
const readSourceDocument = mock();

class SourceDocumentError extends Error {}

const prisma = {
  lessonPlanConversation: { findFirst: mock() },
  lessonPlanUpload: { count: mock(), create: mock(), deleteMany: mock() },
};

mock.module('~/utils/auth.server', () => ({
  requireMutableRequest,
  requireUserId: mock(),
  requireMembership: mock(),
}));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/lesson-planner/lesson-planner-access.server', () => ({
  requireLessonPlannerAccess,
}));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  getLessonPlannerReviewFlags,
}));
mock.module('~/domain/lesson-planner/source-documents.server', () => ({
  MAX_SOURCE_BYTES,
  MAX_SOURCES_PER_LESSON: 10,
  readSourceDocument,
  SourceDocumentError,
}));

const { action } = await import('./route');

const MAX_UPLOAD_BODY_BYTES = MAX_SOURCE_BYTES + 1024 * 1024;
const URL = 'http://localhost/api/domain/lesson-planner/uploads';

type ActionResult = {
  init?: { status: number };
  data?: Record<string, unknown>;
};

afterAll(() => mock.restore());

function uploadRequest(
  body: BodyInit,
  headers: Record<string, string> = {}
) {
  return new Request(URL, {
    method: 'POST',
    headers,
    body,
  });
}

beforeEach(() => {
  requireMutableRequest.mockReset().mockResolvedValue(undefined);
  requireLessonPlannerAccess.mockReset().mockResolvedValue({
    membership: { id: 'teacher-1', organization: { id: 'org-1' } },
    allowed: true,
  });
  getLessonPlannerReviewFlags.mockReset().mockResolvedValue({ uploads: true });
  prisma.lessonPlanUpload.count.mockReset().mockResolvedValue(0);
  prisma.lessonPlanUpload.create.mockReset().mockResolvedValue({
    id: 'up-1',
    name: 'notes.txt',
    truncated: false,
    text: 'hello',
  });
  prisma.lessonPlanConversation.findFirst.mockReset().mockResolvedValue(null);
  readSourceDocument.mockReset().mockResolvedValue({
    kind: 'text',
    contentType: 'text/plain',
    text: 'hello',
    truncated: false,
  });
});

describe('api.domain.lesson-planner.uploads action', () => {
  test('413 when Content-Length is over 11 MB before the body is read', async () => {
    const response = (await action({
      request: uploadRequest('x', {
        'Content-Length': String(MAX_UPLOAD_BODY_BYTES + 1),
      }),
    } as any)) as ActionResult;
    expect(response.init?.status).toBe(413);
    expect(response.data?.error).toContain('10 MB');
    expect(readSourceDocument).not.toHaveBeenCalled();
  });

  test('413 when there is no Content-Length and the body exceeds 11 MB', async () => {
    const response = (await action({
      request: uploadRequest(new Uint8Array(MAX_UPLOAD_BODY_BYTES + 1)),
    } as any)) as ActionResult;
    expect(response.init?.status).toBe(413);
    expect(response.data?.error).toContain('10 MB');
    expect(readSourceDocument).not.toHaveBeenCalled();
  });

  test('accepts a small multipart upload', async () => {
    const form = new FormData();
    form.append('intent', 'upload');
    form.append('file', new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    const response = (await action({
      request: uploadRequest(form),
    } as any)) as ActionResult;
    expect(response.data?.ok).toBe(true);
    expect((response.data?.upload as { id: string })?.id).toBe('up-1');
    expect(readSourceDocument).toHaveBeenCalledTimes(1);
    expect(prisma.lessonPlanUpload.create).toHaveBeenCalledTimes(1);
  });

  test('unexpected read failures return stable copy without raw exception text', async () => {
    const sensitive =
      'Invalid `prisma.user.findMany()` token=SECRET-TOKEN teacher@school.edu';
    readSourceDocument.mockRejectedValue(new Error(sensitive));

    const form = new FormData();
    form.append('intent', 'upload');
    form.append('file', new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    const response = (await action({
      request: uploadRequest(form),
    } as any)) as ActionResult;

    const serialized = JSON.stringify(response.data);
    expect(response.init?.status).toBe(422);
    expect(serialized).not.toContain('SECRET-TOKEN');
    expect(response.data?.error).toBe(
      'Could not read that document. Try another file.'
    );
  });
});
