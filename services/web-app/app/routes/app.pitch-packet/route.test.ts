import { beforeEach, expect, mock, test } from 'bun:test';

const requireUserId = mock(async () => 'session-user');
const membership = { id: 'session-teacher', role: 'TEACHER', isActive: true, organization: { id: 'session-org', plan: 'FREE_CLASSROOM' } };
const requireMembership = mock(async () => membership);
const requireFreeTierEnabled = mock(async () => {});
const enforceFreeTierTeacherGate = mock(async () => null);
const getClassroomActivityReport = mock(async () => ({ activeClasses: 2, enrolledStudents: 2, assignments: 2, submittedWriting: 3, generatedAt: '2026-10-01T12:00:00.000Z' }));
mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({ requireFreeTierEnabled }));
mock.module('~/domain/free-tier/free-tier-gate.server', () => ({ enforceFreeTierTeacherGate }));
mock.module('~/utils/classroom-report.server', () => ({ getClassroomActivityReport }));
const { loader, headers } = await import('./route');
const request = new Request('http://localhost/app/pitch-packet?teacherId=other&organizationId=other&classId=other');
beforeEach(() => {
  for (const fn of [requireUserId, requireMembership, requireFreeTierEnabled, enforceFreeTierTeacherGate, getClassroomActivityReport]) fn.mockClear();
  requireUserId.mockResolvedValue('session-user');
  requireMembership.mockResolvedValue(membership);
  requireFreeTierEnabled.mockResolvedValue(undefined);
  enforceFreeTierTeacherGate.mockResolvedValue(null);
});
test('direct loader requests use authenticated membership and enforce the approval gate before aggregation', async () => {
  const result = await loader({ request } as any);
  expect(requireMembership).toHaveBeenCalledWith(request, 'session-user');
  expect(requireFreeTierEnabled).toHaveBeenCalledTimes(1);
  expect(enforceFreeTierTeacherGate).toHaveBeenCalledWith({ userId: 'session-user', pathname: '/app/pitch-packet', organizationPlan: 'FREE_CLASSROOM' });
  expect(getClassroomActivityReport).toHaveBeenCalledWith({ membershipId: 'session-teacher', organizationId: 'session-org' });
  expect(headers()).toEqual({ 'Cache-Control': 'private, no-store' });
  expect(result.init?.headers).toEqual({ 'Cache-Control': 'private, no-store' });
});
for (const [label, profile] of [['student', { ...membership, role: 'STUDENT' }], ['paid teacher', { ...membership, organization: { ...membership.organization, plan: 'SCHOOL' } }], ['inactive teacher', { ...membership, isActive: false }]] as const) test(`${label} cannot aggregate data`, async () => {
  requireMembership.mockResolvedValue(profile as any);
  const error = await loader({ request } as any).catch(e => e);
  expect(error.init.status).toBe(403);
  expect(getClassroomActivityReport).not.toHaveBeenCalled();
});
for (const gate of [requireUserId, requireFreeTierEnabled, enforceFreeTierTeacherGate]) test(`a failed ${gate === requireUserId ? 'authentication' : gate === requireFreeTierEnabled ? 'feature' : 'approval'} gate prevents aggregation`, async () => {
  gate.mockRejectedValue(new Response('Denied', { status: 403 }));
  await expect(loader({ request } as any)).rejects.toBeInstanceOf(Response);
  expect(getClassroomActivityReport).not.toHaveBeenCalled();
});
