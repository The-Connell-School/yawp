import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock(async () => 'teacher-1');
const requireFreeTierEnabled = mock(async () => {});
const userHasPendingFreeTierTeachingLock = mock(async () => true);
type PreviewProvisionResult = Awaited<
  ReturnType<
    typeof import('~/domain/free-tier/locked-preview.server').ensureLockedPreviewClassroomForUser
  >
>;
const ensureLockedPreviewClassroomForUser = mock<
  (userId: string) => Promise<PreviewProvisionResult>
>(async () => ({
  status: 'provisioned',
  organizationId: 'org-1',
}));
const findFirst = mock(async (): Promise<{ status: string } | null> => ({
  status: 'SENT',
}));

beforeEach(() => {
  requireUserId.mockReset().mockResolvedValue('teacher-1');
  requireFreeTierEnabled.mockReset().mockResolvedValue(undefined);
  userHasPendingFreeTierTeachingLock.mockReset().mockResolvedValue(true);
  ensureLockedPreviewClassroomForUser.mockReset().mockResolvedValue({
    status: 'provisioned',
    organizationId: 'org-1',
  });
  findFirst.mockReset().mockResolvedValue({ status: 'SENT' });
});

mock.module('~/utils/auth.server', () => ({ requireUserId }));
mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({
  requireFreeTierEnabled,
}));
mock.module('~/domain/free-tier/locked-preview.server', () => ({
  userHasPendingFreeTierTeachingLock,
  ensureLockedPreviewClassroomForUser,
}));
mock.module('~/utils/db.server', () => ({
  prisma: { freeTierApplication: { findFirst } },
}));

afterAll(() => mock.restore());

async function load() {
  const { loader } = await import('./route');
  try {
    await loader({
      request: new Request('https://yawp.test/app/free-tier/preview'),
    } as never);
    throw new Error('expected redirect');
  } catch (response) {
    return response;
  }
}

describe('app.free-tier.preview loader', () => {
  test('preview provisions locked classroom then redirects to app', async () => {
    const res = (await load()) as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/app');
    expect(ensureLockedPreviewClassroomForUser).toHaveBeenCalledWith(
      'teacher-1'
    );
  });

  test('returns 404 when free-tier flag is off', async () => {
    requireFreeTierEnabled.mockRejectedValue({
      type: 'DataWithResponseInit',
      init: { status: 404 },
    });
    const thrown = await requireFreeTierEnabled().catch((error) => error);
    expect(thrown).toMatchObject({
      type: 'DataWithResponseInit',
      init: { status: 404 },
    });
    const { loader } = await import('./route');
    await expect(
      loader({
        request: new Request('https://yawp.test/app/free-tier/preview'),
      } as never)
    ).rejects.toMatchObject({
      type: 'DataWithResponseInit',
      init: { status: 404 },
    });
  });

  test('redirects to pending when teaching lock is off', async () => {
    userHasPendingFreeTierTeachingLock.mockResolvedValue(false);
    const res = (await load()) as Response;
    expect(res.headers.get('location')).toBe('/app/free-tier/pending');
  });

  test('redirects to pending when application is missing', async () => {
    findFirst.mockResolvedValue(null);
    const res = (await load()) as Response;
    expect(res.headers.get('location')).toBe('/app/free-tier/pending');
    expect(ensureLockedPreviewClassroomForUser).not.toHaveBeenCalled();
  });

  test('redirects to pending when application is not in preview status', async () => {
    findFirst.mockResolvedValue({ status: 'APPROVED' });
    const res = (await load()) as Response;
    expect(res.headers.get('location')).toBe('/app/free-tier/pending');
    expect(ensureLockedPreviewClassroomForUser).not.toHaveBeenCalled();
  });

  test('redirects to pending when provisioning throws instead of 500', async () => {
    ensureLockedPreviewClassroomForUser.mockRejectedValue(
      new Error('free_tier_application_not_found')
    );
    const res = (await load()) as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/app/free-tier/pending');
  });

  test('redirects to pending when provisioning returns a non-success status', async () => {
    ensureLockedPreviewClassroomForUser.mockResolvedValue({
      status: 'pending_user',
    });
    const res = (await load()) as Response;
    expect(res.headers.get('location')).toBe('/app/free-tier/pending');
  });
});
