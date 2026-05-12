import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignmentTypeImage: {
    findUnique: mock(),
  },
};

mock.module('~/utils/db.server.ts', () => ({ prisma }));

const { loader } = await import('./route');

describe('api.image.course.$id', () => {
  beforeEach(() => {
    prisma.assignmentTypeImage.findUnique.mockReset();
  });

  test('serves assignment type images through the course image URL used by students', async () => {
    prisma.assignmentTypeImage.findUnique.mockResolvedValue({
      contentType: 'image/png',
      blob: Buffer.from('course-image'),
    });

    const response = (await loader({
      params: { id: 'image-1' },
    } as any)) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Content-Length')).toBe('12');
    expect(response.headers.get('Content-Disposition')).toBe(
      'inline; filename="image-1"'
    );
    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=31536000, immutable'
    );
    expect(await response.text()).toBe('course-image');
    expect(prisma.assignmentTypeImage.findUnique).toHaveBeenCalledWith({
      where: { id: 'image-1' },
      select: { contentType: true, blob: true },
    });
  });

  test('returns not found when the course image id is missing', async () => {
    prisma.assignmentTypeImage.findUnique.mockResolvedValue(null);

    let response: Response | null = null;
    try {
      await loader({
        params: { id: 'missing-image' },
      } as any);
    } catch (error) {
      response = error as Response;
    }

    expect(response).not.toBeNull();
    expect(response!.status).toBe(404);
  });
});
