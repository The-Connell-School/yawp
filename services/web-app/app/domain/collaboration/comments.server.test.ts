import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  documentComment: { findMany: mock(), create: mock(), findFirst: mock() },
  documentCommentResponse: { create: mock() },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { DraftCommentError, addDraftComment, listDraftComments, replyToDraftComment } =
  await import('./comments.server');

afterAll(() => {
  mock.restore();
});

const commentRow = () => ({
  id: 'comment-1',
  content: 'Tighten the introduction.',
  createdAt: new Date('2026-08-18T09:00:00Z'),
  membershipId: 'teacher-1',
  membership: { role: 'TEACHER', user: { name: 'Ms. Lambert', email: 'l@x.com' } },
  responses: [
    {
      id: 'reply-1',
      content: 'Done — cut the first two sentences.',
      createdAt: new Date('2026-08-18T10:00:00Z'),
      membershipId: 'member-1',
      membership: { role: 'STUDENT', user: { name: 'Maya P.', email: 'm@x.com' } },
    },
  ],
});

describe('listDraftComments', () => {
  beforeEach(() => {
    prisma.documentComment.findMany.mockReset().mockResolvedValue([commentRow()]);
  });

  test('returns comments with their author and replies', async () => {
    const comments = await listDraftComments({ documentId: 'doc-1' });

    expect(comments[0]).toMatchObject({
      id: 'comment-1',
      content: 'Tighten the introduction.',
      authorName: 'Ms. Lambert',
      authorRole: 'TEACHER',
    });
    expect(comments[0].responses[0]).toMatchObject({
      content: 'Done — cut the first two sentences.',
      authorName: 'Maya P.',
    });
  });

  test('hides archived comments', async () => {
    await listDraftComments({ documentId: 'doc-1' });

    expect(prisma.documentComment.findMany.mock.calls[0][0].where).toEqual({
      documentId: 'doc-1',
      archivedAt: null,
    });
  });

  test('leaves anchored comments out of this list', async () => {
    // The collaborative schema deliberately has no comment mark, so a comment
    // with a highlightId belongs to the solo editor and has nothing to attach to
    // here. Showing it would be a note pointing at text nobody can see.
    await listDraftComments({ documentId: 'doc-1', documentLevelOnly: true });

    expect(
      prisma.documentComment.findMany.mock.calls[0][0].where.highlightId
    ).toBeNull();
  });

  test('falls back to email when an author has no name', async () => {
    const row = commentRow();
    row.membership.user.name = null as any;
    prisma.documentComment.findMany.mockResolvedValue([row]);

    const comments = await listDraftComments({ documentId: 'doc-1' });

    expect(comments[0].authorName).toBe('l@x.com');
  });
});

describe('addDraftComment', () => {
  beforeEach(() => {
    prisma.documentComment.create.mockReset().mockResolvedValue(commentRow());
  });

  const add = (overrides = {}) =>
    addDraftComment({
      documentId: 'doc-1',
      membershipId: 'teacher-1',
      content: 'Tighten the introduction.',
      ...overrides,
    });

  test('stores the comment against the draft and its author', async () => {
    await add();

    const data = prisma.documentComment.create.mock.calls[0][0].data;
    expect(data.documentId).toBe('doc-1');
    expect(data.membershipId).toBe('teacher-1');
    expect(data.content).toBe('Tighten the introduction.');
  });

  test('leaves highlightId unset, because there is nothing to anchor to', async () => {
    await add();

    expect(
      prisma.documentComment.create.mock.calls[0][0].data.highlightId
    ).toBeNull();
  });

  test('refuses an empty comment', async () => {
    await expect(add({ content: '   ' })).rejects.toThrow(DraftCommentError);
    expect(prisma.documentComment.create).not.toHaveBeenCalled();
  });

  test('trims surrounding whitespace', async () => {
    await add({ content: '  Nice work.  ' });

    expect(prisma.documentComment.create.mock.calls[0][0].data.content).toBe(
      'Nice work.'
    );
  });
});

describe('replyToDraftComment', () => {
  beforeEach(() => {
    prisma.documentComment.findFirst
      .mockReset()
      .mockResolvedValue({ id: 'comment-1' });
    prisma.documentCommentResponse.create.mockReset().mockResolvedValue({});
  });

  const reply = (overrides = {}) =>
    replyToDraftComment({
      documentId: 'doc-1',
      commentId: 'comment-1',
      membershipId: 'member-1',
      content: 'Fixed it.',
      ...overrides,
    });

  test('stores the reply against the comment and its author', async () => {
    await reply();

    const data = prisma.documentCommentResponse.create.mock.calls[0][0].data;
    expect(data.commentId).toBe('comment-1');
    expect(data.membershipId).toBe('member-1');
    expect(data.content).toBe('Fixed it.');
  });

  test('checks the comment belongs to this draft', async () => {
    // The comment id comes from a form; a reply must not be able to land on
    // another document's thread.
    await reply();

    expect(prisma.documentComment.findFirst.mock.calls[0][0].where).toEqual({
      id: 'comment-1',
      documentId: 'doc-1',
      archivedAt: null,
    });
  });

  test('refuses a comment that is not on this draft', async () => {
    prisma.documentComment.findFirst.mockResolvedValue(null);

    await expect(reply()).rejects.toThrow(DraftCommentError);
    expect(prisma.documentCommentResponse.create).not.toHaveBeenCalled();
  });

  test('refuses an empty reply', async () => {
    await expect(reply({ content: '' })).rejects.toThrow(DraftCommentError);
  });
});
