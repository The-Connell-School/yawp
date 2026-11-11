import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { MAX_SOURCE_BYTES } from '~/domain/lesson-planner/source-documents.server';

const requireMutableRequest = mock();
const requireLessonPlannerAccess = mock();
const getLessonPlannerReviewFlags = mock();
const readSourceDocument = mock();

class SourceDocumentError extends Error {}

const prisma = {
  lessonPlanConversation: { findFirst: mock() },
  lessonPlanUpload: { count: mock(), create: mock(), deleteMany: mock(), updateMany: mock(), findFirst: mock() },
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

  test('domain read failures redact sensitive substrings in messages', async () => {
    readSourceDocument.mockRejectedValue(
      new SourceDocumentError(
        'Only PDF files are supported. token=SECRET-TOKEN teacher@school.edu',
      ),
    );

    const form = new FormData();
    form.append('intent', 'upload');
    form.append('file', new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    const response = (await action({
      request: uploadRequest(form),
    } as any)) as ActionResult;

    const serialized = JSON.stringify(response.data);
    expect(response.init?.status).toBe(422);
    expect(serialized).not.toContain('SECRET-TOKEN');
    expect(String(response.data?.error)).toContain('Only PDF files are supported');
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

  function deckRead() {
    return {
      kind: 'pptx',
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      text: 'Slide 1\n[Picture 1: An elephant]',
      truncated: false,
      deck: {
        file: new Uint8Array([1, 2, 3]),
        pictures: [
          {
            position: 1,
            slideNumbers: [1, 2],
            altText: 'An elephant',
            format: 'JPEG',
            contentType: 'image/jpeg',
            bytes: new Uint8Array([9, 9]),
            width: 1824,
            height: 1216,
            background: false,
            skipped: null,
          },
          {
            position: 2,
            slideNumbers: [3],
            altText: 'A funnel',
            format: 'EMF',
            contentType: null,
            bytes: null,
            width: null,
            height: null,
            background: false,
            skipped: 'format',
          },
        ],
      },
    };
  }

  function uploadDeck() {
    const form = new FormData();
    form.append('intent', 'upload');
    form.append('file', new File(['deck'], 'thesis.pptx'));
    return action({ request: uploadRequest(form) } as any) as Promise<ActionResult>;
  }

  test('with the kept deck off, a deck is read for its text only, as before', async () => {
    await uploadDeck();
    expect(readSourceDocument.mock.calls[0]?.[1]).toEqual({ keepDeck: false });
    const data = prisma.lessonPlanUpload.create.mock.calls[0]?.[0].data;
    expect(data.file).toBeUndefined();
    expect(data.pictures).toBeUndefined();
  });

  test('with the kept deck on, the file and the pictures a browser can show are saved', async () => {
    getLessonPlannerReviewFlags.mockResolvedValue({ uploads: true, uploadPictures: true });
    readSourceDocument.mockResolvedValue(deckRead());
    prisma.lessonPlanUpload.create.mockResolvedValue({
      id: 'up-2',
      name: 'thesis.pptx',
      truncated: false,
      text: 'Slide 1',
      mode: null,
      _count: { pictures: 1 },
    });
    const response = await uploadDeck();
    expect(readSourceDocument.mock.calls[0]?.[1]).toEqual({ keepDeck: true });
    const data = prisma.lessonPlanUpload.create.mock.calls[0]?.[0].data;
    expect(data.file).toEqual(new Uint8Array([1, 2, 3]));
    expect(data.keptDeck).toBe(true);
    expect(data.pictures.create).toEqual([
      {
        membershipId: 'teacher-1',
        position: 1,
        slideNumbers: [1, 2],
        altText: 'An elephant',
        contentType: 'image/jpeg',
        byteSize: 2,
        width: 1824,
        height: 1216,
        blob: new Uint8Array([9, 9]),
      },
    ]);
    expect(response.data?.upload).toMatchObject({ id: 'up-2', deck: { pictures: 1, mode: null } });
  });

  function modeRequest(mode: string, uploadId = 'up-2') {
    const form = new FormData();
    form.append('intent', 'mode');
    form.append('uploadId', uploadId);
    form.append('mode', mode);
    return action({ request: uploadRequest(form) } as any) as Promise<ActionResult>;
  }

  test('the teacher says what they want from their deck', async () => {
    getLessonPlannerReviewFlags.mockResolvedValue({
      uploads: true,
      uploadPictures: true,
      teachMySlides: true,
      refreshMyDeck: true,
    });
    prisma.lessonPlanUpload.updateMany.mockReset().mockResolvedValue({ count: 1 });
    expect((await modeRequest('teach')).data?.mode).toBe('teach');
    expect(prisma.lessonPlanUpload.updateMany.mock.calls[0]?.[0]).toEqual({
      where: { id: 'up-2', membershipId: 'teacher-1', keptDeck: true },
      data: { mode: 'teach' },
    });
    expect((await modeRequest('refresh')).data?.mode).toBe('refresh');
    expect((await modeRequest('')).data?.mode).toBeNull();
  });

  test('a choice whose flag is off is refused', async () => {
    getLessonPlannerReviewFlags.mockResolvedValue({ uploads: true, uploadPictures: true, teachMySlides: true });
    prisma.lessonPlanUpload.updateMany.mockReset().mockResolvedValue({ count: 1 });
    expect((await modeRequest('refresh')).init?.status).toBe(404);
    expect((await modeRequest('sideways')).init?.status).toBe(400);
    expect(prisma.lessonPlanUpload.updateMany).not.toHaveBeenCalled();
  });

  test('only the teacher’s own kept deck takes a choice', async () => {
    getLessonPlannerReviewFlags.mockResolvedValue({ uploads: true, uploadPictures: true, teachMySlides: true });
    prisma.lessonPlanUpload.updateMany.mockReset().mockResolvedValue({ count: 0 });
    expect((await modeRequest('teach', 'someone-elses')).init?.status).toBe(404);
  });
});
