import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  user: {
    findUnique: mock(),
  },
  grade: {
    findFirst: mock(),
    upsert: mock(),
  },
  documentSnapshot: {
    findFirst: mock(),
  },
  gradeComment: {
    create: mock(),
  },
};

const requireUserId = mock();
const requireProfile = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireProfile,
}));

const { action } = await import('./route');

describe('api.model.grade-comment', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    prisma.grade.findFirst.mockReset();
    prisma.grade.upsert.mockReset();
    prisma.documentSnapshot.findFirst.mockReset();
    prisma.gradeComment.create.mockReset();
    requireUserId.mockReset();
    requireProfile.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireProfile.mockResolvedValue({ id: 'teacher-profile-1' });
    prisma.user.findUnique.mockResolvedValue({ isAdmin: false });
    prisma.gradeComment.create.mockResolvedValue({ id: 'comment-1' });
  });

  test('creates shell grade with documentId when only snapshotId is provided', async () => {
    prisma.documentSnapshot.findFirst.mockResolvedValue({
      id: 'snapshot-1',
      documentId: 'doc-1',
      grades: [],
    });
    prisma.grade.upsert.mockResolvedValue({ id: 'grade-1' });

    const form = new FormData();
    form.append('snapshotId', 'snapshot-1');
    form.append('content', 'Please revise this sentence.');
    form.append('excerpt', 'This sentence');

    const request = new Request('https://example.com/api/model/grade-comment', {
      method: 'POST',
      body: form,
    });

    await action({ request } as any);

    expect(prisma.gradeComment.create).toHaveBeenCalledTimes(1);
    expect(prisma.grade.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.grade.upsert.mock.calls[0]?.[0]).toMatchObject({
      where: { snapshotId: 'snapshot-1' },
      create: {
        snapshotId: 'snapshot-1',
        documentId: 'doc-1',
      },
    });
  });
});
