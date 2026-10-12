import { beforeEach, expect, mock, test } from 'bun:test';
const auditCreate = mock(async () => ({}));
const decisionCreate = mock(async () => ({}));
const approved = mock(async () => {});
const rejected = mock(async () => {});
const findUnique = mock(async () => ({ id: 'application', status: 'SENT', releasedAt: new Date(), email: 'teacher@yawp.local', name: 'Teacher', schoolName: 'Demo', userId: null, organizationId: null }));
const updateMany = mock(async () => ({ count: 1 }));
const tx = {
  freeTierApplication: { findUnique, updateMany, findMany: async () => [{ id: 'application' }], count: async () => 0 },
  freeTierApprovalDecision: { create: decisionCreate },
  internalPlatformApiAudit: { create: auditCreate },
  $executeRaw: async () => 1,
};
mock.module('~/utils/db.server', () => ({ prisma: { $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx) } }));
mock.module('~/domain/free-tier/approval-hooks.server', () => ({ ensureFreeTierProductionApprovalHooks: async () => {}, getApprovalHooks: () => ({ onApplicationApproved: approved, onApplicationRejected: rejected }) }));
const { decideApplication, reopenApplication } = await import('~/utils/internal-free-tier-http.server');
const { releaseBatch } = await import('./service.server');
const actor = { actorUserId: 'intern', actorEmail: 'intern@yawp.local', environment: 'demo', action: 'approval.approve' };
beforeEach(() => {
  auditCreate.mockReset().mockResolvedValue({}); decisionCreate.mockClear(); approved.mockClear(); rejected.mockClear();
  findUnique.mockImplementation(async () => ({ id: 'application', status: 'SENT', releasedAt: new Date(), email: 'teacher@yawp.local', name: 'Teacher', schoolName: 'Demo', userId: null, organizationId: null }));
  updateMany.mockResolvedValue({ count: 1 });
});
test('approval records audit in mutation transaction and runs existing approval hook', async () => {
  await decideApplication({ id: 'application', decision: 'APPROVED', decidedByEmail: actor.actorEmail, audit: actor });
  expect(auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ actorUserId: 'intern', targetId: 'application', environment: 'demo', metadata: expect.objectContaining({ previousStatus: 'SENT', status: 'APPROVED' }) }) });
  expect(decisionCreate).toHaveBeenCalled(); expect(approved).toHaveBeenCalled();
});
test('rejection uses identical rejection hook and audits reason', async () => {
  await decideApplication({ id: 'application', decision: 'REJECTED', decidedByEmail: actor.actorEmail, reason: 'Test reason', audit: { ...actor, action: 'approval.reject' } });
  expect(rejected).toHaveBeenCalledWith(expect.objectContaining({ id: 'application' }), 'Test reason');
  expect(auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'approval.reject', metadata: expect.objectContaining({ reason: 'Test reason' }) }) });
});
test('audit failure prevents post-commit approval hook', async () => {
  auditCreate.mockImplementation(async () => { throw new Error('audit failure'); });
  await expect(decideApplication({ id: 'application', decision: 'APPROVED', decidedByEmail: actor.actorEmail, audit: actor })).rejects.toThrow('audit failure');
  expect(approved).not.toHaveBeenCalled();
});
test('conflicting decision writes neither audit nor hook', async () => {
  updateMany.mockResolvedValue({ count: 0 });
  const result = await decideApplication({ id: 'application', decision: 'APPROVED', decidedByEmail: actor.actorEmail, audit: actor });
  expect(result.status).toBe(409); expect(auditCreate).not.toHaveBeenCalled(); expect(approved).not.toHaveBeenCalled();
});
test('waitlist release audits each changed target', async () => {
  await releaseBatch({ applicationIds: ['application'] }, { ...actor, action: 'waitlist.release' });
  expect(auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'waitlist.release', targetId: 'application', metadata: { status: 'INVITED' } }) });
});
test('reopen audits the shared transition', async () => {
  findUnique.mockImplementation(async () => ({ id: 'application', status: 'REJECTED', releasedAt: new Date(), email: 'teacher@yawp.local', name: 'Teacher', schoolName: 'Demo', userId: null, organizationId: null }));
  const result = await reopenApplication({ id: 'application', decidedByEmail: actor.actorEmail, audit: { ...actor, action: 'approval.reopen' } });
  expect(result.status).toBe(200);
  expect(auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'approval.reopen', targetId: 'application' }) });
});
