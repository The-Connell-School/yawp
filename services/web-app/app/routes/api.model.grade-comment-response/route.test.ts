import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  user: {
    findUnique: mock(),
  },
  gradeComment: {
    findFirst: mock(),
  },
  gradeCommentResponse: {
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

describe('api.model.grade-comment-response', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    prisma.gradeComment.findFirst.mockReset();
    prisma.gradeCommentResponse.create.mockReset();
    requireUserId.mockReset();
    requireProfile.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireProfile.mockResolvedValue({ id: 'teacher-profile-1' });
    prisma.user.findUnique.mockResolvedValue({ isAdmin: false });
    prisma.gradeCommentResponse.create.mockResolvedValue({ id: 'response-1' });
  });

  test('authorizes teacher against grade.document teachers', async () => {
    prisma.gradeComment.findFirst.mockResolvedValue({
      id: 'comment-1',
      grade: {
        releasedAt: null,
        document: {
          profileId: 'student-profile-1',
          class: {
            teachers: [{ profileId: 'teacher-profile-1' }],
          },
        },
      },
    });

    const form = new FormData();
    form.append('commentId', 'comment-1');
    form.append('content', 'Please tighten this sentence.');

    const request = new Request('https://example.com/api/model/grade-comment-response', {
      method: 'POST',
      body: form,
    });

    await action({ request } as any);
    expect(prisma.gradeCommentResponse.create).toHaveBeenCalledTimes(1);
  });
});
