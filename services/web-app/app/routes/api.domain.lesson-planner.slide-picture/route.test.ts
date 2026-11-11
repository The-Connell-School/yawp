import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireMutableRequest = mock();
const requireLessonPlannerAccess = mock();
const getLessonPlannerReviewFlags = mock();
const prisma = {
  lessonPlanConversation: { findFirst: mock() },
  lessonPlanUploadPicture: { create: mock() },
};
mock.module('~/utils/auth.server', () => ({ requireMutableRequest, requireUserId: mock(), requireMembership: mock() }));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/lesson-planner/lesson-planner-access.server', () => ({ requireLessonPlannerAccess }));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({ getLessonPlannerReviewFlags }));

const { action } = await import('./route');
afterAll(() => mock.restore());

// A 2×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGP4z8DwnwEIAA/+Av7a4c0mAAAAAElFTkSuQmCC',
  'base64'
);
type Result = { init?: { status: number }; data?: Record<string, unknown> };
function post(file: File | null, conversationId = 'lesson-1') {
  const form = new FormData();
  form.set('conversationId', conversationId);
  if (file) form.set('file', file);
  return action({ request: new Request('http://localhost/api/domain/lesson-planner/slide-picture', { method: 'POST', body: form }) } as never) as Promise<Result>;
}

describe('api.domain.lesson-planner.slide-picture', () => {
  beforeEach(() => {
    requireMutableRequest.mockReset().mockResolvedValue(undefined);
    requireLessonPlannerAccess.mockReset().mockResolvedValue({ membership: { id: 'teacher-1', organization: { id: 'org-1' } } });
    getLessonPlannerReviewFlags.mockReset().mockResolvedValue({ deckV2: true, uploadPictures: true });
    prisma.lessonPlanConversation.findFirst.mockReset().mockResolvedValue({ id: 'lesson-1' });
    prisma.lessonPlanUploadPicture.create.mockReset().mockResolvedValue({ id: 'pic-1', altText: 'elephant', width: 2, height: 1 });
  });

  test('a real picture is kept for the teacher’s own lesson, and comes back ready for a slide', async () => {
    const result = await post(new File([PNG], 'elephant.png'));
    expect(result.data).toEqual({ ok: true, picture: { id: 'pic-1', altText: 'elephant', width: 2, height: 1 } });
    const data = prisma.lessonPlanUploadPicture.create.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({
      conversationId: 'lesson-1',
      membershipId: 'teacher-1',
      contentType: 'image/png',
      width: 2,
      height: 1,
      altText: 'elephant',
      byteSize: PNG.byteLength,
    });
    expect(data.uploadId).toBeUndefined();
  });

  test('not a picture a browser can show, by its bytes whatever its name: refused', async () => {
    const result = await post(new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'sneaky.png'));
    expect(result.init?.status).toBe(422);
    expect(prisma.lessonPlanUploadPicture.create).not.toHaveBeenCalled();
  });

  test('too large: refused before it is read', async () => {
    const result = await post(new File([new Uint8Array(9 * 1024 * 1024)], 'huge.png'));
    expect(result.init?.status).toBe(413);
  });

  test('someone else’s lesson, no file, or the flag off: refused', async () => {
    prisma.lessonPlanConversation.findFirst.mockResolvedValue(null);
    expect((await post(new File([PNG], 'a.png'))).init?.status).toBe(404);
    prisma.lessonPlanConversation.findFirst.mockResolvedValue({ id: 'lesson-1' });
    expect((await post(null)).init?.status).toBe(400);
    getLessonPlannerReviewFlags.mockResolvedValue({ deckV2: true, uploadPictures: false });
    expect((await post(new File([PNG], 'a.png'))).init?.status).toBe(404);
  });
});
