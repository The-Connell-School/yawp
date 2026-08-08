import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));

const { loader } = await import('./route');

afterAll(() => {
  mock.restore();
});

describe('writing lessons index route', () => {
  beforeEach(() => {
    requireUserId.mockReset();
    requireMembership.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'student-1',
      organization: { id: 'org-1', writingPracticeEnabled: true },
    });
  });

  test('loads by direct URL when the org has writing practice enabled', async () => {
    const response = await loader({
      request: new Request('https://example.test/app/writing-lessons'),
      params: {},
      context: {} as never,
    } as any);

    expect(response.data.lessonCount).toBeGreaterThan(0);
    expect(response.data.promptCount).toBeGreaterThan(0);
  });

  test('redirects to the dashboard when the org has writing practice disabled', async () => {
    requireMembership.mockResolvedValue({
      id: 'student-1',
      organization: { id: 'org-1', writingPracticeEnabled: false },
    });

    await expect(
      loader({
        request: new Request('https://example.test/app/writing-lessons'),
        params: {},
        context: {} as never,
      } as any)
    ).rejects.toMatchObject({ status: 302 });
  });
});
