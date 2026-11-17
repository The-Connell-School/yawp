import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  invitation: {
    findFirst: mock(),
    delete: mock(),
  },
};

mock.module('~/utils/db.server.ts', () => ({ prisma }));
mock.module('~/utils/db.server', () => ({ prisma }));

const { deleteOnboardingInvitation } = await import(
  './consume-onboarding-invitation.server'
);

describe('deleteOnboardingInvitation', () => {
  beforeEach(() => {
    prisma.invitation.findFirst.mockReset();
    prisma.invitation.delete.mockReset();
  });

  test('deletes the pending row for the normalized email', async () => {
    prisma.invitation.findFirst.mockResolvedValue({ id: 'inv-1' });
    prisma.invitation.delete.mockResolvedValue(undefined);

    await deleteOnboardingInvitation('onboard-teacher', 'Teacher@Example.com');

    expect(prisma.invitation.findFirst).toHaveBeenCalledWith({
      where: {
        type: 'onboard-teacher',
        target: { equals: 'teacher@example.com', mode: 'insensitive' },
      },
      select: { id: true },
    });
    expect(prisma.invitation.delete).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
    });
  });
});