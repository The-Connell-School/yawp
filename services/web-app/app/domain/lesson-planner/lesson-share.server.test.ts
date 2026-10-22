import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = { lessonShareLink: { findUnique: mock(), create: mock(), updateMany: mock() } };
mock.module('~/utils/db.server', () => ({ prisma }));
const sendEmail = mock();
mock.module('~/utils/email.server', () => ({ sendEmail }));
const { createShareLink, emailLessonLink, findShareLink, hashShareToken, newShareToken } = await import('./lesson-share.server');

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

describe("emailLessonLink: says what happened (Brian's run 4, item 5)", () => {
  const send = () =>
    emailLessonLink({ to: 'sub@school.org', audience: 'sub', title: 'Day One', className: null, link: 'https://x/l/t', note: null, teacherName: null });
  test('sent, a preview that logs instead of sending, or failed', async () => {
    sendEmail.mockResolvedValueOnce({ status: 'success', data: { id: 'msg_123' } });
    expect(await send()).toEqual({ delivery: 'sent' });
    sendEmail.mockResolvedValueOnce({ status: 'success', data: { id: 'preview-captured' } });
    expect(await send()).toEqual({ delivery: 'preview' });
    sendEmail.mockResolvedValueOnce({ status: 'error', error: new Error('nope') });
    expect(await send()).toEqual({ delivery: 'failed' });
    sendEmail.mockRejectedValueOnce(new Error('network'));
    expect(await send()).toEqual({ delivery: 'failed' });
  });
});
