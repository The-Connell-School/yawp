import type { Prisma } from '@app/prisma';
import { lockSubmissionCommentAccess } from './submission-comment-access.server';
import { prisma } from '~/utils/db.server';

const ids = {
  organization: 'comment-access-db-proof-org',
  otherOrganization: 'comment-access-db-proof-other-org',
  ownerUser: 'comment-access-db-proof-owner-user',
  teacherUser: 'comment-access-db-proof-teacher-user',
  unrelatedUser: 'comment-access-db-proof-unrelated-user',
  crossTenantUser: 'comment-access-db-proof-cross-user',
  ownerMembership: 'comment-access-db-proof-owner-membership',
  teacherMembership: 'comment-access-db-proof-teacher-membership',
  unrelatedMembership: 'comment-access-db-proof-unrelated-membership',
  crossTenantMembership: 'comment-access-db-proof-cross-membership',
  school: 'comment-access-db-proof-school',
  class: 'comment-access-db-proof-class',
  assignmentType: 'comment-access-db-proof-assignment-type',
  assignment: 'comment-access-db-proof-assignment',
  classAssignment: 'comment-access-db-proof-class-assignment',
  document: 'comment-access-db-proof-document',
  submission: 'comment-access-db-proof-submission',
} as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function connectTeacher() {
  await prisma.class.update({
    where: { id: ids.class },
    data: { teachers: { connect: { id: ids.teacherMembership } } },
  });
}

async function revokeFirst(
  label: string,
  operation: (tx: Prisma.TransactionClient) => Promise<void>
) {
  await connectTeacher();

  let markRevocationReady!: () => void;
  const revocationReady = new Promise<void>((resolve) => {
    markRevocationReady = resolve;
  });
  let releaseRevocation!: () => void;
  const holdRevocation = new Promise<void>((resolve) => {
    releaseRevocation = resolve;
  });

  const revocation = prisma.$transaction(async (tx) => {
    await tx.class.update({
      where: { id: ids.class },
      data: { teachers: { disconnect: { id: ids.teacherMembership } } },
    });
    markRevocationReady();
    await holdRevocation;
  });
  await revocationReady;

  let markAttemptStarted!: () => void;
  const attemptStarted = new Promise<void>((resolve) => {
    markAttemptStarted = resolve;
  });
  const attempt = prisma.$transaction(async (tx) => {
    markAttemptStarted();
    const allowed = await lockSubmissionCommentAccess(tx, {
      submissionId: ids.submission,
      actorMembershipId: ids.teacherMembership,
      actorUserId: ids.teacherUser,
    });
    if (allowed) await operation(tx);
    return allowed;
  });
  await attemptStarted;

  // Give PostgreSQL time to reach the relationship-row lock. The revocation
  // transaction remains open, so the access transaction cannot skip ahead.
  await new Promise((resolve) => setTimeout(resolve, 100));
  releaseRevocation();
  await revocation;
  const allowed = await attempt;
  assert(!allowed, `${label}: revoked access unexpectedly remained allowed`);
}

async function main() {
  await prisma.organization.createMany({
    data: [
      { id: ids.organization, name: 'Comment access DB proof' },
      { id: ids.otherOrganization, name: 'Comment access DB proof other' },
    ],
  });
  await prisma.user.createMany({
    data: [
      {
        id: ids.ownerUser,
        email: 'comment-access-owner@example.test',
        name: 'Proof Student',
      },
      {
        id: ids.teacherUser,
        email: 'comment-access-teacher@example.test',
        name: 'Proof Teacher',
      },
      {
        id: ids.unrelatedUser,
        email: 'comment-access-unrelated@example.test',
        name: 'Unrelated Teacher',
      },
      {
        id: ids.crossTenantUser,
        email: 'comment-access-cross@example.test',
        name: 'Cross Tenant Teacher',
      },
    ],
  });
  await prisma.orgMembership.createMany({
    data: [
      {
        id: ids.ownerMembership,
        userId: ids.ownerUser,
        organizationId: ids.organization,
        role: 'STUDENT',
      },
      {
        id: ids.teacherMembership,
        userId: ids.teacherUser,
        organizationId: ids.organization,
        role: 'TEACHER',
      },
      {
        id: ids.unrelatedMembership,
        userId: ids.unrelatedUser,
        organizationId: ids.organization,
        role: 'TEACHER',
      },
      {
        id: ids.crossTenantMembership,
        userId: ids.crossTenantUser,
        organizationId: ids.otherOrganization,
        role: 'TEACHER',
      },
    ],
  });
  await prisma.school.create({
    data: {
      id: ids.school,
      name: 'Comment Access Proof School',
      code: 'comment-access-db-proof-school',
      organizationId: ids.organization,
    },
  });
  await prisma.class.create({
    data: {
      id: ids.class,
      code: 'comment-access-db-proof-class',
      schoolId: ids.school,
      students: { connect: { id: ids.ownerMembership } },
      teachers: { connect: { id: ids.teacherMembership } },
    },
  });
  await prisma.assignmentType.create({
    data: {
      id: ids.assignmentType,
      title: 'Comment Access DB Proof',
      position: 999997,
    },
  });
  await prisma.assignment.create({
    data: {
      id: ids.assignment,
      assignmentTypeId: ids.assignmentType,
      title: 'Comment Access DB Proof',
      prompt: 'Prove assignment-specific comment authorization.',
    },
  });
  await prisma.classAssignment.create({
    data: {
      id: ids.classAssignment,
      assignmentId: ids.assignment,
      classId: ids.class,
    },
  });
  await prisma.document.create({
    data: {
      id: ids.document,
      title: 'Comment Access DB Proof',
      text: 'Proof body',
      html: '<p>Proof body</p>',
      membershipId: ids.ownerMembership,
      assignmentTypeId: ids.assignmentType,
      assignmentId: ids.assignment,
      classAssignmentId: ids.classAssignment,
    },
  });
  await prisma.submission.create({
    data: {
      id: ids.submission,
      title: 'Comment Access DB Proof',
      text: 'Proof body',
      html: '<p>Proof body</p>',
      submittedAt: new Date(),
      documentId: ids.document,
    },
  });

  const assignedTeacherAllowed = await prisma.$transaction((tx) =>
    lockSubmissionCommentAccess(tx, {
      submissionId: ids.submission,
      actorMembershipId: ids.teacherMembership,
      actorUserId: ids.teacherUser,
    })
  );
  const unrelatedTeacherAllowed = await prisma.$transaction((tx) =>
    lockSubmissionCommentAccess(tx, {
      submissionId: ids.submission,
      actorMembershipId: ids.unrelatedMembership,
      actorUserId: ids.unrelatedUser,
    })
  );
  const crossTenantTeacherAllowed = await prisma.$transaction((tx) =>
    lockSubmissionCommentAccess(tx, {
      submissionId: ids.submission,
      actorMembershipId: ids.crossTenantMembership,
      actorUserId: ids.crossTenantUser,
    })
  );
  assert(assignedTeacherAllowed, 'assigned teacher was denied');
  assert(!unrelatedTeacherAllowed, 'unrelated teacher was allowed');
  assert(!crossTenantTeacherAllowed, 'cross-tenant teacher was allowed');

  await revokeFirst('create', async (tx) => {
    await tx.submissionComment.create({
      data: {
        id: 'comment-access-db-proof-create',
        submissionId: ids.submission,
        membershipId: ids.teacherMembership,
        content: 'must not persist',
        excerpt: 'proof',
      },
    });
    await tx.submissionActivity.create({
      data: {
        id: 'comment-access-db-proof-create-activity',
        submissionId: ids.submission,
        organizationId: ids.organization,
        actorMembershipId: ids.teacherMembership,
        actorType: 'human',
        eventType: 'submission.comment_created',
        source: 'db-proof',
        occurredAfterRelease: false,
        changes: {},
      },
    });
  });
  assert(
    (await prisma.submissionComment.count({
      where: { id: 'comment-access-db-proof-create' },
    })) === 0,
    'revoked create persisted a comment'
  );
  assert(
    (await prisma.submissionActivity.count({
      where: { id: 'comment-access-db-proof-create-activity' },
    })) === 0,
    'revoked create persisted activity'
  );

  await prisma.submissionComment.create({
    data: {
      id: 'comment-access-db-proof-update',
      submissionId: ids.submission,
      membershipId: ids.teacherMembership,
      content: 'original update content',
      excerpt: 'proof',
    },
  });
  await revokeFirst('update', async (tx) => {
    await tx.submissionComment.update({
      where: { id: 'comment-access-db-proof-update' },
      data: { content: 'must not persist' },
    });
    await tx.submissionActivity.create({
      data: {
        id: 'comment-access-db-proof-update-activity',
        submissionId: ids.submission,
        organizationId: ids.organization,
        actorMembershipId: ids.teacherMembership,
        actorType: 'human',
        eventType: 'submission.comment_updated',
        source: 'db-proof',
        occurredAfterRelease: false,
        changes: {},
      },
    });
  });
  assert(
    (
      await prisma.submissionComment.findUniqueOrThrow({
        where: { id: 'comment-access-db-proof-update' },
        select: { content: true },
      })
    ).content === 'original update content',
    'revoked update changed the comment'
  );
  assert(
    (await prisma.submissionActivity.count({
      where: { id: 'comment-access-db-proof-update-activity' },
    })) === 0,
    'revoked update persisted activity'
  );

  await prisma.submissionComment.create({
    data: {
      id: 'comment-access-db-proof-delete',
      submissionId: ids.submission,
      membershipId: ids.teacherMembership,
      content: 'must survive revoked delete',
      excerpt: 'proof',
    },
  });
  await revokeFirst('delete', async (tx) => {
    await tx.submissionComment.delete({
      where: { id: 'comment-access-db-proof-delete' },
    });
    await tx.submissionActivity.create({
      data: {
        id: 'comment-access-db-proof-delete-activity',
        submissionId: ids.submission,
        organizationId: ids.organization,
        actorMembershipId: ids.teacherMembership,
        actorType: 'human',
        eventType: 'submission.comment_deleted',
        source: 'db-proof',
        occurredAfterRelease: false,
        changes: {},
      },
    });
  });
  assert(
    (await prisma.submissionComment.count({
      where: { id: 'comment-access-db-proof-delete' },
    })) === 1,
    'revoked delete removed the comment'
  );
  assert(
    (await prisma.submissionActivity.count({
      where: { id: 'comment-access-db-proof-delete-activity' },
    })) === 0,
    'revoked delete persisted activity'
  );

  console.log(
    'Assignment-specific comment access and create/update/delete revocation races passed.'
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
