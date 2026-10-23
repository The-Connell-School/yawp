import bcrypt from 'bcryptjs';
import { LOCAL_DEV_ORG_ID, LOCAL_DEV_PASSWORD } from '../../../../packages/prisma/scripts/local-dev/dev-personas';
import { prisma } from '~/utils/db.server';

export const DEV_PANEL_SIGNED_OUT_TESTER_EMAIL =
  'dev-panel-signed-out-tester@example.test';

export async function ensureDevPanelSignedOutTesterUser(organizationId: string) {
  const passwordHash = bcrypt.hashSync(LOCAL_DEV_PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email: DEV_PANEL_SIGNED_OUT_TESTER_EMAIL },
    create: {
      email: DEV_PANEL_SIGNED_OUT_TESTER_EMAIL,
      name: 'Dev panel signed-out tester',
      password: { create: { hash: passwordHash } },
      memberships: {
        create: {
          organizationId,
          role: 'TEACHER',
        },
      },
    },
    update: {
      name: 'Dev panel signed-out tester',
    },
    select: { id: true },
  });
  const membership = await prisma.orgMembership.findFirst({
    where: { userId: user.id, organizationId },
    select: { id: true },
  });
  if (!membership) {
    await prisma.orgMembership.create({
      data: {
        userId: user.id,
        organizationId,
        role: 'TEACHER',
      },
    });
  }
  return user.id;
}

export function devPanelSeatRateLimitKey(seat: {
  organizationId: string;
  label?: string | null;
}) {
  return `dev_panel_feedback_seat:${seat.organizationId}`;
}

export async function resolveSignedOutFeedbackOrganizationId(
  seatOrganizationId: string | undefined
) {
  return seatOrganizationId ?? LOCAL_DEV_ORG_ID;
}
