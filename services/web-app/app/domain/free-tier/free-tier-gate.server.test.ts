import { beforeEach, describe, expect, mock, test } from 'bun:test';

const findFirst = mock();
const classCount = mock();

mock.module('~/utils/db.server', () => ({
  prisma: {
    freeTierApplication: { findFirst },
    class: { count: classCount },
  },
}));

const { enforceFreeTierTeacherGate } = await import('./free-tier-gate.server');

function app(overrides: Partial<{
  status: string;
  organizationId: string | null;
  adminApprovals: Array<{ adminName: string; adminEmail: string }>;
}>) {
  return {
    id: 'app-1',
    status: 'ACCOUNT_CREATED',
    organizationId: null,
    adminApprovals: [],
    ...overrides,
  };
}

async function expectRedirect(
  run: () => Promise<unknown>,
  location: string
) {
  try {
    await run();
    throw new Error('expected redirect');
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    const response = error as Response;
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    expect(response.headers.get('Location')).toBe(location);
  }
}

describe('enforceFreeTierTeacherGate', () => {
  beforeEach(() => {
    findFirst.mockReset();
    classCount.mockReset();
    classCount.mockResolvedValue(0);
  });

  test('no application returns null', async () => {
    findFirst.mockResolvedValue(null);
    const result = await enforceFreeTierTeacherGate({
      userId: 'u1',
      pathname: '/app/my-classes',
    });
    expect(result).toBeNull();
  });

  test('APPROVED teacher with zero active classes stays on my-classes (no setup loop)', async () => {
    const row = app({ status: 'APPROVED', organizationId: 'org-1' });
    const result = await enforceFreeTierTeacherGate({
      userId: 'u1',
      pathname: '/app/my-classes',
      application: row,
    });
    expect(result).toBe(row);
    expect(classCount).not.toHaveBeenCalled();
  });

  test('REJECTED redirects to status outside free-tier routes', async () => {
    await expectRedirect(
      () =>
        enforceFreeTierTeacherGate({
          userId: 'u1',
          pathname: '/app/my-classes',
          application: app({ status: 'REJECTED' }),
        }),
      '/app/free-tier/status'
    );
  });

  test('EXPIRED redirects to status', async () => {
    await expectRedirect(
      () =>
        enforceFreeTierTeacherGate({
          userId: 'u1',
          pathname: '/app/reporter',
          application: app({ status: 'EXPIRED' }),
        }),
      '/app/free-tier/status'
    );
  });

  test('SENT redirects to pending', async () => {
    await expectRedirect(
      () =>
        enforceFreeTierTeacherGate({
          userId: 'u1',
          pathname: '/app/my-classes',
          application: app({
            status: 'SENT',
            adminApprovals: [{ adminName: 'P', adminEmail: 'p@school.edu' }],
          }),
        }),
      '/app/free-tier/pending'
    );
  });

  test('MANUAL_REVIEW redirects to pending', async () => {
    await expectRedirect(
      () =>
        enforceFreeTierTeacherGate({
          userId: 'u1',
          pathname: '/app/my-classes',
          application: app({ status: 'MANUAL_REVIEW' }),
        }),
      '/app/free-tier/pending'
    );
  });

  test('ADMIN_SUBMITTED redirects to onboarding (email failure retry)', async () => {
    await expectRedirect(
      () =>
        enforceFreeTierTeacherGate({
          userId: 'u1',
          pathname: '/app/free-tier/pending',
          application: app({ status: 'ADMIN_SUBMITTED' }),
        }),
      '/app/free-tier/onboarding'
    );
  });

  test('ACCOUNT_CREATED redirects to onboarding', async () => {
    await expectRedirect(
      () =>
        enforceFreeTierTeacherGate({
          userId: 'u1',
          pathname: '/app',
          application: app({ status: 'ACCOUNT_CREATED' }),
        }),
      '/app/free-tier/onboarding'
    );
  });

  test('pending route allowed for SENT', async () => {
    const row = app({
      status: 'SENT',
      adminApprovals: [{ adminName: 'A', adminEmail: 'a@school.edu' }],
    });
    const result = await enforceFreeTierTeacherGate({
      userId: 'u1',
      pathname: '/app/free-tier/pending',
      application: row,
    });
    expect(result).toBe(row);
  });
});
