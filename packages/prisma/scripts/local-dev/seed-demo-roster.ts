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
  DEMO_ROSTER_CLASSES,
  type DemoClassKey,
  type DemoExistingAssignmentKey,
} from './demo-roster';
import { LOCAL_DEV_PASSWORD } from './dev-personas';
import { getClassArtByIndex } from '../../../../services/web-app/app/utils/class-art.ts';

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
  /**
   * Ids of the classes the persona seed already created. Every other class in
   * the teacher's load is created here.
   */
  existingClasses: Partial<Record<DemoClassKey, string>>;
  /** Schools the classes hang off, in the order the synthetic seed created them. */
  schools: Array<{ id: string; name: string }>;
  /** Every teacher membership that should see the roster classes. */
  teacherMembershipIds: string[];
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
const classId = (key: DemoClassKey) => `demo-class-${key}`;
const classAssignmentId = (assignmentKey: string, classKey: DemoClassKey) =>
  `demo-class-assignment-${assignmentKey}--${classKey}`;
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
  // and bcrypt on a hundred users is otherwise the slowest part of the seed.
  const passwordHash = bcrypt.hashSync(LOCAL_DEV_PASSWORD, 10);

  // The persona seed owns two of the teacher's five sections; create the rest.
  const newClasses = DEMO_ROSTER_CLASSES.filter((klass) => !klass.existing);
  for (const klass of newClasses) {
    const school = input.schools[klass.schoolIndex] ?? input.schools[0];
    await prisma.class.create({
      data: {
        id: classId(klass.key),
        code: klass.code,
        schoolYear: '2025-2026',
        title: klass.title,
        grade: klass.grade,
        period: klass.period,
        classArtKey: getClassArtByIndex(klass.classArtIndex).key,
        schoolId: school.id,
        teachers: {
          connect: input.teacherMembershipIds.map((id) => ({ id })),
        },
      },
    });
  }

  const classIdByKey = new Map<DemoClassKey, string>(
    DEMO_ROSTER_CLASSES.map((klass) => [
      klass.key,
      klass.existing
        ? (input.existingClasses[klass.key] ?? classId(klass.key))
        : classId(klass.key),
    ])
  );
  const schoolNameByClass = new Map<DemoClassKey, string>(
    DEMO_ROSTER_CLASSES.map((klass) => [
      klass.key,
      (input.schools[klass.schoolIndex] ?? input.schools[0])?.name ?? '',
    ])
  );
  const classByKey = new Map(
    DEMO_ROSTER_CLASSES.map((klass) => [klass.key, klass])
  );

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
      school: schoolNameByClass.get(student.classKey)!,
      grade: classByKey.get(student.classKey)!.grade,
      period: classByKey.get(student.classKey)!.period,
      schoolTeacher: input.teacher.name,
    })),
  });

  for (const klass of DEMO_ROSTER_CLASSES) {
    const students = plan.students.filter(
      (student) => student.classKey === klass.key
    );
    if (students.length === 0) continue;
    await prisma.class.update({
      where: { id: classIdByKey.get(klass.key)! },
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

  // One ClassAssignment per section the assignment was handed to: both English
  // 10 sections write the same essays off a single Assignment row, which is what
  // the app's "also assigned to another class" badge is for.
  await prisma.classAssignment.createMany({
    data: ownedAssignments.flatMap((assignment) =>
      assignment.classKeys.map((classKey) => ({
        id: classAssignmentId(assignment.key, classKey),
        assignmentId: assignmentId(assignment.key),
        classId: classIdByKey.get(classKey)!,
        createdAt: assignment.assignedAt,
        updatedAt: assignment.assignedAt,
      }))
    ),
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
  const classAssignmentIdFor = (
    assignmentKey: string,
    classKey: DemoClassKey
  ) => {
    const assignment = plannedAssignments.find(
      (candidate) => candidate.key === assignmentKey
    )!;
    return (
      existingRef(assignment)?.classAssignmentId ??
      classAssignmentId(assignmentKey, classKey)
    );
  };

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
      classAssignmentId: classAssignmentIdFor(
        entry.assignmentKey,
        entry.classKey
      ),
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
