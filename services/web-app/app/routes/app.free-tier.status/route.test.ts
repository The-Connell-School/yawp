import { beforeEach, expect, mock, test } from 'bun:test';

const requireUserId = mock(async () => 'current-user');
const profile = { id: 'current-member', role: 'TEACHER', isActive: true, organization: { id: 'current-org', plan: 'FREE_CLASSROOM' } };
const requireMembership = mock(async () => profile);
const requireFreeTierEnabled = mock(async () => {});
const isFreeTierEnabled = mock(async (_options?: { throwOnError: boolean }) => true);
const application = { id: 'current-app', status: 'APPROVED', organizationId: 'current-org', adminApprovals: [] };
const findFirst = mock(async (_args: any) => application as typeof application | null);
const assertFreeTierSpendAllowed = mock(async () => {});
class FreeTierSpendGuardDeniedError extends Error {}
mock.module('~/domain/feature-flags/feature-flags.server', () => ({ isFreeTierEnabled }));
mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
mock.module('~/utils/db.server', () => ({ prisma: { freeTierApplication: { findFirst } } }));
mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({ requireFreeTierEnabled }));
mock.module('~/domain/free-tier/usage-budget.server', () => ({ assertFreeTierSpendAllowed, FreeTierSpendGuardDeniedError }));
const { loader, headers } = await import('./route');
const request = new Request('http://localhost/app/free-tier/status?userId=foreign&organizationId=foreign&reason=expired');
beforeEach(() => {
  requireUserId.mockReset().mockResolvedValue('current-user');
  requireMembership.mockReset().mockResolvedValue(profile);
  isFreeTierEnabled.mockReset().mockResolvedValue(true);
  requireFreeTierEnabled.mockReset().mockResolvedValue(undefined);
  findFirst.mockReset().mockResolvedValue(application);
  assertFreeTierSpendAllowed.mockReset().mockResolvedValue(undefined);
});
async function load() { return loader({ request } as any); }
test('independent loader ignores crafted state and scopes application and spending check to session membership', async () => {
  const result = await load();
  expect(result.data).toEqual({ state: 'available' });
  expect(findFirst.mock.calls[0][0]).toMatchObject({ where: { userId: 'current-user' } });
  expect(requireMembership).toHaveBeenCalledWith(request, 'current-user');
  expect(isFreeTierEnabled).toHaveBeenCalledWith({ throwOnError: true });
  expect(assertFreeTierSpendAllowed).toHaveBeenCalledTimes(1);
  expect(result.init?.headers).toEqual({ 'Cache-Control': 'private, no-store' });
  expect(headers()).toEqual({ 'Cache-Control': 'private, no-store' });
});
test('budget denial is temporary and recovery is reflected on the next load', async () => {
  assertFreeTierSpendAllowed.mockRejectedValueOnce(new FreeTierSpendGuardDeniedError());
  expect((await load()).data).toEqual({ state: 'budget-paused' });
  expect((await load()).data).toEqual({ state: 'available' });
});
for (const [status, state] of [['EXPIRED', 'trial-ended'], ['REJECTED', 'rejected']] as const) test(`${status} takes precedence over a budget pause without changing persisted state`, async () => {
  findFirst.mockResolvedValue({ ...application, status });
  assertFreeTierSpendAllowed.mockRejectedValue(new FreeTierSpendGuardDeniedError());
  expect((await load()).data).toEqual({ state });
  expect(assertFreeTierSpendAllowed).not.toHaveBeenCalled();
});
test('an expired application without a provisioned classroom remains an expired invite', async () => {
  findFirst.mockResolvedValue({ ...application, status: 'EXPIRED', organizationId: null } as any);
  expect((await load()).data).toEqual({ state: 'invite-expired' });
  expect(requireMembership).not.toHaveBeenCalled();
});
for (const [status, location] of [['SENT', '/app/free-tier/pending'], ['MANUAL_REVIEW', '/app/free-tier/pending'], ['ACCOUNT_CREATED', '/app/free-tier/onboarding'], ['ADMIN_SUBMITTED', '/app/free-tier/onboarding']] as const) test(`${status} keeps its existing gate on direct requests`, async () => {
  findFirst.mockResolvedValue({ ...application, status });
  const error = await load().catch(e => e);
  expect(error.status).toBe(302);
  expect(error.headers.get('Location')).toBe(location);
  expect(assertFreeTierSpendAllowed).not.toHaveBeenCalled();
});
for (const [name, member] of [
  ['student', { ...profile, role: 'STUDENT' }],
  ['paid', { ...profile, organization: { ...profile.organization, plan: 'SCHOOL' } }],
  ['inactive', { ...profile, isActive: false }],
  ['foreign organization', { ...profile, organization: { ...profile.organization, id: 'foreign-org' } }],
] as const) test(`${name} cannot read classroom status`, async () => {
  requireMembership.mockResolvedValue(member as any);
  const error = await load().catch(e => e);
  expect(error.init.status).toBe(403);
  expect(assertFreeTierSpendAllowed).not.toHaveBeenCalled();
});
for (const status of ['INVITED', 'LEAD']) test(`${status} is not evidence of approved access or expiry`, async () => {
  findFirst.mockResolvedValue({ ...application, status });
  const error = await load().catch(e => e);
  expect(error.init.status).toBe(409);
  expect(assertFreeTierSpendAllowed).not.toHaveBeenCalled();
});
test('no application is unavailable rather than expired', async () => {
  findFirst.mockResolvedValue(null);
  expect((await load().catch(e => e)).init.status).toBe(404);
});
for (const fn of [requireUserId, requireMembership, requireFreeTierEnabled, isFreeTierEnabled, findFirst, assertFreeTierSpendAllowed]) test('authentication, authorization and server failures propagate rather than fabricating status', async () => {
  const failure = new Error('fixture failure');
  fn.mockRejectedValue(failure);
  await expect(load()).rejects.toBe(failure);
});

test('demo route availability does not invent a budget pause when the spending flag is off', async () => {
  isFreeTierEnabled.mockResolvedValue(false);
  expect((await load()).data).toEqual({ state: 'available' });
  expect(assertFreeTierSpendAllowed).not.toHaveBeenCalled();
});
