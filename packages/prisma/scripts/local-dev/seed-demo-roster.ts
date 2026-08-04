/* eslint-disable no-console */
/**
 * Writes the demo roster built by `demo-roster.ts` into the local dev database.
 *
 * Everything is inserted with deterministic ids (`demo-…`) so a re-seed is
 * idempotent-looking in logs and individual rows are easy to find by hand. The
 * writes are batched: one bcrypt hash for the whole roster, then createMany per
 * table, which keeps a forty-student, two-hundred-essay seed to a few seconds.
 */
import bcrypt from 'bcryptjs';
import type { PrismaClient, Prisma } from '../../generated/prisma';
import {
  buildDemoRoster,
  type DemoClassKey,
  type DemoExistingAssignmentKey,
} from './demo-roster';
import { LOCAL_DEV_PASSWORD } from './dev-personas';

/**
 * An assignment the persona seed already created. The roster supplies papers
 * for it instead of creating a second, near-identical assignment row.
 */
export type ExistingAssignmentRef = {
  assignmentId: string;
  classAssignmentId: string;
  assignmentTypeId: string;
};

export type DemoRosterSeedInput = {
  organizationId: string;
  /** Class rows the roster attaches to, already created by the synthetic seed. */
  classes: Record<DemoClassKey, { id: string; grade: string; period: string }>;
  schoolNames: Record<DemoClassKey, string>;
  assignmentTypeIds: {
    thesis: string;
    /** Falls back to the thesis type when the 5-paragraph type is absent. */
    fiveParagraph: string | null;
  };
  /**
   * Rows the persona seed made. A null entry means that assignment type was not
   * imported, so the roster simply skips it rather than inventing a stand-in.
   */
  existingAssignments: Record<
    DemoExistingAssignmentKey,
    ExistingAssignmentRef | null
  >;
  teacher: { membershipId: string; name: string };
  now?: Date;
};

export type DemoRosterSeedResult = {
  studentCount: number;
  assignmentCount: number;
  documentCount: number;
  submissionCount: number;
  releasedSubmissionCount: number;
  ungradedSubmissionCount: number;
  growthPlanCount: number;
};

const userId = (key: string) => `demo-user-${key}`;
const membershipId = (key: string) => `demo-membership-${key}`;
const assignmentId = (key: string) => `demo-assignment-${key}`;
const classAssignmentId = (key: string) => `demo-class-assignment-${key}`;
const documentId = (studentKey: string, assignmentKey: string) =>
  `demo-document-${studentKey}--${assignmentKey}`;
const submissionId = (studentKey: string, assignmentKey: string) =>
  `demo-submission-${studentKey}--${assignmentKey}`;

export async function seedDemoRoster(
  prisma: PrismaClient,
  input: DemoRosterSeedInput
): Promise<DemoRosterSeedResult> {
  const now = input.now ?? new Date();
  const plan = buildDemoRoster({ now });

  // One hash for the whole roster: every demo student shares the dev password,
  // and bcrypt on forty users is otherwise the slowest part of the seed.
  const passwordHash = bcrypt.hashSync(LOCAL_DEV_PASSWORD, 10);

  await prisma.user.createMany({
    data: plan.students.map((student) => ({
      id: userId(student.key),
      email: student.email,
      name: student.name,
    })),
  });

  await prisma.password.createMany({
    data: plan.students.map((student) => ({
      userId: userId(student.key),
      hash: passwordHash,
    })),
  });

  await prisma.orgMembership.createMany({
    data: plan.students.map((student) => ({
      id: membershipId(student.key),
      userId: userId(student.key),
      organizationId: input.organizationId,
      role: 'STUDENT' as const,
      school: input.schoolNames[student.classKey],
      grade: input.classes[student.classKey].grade,
      period: input.classes[student.classKey].period,
      schoolTeacher: input.teacher.name,
    })),
  });

  for (const classKey of ['primary', 'secondary'] as const) {
    const students = plan.students.filter(
      (student) => student.classKey === classKey
    );
    if (students.length === 0) continue;
    await prisma.class.update({
      where: { id: input.classes[classKey].id },
      data: {
        students: {
          connect: students.map((student) => ({
            id: membershipId(student.key),
          })),
        },
      },
    });
  }

  const existingRef = (assignment: (typeof plan.assignments)[number]) =>
    assignment.existingKey
      ? input.existingAssignments[assignment.existingKey]
      : null;

  // An assignment whose row the persona seed owns but did not create (a missing
  // assignment type) has nowhere to hang papers, so drop it entirely.
  const plannedAssignments = plan.assignments.filter(
    (assignment) => !assignment.existingKey || existingRef(assignment)
  );
  const ownedAssignments = plannedAssignments.filter(
    (assignment) => !assignment.existingKey
  );

  const assignmentTypeFor = (spec: (typeof plan.assignments)[number]) => {
    const existing = existingRef(spec);
    if (existing) return existing.assignmentTypeId;
    return spec.assignmentTypeKey === 'five-paragraph'
      ? (input.assignmentTypeIds.fiveParagraph ??
          input.assignmentTypeIds.thesis)
      : input.assignmentTypeIds.thesis;
  };

  await prisma.assignment.createMany({
    data: ownedAssignments.map((assignment) => ({
      id: assignmentId(assignment.key),
      assignmentTypeId: assignmentTypeFor(assignment),
      title: assignment.title,
      prompt: assignment.prompt,
      submitForGrade: true,
      pointValue: assignment.pointValue,
      createdAt: assignment.assignedAt,
      updatedAt: assignment.assignedAt,
    })),
  });

  await prisma.classAssignment.createMany({
    data: ownedAssignments.map((assignment) => ({
      id: classAssignmentId(assignment.key),
      assignmentId: assignmentId(assignment.key),
      classId: input.classes[assignment.classKey].id,
      createdAt: assignment.assignedAt,
      updatedAt: assignment.assignedAt,
    })),
  });

  const assignmentTypeByKey = new Map(
    plannedAssignments.map((assignment) => [
      assignment.key,
      assignmentTypeFor(assignment),
    ])
  );
  const assignmentIdByKey = new Map(
    plannedAssignments.map((assignment) => [
      assignment.key,
      existingRef(assignment)?.assignmentId ?? assignmentId(assignment.key),
    ])
  );
  const classAssignmentIdByKey = new Map(
    plannedAssignments.map((assignment) => [
      assignment.key,
      existingRef(assignment)?.classAssignmentId ??
        classAssignmentId(assignment.key),
    ])
  );

  const work = plan.work.filter((entry) =>
    assignmentIdByKey.has(entry.assignmentKey)
  );

  await prisma.document.createMany({
    data: work.map((entry) => ({
      id: documentId(entry.studentKey, entry.assignmentKey),
      title: entry.documentTitle,
      text: entry.text,
      html: entry.html,
      // Real drafts accumulate revisions; a flat 0 makes every document look
      // untouched in the teacher's document list.
      revision: entry.state === 'in-progress' ? 2 : 6,
      membershipId: membershipId(entry.studentKey),
      assignmentTypeId: assignmentTypeByKey.get(entry.assignmentKey)!,
      assignmentId: assignmentIdByKey.get(entry.assignmentKey)!,
      classAssignmentId: classAssignmentIdByKey.get(entry.assignmentKey)!,
      createdAt: entry.createdAt,
      updatedAt: entry.submittedAt ?? entry.createdAt,
    })),
  });

  const submittedWork = work.filter((entry) => entry.state !== 'in-progress');

  await prisma.submission.createMany({
    data: submittedWork.map((entry) => ({
      id: submissionId(entry.studentKey, entry.assignmentKey),
      documentId: documentId(entry.studentKey, entry.assignmentKey),
      title: entry.documentTitle,
      text: entry.text,
      html: entry.html,
      submittedAt: entry.submittedAt!,
      createdAt: entry.submittedAt!,
      updatedAt: entry.gradedAt ?? entry.submittedAt!,
      gradedAt: entry.gradedAt,
      gradedByMembershipId: entry.gradedAt ? input.teacher.membershipId : null,
      releasedAt: entry.releasedAt,
      rubricScores: (entry.rubricScores ??
        undefined) as unknown as Prisma.InputJsonValue,
      overallScore: entry.overallScore,
      overallComment: entry.overallComment,
      numericPercentage: entry.numericPercentage,
      letterGrade: entry.letterGrade,
    })),
  });

  const inlineComments = submittedWork.flatMap((entry) =>
    entry.inlineComments.map((comment) => ({
      submissionId: submissionId(entry.studentKey, entry.assignmentKey),
      membershipId: input.teacher.membershipId,
      content: comment.content,
      excerpt: comment.excerpt,
      occurrence: comment.occurrence,
      createdAt: entry.gradedAt ?? entry.submittedAt!,
    }))
  );
  if (inlineComments.length > 0) {
    await prisma.submissionComment.createMany({ data: inlineComments });
  }

  if (plan.growthPlans.length > 0) {
    await prisma.reporterGrowthPlan.createMany({
      data: plan.growthPlans.map((growthPlan) => ({
        id: `demo-growth-plan-${growthPlan.studentKey}`,
        status: 'active',
        focus: growthPlan.focus,
        targetSkills:
          growthPlan.targetSkills as unknown as Prisma.InputJsonValue,
        body: growthPlan.body,
        baseline: growthPlan.baseline as unknown as Prisma.InputJsonValue,
        checkInAt: growthPlan.checkInAt,
        createdAt: growthPlan.createdAt,
        membershipId: input.teacher.membershipId,
        organizationId: input.organizationId,
        studentMembershipId: membershipId(growthPlan.studentKey),
      })),
    });
  }

  return {
    studentCount: plan.students.length,
    assignmentCount: plannedAssignments.length,
    documentCount: work.length,
    submissionCount: submittedWork.length,
    releasedSubmissionCount: work.filter((entry) => entry.state === 'released')
      .length,
    ungradedSubmissionCount: work.filter((entry) => entry.state === 'submitted')
      .length,
    growthPlanCount: plan.growthPlans.length,
  };
}
