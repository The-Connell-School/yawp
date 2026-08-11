import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { redirect } from 'react-router';

const prisma = {
  assignmentTypeImage: {
    findUnique: mock(),
  },
};

const requireUserId = mock();

mock.module('~/utils/db.server.ts', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId }));

const { loader } = await import('./route');

function courseImageRequest(id: string) {
  return new Request(`https://example.com/api/image/course/${id}`);
}

describe('api.image.course.$id', () => {
  beforeEach(() => {
    prisma.assignmentTypeImage.findUnique.mockReset();
    requireUserId.mockReset();
    requireUserId.mockResolvedValue('user-1');
  });

  test('serves assignment type images through the course image URL used by students', async () => {
    prisma.assignmentTypeImage.findUnique.mockResolvedValue({
      contentType: 'image/png',
      blob: Buffer.from('course-image'),
    });

    const response = (await loader({
      request: courseImageRequest('image-1'),
      params: { id: 'image-1' },
    } as any)) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Content-Length')).toBe('12');
    expect(response.headers.get('Content-Disposition')).toBe(
      'inline; filename="image-1"'
    );
    expect(response.headers.get('Cache-Control')).toBe(
      'private, max-age=31536000, immutable'
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
        request: courseImageRequest('missing-image'),
        params: { id: 'missing-image' },
      } as any);
    } catch (error) {
      response = error as Response;
    }

    expect(response).not.toBeNull();
    expect(response!.status).toBe(404);
  });

  test('refuses the course image URL to a caller with no session', async () => {
    requireUserId.mockImplementation(() => {
      throw redirect('/auth/login');
    });

    await expect(
      loader({
        request: courseImageRequest('image-1'),
        params: { id: 'image-1' },
      } as any)
    ).rejects.toBeDefined();

    expect(prisma.assignmentTypeImage.findUnique).not.toHaveBeenCalled();
  });
});
