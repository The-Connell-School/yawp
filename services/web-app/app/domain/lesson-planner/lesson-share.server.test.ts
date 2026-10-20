import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = { lessonShareLink: { findUnique: mock(), create: mock(), updateMany: mock() } };
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/email.server', () => ({ sendEmail: mock() }));
const { createShareLink, findShareLink, hashShareToken, newShareToken } = await import('./lesson-share.server');

const LIVE = {
  id: 'l1',
  audience: 'student',
  includes: ['deck'],
  note: null,
  body: null,
  revokedAt: null,
  expiresAt: null,
  conversation: { id: 'c1', deletedAt: null },
};

beforeEach(() => {
  prisma.lessonShareLink.findUnique.mockReset();
  prisma.lessonShareLink.create.mockReset().mockResolvedValue({ id: 'l1' });
});

describe('share links: the link is the key (stack page redesign)', () => {
  test('tokens are long and random; only their hash is stored', async () => {
    const a = newShareToken();
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(newShareToken()).not.toBe(a);
    const { token } = await createShareLink({ conversationId: 'c1', audience: 'student', includes: ['deck'] });
    const data = prisma.lessonShareLink.create.mock.calls[0][0].data;
    expect(data.tokenHash).toBe(hashShareToken(token));
    expect(JSON.stringify(data)).not.toContain(token);
  });

  test('a malformed token never reaches the database', async () => {
    expect(await findShareLink('../../etc')).toBeNull();
    expect(await findShareLink('short')).toBeNull();
    expect(prisma.lessonShareLink.findUnique).not.toHaveBeenCalled();
  });

  test('a revoked, expired or deleted lesson’s link opens nothing', async () => {
    const token = newShareToken();
    prisma.lessonShareLink.findUnique.mockResolvedValue({ ...LIVE, revokedAt: new Date() });
    expect(await findShareLink(token)).toBeNull();
    prisma.lessonShareLink.findUnique.mockResolvedValue({ ...LIVE, expiresAt: new Date(Date.now() - 1000) });
    expect(await findShareLink(token)).toBeNull();
    prisma.lessonShareLink.findUnique.mockResolvedValue({ ...LIVE, conversation: { id: 'c1', deletedAt: new Date() } });
    expect(await findShareLink(token)).toBeNull();
    prisma.lessonShareLink.findUnique.mockResolvedValue(LIVE);
    expect(await findShareLink(token)).toMatchObject({ id: 'l1' });
    expect(prisma.lessonShareLink.findUnique.mock.calls.at(-1)![0].where).toEqual({ tokenHash: hashShareToken(token) });
  });
});
