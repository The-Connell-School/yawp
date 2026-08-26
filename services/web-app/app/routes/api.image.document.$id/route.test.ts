import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  user: { findUniqueOrThrow: mock() },
  documentImage: { findFirst: mock() },
};

const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));

const { loader } = await import('./route');

function call(id: string) {
  return loader({
    request: new Request(`https://example.com/api/image/document/${id}`),
    params: { id },
    context: {} as never,
  } as never);
}

describe('api.image.document.$id', () => {
  beforeEach(() => {
    for (const model of Object.values(prisma)) {
      for (const fn of Object.values(model)) {
        (fn as ReturnType<typeof mock>).mockReset();
      }
    }
    requireUserId.mockReset();
    requireMembership.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({ id: 'profile-1' });
    prisma.user.findUniqueOrThrow.mockResolvedValue({ isAdmin: false });
    prisma.documentImage.findFirst.mockResolvedValue({
      contentType: 'image/png',
      altText: 'Revenue by year',
      blob: Buffer.from([1, 2, 3, 4]),
    });
  });

  test('serves the stored bytes with the stored content type', async () => {
    const response = await call('img-1');

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Content-Length')).toBe('4');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from([1, 2, 3, 4]));
  });

  test('never lets a shared cache re-serve a session-scoped image', async () => {
    const response = await call('img-1');
    expect(response.headers.get('Cache-Control')).toContain('private');
  });

  test('404s an image the caller cannot reach', async () => {
    prisma.documentImage.findFirst.mockResolvedValue(null);
    const response = await call('img-1').catch((thrown: Response) => thrown);
    expect(response.status).toBe(404);
  });

  test('scopes the lookup to the author and their teachers for a non-admin', async () => {
    await call('img-1');

    const where = prisma.documentImage.findFirst.mock.calls[0]![0].where;
    expect(where.id).toBe('img-1');
    expect(where.deletedAt).toBeNull();
    expect(JSON.stringify(where.document)).toContain('profile-1');
  });

  test('lets a platform admin through without the ownership clause', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({ isAdmin: true });

    await call('img-1');

    const where = prisma.documentImage.findFirst.mock.calls[0]![0].where;
    expect(where.document).toBeUndefined();
  });
});
