import { afterEach, expect, mock, test } from 'bun:test';

let flagEnabled = true;
let lockedApp: { status: string; organizationId: string | null } | null = {
  status: 'SENT',
  organizationId: 'org-a',
};
let application: any = {
  id: 'app-1',
  status: 'SENT',
  organizationId: 'org-a',
  lockedPreviewApprovalToastSeenAt: null,
  adminApprovals: [{ adminName: 'Dr. Patel' }],
};

mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFeatureFlagEnabled: mock(async () => flagEnabled),
}));
mock.module('./locked-preview.server', () => ({
  getLockedPreviewApplication: mock(async () => lockedApp),
}));
mock.module('~/utils/db.server', () => ({
  prisma: {
    freeTierApplication: {
      findFirst: mock(async () => application),
      updateMany: mock(async () => ({ count: 1 })),
    },
  },
}));

const { loadTeachingAccessShellState, markTeachingAccessApprovalToastSeen } =
  await import('./teaching-access-shell.server');

afterEach(() => {
  flagEnabled = true;
  lockedApp = { status: 'SENT', organizationId: 'org-a' };
  application = {
    id: 'app-1',
    status: 'SENT',
    organizationId: 'org-a',
    lockedPreviewApprovalToastSeenAt: null,
    adminApprovals: [{ adminName: 'Dr. Patel' }],
  };
});

test('returns none when flag is off or role is not a free teacher', async () => {
  flagEnabled = false;
  expect(
    await loadTeachingAccessShellState({
      userId: 'u1',
      role: 'TEACHER',
      organizationPlan: 'FREE_CLASSROOM',
      organizationId: 'org-a',
    })
  ).toEqual({ variant: 'none' });
  flagEnabled = true;
  expect(
    await loadTeachingAccessShellState({
      userId: 'u1',
      role: 'STUDENT',
      organizationPlan: 'FREE_CLASSROOM',
      organizationId: 'org-a',
    })
  ).toEqual({ variant: 'none' });
});

test('returns locked with admin name while preview is active', async () => {
  expect(
    await loadTeachingAccessShellState({
      userId: 'u1',
      role: 'TEACHER',
      organizationPlan: 'FREE_CLASSROOM',
      organizationId: 'org-a',
    })
  ).toEqual({
    variant: 'locked',
    applicationId: 'app-1',
    adminName: 'Dr. Patel',
  });
});

test('returns loading until locked preview membership resolves', async () => {
  lockedApp = null;
  expect(
    await loadTeachingAccessShellState({
      userId: 'u1',
      role: 'TEACHER',
      organizationPlan: 'FREE_CLASSROOM',
      organizationId: 'org-a',
    })
  ).toEqual({ variant: 'loading' });
});

test('returns unlocked with one-time approval toast', async () => {
  application.status = 'APPROVED';
  lockedApp = null;
  expect(
    await loadTeachingAccessShellState({
      userId: 'u1',
      role: 'TEACHER',
      organizationPlan: 'FREE_CLASSROOM',
      organizationId: 'org-a',
    })
  ).toEqual({
    variant: 'unlocked',
    applicationId: 'app-1',
    showApprovalToast: true,
  });
  application.lockedPreviewApprovalToastSeenAt = new Date();
  expect(
    await loadTeachingAccessShellState({
      userId: 'u1',
      role: 'TEACHER',
      organizationPlan: 'FREE_CLASSROOM',
      organizationId: 'org-a',
    })
  ).toEqual({
    variant: 'unlocked',
    applicationId: 'app-1',
    showApprovalToast: false,
  });
});

test('markTeachingAccessApprovalToastSeen is idempotent', async () => {
  await markTeachingAccessApprovalToastSeen('app-1');
});
