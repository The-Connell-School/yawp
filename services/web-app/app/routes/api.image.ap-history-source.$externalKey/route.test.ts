import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  apHistoryPromptLibrarySource: {
    findUnique: mock(),
  },
};

mock.module('~/utils/db.server.ts', () => ({ prisma }));

const { loader } = await import('./route');

describe('api.image.ap-history-source.$externalKey', () => {
  beforeEach(() => {
    prisma.apHistoryPromptLibrarySource.findUnique.mockReset();
  });

  test('streams the stored source image blob by external key', async () => {
    prisma.apHistoryPromptLibrarySource.findUnique.mockResolvedValue({
      imageContentType: 'image/svg+xml',
      imageBlob: Buffer.from('<svg/>'),
    });

    const response = (await loader({
      params: { externalKey: 'apush-dbq-american-independence-doc-8' },
    } as any)) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=31536000, immutable'
    );
    expect(await response.text()).toBe('<svg/>');
    expect(
      prisma.apHistoryPromptLibrarySource.findUnique
    ).toHaveBeenCalledWith({
      where: { externalKey: 'apush-dbq-american-independence-doc-8' },
      select: { imageContentType: true, imageBlob: true },
    });
  });

  test('returns 404 when the source has no stored image', async () => {
    prisma.apHistoryPromptLibrarySource.findUnique.mockResolvedValue({
      imageContentType: null,
      imageBlob: null,
    });

    let response: Response | null = null;
    try {
      await loader({
        params: { externalKey: 'apush-dbq-american-independence-doc-1' },
      } as any);
    } catch (error) {
      response = error as Response;
    }

    expect(response).not.toBeNull();
    expect(response!.status).toBe(404);
  });

  test('returns 404 when the source key is unknown', async () => {
    prisma.apHistoryPromptLibrarySource.findUnique.mockResolvedValue(null);

    let response: Response | null = null;
    try {
      await loader({ params: { externalKey: 'nope' } } as any);
    } catch (error) {
      response = error as Response;
    }

    expect(response).not.toBeNull();
    expect(response!.status).toBe(404);
  });
});
