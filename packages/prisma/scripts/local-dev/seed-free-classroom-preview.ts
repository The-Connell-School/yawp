import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma';
import bcrypt from 'bcryptjs';

function generateStudentJoinToken() {
  return randomBytes(24).toString('base64url');
}

export const PREVIEW_FREE_CLASSROOM_ORG_ID = 'preview-free-classroom';

const TEACHER_EMAIL = 'preview.free-classroom@yawp.local';
const TEACHER_PASSWORD = 'yawp-dev';

/**
 * Idempotent preview fixture: one FREE_CLASSROOM org, teacher, school, and class
 * with a student join token for handle-based onboarding QA.
 */
export async function ensurePreviewFreeClassroomFixture(prisma: PrismaClient) {
  const existing = await prisma.organization.findUnique({
    where: { id: PREVIEW_FREE_CLASSROOM_ORG_ID },
    select: { id: true },
  });
  if (existing) return { status: 'existing' as const };

  const passwordHash = await bcrypt.hash(TEACHER_PASSWORD, 10);
  const joinToken = generateStudentJoinToken();

  await prisma.$transaction(async (tx) => {
    await tx.organization.create({
      data: {
        id: PREVIEW_FREE_CLASSROOM_ORG_ID,
        name: 'Preview Free Classroom',
        plan: 'FREE_CLASSROOM',
        numOfStudentSeats: 35,
        numOfTeacherSeats: 1,
      },
    });
    const school = await tx.school.create({
      data: {
        name: 'Preview Free School',
        code: 'PREVIEW-FREE',
        organizationId: PREVIEW_FREE_CLASSROOM_ORG_ID,
      },
    });
    const teacher = await tx.user.create({
      data: {
        email: TEACHER_EMAIL,
        name: 'Preview Free Teacher',
        password: { create: { hash: passwordHash } },
      },
    });
    const membership = await tx.orgMembership.create({
      data: {
        userId: teacher.id,
        organizationId: PREVIEW_FREE_CLASSROOM_ORG_ID,
        role: 'TEACHER',
        isOrgOwner: true,
      },
    });
    await tx.class.create({
      data: {
        code: 'FREEPRV',
        schoolYear: '2025-2026',
        grade: '9',
        period: '1',
        schoolId: school.id,
        studentJoinToken: joinToken,
        teachers: { connect: { id: membership.id } },
      },
    });
  });

  return { status: 'created' as const, teacherEmail: TEACHER_EMAIL, joinToken };
}
