import { beforeEach, describe, expect, mock, test } from 'bun:test';

const getUserId = mock(async () => null as string | null);
const redirectWithToast = mock(
  (location: string, toast: unknown, init?: ResponseInit) =>
    new Response(null, {
      status: 302,
      headers: { location, ...(init?.headers as Record<string, string>) },
    })
);

mock.module('~/utils/auth.server.ts', () => ({ getUserId }));
mock.module('~/utils/auth.server', () => ({ getUserId }));
mock.module('~/utils/toast.server', () => ({ redirectWithToast }));
mock.module('~/utils/toast.server.ts', () => ({ redirectWithToast }));

const { redirectIfInvitationAlreadyFulfilled } = await import(
  './redirect-consumed-invitation.server'
);

describe('redirectIfInvitationAlreadyFulfilled', () => {
  beforeEach(() => {
    getUserId.mockReset().mockResolvedValue(null);
    redirectWithToast.mockClear();
  });

  test('sends anonymous users to sign in with neutral copy', async () => {
    const result = await redirectIfInvitationAlreadyFulfilled({
      request: new Request('https://yawp.school/auth/inv/verify'),
      type: 'onboard-teacher',
      normalizedTarget: 'teacher@example.com',
    });

    expect(result?.ok).toBe(true);
    if (result?.ok) {
      expect(result.response.headers.get('location')).toBe(
        '/auth/login?redirectTo=%2Fapp'
      );
    }
    expect(redirectWithToast).toHaveBeenCalledWith(
      '/auth/login?redirectTo=%2Fapp',
      {
        title: 'This invitation is no longer available',
        description:
          'This invite was already used or has expired. Sign in to continue.',
      }
    );
  });

  test('sends signed-in users to the app with the same neutral copy', async () => {
    getUserId.mockResolvedValue('user-1');

    await redirectIfInvitationAlreadyFulfilled({
      request: new Request('https://yawp.school/auth/inv/verify', {
        headers: { cookie: 'session=1' },
      }),
      type: 'onboard-owner',
      normalizedTarget: 'owner@example.com',
    });

    expect(redirectWithToast).toHaveBeenCalledWith('/app', {
      title: 'This invitation is no longer available',
      description:
        'This invite was already used or has expired. Sign in to continue.',
    });
  });

  test('ignores non-onboarding invitation types', async () => {
    expect(
      await redirectIfInvitationAlreadyFulfilled({
        request: new Request('https://yawp.school/auth/inv/verify'),
        type: 'password-reset',
        normalizedTarget: 'user@example.com',
      })
    ).toBeNull();
  });
});