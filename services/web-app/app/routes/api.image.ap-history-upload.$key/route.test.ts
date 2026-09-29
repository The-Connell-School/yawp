import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  apHistoryCustomSourceImage: { findUnique: mock() },
};

mock.module('~/utils/db.server.ts', () => ({ prisma }));

const { loader } = await import('./route');

describe('api.image.ap-history-upload.$key', () => {
  beforeEach(() => {
    prisma.apHistoryCustomSourceImage.findUnique.mockReset();
  });

  test('streams an uploaded source image by key', async () => {
    prisma.apHistoryCustomSourceImage.findUnique.mockResolvedValue({
      contentType: 'image/png',
      blob: Buffer.from('png-bytes'),
    });

    const response = (await loader({
      params: { key: 'upload-123' },
    } as any)) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(await response.text()).toBe('png-bytes');
    expect(prisma.apHistoryCustomSourceImage.findUnique).toHaveBeenCalledWith({
      where: { key: 'upload-123' },
      select: { contentType: true, blob: true },
    });
  });

  test('returns 404 for an unknown key', async () => {
    prisma.apHistoryCustomSourceImage.findUnique.mockResolvedValue(null);

    let response: Response | null = null;
    try {
      await loader({ params: { key: 'nope' } } as any);
    } catch (error) {
      response = error as Response;
    }

    expect(response?.status).toBe(404);
  });
});
