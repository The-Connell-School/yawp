// Dev-only stress fixture: seeds ~50 graded documents for one student so the
// class Documents tab and Student Work grouping/filtering can be checked with
// realistic volume.
//
// Usage:
//   bun packages/prisma/scripts/seed-student-work-stress.ts <classId> <studentEmail> [count]

import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();

const [classId, studentEmail, countArg] = process.argv.slice(2);
const count = Number(countArg ?? '50');

if (!classId || !studentEmail || !Number.isInteger(count) || count < 1) {
  console.error(
    'Usage: bun packages/prisma/scripts/seed-student-work-stress.ts <classId> <studentEmail> [count]'
  );
  process.exit(1);
}

const klass = await prisma.class.findUniqueOrThrow({
  where: { id: classId },
  select: { id: true, grade: true, period: true },
});

const profile = await prisma.profile.findFirstOrThrow({
  where: {
    user: { email: studentEmail },
    studentProfile: { classes: { some: { id: klass.id } } },
  },
  select: {
    id: true,
    studentProfile: { select: { id: true } },
  },
});

const assignmentType = await prisma.assignmentType.findFirstOrThrow({
  where: { archivedAt: null, systemKey: null },
  select: { id: true },
});

const assignment = await prisma.assignment.create({
  data: {
    classId: klass.id,
    assignmentTypeId: assignmentType.id,
    title: `Stress Test Assignment ${Date.now().toString(36)}`,
    prompt: 'Stress-test prompt: write a short response.',
  },
  select: { id: true, title: true },
});

for (let index = 0; index < count; index++) {
  const released = index % 3 === 0;
  const body = `Stress document ${index + 1} body text.`;
  await prisma.document.create({
    data: {
      title: `Stress Doc ${String(index + 1).padStart(2, '0')}`,
      text: body,
      html: `<p>${body}</p>`,
      profile: { connect: { id: profile.id } },
      studentProfile: { connect: { id: profile.studentProfile!.id } },
      assignmentType: { connect: { id: assignmentType.id } },
      assignment: { connect: { id: assignment.id } },
      submissions: {
        create: {
          title: `Stress Submission ${String(index + 1).padStart(2, '0')}`,
          text: body,
          html: `<p>${body}</p>`,
          submittedAt: new Date(Date.now() - index * 60_000),
          gradedAt: new Date(Date.now() - index * 30_000),
          numericPercentage: 70 + (index % 30),
          feedback: 'Stress-test feedback.',
          ...(released ? { releasedAt: new Date() } : {}),
        },
      },
    },
    select: { id: true },
  });
}

console.log(
  `Seeded ${count} graded documents for ${studentEmail} on assignment "${assignment.title}" in class ${klass.grade}/${klass.period}.`
);

await prisma.$disconnect();
