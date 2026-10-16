import {
  afterAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test';

const oldPreviewSlug = process.env.PREVIEW_SLUG;
const oldYawpEnvironment = process.env.YAWP_ENVIRONMENT;

const canUseMockAdmin = mock(async () => false);
const requireMockAdmin = mock(async () => {});
const requireUserId = mock(async () => 'user-1');
const requireMembership = mock(async () => {
  throw new Error(
    'requireMembership should not run for demo free-tier applicants'
  );
});
const isFreeTierEnabled = mock(async () => false);
const loadFreeTierGateApplication = mock(async () => ({
  id: 'app-1',
  status: 'ACCOUNT_CREATED',
  organizationId: null,
  adminApprovals: [],
}));
const enforceFreeTierTeacherGate = mock(async () => null);
const retryFreeClassroomProvisioningForUser = mock(async () => {});

mock.module('~/utils/mock-admin.server', () => ({
  canUseMockAdmin,
  requireMockAdmin,
}));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/auth.server.js', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFreeTierEnabled,
  isFeatureFlagEnabled: mock(async () => false),
}));
mock.module('~/domain/free-tier/free-tier-gate.server', () => ({
  loadFreeTierGateApplication,
  enforceFreeTierTeacherGate,
}));
mock.module('~/domain/free-tier/provision-free-classroom.server', () => ({
  retryFreeClassroomProvisioningForUser,
}));

const { loader } = await import('./route');

afterAll(() => {
  mock.restore();
  if (oldPreviewSlug === undefined) delete process.env.PREVIEW_SLUG;
  else process.env.PREVIEW_SLUG = oldPreviewSlug;
  if (oldYawpEnvironment === undefined) delete process.env.YAWP_ENVIRONMENT;
  else process.env.YAWP_ENVIRONMENT = oldYawpEnvironment;
});

describe('app parent free-tier loader gate', () => {
  beforeEach(() => {
    canUseMockAdmin.mockClear();
    requireMockAdmin.mockClear();
    requireUserId.mockClear();
    requireMembership.mockClear();
    isFreeTierEnabled.mockClear();
    loadFreeTierGateApplication.mockClear();
    enforceFreeTierTeacherGate.mockClear();
    retryFreeClassroomProvisioningForUser.mockClear();
    if (oldPreviewSlug === undefined) delete process.env.PREVIEW_SLUG;
    else process.env.PREVIEW_SLUG = oldPreviewSlug;
    if (oldYawpEnvironment === undefined) delete process.env.YAWP_ENVIRONMENT;
    else process.env.YAWP_ENVIRONMENT = oldYawpEnvironment;
  });

  test('lets demo free-tier applicants reach the onboarding shell when the stored flag is off', async () => {
    process.env.YAWP_ENVIRONMENT = 'demo';
    isFreeTierEnabled.mockResolvedValue(false);

    const response = await loader({
      request: new Request('https://yawp.test/app/free-tier/onboarding'),
      params: {},
      context: {} as never,
    } as any);

    expect(loadFreeTierGateApplication).toHaveBeenCalledWith('user-1');
    expect(retryFreeClassroomProvisioningForUser).toHaveBeenCalledWith('user-1');
    expect(enforceFreeTierTeacherGate).toHaveBeenCalledWith({
      userId: 'user-1',
      pathname: '/app/free-tier/onboarding',
      organizationPlan: 'FREE_CLASSROOM',
      application: {
        id: 'app-1',
        status: 'ACCOUNT_CREATED',
        organizationId: null,
        adminApprovals: [],
      },
    });
    expect(requireMembership).not.toHaveBeenCalled();
    expect((response as { data: unknown }).data).toEqual({
      freeAccountUsage: null,
      mockAdminAvailable: false,
      schoolYearScope: {
        selected: 'all',
        options: [],
        isStudent: false,
      },
      guidedTours: null,
    });
  });
});
