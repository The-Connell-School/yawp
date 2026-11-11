import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = { lessonPlanUpload: { findFirst: mock() } };
const requireLessonPlannerAccess = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/lesson-planner/lesson-planner-access.server', () => ({ requireLessonPlannerAccess }));

const { loader } = await import('./route');

const call = (uploadId: string) =>
  loader({
    request: new Request(`https://example.com/api/lesson-planner-deck/${uploadId}`),
    params: { uploadId },
  } as never);

describe('api.lesson-planner-deck.$uploadId', () => {
  beforeEach(() => {
    requireLessonPlannerAccess.mockReset().mockResolvedValue({ membership: { id: 'teacher-1' } });
    prisma.lessonPlanUpload.findFirst.mockReset().mockResolvedValue({
      name: 'Develop Your “Thesis”.pptx',
      file: Buffer.from([80, 75, 3, 4]),
    });
  });

  test('gives the teacher back their own deck, exactly as uploaded', async () => {
    const response = await call('up-1');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
    expect(response.headers.get('Content-Disposition')).toBe(
      `attachment; filename="Develop Your Thesis.pptx"; filename*=UTF-8''Develop%20Your%20%E2%80%9CThesis%E2%80%9D.pptx`
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([80, 75, 3, 4]));
    expect(prisma.lessonPlanUpload.findFirst.mock.calls[0]?.[0].where).toEqual({
      id: 'up-1',
      membershipId: 'teacher-1',
      file: { not: null },
    });
  });

  test('a deck that was not kept, or is someone else’s, is not found', async () => {
    prisma.lessonPlanUpload.findFirst.mockResolvedValue(null);
    await expect(call('up-2')).rejects.toMatchObject({ init: { status: 404 } });
  });
});
