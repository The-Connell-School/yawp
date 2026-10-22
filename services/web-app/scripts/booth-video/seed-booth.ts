/**
 * Shapes a disposable local-dev database into the booth video's demo world.
 *
 *   bun scripts/booth-video/seed-booth.ts base        # class, roster, flags
 *   bun scripts/booth-video/seed-booth.ts class-work  # classmates' graded essays
 *
 * `base` runs on a freshly bootstrapped local database (./bin/project bootstrap
 * --fresh). The video's first section creates the assignment live in the app;
 * `class-work` then gives the other 23 students graded, released essays on that
 * same assignment, so the Class Summary later describes a real class.
 *
 * Refuses anything but a local database: it renames users and archives classes.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../../packages/prisma/generated/prisma';
import { isLocalDatabaseUrl } from '../../../../packages/prisma/scripts/local-dev/database-url';
import { ASSIGNMENT, CLASS, CLASSMATES, STUDENT, TEACHER } from './copy.mjs';

const RUBRIC_KEYS = [
  'thesis_and_content',
  'organization_and_structure',
  'evidence_and_support',
  'voice_and_style',
  'grammar_and_mechanics',
] as const;
const RUBRIC_WEIGHTS = [0.25, 0.25, 0.2, 0.2, 0.1];

const SHORT_COMMENTS: Record<(typeof RUBRIC_KEYS)[number], string[]> = {
  thesis_and_content: ['Your thesis wanders; say what you are arguing in one sentence.', 'A clear position, but it needs to be more specific.', 'A clear, arguable thesis.', 'A sharp, original thesis that drives the whole essay.', 'An original thesis that drives every paragraph.'],
  organization_and_structure: ['Paragraphs need a clear claim to organize around.', 'Paragraph two drifts into plot summary.', 'Each paragraph opens with a claim.', 'Well organized, with purposeful transitions.', 'Every paragraph builds the argument.'],
  evidence_and_support: ['Add evidence from the novel to support your claims.', 'You quote the novel but don\'t explain what the quotation proves.', 'Good evidence; push the analysis one sentence further.', 'Evidence is explained, not just quoted.', 'Precise evidence with insightful analysis.'],
  voice_and_style: ['Your ideas are hard to follow; read it aloud and revise.', 'Mostly general statements; find your own way of saying it.', 'A readable, consistent voice.', 'A confident voice with some memorable lines.', 'A distinctive, confident voice.'],
  grammar_and_mechanics: ['Frequent errors make some sentences hard to follow.', 'Watch for comma splices, especially after quotations.', 'A few comma splices after quotations.', 'Mostly clean.', 'Clean and controlled.'],
};

function percentageFor(scores: number[]) {
  const weighted = scores.reduce((sum, score, i) => sum + (score / 5) * RUBRIC_WEIGHTS[i]!, 0);
  return Math.round(weighted * 100);
}

function letterFor(percentage: number) {
  if (percentage >= 90) return 'A';
  if (percentage >= 80) return 'B';
  if (percentage >= 70) return 'C';
  if (percentage >= 60) return 'D';
  return 'F';
}

function emailFor(name: string) {
  return `booth.${name.toLowerCase().replace(/[^a-z]+/g, '.')}@yawp.local`;
}

function paragraphsToHtml(text: string) {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return text.split(/\n\n+/).map((p) => `<p>${escape(p)}</p>`).join('');
}

/** A short essay built around the student's opening, sized like a real one. */
function essayFor(opening: string, scores: number[]) {
  const evidence = scores[2]! >= 4
    ? 'Bradbury makes this concrete in the scene where Mildred cannot remember where she met Montag. The detail matters because it shows that a life filled with constant entertainment leaves no room for memory, and without memory there is nothing to think about.'
    : 'In the book Mildred cannot remember where she met Montag. This shows that she does not care about him.';
  const close = scores[0]! >= 4
    ? "Bradbury's warning still applies, but it is a warning, not a prediction. We decide every day whether Montag's world becomes ours."
    : 'In conclusion, Fahrenheit 451 is like our world in many ways and people should read more books.';
  return [opening, evidence, close].join('\n\n');
}

async function main() {
  const phase = process.argv[2];
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (!isLocalDatabaseUrl(databaseUrl)) throw new Error('seed-booth only runs against a local database.');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, ssl: false }) });
  try {
    if (phase === 'base') await seedBase(prisma);
    else if (phase === 'class-work') await seedClassWork(prisma);
    else throw new Error('Usage: seed-booth.ts <base|class-work>');
  } finally {
    await prisma.$disconnect();
  }
}

async function seedBase(prisma: PrismaClient) {
  const teacher = await prisma.user.findUniqueOrThrow({ where: { email: TEACHER.email }, include: { memberships: true } });
  const student = await prisma.user.findUniqueOrThrow({ where: { email: STUDENT.email }, include: { memberships: true } });
  const teacherMembership = teacher.memberships[0]!;
  const studentMembership = student.memberships[0]!;
  const organizationId = teacherMembership.organizationId;

  await prisma.user.update({ where: { id: teacher.id }, data: { name: TEACHER.name } });
  await prisma.user.update({ where: { id: student.id }, data: { name: STUDENT.name } });

  await prisma.organization.update({
    where: { id: organizationId },
    data: { classInsightsEnabled: true, writingPracticeEnabled: true, revisionFlowEnabled: true },
  });
  await prisma.setting.upsert({
    where: { name: 'feature_flag.lesson_planner' },
    create: { id: 'booth-lesson-planner', name: 'feature_flag.lesson_planner', value: 'true', valueType: 'boolean' },
    update: { value: 'true' },
  });

  // One class on screen: archive everything the dev seed made.
  await prisma.class.updateMany({ where: { school: { organizationId } }, data: { isArchived: true } });

  // Keep the dashboard's assignment-type row to the types a teacher would recognise.
  await prisma.assignmentType.updateMany({
    where: {
      archivedAt: null,
      OR: [{ title: { startsWith: 'GBA' } }, { title: { startsWith: 'Production QA' } }, { title: 'Nonverbal Communication Assignment' }],
    },
    data: { archivedAt: new Date() },
  });

  const school = await prisma.school.findFirstOrThrow({ where: { organizationId, name: 'North Ridge High' } });
  const classmateMembershipIds: string[] = [];
  for (const classmate of CLASSMATES) {
    const user = await prisma.user.upsert({
      where: { email: emailFor(classmate.name) },
      create: {
        email: emailFor(classmate.name),
        name: classmate.name,
        memberships: { create: { organizationId, role: 'STUDENT' } },
      },
      update: { name: classmate.name },
      include: { memberships: true },
    });
    classmateMembershipIds.push(user.memberships[0]!.id);
  }

  const existing = await prisma.class.findFirst({ where: { schoolId: school.id, code: CLASS.code } });
  if (existing) await prisma.class.delete({ where: { id: existing.id } });
  const boothClass = await prisma.class.create({
    data: {
      code: CLASS.code,
      title: CLASS.title,
      grade: CLASS.grade,
      period: CLASS.period,
      schoolYear: '2026-2027',
      schoolId: school.id,
      classArtKey: (await prisma.class.findFirst({ where: { schoolId: school.id, title: CLASS.title } }))?.classArtKey ?? null,
      teachers: { connect: [{ id: teacherMembership.id }] },
      students: { connect: [studentMembership.id, ...classmateMembershipIds].map((id) => ({ id })) },
    },
  });
  console.log(JSON.stringify({ phase: 'base', classId: boothClass.id, students: classmateMembershipIds.length + 1 }));
}

async function seedClassWork(prisma: PrismaClient) {
  const boothClass = await prisma.class.findFirstOrThrow({ where: { code: CLASS.code, isArchived: false } });
  const classAssignment = await prisma.classAssignment.findFirstOrThrow({
    where: { classId: boothClass.id },
    orderBy: { createdAt: 'desc' },
    include: { assignment: true },
  });
  const teacher = await prisma.user.findUniqueOrThrow({ where: { email: TEACHER.email }, include: { memberships: true } });
  const assignmentTypeId = classAssignment.assignment.assignmentTypeId;
  const modules = await prisma.assignmentModule.findMany({
    where: { assignmentTypeId, deletedAt: null },
    orderBy: { position: 'asc' },
    select: { id: true, instructions: { orderBy: { position: 'asc' }, select: { id: true, prompt: true }, take: 1 } },
  });

  const now = Date.now();
  const hour = 60 * 60 * 1000;
  let created = 0;
  for (const [index, classmate] of CLASSMATES.entries()) {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: emailFor(classmate.name) }, include: { memberships: true } });
    const membershipId = user.memberships[0]!.id;
    const already = await prisma.document.findFirst({ where: { membershipId, classAssignmentId: classAssignment.id } });
    if (already) continue;

    const text = essayFor(classmate.opening, classmate.scores);
    const html = paragraphsToHtml(text);
    const title = `${classmate.name.split(' ')[0]}'s Fahrenheit 451 essay`;
    const document = await prisma.document.create({
      data: {
        title,
        text,
        html,
        membershipId,
        assignmentTypeId,
        assignmentId: classAssignment.assignmentId,
        classAssignmentId: classAssignment.id,
        assignmentModuleSessions: {
          create: modules.map((module) => ({
            instructionsCompleted: 0,
            assignmentModuleId: module.id,
            ...(module.instructions[0]
              ? { messages: { create: [{ content: module.instructions[0].prompt, agent: 'assistant', instructionId: module.instructions[0].id }] } }
              : {}),
          })),
        },
      },
    });
    const percentage = percentageFor(classmate.scores);
    const rubricScores = Object.fromEntries(
      RUBRIC_KEYS.map((key, i) => [key, { score: classmate.scores[i]!, comment: SHORT_COMMENTS[key][classmate.scores[i]! - 1]!, isAi: false }]),
    );
    const submittedAt = new Date(now - (72 - index) * hour);
    const gradedAt = new Date(now - (40 - index) * hour);
    await prisma.submission.create({
      data: {
        documentId: document.id,
        title,
        text,
        html,
        submittedAt,
        gradedAt,
        releasedAt: new Date(gradedAt.getTime() + hour),
        gradedByMembershipId: teacher.memberships[0]!.id,
        numericPercentage: percentage,
        letterGrade: letterFor(percentage),
        score: `${percentage}% (${letterFor(percentage)})`,
        overallScore: Math.round(classmate.scores.reduce((a, b) => a + b, 0) / classmate.scores.length),
        overallComment: `${classmate.name.split(' ')[0]}, ${percentage >= 80 ? 'a strong essay with a real argument.' : 'you have a position; now prove it with explained evidence.'}`,
        rubricScores,
      },
    });
    created += 1;
  }
  console.log(JSON.stringify({ phase: 'class-work', classAssignmentId: classAssignment.id, assignment: classAssignment.assignment.title, created, expectedTitle: ASSIGNMENT.title }));
}

await main();
