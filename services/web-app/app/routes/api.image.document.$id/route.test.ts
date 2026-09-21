import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { documentReadWhere } from '~/utils/document-access.server';

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

  test('scopes the lookup to the document audience for a non-admin', async () => {
    await call('img-1');

    const where = prisma.documentImage.findFirst.mock.calls[0]![0].where;
    expect(where.id).toBe('img-1');
    expect(where.deletedAt).toBeNull();
    expect(JSON.stringify(where.document)).toContain('profile-1');
  });

  test('grants the same audience the document itself grants', async () => {
    // A teacher reaching a submitted report through its class assignment, and
    // an active co-author on a shared draft, both read the document itself.
    // Narrowing the rule here renders their page with every figure broken, so
    // this asks the same helper the document loader asks.
    await call('img-1');

    const where = prisma.documentImage.findFirst.mock.calls[0]![0].where;
    const expected = documentReadWhere({ profileId: 'profile-1', isAdmin: false });

    // Structural, not deep-equal: the shared rule carries a `postAt: { lte: now }`
    // clause, so two calls a millisecond apart are never identical objects.
    expect(where.document.OR).toHaveLength(expected.OR!.length);
    const serialized = JSON.stringify(where.document);
    expect(serialized).toContain('classAssignment');
    expect(serialized).toContain('removedAt');
    expect(serialized).toContain('profile-1');
  });

  test('will not serve a figure out of a deleted document', async () => {
    await call('img-1');

    const where = prisma.documentImage.findFirst.mock.calls[0]![0].where;
    expect(where.document.deletedAt).toBeNull();
  });

  test('lets a platform admin through without the ownership clause', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({ isAdmin: true });

    await call('img-1');

    const where = prisma.documentImage.findFirst.mock.calls[0]![0].where;
    // Still scoped to a live document; just not to one audience.
    expect(where.document).toEqual({ deletedAt: null });
  });

  test('tells the browser not to sniff its way past the stored type', async () => {
    // These bytes came from a student, and they are served from our origin.
    const response = await call('img-1');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});
