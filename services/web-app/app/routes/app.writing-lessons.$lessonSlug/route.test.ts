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

describe('writing lesson detail route', () => {
  beforeEach(() => {
    requireUserId.mockReset();
    requireMembership.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'student-1',
      organization: { id: 'org-1', writingPracticeEnabled: true },
    });
  });

  test('loads a lesson by direct URL when the org has writing practice enabled', async () => {
    const response = await loader({
      request: new Request(
        'https://example.test/app/writing-lessons/revising-for-wordiness'
      ),
      params: { lessonSlug: 'revising-for-wordiness' },
      context: {} as never,
    } as any);

    expect(response.data.lesson.slug).toBe('revising-for-wordiness');
    expect(response.data.practicePrompts.length).toBeGreaterThan(0);
  });

  test('redirects to the dashboard when the org has writing practice disabled', async () => {
    requireMembership.mockResolvedValue({
      id: 'student-1',
      organization: { id: 'org-1', writingPracticeEnabled: false },
    });

    await expect(
      loader({
        request: new Request(
          'https://example.test/app/writing-lessons/revising-for-wordiness'
        ),
        params: { lessonSlug: 'revising-for-wordiness' },
        context: {} as never,
      } as any)
    ).rejects.toMatchObject({ status: 302 });
  });
});
