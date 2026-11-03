import { afterEach, describe, expect, mock, test } from 'bun:test';
import { data as dataResponse } from 'react-router';

const requireUserId = mock(async () => 'user-1');
const requireMembership = mock(async () => ({
  id: 'membership-1',
  role: 'TEACHER' as const,
  organization: { id: 'org-1', plan: 'FREE_CLASSROOM' as const },
}));
const isFreeTierEnabled = mock(async () => true);
const userHasPendingFreeTierTeachingLock = mock(async () => true);
const guardTeachingFormAction = mock<
  () => Promise<Awaited<ReturnType<typeof import('~/domain/free-tier/teaching-approval-required.server').guardTeachingFormAction>>>
>(async () => null);
const getAvailableAssignmentTypesForScopes = mock(async () => [
  { id: 'type-1', title: 'Class Starter' },
]);

mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFreeTierEnabled,
}));
mock.module('~/domain/free-tier/locked-preview.server', () => ({
  userHasPendingFreeTierTeachingLock,
}));
mock.module('~/domain/free-tier/teaching-approval-required.server', () => ({
  guardTeachingFormAction,
}));
mock.module('~/utils/assignment-type-access.server', () => ({
  getAvailableAssignmentTypesForScopes,
}));
mock.module('~/utils/db.server', () => ({
  prisma: {
    class: {
      findMany: mock(async () => [
        {
          id: 'class-1',
          schoolId: 'school-1',
          grade: '11',
          period: '1',
          title: null,
          school: { name: 'Lincoln High' },
        },
      ]),
    },
  },
}));

const { loader, action } = await import('./route');

describe('app.assignments.new route gate', () => {
  afterEach(() => {
    requireUserId.mockClear();
    requireMembership.mockClear();
    isFreeTierEnabled.mockClear();
    userHasPendingFreeTierTeachingLock.mockClear();
    guardTeachingFormAction.mockClear();
    getAvailableAssignmentTypesForScopes.mockClear();
    isFreeTierEnabled.mockResolvedValue(true);
    userHasPendingFreeTierTeachingLock.mockResolvedValue(true);
    guardTeachingFormAction.mockResolvedValue(null);
  });

  test('loader returns 404 when free-tier is off', async () => {
    isFreeTierEnabled.mockResolvedValue(false);
    await expect(
      loader({
        request: new Request('http://localhost/app/assignments/new'),
        params: {},
        context: {} as never,
      } as never)
    ).rejects.toMatchObject({ status: 404 });
    expect(userHasPendingFreeTierTeachingLock).not.toHaveBeenCalled();
  });

  test('loader returns 404 for an approved teacher', async () => {
    userHasPendingFreeTierTeachingLock.mockResolvedValue(false);
    await expect(
      loader({
        request: new Request('http://localhost/app/assignments/new'),
        params: {},
        context: {} as never,
      } as never)
    ).rejects.toMatchObject({ status: 404 });
  });

  test('action returns 404 when free-tier is off', async () => {
    isFreeTierEnabled.mockResolvedValue(false);
    const form = new FormData();
    form.set('title', 'Draft');
    await expect(
      action({
        request: new Request('http://localhost/app/assignments/new', {
          method: 'POST',
          body: form,
        }),
        params: {},
        context: {} as never,
      } as never)
    ).rejects.toMatchObject({ status: 404 });
    expect(guardTeachingFormAction).not.toHaveBeenCalled();
  });

  test('action returns 404 for an approved teacher', async () => {
    userHasPendingFreeTierTeachingLock.mockResolvedValue(false);
    const form = new FormData();
    form.set('title', 'Draft');
    await expect(
      action({
        request: new Request('http://localhost/app/assignments/new', {
          method: 'POST',
          body: form,
        }),
        params: {},
        context: {} as never,
      } as never)
    ).rejects.toMatchObject({ status: 404 });
    expect(guardTeachingFormAction).not.toHaveBeenCalled();
  });

  test('action returns inline approval_required for a pending teacher', async () => {
    guardTeachingFormAction.mockResolvedValue(
      dataResponse(
        {
          error: 'approval_required',
          approvalRequired: true as const,
          fields: { title: 'Community Gardens' },
        },
        { status: 403 }
      )
    );
    const form = new FormData();
    form.set('title', 'Community Gardens');
    const result = await action({
      request: new Request('http://localhost/app/assignments/new', {
        method: 'POST',
        body: form,
      }),
      params: {},
      context: {} as never,
    } as never);
    expect(result).toMatchObject({
      type: 'DataWithResponseInit',
      init: { status: 403 },
      data: {
        approvalRequired: true,
        fields: { title: 'Community Gardens' },
      },
    });
    expect(guardTeachingFormAction).toHaveBeenCalled();
  });
});
