import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireAdmin = mock();

mock.module('~/utils/auth.server', () => ({
  requireAdmin,
}));

const { loader } = await import('./route');
const { CLASS_ART_LIBRARY } = await import('~/utils/class-art');

describe('admin general loader', () => {
  beforeEach(() => {
    requireAdmin.mockReset();
    requireAdmin.mockResolvedValue(undefined);
  });

  test('requires admin and returns every library artwork once', async () => {
    const response = await loader({
      request: new Request('https://example.test/app/admin/general'),
      params: {},
    } as any);

    expect(requireAdmin).toHaveBeenCalledTimes(1);
    const data = (response as { data: { artworks: Array<{ src: string; label: string }> } }).data;
    expect(data.artworks).toHaveLength(CLASS_ART_LIBRARY.length);
    expect(data.artworks[0]).toEqual({
      src: CLASS_ART_LIBRARY[0].src,
      label: expect.stringContaining('—'),
    });
    expect(data.artworks.every((artwork: { label: string }) => !artwork.label.includes('public domain'))).toBe(true);
  });
});
