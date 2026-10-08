import { afterAll, describe, expect, test } from 'bun:test';
import { basePrisma as prisma } from '~/utils/db.server';
import { FREE_CLASSROOM_STUDENT_SEAT_CAP } from './class-seat-cap';
import { assertFreeClassSeatAvailableInTx } from './class-seat-cap.server';
import { generateStudentJoinToken } from '~/utils/student-join-token';

const createdOrgIds: string[] = [];

afterAll(async () => {
  try {
    await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
    await prisma.$disconnect();
  } catch {
    // ignore
  }
});

describe('DB: free-class seat cap', () => {
  test('refuses the 36th seat under row lock', async () => {
    const org = await prisma.organization.create({
      data: {
        name: `Seat cap ${Date.now()}`,
        plan: 'FREE_CLASSROOM',
      },
    });
    createdOrgIds.push(org.id);
    const school = await prisma.school.create({
      data: {
        name: 'Cap School',
        code: `CAP-${Date.now()}`,
        organizationId: org.id,
      },
    });
    const klass = await prisma.class.create({
      data: {
        code: 'CAP001',
        schoolId: school.id,
        studentJoinToken: generateStudentJoinToken(),
      },
    });

    for (let i = 0; i < FREE_CLASSROOM_STUDENT_SEAT_CAP; i++) {
      await prisma.orgMembership.create({
        data: {
          role: 'STUDENT',
          organization: { connect: { id: org.id } },
          user: {
            create: {
              email: `cap-student-${i}-${Date.now()}@example.com`,
              name: `Student ${i}`,
            },
          },
          classesAsStudent: { connect: { id: klass.id } },
        },
      });
    }

    const denied = await prisma.$transaction((tx) =>
      assertFreeClassSeatAvailableInTx(tx, {
        classId: klass.id,
        organizationId: org.id,
      })
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.code).toBe('class_full');
    }
  });
});
