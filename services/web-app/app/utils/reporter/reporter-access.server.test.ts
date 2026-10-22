import { beforeEach, describe, expect, mock, test } from 'bun:test';

let monthlyEnabled = false;
mock.module('~/domain/free-tier/monthly-policy.server', () => ({
  monthlyFreeTierPolicy: async () => ({ enabled: monthlyEnabled }),
}));

const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));

const { getReporterAccess, requireReporterAccess } =
  await import('./reporter-access.server.ts');

const membershipFixture = (plan: string) => ({
  id: 'm-1',
  role: 'TEACHER' as const,
  isOrgOwner: false,
  isActive: true,
  organization: {
    id: 'org-1',
    name: 'Yawp Org',
    plan,
    reporterEnabled: false,
    classInsightsEnabled: true,
    writingPracticeEnabled: false,
    submissionActivityEnabled: false,
    revisionFlowEnabled: false,
  },
});

beforeEach(() => {
  monthlyEnabled = false;
  requireUserId.mockReset().mockResolvedValue('user-1');
  requireMembership.mockReset();
});

describe('reporter access gate', () => {
  test('allows teachers in SCHOOL orgs (unchanged behavior)', async () => {
    requireMembership.mockResolvedValue(membershipFixture('SCHOOL'));
    const access = await getReporterAccess(new Request('http://localhost/'));
    expect(access.isTeacher).toBe(true);
    expect(access.enabled).toBe(true);
    expect(access.allowed).toBe(true);
    await expect(
      requireReporterAccess(new Request('http://localhost/'))
    ).resolves.toBeTruthy();
  });

  test('denies FREE_CLASSROOM orgs server-side', async () => {
    requireMembership.mockResolvedValue(membershipFixture('FREE_CLASSROOM'));
    const access = await getReporterAccess(new Request('http://localhost/'));
    expect(access.isTeacher).toBe(true);
    expect(access.enabled).toBe(false);
    expect(access.allowed).toBe(false);
    await expect(
      requireReporterAccess(new Request('http://localhost/'))
    ).rejects.toMatchObject({
      data: { error: 'Yawp! Reporter is not available.' },
      init: { status: 404 },
    });
  });
});

test('approved targeted free teacher can access Reporter; students remain denied', async () => {
  monthlyEnabled = true;
  requireMembership.mockResolvedValue(membershipFixture('FREE_CLASSROOM'));
  expect(
    (await getReporterAccess(new Request('http://localhost/'))).allowed
  ).toBe(true);
  requireMembership.mockResolvedValue({
    ...membershipFixture('FREE_CLASSROOM'),
    role: 'STUDENT',
  });
  expect(
    (await getReporterAccess(new Request('http://localhost/'))).allowed
  ).toBe(false);
});
