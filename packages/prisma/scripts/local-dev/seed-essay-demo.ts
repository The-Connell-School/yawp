/* eslint-disable no-console */
import type { Prisma, PrismaClient } from '../../generated/prisma';
import { createPassword } from '../utils';
import { getClassArtByIndex } from '../../../../services/web-app/app/utils/class-art.ts';
import type { LocalDevPersona } from './dev-personas';
import {
  ESSAY_DEMO_CLASS_CODE,
  ESSAY_DEMO_CLASS_TITLE,
  ESSAY_DEMO_COHORT,
  ESSAY_DEMO_RUBRIC_KEYS,
  essayDemoEmail,
  type EssayDemoAssignment,
  type EssayDemoGrade,
} from './essay-demo-data';
import { ROMEO_AND_JULIET_ESSAY } from './essay-demo-romeo-juliet';
import { SCHOOL_START_ESSAY } from './essay-demo-school-start';

/**
 * Seeds the essay demo class described in essay-demo-data.ts.
 *
 * Shaped like the collaboration demo seed: everything is resolved from the
 * personas by email, so it runs the same on an organization seeded a minute ago
 * and on a preview seat that has been up for weeks. The class code is the
 * marker — a seat that already has the class is left alone.
 */

type SeedClient = PrismaClient | Prisma.TransactionClient;

export type EssayDemoSeedOptions = {
  organizationId: string;
  /** The school the class belongs to, by code — the seat's first one. */
  schoolCode: string;
  personas: LocalDevPersona[];
  /** Keeps cohort emails unique across preview seats. Empty for the first. */
  emailSuffix?: string;
};

export type EssayDemoSeedResult = {
  classId: string;
  created: boolean;
  classAssignmentIds: string[];
} | null;

export const ESSAY_DEMO_ASSIGNMENTS: EssayDemoAssignment[] = [
  ROMEO_AND_JULIET_ESSAY,
  SCHOOL_START_ESSAY,
];

const THESIS_ESSAY_TITLE = 'The Thesis-Driven Essay';

/** Default rubric weights, mirrored from services/web-app/app/domain/grading/rubric.ts. */
const RUBRIC_WEIGHTS: Record<(typeof ESSAY_DEMO_RUBRIC_KEYS)[number], number> = {
  thesis_and_content: 0.25,
  organization_and_structure: 0.25,
  evidence_and_support: 0.2,
  voice_and_style: 0.2,
  grammar_and_mechanics: 0.1,
};

/** The band ceilings gradeMath.scoreToPercent maps a one-to-five score onto. */
const SCORE_PERCENT: Record<number, number> = {
  5: 100,
  4: 89,
  3: 79,
  2: 69,
  1: 59,
};

/** Same arithmetic as computeWeightedPercentage, which this script cannot import. */
export function essayDemoPercentage(grade: Pick<EssayDemoGrade, 'scores'>) {
  let weighted = 0;
  for (const key of ESSAY_DEMO_RUBRIC_KEYS) {
    const percent = SCORE_PERCENT[grade.scores[key]];
    if (percent === undefined) {
      throw new Error(`Essay demo score out of range for ${key}`);
    }
    weighted += percent * RUBRIC_WEIGHTS[key];
  }
  return Math.round(weighted);
}

export function essayDemoLetter(percent: number) {
  if (percent >= 90) return 'A';
  if (percent >= 80) return 'B';
  if (percent >= 70) return 'C';
  if (percent >= 60) return 'D';
  return 'F';
}

function escapeHtml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function essayDemoBody(paragraphs: string[]) {
  return {
    text: paragraphs.join('\n\n'),
    html: paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join(''),
  };
}

function daysAgo(days: number, hours = 0) {
  return new Date(Date.now() - (days * 24 + hours) * 60 * 60 * 1000);
}

/**
 * All or nothing: the class is the marker that says a seat already has the
 * demo, so a run that died after creating it would leave a half-seeded class
 * that no later deploy repairs. Inside a caller's transaction it joins that.
 */
export async function seedEssayDemoData(
  prisma: SeedClient,
  options: EssayDemoSeedOptions
): Promise<EssayDemoSeedResult> {
  if ('$transaction' in prisma) {
    return prisma.$transaction(
      (transaction) => seedEssayDemoDataIn(transaction, options),
      { maxWait: 10_000, timeout: 120_000 }
    );
  }
  return seedEssayDemoDataIn(prisma, options);
}

async function seedEssayDemoDataIn(
  prisma: SeedClient,
  options: EssayDemoSeedOptions
): Promise<EssayDemoSeedResult> {
  const school = await prisma.school.findFirst({
    where: { organizationId: options.organizationId, code: options.schoolCode },
    select: { id: true, name: true },
  });
  if (!school) {
    console.warn(
      `⚠️  Skipping the essay demo: no school ${options.schoolCode} in ${options.organizationId}.`
    );
    return null;
  }

  const existingClass = await prisma.class.findFirst({
    where: { schoolId: school.id, code: ESSAY_DEMO_CLASS_CODE },
    select: { id: true },
  });
  if (existingClass) {
    return { classId: existingClass.id, created: false, classAssignmentIds: [] };
  }

  const assignmentType = await prisma.assignmentType.findFirst({
    where: { title: THESIS_ESSAY_TITLE, archivedAt: null },
    select: { id: true },
  });
  if (!assignmentType) {
    console.warn(
      `⚠️  Skipping the essay demo: no "${THESIS_ESSAY_TITLE}" assignment type.`
    );
    return null;
  }

  const teacherPersonas = options.personas.filter(
    (persona) => persona.role === 'TEACHER'
  );
  const teacherMembershipIds: string[] = [];
  for (const persona of teacherPersonas) {
    const membership = await prisma.orgMembership.findFirst({
      where: {
        organizationId: options.organizationId,
        user: { is: { email: persona.email } },
      },
      select: { id: true },
    });
    if (membership) teacherMembershipIds.push(membership.id);
  }
  const primaryTeacherPersona =
    teacherPersonas.find((persona) => persona.key === 'teacher') ??
    teacherPersonas[0];
  const primaryTeacherMembershipId = primaryTeacherPersona
    ? teacherMembershipIds[teacherPersonas.indexOf(primaryTeacherPersona)]
    : undefined;
  if (!primaryTeacherPersona || !primaryTeacherMembershipId) {
    console.warn(
      `⚠️  Skipping the essay demo: no teacher persona in ${options.organizationId}.`
    );
    return null;
  }

  const modules = await prisma.assignmentModule.findMany({
    where: { assignmentTypeId: assignmentType.id, deletedAt: null },
    orderBy: { position: 'asc' },
    select: {
      id: true,
      instructions: {
        orderBy: { position: 'asc' },
        select: { id: true, prompt: true },
        take: 1,
      },
    },
  });
  // Mirrors createDocumentForAssignmentType: one session per module, or the
  // document will not open.
  const moduleSessions = () =>
    modules.map((assignmentModule) => {
      const firstInstruction = assignmentModule.instructions[0];
      return {
        instructionsCompleted: 0,
        assignmentModuleId: assignmentModule.id,
        ...(firstInstruction
          ? {
              messages: {
                create: [
                  {
                    content: firstInstruction.prompt,
                    agent: 'assistant',
                    instructionId: firstInstruction.id,
                  },
                ],
              },
            }
          : {}),
      };
    });

  // Adopted when the address is already taken: a run that died part-way leaves
  // users behind, and User.email is unique across the whole database.
  const membershipByKey = new Map<string, string>();
  for (const student of ESSAY_DEMO_COHORT) {
    const email = essayDemoEmail(student.key, options.emailSuffix ?? '');
    const existing = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        memberships: {
          where: { organizationId: options.organizationId },
          select: { id: true },
          take: 1,
        },
      },
    });
    let membershipId = existing?.memberships[0]?.id;
    if (!membershipId) {
      const roster = {
        organization: { connect: { id: options.organizationId } },
        role: 'STUDENT' as const,
        school: school.name,
        grade: '10',
        period: '1',
        schoolTeacher: primaryTeacherPersona.name,
      };
      const membership = await prisma.orgMembership.create({
        data: existing
          ? { ...roster, user: { connect: { id: existing.id } } }
          : {
              ...roster,
              user: {
                create: {
                  email,
                  name: student.name,
                  password: {
                    create: createPassword(primaryTeacherPersona.password),
                  },
                },
              },
            },
        select: { id: true },
      });
      membershipId = membership.id;
    }
    membershipByKey.set(student.key, membershipId);
  }

  // Grade 10, period 1, in the first school: sorts ahead of the QA class
  // (English 10 - Period 3) on My Classes, so it is the first thing a teacher
  // sees.
  const essayClass = await prisma.class.create({
    data: {
      code: ESSAY_DEMO_CLASS_CODE,
      schoolYear: '2025-2026',
      period: '1',
      grade: '10',
      title: ESSAY_DEMO_CLASS_TITLE,
      classArtKey: getClassArtByIndex(0).key,
      schoolId: school.id,
      teachers: { connect: teacherMembershipIds.map((id) => ({ id })) },
      students: {
        connect: [...membershipByKey.values()].map((id) => ({ id })),
      },
    },
    select: { id: true },
  });

  const classAssignmentIds: string[] = [];
  for (const demo of ESSAY_DEMO_ASSIGNMENTS) {
    const assignedAt = daysAgo(demo.assignedDaysAgo);
    const assignment = await prisma.assignment.create({
      data: {
        assignmentTypeId: assignmentType.id,
        title: demo.title,
        prompt: demo.prompt,
        submitForGrade: true,
        pointValue: 100,
        // Left at now on purpose: the teacher's Assignments list sorts by
        // this, newest first, and the demo belongs at the top of it rather
        // than under every QA fixture seeded alongside.
      },
      select: { id: true },
    });
    const classAssignment = await prisma.classAssignment.create({
      data: {
        assignmentId: assignment.id,
        classId: essayClass.id,
        createdAt: assignedAt,
      },
      select: { id: true },
    });
    classAssignmentIds.push(classAssignment.id);

    for (const [index, entry] of demo.submissions.entries()) {
      const membershipId = membershipByKey.get(entry.studentKey);
      if (!membershipId) {
        throw new Error(`Essay demo has no student "${entry.studentKey}"`);
      }
      const { text, html } = essayDemoBody(entry.paragraphs);
      // Staggered by an hour each, so the queue reads as a class handing in
      // over an evening rather than one instant.
      const submittedAt = daysAgo(entry.submittedDaysAgo, index);

      const document = await prisma.document.create({
        data: {
          title: entry.title,
          text,
          html,
          revision: 3,
          membershipId,
          assignmentTypeId: assignmentType.id,
          assignmentId: assignment.id,
          classAssignmentId: classAssignment.id,
          createdAt: assignedAt,
          updatedAt: submittedAt,
          assignmentModuleSessions: { create: moduleSessions() },
        },
        select: { id: true },
      });

      const grade = entry.grade;
      const percent = grade ? essayDemoPercentage(grade) : null;
      const submission = await prisma.submission.create({
        data: {
          documentId: document.id,
          title: entry.title,
          text,
          html,
          submittedAt,
          ...(grade && percent !== null
            ? {
                gradedByMembershipId: primaryTeacherMembershipId,
                gradedAt: daysAgo(Math.max(entry.submittedDaysAgo - 1, 0)),
                releasedAt: daysAgo(Math.max(entry.submittedDaysAgo - 1, 0)),
                numericPercentage: percent,
                letterGrade: essayDemoLetter(percent),
                overallComment: grade.overallComment,
                rubricScores: Object.fromEntries(
                  ESSAY_DEMO_RUBRIC_KEYS.map((key) => [
                    key,
                    {
                      score: grade.scores[key],
                      comment: grade.comments[key],
                      isAi: false,
                    },
                  ])
                ),
              }
            : {}),
        },
        select: { id: true },
      });

      if (grade?.inlineComments.length) {
        await prisma.submissionComment.createMany({
          data: grade.inlineComments.map((comment) => ({
            submissionId: submission.id,
            membershipId: primaryTeacherMembershipId,
            content: comment.content,
            excerpt: comment.excerpt,
            occurrence: 1,
          })),
        });
      }
    }
  }

  return { classId: essayClass.id, created: true, classAssignmentIds };
}

// Mirrors featureFlagSettingName(ASSIGNMENT_SUMMARY_MODELS_FLAG).
const ASSIGNMENT_SUMMARY_MODELS_SETTING = 'feature_flag.assignment_summary_models';

/**
 * Previews and demo start "models to teach from" on, so the essay demo shows
 * the whole class summary. Create-only: a later change made from
 * yawp-internal is never overwritten by a reseed. Production never runs this.
 */
export async function ensureAssignmentSummaryModelsOnForPreview(
  prisma: Pick<PrismaClient, 'setting'>
) {
  await prisma.setting.upsert({
    where: { name: ASSIGNMENT_SUMMARY_MODELS_SETTING },
    create: {
      name: ASSIGNMENT_SUMMARY_MODELS_SETTING,
      value: JSON.stringify({ mode: 'everyone', orgIds: [] }),
      valueType: 'json',
      description: 'Started on for previews and demo (essay demo)',
    },
    update: {},
  });
}
