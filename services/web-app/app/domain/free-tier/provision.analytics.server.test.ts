import { beforeEach, expect, mock, test } from 'bun:test';
const capture = mock();
const alias = mock();
const prisma = {
  $transaction: mock(),
  freeTierApplication: { findUnique: mock() },
};
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/services/posthog.server', () => ({
  posthog: { capture, alias },
}));
const { provisionFreeClassroom } =
  await import('./provision-free-classroom.server');
beforeEach(() => {
  capture.mockReset();
  alias.mockReset();
  prisma.$transaction.mockReset();
  prisma.freeTierApplication.findUnique.mockReset();
});
test('activation emits only after new provisioning, preserving token attribution and identity', async () => {
  prisma.$transaction.mockResolvedValue({
    status: 'provisioned',
    organizationId: 'org-1',
  });
  prisma.freeTierApplication.findUnique.mockResolvedValue({
    id: 'app-1',
    status: 'APPROVED',
    userId: 'teacher-1',
    organizationId: 'org-1',
    acquisitionTokenId: 'token-1',
    acquisitionToken: { sourceName: 'Event', eventDate: null },
  });
  expect(await provisionFreeClassroom('app-1')).toEqual({
    status: 'provisioned',
    organizationId: 'org-1',
  });
  expect(alias).toHaveBeenCalledWith({
    distinctId: 'free-tier-application:app-1',
    alias: 'free-tier-organization:org-1',
  });
  expect(capture).toHaveBeenCalledWith(
    expect.objectContaining({
      event: 'free_tier.activation',
      properties: expect.objectContaining({
        activation_step: 'provisioned',
        teacher_user_id: 'teacher-1',
        acquisition_channel: 'event_link',
        source_name: 'Event',
      }),
    })
  );
});
for (const status of [
  'already_provisioned',
  'pending_user',
  'routed_to_school_onboarding',
]) {
  test(`${status} does not emit activation or read attribution`, async () => {
    prisma.$transaction.mockResolvedValue({ status, organizationId: 'org-1' });
    await provisionFreeClassroom('app-1');
    expect(capture).not.toHaveBeenCalled();
    expect(prisma.freeTierApplication.findUnique).not.toHaveBeenCalled();
  });
}
test('failed provisioning does not convert; enrichment failure cannot undo success', async () => {
  prisma.$transaction.mockRejectedValueOnce(new Error('rollback'));
  await expect(provisionFreeClassroom('app-1')).rejects.toThrow('rollback');
  expect(capture).not.toHaveBeenCalled();
  prisma.$transaction.mockResolvedValue({
    status: 'provisioned',
    organizationId: 'org-1',
  });
  prisma.freeTierApplication.findUnique.mockRejectedValue(
    new Error('optional lookup')
  );
  expect(await provisionFreeClassroom('app-1')).toEqual({
    status: 'provisioned',
    organizationId: 'org-1',
  });
});
