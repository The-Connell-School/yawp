import type { Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server.ts';
import { normalizeEmail } from '~/utils/normalize-email';

const ONBOARD_TYPES = [
  'onboard-student',
  'onboard-teacher',
  'onboard-owner',
] as const;

export type OnboardInvitationType = (typeof ONBOARD_TYPES)[number];

export function isOnboardInvitationType(
  type: string
): type is OnboardInvitationType {
  return (ONBOARD_TYPES as readonly string[]).includes(type);
}

export async function deleteOnboardingInvitationInTx(
  tx: Prisma.TransactionClient,
  type: OnboardInvitationType,
  email: string
) {
  const normalizedTarget = normalizeEmail(email);
  const invitation = await tx.invitation.findFirst({
    where: {
      type,
      target: { equals: normalizedTarget, mode: 'insensitive' },
    },
    select: { id: true },
  });
  if (invitation) {
    await tx.invitation.delete({ where: { id: invitation.id } });
  }
}

export async function deleteOnboardingInvitation(
  type: OnboardInvitationType,
  email: string
) {
  await deleteOnboardingInvitationInTx(prisma, type, email);
}