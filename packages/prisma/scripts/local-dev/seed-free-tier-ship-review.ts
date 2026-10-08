import type { PrismaClient } from '@app/prisma';
import { LOCAL_DEV_PASSWORD } from './dev-personas';
import { createPassword } from '../utils';

export const SHIP_REVIEW_TEACHER_EMAIL = 'shipreview-teacher@yawp.invalid';
export const SHIP_REVIEW_PENDING_EMAIL = 'shipreview-pending@yawp.invalid';
export const SHIP_REVIEW_RELEASE_EMAIL = 'shipreview-released@yawp.invalid';

/** Preview ship-review Playwright fixture (idempotent). */
export async function seedFreeTierShipReview(prisma: PrismaClient) {
  const passwordHash = createPassword(LOCAL_DEV_PASSWORD).hash;

  const teacherUser = await prisma.user.upsert({
    where: { email: SHIP_REVIEW_TEACHER_EMAIL },
    create: {
      email: SHIP_REVIEW_TEACHER_EMAIL,
      name: 'Ship Review Teacher',
      password: { create: { hash: passwordHash } },
    },
    update: { name: 'Ship Review Teacher' },
    select: { id: true },
  });

  await prisma.freeTierApplication.upsert({
    where: { email: SHIP_REVIEW_TEACHER_EMAIL },
    create: {
      email: SHIP_REVIEW_TEACHER_EMAIL,
      name: 'Ship Review Teacher',
      schoolName: 'Ship Review High',
      location: 'Preview',
      gradeLevel: '9',
      status: 'ACCOUNT_CREATED',
      userId: teacherUser.id,
      releasedAt: new Date(),
    },
    update: {
      status: 'ACCOUNT_CREATED',
      userId: teacherUser.id,
      releasedAt: new Date(),
    },
  });

  const pendingUser = await prisma.user.upsert({
    where: { email: SHIP_REVIEW_PENDING_EMAIL },
    create: {
      email: SHIP_REVIEW_PENDING_EMAIL,
      name: 'Ship Review Pending',
      password: { create: { hash: passwordHash } },
    },
    update: { name: 'Ship Review Pending' },
    select: { id: true },
  });

  const pendingApp = await prisma.freeTierApplication.upsert({
    where: { email: SHIP_REVIEW_PENDING_EMAIL },
    create: {
      email: SHIP_REVIEW_PENDING_EMAIL,
      name: 'Ship Review Pending',
      schoolName: 'Ship Review High',
      location: 'Preview',
      gradeLevel: '10',
      status: 'SENT',
      userId: pendingUser.id,
      releasedAt: new Date(),
    },
    update: { status: 'SENT', userId: pendingUser.id, releasedAt: new Date() },
    select: { id: true },
  });

  await prisma.freeTierAdminApproval.upsert({
    where: { id: 'ship-review-pending-approval' },
    create: {
      id: 'ship-review-pending-approval',
      applicationId: pendingApp.id,
      adminName: 'Preview Principal',
      adminEmail: 'principal@shipreview.invalid',
      adminRole: 'Principal',
      status: 'PENDING',
      emailCopyVersionHash: 'seed',
    },
    update: {
      adminName: 'Preview Principal',
      adminEmail: 'principal@shipreview.invalid',
      status: 'PENDING',
    },
  });

  await prisma.freeTierApplication.upsert({
    where: { email: SHIP_REVIEW_RELEASE_EMAIL },
    create: {
      email: SHIP_REVIEW_RELEASE_EMAIL,
      name: 'Ship Review Released',
      schoolName: 'Ship Review High',
      location: 'Preview',
      gradeLevel: '11',
      status: 'LEAD',
      releasedAt: null,
    },
    update: { status: 'LEAD', releasedAt: null },
  });
}
