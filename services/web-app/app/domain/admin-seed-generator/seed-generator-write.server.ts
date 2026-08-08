/**
 * Writes an APPROVED subset of an admin seed-data proposal to the database.
 *
 * Invariants this file exists to enforce:
 *  - ADD-ONLY: every operation below is a `create` (or an m2m `connect` on a
 *    brand-new row). Nothing here ever calls `update` or `delete` on a
 *    pre-existing row's own fields.
 *  - Rejected items are never created: filtering happens before the
 *    transaction opens, so nothing rejected ever reaches Prisma.
 *  - All-or-nothing: everything happens inside one $transaction, so a
 *    mid-write failure (e.g. an unresolved localId) leaves no partial class
 *    behind. Timeouts mirror packages/prisma/scripts/preview-seats.ts'
 *    createRuntimePreviewSeat, which also seeds a full org (with essays)
 *    inside a single request.
 */
import type { Prisma, PrismaClient } from '@app/prisma';
import { getClassArtByIndex } from '~/utils/class-art';
import { getPasswordHash } from '~/utils/auth.server';
import {
  RUBRIC_CATEGORY_KEYS,
  seedCommitProposalSchema,
  type SeedCommitProposal,
} from './seed-generator-schema';

export type SeedWriteClient = PrismaClient | Prisma.TransactionClient;

export type SeedGeneratorWriteContext = {
  organizationId: string;
  organizationName: string;
  /** ids of classes that legitimately exist in this org already (from the loader, not client-trusted alone). */
  existingClassIds: Set<string>;
  /** ids of assignments already committed in this org and safe to reference. */
  existingAssignmentIds?: Set<string>;
  /** ids of existing student memberships already committed in this org. */
  existingStudentMembershipIds?: Set<string>;
  /** assignment type title -> id, restricted to types enabled for this org. */
  assignmentTypeIdByTitle: Map<string, string>;
};

export type SeedGeneratorWriteSummary = {
  classesCreated: number;
  assignmentsCreated: number;
  studentsCreated: number;
  submissionsCreated: number;
  documentsCreated: number;
  skippedStudents: Array<{ localId: string; name: string; reason: string }>;
  committedNodes: Array<{
    localId: string;
    kind: 'class' | 'assignment' | 'student' | 'document' | 'submission';
    entityId: string;
  }>;
};

const DEMO_STUDENT_PASSWORD = 'yawp-demo-seed';

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}

function randomSuffix() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function toHtmlParagraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim())}</p>`)
    .join('');
}

function pickRubricScores(
  rubricScores: Partial<Record<(typeof RUBRIC_CATEGORY_KEYS)[number], number>>
) {
  const picked: Record<string, number> = {};
  for (const key of RUBRIC_CATEGORY_KEYS) {
    const value = rubricScores[key];
    if (typeof value === 'number') picked[key] = value;
  }
  return picked;
}

/**
 * Filters a raw commit payload down to only approved, structurally-sound
 * items, resolving each localId reference along the way. Pure function --
 * no I/O -- so approval filtering is independently unit-testable.
 */
export function resolveApprovedSeedItems(
  proposal: SeedCommitProposal,
  ctx: Pick<
    SeedGeneratorWriteContext,
    | 'existingClassIds'
    | 'existingAssignmentIds'
    | 'existingStudentMembershipIds'
    | 'assignmentTypeIdByTitle'
  >
) {
  const approvedClasses = proposal.classes.filter((c) => c.approved);
  const approvedClassLocalIds = new Set(approvedClasses.map((c) => c.localId));

  function resolveClassRef(
    classLocalId: string
  ): { kind: 'new' | 'existing'; id: string } | null {
    if (approvedClassLocalIds.has(classLocalId))
      return { kind: 'new', id: classLocalId };
    if (ctx.existingClassIds.has(classLocalId))
      return { kind: 'existing', id: classLocalId };
    return null;
  }

  const approvedAssignments = proposal.assignments.filter((a) => {
    if (!a.approved) return false;
    if (!resolveClassRef(a.classLocalId)) return false;
    return ctx.assignmentTypeIdByTitle.has(a.assignmentTypeTitle);
  });
  const approvedAssignmentLocalIds = new Set(
    approvedAssignments.map((a) => a.localId)
  );
  const existingAssignmentIds = ctx.existingAssignmentIds ?? new Set<string>();
  const existingStudentMembershipIds =
    ctx.existingStudentMembershipIds ?? new Set<string>();

  const skippedStudents: Array<{
    localId: string;
    name: string;
    reason: string;
  }> = [];
  const approvedStudents = proposal.students
    .filter((s) => s.approved)
    .map((student) => {
      if (
        student.existingMembershipId &&
        !existingStudentMembershipIds.has(student.existingMembershipId)
      ) {
        skippedStudents.push({
          localId: student.localId,
          name: student.name,
          reason: 'references a student outside this organization.',
        });
        return null;
      }
      const classRef = resolveClassRef(student.classLocalId);
      if (!classRef) {
        skippedStudents.push({
          localId: student.localId,
          name: student.name,
          reason: `references an unresolved or unapproved class ("${student.classLocalId}").`,
        });
        return null;
      }
      const validSubmissions = student.submissions.filter(
        (submission) =>
          submission.approved &&
          (approvedAssignmentLocalIds.has(submission.assignmentLocalId) ||
            existingAssignmentIds.has(submission.assignmentLocalId))
      );
      if (validSubmissions.length === 0) {
        skippedStudents.push({
          localId: student.localId,
          name: student.name,
          reason: 'has no approved submissions against an approved assignment.',
        });
        return null;
      }
      return { student, classRef, submissions: validSubmissions };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  return {
    approvedClasses,
    approvedAssignments,
    approvedStudents,
    skippedStudents,
    resolveClassRef,
  };
}

export async function writeApprovedSeedData(
  transaction: Prisma.TransactionClient,
  rawProposal: unknown,
  ctx: SeedGeneratorWriteContext
): Promise<SeedGeneratorWriteSummary> {
  const proposal = seedCommitProposalSchema.parse(rawProposal);
  const {
    approvedClasses,
    approvedAssignments,
    approvedStudents,
    skippedStudents,
  } = resolveApprovedSeedItems(proposal, ctx);

  if (
    approvedClasses.length === 0 &&
    approvedAssignments.length === 0 &&
    approvedStudents.length === 0
  ) {
    return {
      classesCreated: 0,
      assignmentsCreated: 0,
      studentsCreated: 0,
      submissionsCreated: 0,
      documentsCreated: 0,
      skippedStudents,
      committedNodes: [],
    };
  }

  {
    const teacherMemberships = await transaction.orgMembership.findMany({
      where: {
        organizationId: ctx.organizationId,
        role: 'TEACHER',
        isActive: true,
      },
      select: { id: true },
    });
    if (approvedClasses.length > 0 && teacherMemberships.length === 0) {
      throw new Error(
        'This organization has no active teachers, so a new class cannot be created (every class needs at least one teacher).'
      );
    }
    const teacherIds = teacherMemberships.map((m) => m.id);
    const gradingTeacherId = teacherIds[0] ?? null;

    let school = await transaction.school.findFirst({
      where: { organizationId: ctx.organizationId },
      select: { id: true, name: true },
    });
    if (!school && approvedClasses.length > 0) {
      school = await transaction.school.create({
        data: {
          name: `${ctx.organizationName} (generated)`,
          code: `GEN-${randomSuffix()}`,
          organizationId: ctx.organizationId,
        },
        select: { id: true, name: true },
      });
    }

    const classIdByLocalId = new Map<string, string>();
    const committedNodes: SeedGeneratorWriteSummary['committedNodes'] = [];
    const classById = new Map<
      string,
      { grade: string; period: string; schoolName: string }
    >();
    for (const [index, klass] of approvedClasses.entries()) {
      if (!school) {
        throw new Error('No school available to attach the new class to.');
      }
      const created = await transaction.class.create({
        data: {
          code: `GEN-${randomSuffix()}`,
          schoolYear: klass.schoolYear,
          period: klass.period,
          grade: klass.grade,
          title: klass.title,
          classArtKey: getClassArtByIndex(index + Date.now()).key,
          schoolId: school.id,
          teachers: { connect: teacherIds.map((id) => ({ id })) },
        },
        select: { id: true },
      });
      classIdByLocalId.set(klass.localId, created.id);
      committedNodes.push({
        localId: klass.localId,
        kind: 'class',
        entityId: created.id,
      });
      classById.set(created.id, {
        grade: klass.grade,
        period: klass.period,
        schoolName: school.name,
      });
    }

    const assignmentInfoByLocalId = new Map<
      string,
      {
        assignmentId: string;
        classAssignmentId: string;
        assignmentTypeId: string;
      }
    >();
    const assignmentKey = (assignmentId: string, classId: string) =>
      `${assignmentId}:${classId}`;
    for (const assignment of approvedAssignments) {
      const assignmentTypeId = ctx.assignmentTypeIdByTitle.get(
        assignment.assignmentTypeTitle
      );
      if (!assignmentTypeId) continue; // filtered out already, defensive only
      const classId =
        classIdByLocalId.get(assignment.classLocalId) ??
        assignment.classLocalId;

      const createdAssignment = await transaction.assignment.create({
        data: {
          assignmentTypeId,
          title: assignment.title,
          prompt: assignment.prompt,
          submitForGrade: true,
          pointValue: 100,
        },
        select: { id: true },
      });
      const classAssignment = await transaction.classAssignment.create({
        data: { assignmentId: createdAssignment.id, classId },
        select: { id: true },
      });
      assignmentInfoByLocalId.set(assignmentKey(assignment.localId, classId), {
        assignmentId: createdAssignment.id,
        classAssignmentId: classAssignment.id,
        assignmentTypeId,
      });
      committedNodes.push({
        localId: assignment.localId,
        kind: 'assignment',
        entityId: createdAssignment.id,
      });
    }

    const referencedExistingAssignmentIds = [
      ...new Set(
        approvedStudents.flatMap(({ submissions }) =>
          submissions
            .map((submission) => submission.assignmentLocalId)
            .filter((id) => ctx.existingAssignmentIds?.has(id))
        )
      ),
    ];
    if (referencedExistingAssignmentIds.length > 0) {
      const existingAssignments = await transaction.assignment.findMany({
        where: {
          id: { in: referencedExistingAssignmentIds },
          classAssignments: {
            some: { class: { school: { organizationId: ctx.organizationId } } },
          },
        },
        select: {
          id: true,
          assignmentTypeId: true,
          classAssignments: {
            where: {
              class: { school: { organizationId: ctx.organizationId } },
            },
            select: { id: true, classId: true },
          },
        },
      });
      for (const assignment of existingAssignments) {
        for (const classAssignment of assignment.classAssignments) {
          assignmentInfoByLocalId.set(
            assignmentKey(assignment.id, classAssignment.classId),
            {
              assignmentId: assignment.id,
              classAssignmentId: classAssignment.id,
              assignmentTypeId: assignment.assignmentTypeId,
            }
          );
        }
      }
    }

    let submissionsCreated = 0;
    let documentsCreated = 0;
    let studentsCreated = 0;
    const passwordHash = await getPasswordHash(DEMO_STUDENT_PASSWORD);

    for (const { student, classRef, submissions } of approvedStudents) {
      const classId =
        classRef.kind === 'new'
          ? classIdByLocalId.get(classRef.id)!
          : classRef.id;
      const classInfo = classById.get(classId);

      let membershipId = student.existingMembershipId;
      if (!membershipId) {
        const email = `${slugify(student.name) || 'demo-student'}.${randomSuffix()}@yawp-demo.local`;
        const user = await transaction.user.create({
          data: {
            email,
            name: student.name,
            password: { create: { hash: passwordHash } },
            memberships: {
              create: {
                organizationId: ctx.organizationId,
                role: 'STUDENT',
                grade: classInfo?.grade,
                period: classInfo?.period,
                school: classInfo?.schoolName,
                classesAsStudent: { connect: [{ id: classId }] },
              },
            },
          },
          include: { memberships: true },
        });
        membershipId = user.memberships[0]!.id;
        studentsCreated += 1;
        committedNodes.push({
          localId: student.localId,
          kind: 'student',
          entityId: membershipId,
        });
      }

      for (const submission of submissions) {
        const assignmentInfo = assignmentInfoByLocalId.get(
          assignmentKey(submission.assignmentLocalId, classId)
        );
        if (!assignmentInfo) {
          throw new Error(
            `The approved assignment for ${student.name} is no longer attached to the student's class.`
          );
        }

        const html = toHtmlParagraphs(submission.essayText);
        const document = await transaction.document.create({
          data: {
            title: `${student.name} — generated draft`,
            text: submission.essayText,
            html,
            membershipId,
            assignmentTypeId: assignmentInfo.assignmentTypeId,
            assignmentId: assignmentInfo.assignmentId,
            classAssignmentId: assignmentInfo.classAssignmentId,
          },
          select: { id: true },
        });
        documentsCreated += 1;
        committedNodes.push({
          localId:
            submission.documentLocalId ?? `${submission.localId}-document`,
          kind: 'document',
          entityId: document.id,
        });

        if (submission.status === 'draft') continue;

        const grade = submission.grade;
        const createdSubmission = await transaction.submission.create({
          data: {
            documentId: document.id,
            html,
            text: submission.essayText,
            title: `${student.name} — generated submission`,
            submittedAt: new Date(),
            ...(submission.status === 'graded' && grade
              ? {
                  gradedByMembershipId: gradingTeacherId,
                  gradedAt: new Date(),
                  numericPercentage: grade.numericPercentage,
                  letterGrade: grade.letterGrade,
                  overallScore: grade.overallScore,
                  overallComment: grade.overallComment,
                  rubricScores: pickRubricScores(grade.rubricScores),
                  releasedAt: grade.released ? new Date() : null,
                }
              : {}),
          },
          select: { id: true },
        });
        submissionsCreated += 1;
        committedNodes.push({
          localId: submission.localId,
          kind: 'submission',
          entityId: createdSubmission.id,
        });
      }
    }

    return {
      classesCreated: approvedClasses.length,
      assignmentsCreated: approvedAssignments.length,
      studentsCreated,
      submissionsCreated,
      documentsCreated,
      skippedStudents,
      committedNodes,
    };
  }
}

export async function commitApprovedSeedData(
  db: PrismaClient,
  rawProposal: unknown,
  ctx: SeedGeneratorWriteContext
): Promise<SeedGeneratorWriteSummary> {
  return db.$transaction(
    (transaction) => writeApprovedSeedData(transaction, rawProposal, ctx),
    // Mirrors createRuntimePreviewSeat (packages/prisma/scripts/preview-seats.ts):
    // this can write a full class of essays inside one request, well past
    // Prisma's 5s default transaction window.
    { maxWait: 10_000, timeout: 120_000 }
  );
}
