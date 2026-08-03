import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignment: { findFirst: mock() },
};
const requireUserId = mock();
const requireMembership = mock();
const getSignedGetUrl = mock();
const actualS3 = await import('~/services/s3.server');

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/services/s3.server', () => ({ ...actualS3, getSignedGetUrl }));

const { loader } = await import('./route');

describe('assignment prompt attachment route', () => {
  beforeEach(() => {
    prisma.assignment.findFirst.mockReset();
    requireUserId.mockReset().mockResolvedValue('user-1');
    requireMembership.mockReset().mockResolvedValue({
      id: 'student-membership-1',
      role: 'STUDENT',
      organization: { id: 'org-1' },
    });
    getSignedGetUrl
      .mockReset()
      .mockResolvedValue('https://signed.example/assignment.pdf');
  });

  test('redirects an authorized student to a short-lived PDF URL', async () => {
    prisma.assignment.findFirst.mockResolvedValue({
      promptAttachmentKey: 'assignment-prompts/file-id/assignment.pdf',
    });

    const response = await loader({
      request: new Request(
        'https://example.test/api/domain/assignment-prompt-attachment/a-1'
      ),
      params: { assignmentId: 'a-1' },
    } as any);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(
      'https://signed.example/assignment.pdf'
    );
    expect(getSignedGetUrl).toHaveBeenCalledWith(
      'assignment-prompts/file-id/assignment.pdf',
      300
    );
  });

  test('returns 404 without leaking whether an unauthorized attachment exists', async () => {
    prisma.assignment.findFirst.mockResolvedValue(null);

    await expect(
      loader({
        request: new Request(
          'https://example.test/api/domain/assignment-prompt-attachment/a-1'
        ),
        params: { assignmentId: 'a-1' },
      } as any)
    ).rejects.toMatchObject({ status: 404 });
    expect(getSignedGetUrl).not.toHaveBeenCalled();
  });
});
