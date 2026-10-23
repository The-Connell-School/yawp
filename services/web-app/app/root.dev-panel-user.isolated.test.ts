import { describe, expect, mock, test } from 'bun:test';

const run = process.env.ROOT_LOADER_USER_ISOLATED === '1';

if (run) {
  mock.module('./utils/internal-impersonation-runtime.server.ts', () => ({
    internalImpersonationMiddleware: async (_ctx: unknown, next: () => unknown) =>
      next(),
  }));

  mock.module('./utils/preview-access.server.ts', () => ({
    getPreviewAccessSeat: async () => null,
    isIsolatedPreviewSeatMode: () => false,
    isPreviewDevLoginAccessCodeRequired: () => false,
    previewAccessMiddleware: async (_ctx: unknown, next: () => unknown) => next(),
  }));

  mock.module('./utils/ua-partner.server.ts', () => ({
    uaPartnerMiddleware: async (_ctx: unknown, next: () => unknown) => next(),
  }));

  mock.module('./routes/api.preferences.contrast/cookie.server.ts', () => ({
    contrastPreferenceCookie: { parse: async () => ({}) },
  }));

  mock.module('./routes/api.preferences.nav/cookie.server.ts', () => ({
    navStateCookie: { parse: async () => ({}) },
  }));

  mock.module('./cookies/membership-id.server.ts', () => ({
    getMembershipId: async () => null,
  }));

  mock.module('./cookie-session-storages/authentication.server.ts', () => ({
    authSessionStorage: {
      getSession: async () => ({ get: () => undefined }),
      commitSession: async () => '',
    },
  }));

  mock.module('./utils/toast.server.ts', () => ({
    getToast: async () => ({ toast: null, headers: {} }),
  }));

  mock.module('./utils/environment-banner.server.ts', () => ({
    getEnvironmentBannerWarning: () => null,
    shouldEnableLocalDevQuickLogin: () => false,
  }));

  mock.module('./utils/local-dev-auth.server.ts', () => ({
    isLocalDevAuthEnabled: () => true,
  }));

  mock.module('./utils/blackboard-lti-mock-ui.server.ts', () => ({
    isBlackboardLtiMockUiEnabled: () => false,
  }));

  mock.module('./domain/feature-flags/feature-flags.server.ts', () => ({
    isLessonPlannerEnabled: async () => false,
  }));

  mock.module('./utils/demo-feedback-runtime.server.ts', () => ({
    isDemoFeedbackAvailable: async () => false,
  }));

  mock.module('./dev-panel/dev-panel-runtime.server.ts', () => ({
    isDevPanelRuntimeEnabled: () => true,
    devPanelEnvBadge: () => 'Dev',
  }));

  mock.module('./utils/env.server.ts', () => ({
    getEnv: () => ({}),
  }));

  mock.module('./utils/client-hints.tsx', () => ({
    getHints: () => ({}),
    ClientHintCheck: () => null,
  }));

  mock.module('./utils/misc.tsx', () => ({
    combineHeaders: (...parts: unknown[]) => parts.filter(Boolean),
    getDomainUrl: () => 'http://127.0.0.1:5489',
  }));

  mock.module('./utils/auth.server.ts', () => ({
    getUserId: async () => null,
    getImpersonationState: async () => ({
      isReadOnly: false,
      impersonatorUserId: null,
    }),
    getAuthSessionCookieExpiresAt: async () => new Date(),
    logout: async () => {},
    sessionKey: 'sessionId',
  }));

  mock.module('./utils/db.server.ts', () => ({
    prisma: {
      user: {
        findUnique: async () => null,
        findUniqueOrThrow: async () => {
          throw new Error('unexpected user load');
        },
      },
    },
  }));

  mock.module('./utils/root-membership-filter.server.ts', () => ({
    getRootMembershipWhere: async () => undefined,
  }));
}

describe.skipIf(!run)('root loader signed-out user (isolated)', () => {
  test('returns user null on /free when no session', async () => {
    const { loader } = await import('./root.tsx');
    const response = await loader({
      request: new Request('http://127.0.0.1:5489/free'),
      params: {},
      context: {},
    } as never);
    const body =
      typeof response === 'object' && response && 'data' in response
        ? (response as { data: unknown }).data
        : response;
    expect(body).toMatchObject({ user: null });
  });
});
