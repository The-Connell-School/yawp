import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = { lessonPlanUploadPicture: { findFirst: mock() } };
const requireLessonPlannerAccess = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/lesson-planner/lesson-planner-access.server', () => ({ requireLessonPlannerAccess }));

const { loader } = await import('./route');

const call = (id: string) =>
  loader({ request: new Request(`https://example.com/api/image/lesson-picture/${id}`), params: { id } } as never);

describe('api.image.lesson-picture.$id', () => {
  beforeEach(() => {
    requireLessonPlannerAccess.mockReset().mockResolvedValue({ membership: { id: 'teacher-1' } });
    prisma.lessonPlanUploadPicture.findFirst.mockReset().mockResolvedValue({
      contentType: 'image/jpeg',
      blob: Buffer.from([1, 2, 3]),
    });
  });

  test('serves the teacher’s own picture with its stored type, never sniffed', async () => {
    const response = await call('pic-1');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Cache-Control')).toContain('private');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(prisma.lessonPlanUploadPicture.findFirst.mock.calls[0]?.[0].where).toEqual({
      id: 'pic-1',
      membershipId: 'teacher-1',
    });
  });

  test('anyone else’s picture is not found', async () => {
    prisma.lessonPlanUploadPicture.findFirst.mockResolvedValue(null);
    await expect(call('pic-2')).rejects.toMatchObject({ init: { status: 404 } });
  });
});
