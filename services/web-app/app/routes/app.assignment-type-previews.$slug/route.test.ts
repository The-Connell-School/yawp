import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const isFreeTierEnabled = mock();

mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFreeTierEnabled,
}));

const { loader } = await import('./route');

async function load(slug: string | undefined) {
  try {
    return await loader({
      request: new Request(
        `https://example.com/app/assignment-type-previews/${slug ?? ''}`
      ),
      params: { slug },
    } as any);
  } catch (thrown) {
    return thrown;
  }
}

describe('app.assignment-type-previews.$slug', () => {
  beforeEach(() => {
    for (const fn of [requireUserId, requireMembership, isFreeTierEnabled]) {
      fn.mockReset();
    }
    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      role: 'TEACHER',
      organization: { plan: 'FREE_CLASSROOM' },
    });
    isFreeTierEnabled.mockResolvedValue(true);
  });

  test('shows a free classroom teacher the teaser for a locked type', async () => {
    expect(await load('thesis-driven-essay')).toEqual({
      slug: 'thesis-driven-essay',
    });
    expect(await load('ap-history-essay')).toEqual({
      slug: 'ap-history-essay',
    });
  });

  test('is not found for an unknown slug', async () => {
    const thrown = (await load('class-starter')) as Response;
    expect(thrown).toBeInstanceOf(Response);
    expect(thrown.status).toBe(404);
  });

  test('is not found with the free tier flag off', async () => {
    isFreeTierEnabled.mockResolvedValue(false);
    expect(((await load('thesis-driven-essay')) as Response).status).toBe(404);
  });

  test('is not found for paid schools and for students', async () => {
    requireMembership.mockResolvedValue({
      role: 'TEACHER',
      organization: { plan: 'SCHOOL' },
    });
    expect(((await load('thesis-driven-essay')) as Response).status).toBe(404);

    requireMembership.mockResolvedValue({
      role: 'STUDENT',
      organization: { plan: 'FREE_CLASSROOM' },
    });
    expect(((await load('thesis-driven-essay')) as Response).status).toBe(404);
  });
});
