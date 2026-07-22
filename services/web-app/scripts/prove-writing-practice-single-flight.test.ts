import { afterAll, expect, mock, test } from 'bun:test';

const getLLMCompletion = mock(async () =>
  JSON.stringify({
    questions: [
      {
        sentence: 'The exhibit opened, visitors filled the gallery.',
        underline: 'opened, visitors',
        choices: [
          'opened, visitors',
          'opened; visitors',
          'opened visitors',
          'opened, and, visitors',
        ],
        correctChoiceIndex: 1,
        explanation: 'A semicolon correctly joins the two independent clauses.',
      },
      {
        sentence: 'The telescope rotated, the astronomer recorded the image.',
        underline: 'rotated, the astronomer',
        choices: [
          'rotated, the astronomer',
          'rotated; the astronomer',
          'rotated the astronomer',
          'rotated, and, the astronomer',
        ],
        correctChoiceIndex: 1,
        explanation: 'A semicolon correctly joins the two independent clauses.',
      },
      {
        sentence: 'The rehearsal ended, the musicians packed their cases.',
        underline: 'ended, the musicians',
        choices: [
          'ended, the musicians',
          'ended; the musicians',
          'ended the musicians',
          'ended, and, the musicians',
        ],
        correctChoiceIndex: 1,
        explanation: 'A semicolon correctly joins the two independent clauses.',
      },
      {
        sentence: 'The tide receded, researchers examined the shoreline.',
        underline: 'receded, researchers',
        choices: [
          'receded, researchers',
          'receded; researchers',
          'receded researchers',
          'receded, and, researchers',
        ],
        correctChoiceIndex: 1,
        explanation: 'A semicolon correctly joins the two independent clauses.',
      },
    ],
  })
);

mock.module('~/utils/getLLMCompletion', () => ({
  AgentType: { Assistant: 'assistant', User: 'user' },
  getLLMCompletion,
}));

const { prisma } = await import('../app/utils/db.server');
const { getOrCreateStudentPracticeSet } =
  await import('../app/utils/writing-lessons/practice-assignments.server');

afterAll(async () => {
  await prisma.$disconnect();
  mock.restore();
});

test('PostgreSQL advisory lock and retry admit one reservation, provider call, and prompt set', async () => {
  const suffix = `${Date.now()}-${crypto.randomUUID()}`;
  let userId: string | null = null;
  let membershipId: string | null = null;
  let assignmentId: string | null = null;
  let classId: string | null = null;

  try {
    const targetClass = await prisma.class.findFirst({
      where: { teachers: { some: { isActive: true } } },
      select: {
        id: true,
        school: { select: { organizationId: true } },
        teachers: {
          where: { isActive: true },
          select: { id: true },
          take: 1,
        },
      },
    });
    expect(targetClass).not.toBeNull();
    const teacher = targetClass!.teachers[0];
    expect(teacher).toBeDefined();
    classId = targetClass!.id;

    const user = await prisma.user.create({
      data: {
        email: `writing-single-flight-${suffix}@yawp.test`,
        name: 'Writing single-flight proof',
      },
    });
    userId = user.id;
    const membership = await prisma.orgMembership.create({
      data: {
        userId: user.id,
        organizationId: targetClass!.school.organizationId,
        role: 'STUDENT',
      },
    });
    membershipId = membership.id;
    await prisma.class.update({
      where: { id: targetClass!.id },
      data: { students: { connect: { id: membership.id } } },
    });

    const assignment = await prisma.writingPracticeAssignment.create({
      data: {
        title: `Single-flight proof ${suffix}`,
        organizationId: targetClass!.school.organizationId,
        createdByMembershipId: teacher!.id,
        lessonSlugs: ['fixing-comma-splices'],
        problemCount: 4,
        classAssignments: { create: { classId: targetClass!.id } },
      },
      select: {
        id: true,
        classAssignments: { select: { id: true } },
      },
    });
    assignmentId = assignment.id;
    const classAssignmentId = assignment.classAssignments[0]!.id;
    const input = {
      classAssignmentId,
      membershipId: membership.id,
      organizationId: targetClass!.school.organizationId,
      lessonSlugs: ['fixing-comma-splices'],
      problemCount: 4,
    };

    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const contenders = Array.from({ length: 8 }, async () => {
      await barrier;
      return getOrCreateStudentPracticeSet(input);
    });
    release();
    const results = await Promise.all(contenders);
    const retry = await getOrCreateStudentPracticeSet(input);

    expect(results.every((result) => result.length === 4)).toBe(true);
    expect(
      results.every(
        (result) =>
          result[0]!.kind === 'act' &&
          results[0]![0]!.kind === 'act' &&
          result[0]!.question.id === results[0]![0]!.question.id
      )
    ).toBe(true);
    expect(retry[0]!.kind).toBe('act');
    expect(results[0]![0]!.kind).toBe('act');
    if (retry[0]!.kind !== 'act' || results[0]![0]!.kind !== 'act') {
      throw new Error('Grammar-only proof returned a Composition item');
    }
    expect(retry[0]!.question.id).toBe(results[0]![0]!.question.id);
    expect(getLLMCompletion).toHaveBeenCalledTimes(1);
    expect(
      await prisma.writingPracticePromptSet.count({
        where: { classAssignmentId, membershipId: membership.id },
      })
    ).toBe(1);
    expect(
      await prisma.aiRequestReservation.count({
        where: {
          membershipId: membership.id,
          feature: 'writing-fundamentals-generation',
        },
      })
    ).toBe(1);
  } finally {
    if (assignmentId) {
      await prisma.writingPracticeAssignment.deleteMany({
        where: { id: assignmentId },
      });
    }
    if (classId && membershipId) {
      await prisma.class.update({
        where: { id: classId },
        data: { students: { disconnect: { id: membershipId } } },
      });
    }
    if (membershipId) {
      await prisma.orgMembership.deleteMany({
        where: { id: membershipId },
      });
    }
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  }
}, 30_000);
