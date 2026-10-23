import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  clearDevPanelClassSimulation,
  populateDevPanelClassSimulation,
} from '../../../services/web-app/app/dev-panel/class-simulation.server';
import { simulatedStudentEmail } from '../../../services/web-app/app/dev-panel/class-simulation-mix';
import { resolveClassCode } from '../../../services/web-app/app/utils/class-code-write.server';
import { currentSchoolYear } from '../../../services/web-app/app/utils/school-year';

const sendEmail = mock(async () => ({ status: 'success' as const }));

mock.module('../../../services/web-app/app/utils/email.server', () => ({
  sendEmail,
  getTransactionalEmailFrom: () => 'transactional-from@example.org',
}));

const DB = process.env.DATABASE_URL;

function buildClient() {
  if (!DB) throw new Error('DATABASE_URL is required');
  const adapter = new PrismaPg({ connectionString: DB, ssl: false });
  return new PrismaClient({ adapter });
}

describe('dev panel class simulation (real Postgres)', () => {
  const prisma = buildClient();
  const orgIds: string[] = [];
  const userIds: string[] = [];
  const classIds: string[] = [];

  afterAll(async () => {
    for (const classId of classIds) {
      await prisma.user.deleteMany({ where: { simulatedForClassId: classId } });
    }
    await prisma.classAssignment.deleteMany({
      where: { classId: { in: classIds } },
    });
    await prisma.class.deleteMany({ where: { id: { in: classIds } } });
    await prisma.orgMembership.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.school.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    sendEmail.mockClear();
  });

  async function seedTeacherClass() {
    const org = await prisma.organization.create({
      data: {
        name: `Sim org ${randomUUID()}`,
        plan: 'SCHOOL',
        numOfTeacherSeats: 5,
        numOfStudentSeats: 200,
      },
    });
    orgIds.push(org.id);
    const school = await prisma.school.create({
      data: { organizationId: org.id, name: 'Sim school', code: `sim-${randomUUID()}` },
    });
    const teacherUser = await prisma.user.create({
      data: {
        email: `teacher-${randomUUID()}@example.test`,
        name: 'Sim Teacher',
      },
    });
    userIds.push(teacherUser.id);
    const teacherMembership = await prisma.orgMembership.create({
      data: {
        userId: teacherUser.id,
        organizationId: org.id,
        role: 'TEACHER',
        schools: { connect: { id: school.id } },
      },
    });
    const realStudentUser = await prisma.user.create({
      data: {
        email: `real-${randomUUID()}@example.test`,
        name: 'Real Student',
      },
    });
    userIds.push(realStudentUser.id);
    const realStudentMembership = await prisma.orgMembership.create({
      data: {
        userId: realStudentUser.id,
        organizationId: org.id,
        role: 'STUDENT',
      },
    });
    const klass = await prisma.class.create({
      data: {
        schoolId: school.id,
        title: 'Simulation Class',
        code: await resolveClassCode(prisma, 'sim-class', { generated: true }),
        schoolYear: currentSchoolYear(),
        teachers: { connect: { id: teacherMembership.id } },
        students: { connect: { id: realStudentMembership.id } },
      },
    });
    classIds.push(klass.id);
    const assignmentType = await prisma.assignmentType.findFirst({
      where: { archivedAt: null },
      orderBy: { position: 'asc' },
    });
    if (!assignmentType) throw new Error('No assignment type for integration test');
    const assignment = await prisma.assignment.create({
      data: {
        assignmentTypeId: assignmentType.id,
        title: 'Sim Assignment',
        prompt: 'Write about evidence.',
      },
    });
    await prisma.classAssignment.create({
      data: { classId: klass.id, assignmentId: assignment.id },
    });
    const otherTeacher = await prisma.user.create({
      data: { email: `other-${randomUUID()}@example.test`, name: 'Other' },
    });
    userIds.push(otherTeacher.id);
    return {
      teacherUserId: teacherUser.id,
      otherTeacherUserId: otherTeacher.id,
      classId: klass.id,
      realStudentUserId: realStudentUser.id,
    };
  }

  test('populate is idempotent, resize converges, clear keeps real students', async () => {
    const { teacherUserId, classId, realStudentUserId } = await seedTeacherClass();

    const first = await populateDevPanelClassSimulation({
      userId: teacherUserId,
      classId,
      studentCount: 5,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.counts.students).toBe(5);
    expect(sendEmail).not.toHaveBeenCalled();

    const simAfterFirst = await prisma.user.count({
      where: { simulatedForClassId: classId },
    });
    expect(simAfterFirst).toBe(5);

    const second = await populateDevPanelClassSimulation({
      userId: teacherUserId,
      classId,
      studentCount: 5,
    });
    expect(second.ok).toBe(true);
    expect(await prisma.user.count({ where: { simulatedForClassId: classId } })).toBe(
      5
    );

    await populateDevPanelClassSimulation({
      userId: teacherUserId,
      classId,
      studentCount: 3,
    });
    expect(await prisma.user.count({ where: { simulatedForClassId: classId } })).toBe(
      3
    );
    expect(
      await prisma.user.findFirst({
        where: { email: simulatedStudentEmail(classId, 4) },
      })
    ).toBeNull();

    const cleared = await clearDevPanelClassSimulation({
      userId: teacherUserId,
      classId,
    });
    expect(cleared.ok).toBe(true);
    if (cleared.ok) expect(cleared.removedStudents).toBe(3);
    expect(await prisma.user.count({ where: { simulatedForClassId: classId } })).toBe(
      0
    );
    const realStill = await prisma.user.findUnique({
      where: { id: realStudentUserId },
    });
    expect(realStill?.name).toBe('Real Student');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('rejects class the teacher does not own', async () => {
    const { teacherUserId, otherTeacherUserId, classId } = await seedTeacherClass();
    userIds.push(otherTeacherUserId);
    const denied = await populateDevPanelClassSimulation({
      userId: otherTeacherUserId,
      classId,
      studentCount: 2,
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.status).toBe(403);
    await clearDevPanelClassSimulation({ userId: teacherUserId, classId });
  });
});
