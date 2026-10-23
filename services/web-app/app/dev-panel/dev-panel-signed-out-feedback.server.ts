import { prisma } from '~/utils/db.server';

export const DEV_PANEL_SIGNED_OUT_TESTER_EMAIL =
  'dev-panel-signed-out-tester@example.test';

/** Credential-less user for signed-out preview feedback only (no login, no org role). */
export async function ensureDevPanelSignedOutTesterUser() {
  const user = await prisma.user.upsert({
    where: { email: DEV_PANEL_SIGNED_OUT_TESTER_EMAIL },
    create: {
      email: DEV_PANEL_SIGNED_OUT_TESTER_EMAIL,
      name: 'Dev panel signed-out tester',
    },
    update: {
      name: 'Dev panel signed-out tester',
    },
    select: { id: true },
  });
  await prisma.password.deleteMany({ where: { userId: user.id } });
  await prisma.orgMembership.deleteMany({ where: { userId: user.id } });
  return user.id;
}

export function devPanelSeatRateLimitKey(seat: {
  organizationId: string;
  label?: string | null;
}) {
  const label = (seat.label ?? 'unknown').slice(0, 80);
  return `dev_panel_feedback_seat:${seat.organizationId}:${label}`;
}
