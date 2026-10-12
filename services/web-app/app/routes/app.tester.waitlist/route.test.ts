import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
const savedFlag = process.env.MOCK_ADMIN_ENABLED;
const savedPreviewSlug = process.env.PREVIEW_SLUG;
const savedYawpEnvironment = process.env.YAWP_ENVIRONMENT;
const savedNodeEnv = process.env.NODE_ENV;
afterAll(() => {
  if (savedFlag === undefined) delete process.env.MOCK_ADMIN_ENABLED;
  else process.env.MOCK_ADMIN_ENABLED = savedFlag;
  if (savedPreviewSlug === undefined) delete process.env.PREVIEW_SLUG;
  else process.env.PREVIEW_SLUG = savedPreviewSlug;
  if (savedYawpEnvironment === undefined) delete process.env.YAWP_ENVIRONMENT;
  else process.env.YAWP_ENVIRONMENT = savedYawpEnvironment;
  if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = savedNodeEnv;
});
const requireUserId = mock(async () => 'intern');
const findUnique = mock(async () => ({
  id: 'intern',
  email: 'intern@yawp.local',
  mockAdminGranted: true,
}));
const findMany = mock(async () => []);
const releaseBatch = mock(async () => ({ released: 1 }));
const sendReleaseEmailsForApplicationIds = mock(async () => []);
const decideApplication = mock(async () => ({
  status: 200,
  payload: { ok: true },
}));
const reopenApplication = mock(async () => ({
  status: 200,
  payload: { ok: true },
}));
mock.module('~/utils/auth.server', () => ({ requireUserId }));
mock.module('~/utils/db.server', () => ({
  prisma: { user: { findUnique }, freeTierApplication: { findMany } },
}));
mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({
  requireFreeTierEnabled: async () => {},
}));
mock.module('~/domain/free-tier/service.server', () => ({ releaseBatch }));
mock.module('~/domain/free-tier/approval-flow.server', () => ({
  sendReleaseEmailsForApplicationIds,
}));
mock.module('~/utils/internal-free-tier-http.server', () => ({
  decideApplication,
  reopenApplication,
}));
const waitlist = await import('./route');
const approvals = await import('../app.tester.approvals/route');
function args(intent?: string) {
  const form = new FormData();
  form.set('applicationId', 'application');
  form.set('intent', intent ?? 'release');
  form.set('reason', 'Test rejection');
  return {
    request: new Request(
      'http://localhost/app/tester/waitlist',
      intent ? { method: 'POST', body: form } : {}
    ),
    params: {},
    context: {},
  } as never;
}
beforeEach(() => {
  process.env.MOCK_ADMIN_ENABLED = 'true';
  delete process.env.PREVIEW_SLUG;
  delete process.env.YAWP_ENVIRONMENT;
  process.env.NODE_ENV = 'test';
  requireUserId.mockImplementation(async () => 'intern');
  findUnique.mockImplementation(async () => ({
    id: 'intern',
    email: 'intern@yawp.local',
    mockAdminGranted: true,
  }));
  releaseBatch.mockClear();
  decideApplication.mockClear();
  reopenApplication.mockClear();
  findMany.mockClear();
});
describe('tester routes', () => {
  for (const route of [waitlist, approvals]) {
    test('flag off denies loader and action before querying a user', async () => {
      delete process.env.MOCK_ADMIN_ENABLED;
      findUnique.mockClear();
      for (const handler of [route.loader, route.action]) {
        try {
          await handler(args('approve'));
          throw new Error('Expected denial');
        } catch (error) {
          expect((error as Response).status).toBe(404);
        }
      }
      expect(findUnique).not.toHaveBeenCalled();
    });
    test('production runtime denies even when the flag is accidentally enabled', async () => {
      process.env.YAWP_ENVIRONMENT = 'production';
      process.env.NODE_ENV = 'production';
      findUnique.mockClear();
      for (const handler of [route.loader, route.action]) {
        try {
          await handler(args('approve'));
          throw new Error('Expected denial');
        } catch (error) {
          expect((error as Response).status).toBe(404);
        }
      }
      expect(findUnique).not.toHaveBeenCalled();
    });
    test('demo runtime allows the explicit tester gate', async () => {
      process.env.PREVIEW_SLUG = 'demo';
      process.env.YAWP_ENVIRONMENT = 'preview';
      process.env.NODE_ENV = 'production';
      await route.loader(args());
      expect(findMany).toHaveBeenCalled();
    });
    test('ungranted user cannot list or act', async () => {
      findUnique.mockImplementation(async () => ({
        id: 'intern',
        email: 'intern@yawp.local',
        mockAdminGranted: false,
      }));
      for (const handler of [route.loader, route.action]) {
        try {
          await handler(args('approve'));
          throw new Error('Expected denial');
        } catch (error) {
          expect((error as Response).status).toBe(403);
        }
      }
      expect(findMany).not.toHaveBeenCalled();
      expect(decideApplication).not.toHaveBeenCalled();
    });
    test('unauthenticated loader and action preserve login redirect', async () => {
      requireUserId.mockImplementation(async () => {
        throw new Response(null, {
          status: 302,
          headers: { Location: '/auth/login' },
        });
      });
      for (const handler of [route.loader, route.action]) {
        try {
          await handler(args('approve'));
          throw new Error('Expected denial');
        } catch (error) {
          expect((error as Response).status).toBe(302);
        }
      }
      expect(decideApplication).not.toHaveBeenCalled();
    });
    test('granted user can list', async () => {
      await route.loader(args());
      expect(findMany).toHaveBeenCalled();
    });
  }
  test('waitlist release uses existing release and access-email services', async () => {
    await waitlist.action(args('release'));
    expect(releaseBatch).toHaveBeenCalledWith(
      { applicationIds: ['application'] },
      expect.objectContaining({
        actorUserId: 'intern',
        action: 'waitlist.release',
      })
    );
    expect(sendReleaseEmailsForApplicationIds).toHaveBeenCalled();
  });
  test('approval and rejection use shared services with authenticated actor', async () => {
    for (const intent of ['approve', 'reject']) {
      await approvals.action(args(intent));
      expect(decideApplication).toHaveBeenLastCalledWith(
        expect.objectContaining({
          id: 'application',
          decision: intent === 'approve' ? 'APPROVED' : 'REJECTED',
          decidedByEmail: 'intern@yawp.local',
          audit: expect.objectContaining({ actorUserId: 'intern' }),
        })
      );
    }
  });
  test('reopen uses shared service', async () => {
    await approvals.action(args('reopen'));
    expect(reopenApplication).toHaveBeenCalled();
  });
  test('unsupported intents cannot invoke broader admin operations', async () => {
    expect(((await approvals.action(args('token'))) as Response).status).toBe(
      400
    );
    expect(decideApplication).not.toHaveBeenCalled();
  });
});
