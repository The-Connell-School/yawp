import type { Prisma, PrismaClient } from '@app/prisma';
import type { DemoCleanupPlan } from './demo-cleanup-lib';

async function deleteDocumentsForMembership(
  tx: Prisma.TransactionClient,
  membershipId: string
) {
  const documents = await tx.document.findMany({
    where: { membershipId },
    select: { id: true },
  });
  const documentIds = documents.map((document) => document.id);
  if (!documentIds.length) return;

  const submissions = await tx.submission.findMany({
    where: { documentId: { in: documentIds } },
    select: { id: true },
  });
  const submissionIds = submissions.map((submission) => submission.id);
  if (submissionIds.length) {
    await tx.submissionActivity.deleteMany({
      where: { submissionId: { in: submissionIds } },
    });
    await tx.submissionGradingAssistantRun.deleteMany({
      where: { submissionId: { in: submissionIds } },
    });
    await tx.submissionComment.deleteMany({
      where: { submissionId: { in: submissionIds } },
    });
    await tx.submission.deleteMany({ where: { id: { in: submissionIds } } });
  }
  await tx.assignmentModuleSessionMessage.deleteMany({
    where: {
      assignmentModuleSession: { documentId: { in: documentIds } },
    },
  });
  await tx.assignmentModuleSession.deleteMany({
    where: { documentId: { in: documentIds } },
  });
  await tx.document.deleteMany({ where: { id: { in: documentIds } } });
}

async function deleteUserAndMemberships(
  tx: Prisma.TransactionClient,
  userId: string
) {
  const memberships = await tx.orgMembership.findMany({
    where: { userId },
    select: { id: true },
  });
  for (const membership of memberships) {
    await deleteDocumentsForMembership(tx, membership.id);
    await tx.orgMembership.delete({ where: { id: membership.id } });
  }
  await tx.session.deleteMany({ where: { userId } });
  await tx.password.deleteMany({ where: { userId } });
  await tx.user.delete({ where: { id: userId } });
}

export async function applyDemoCleanupPlan(
  prisma: PrismaClient,
  plan: DemoCleanupPlan
) {
  const usersToDelete = plan.users
    .filter((user) => user.decision.action === 'DELETE')
    .map((user) => user.id);
  const orgsToDelete = plan.organizations
    .filter((org) => org.decision.action === 'DELETE')
    .map((org) => org.id);

  await prisma.$transaction(
    async (tx) => {
      for (const userId of usersToDelete) {
        await deleteUserAndMemberships(tx, userId);
      }
      for (const organizationId of orgsToDelete) {
        const remainingMemberships = await tx.orgMembership.count({
          where: { organizationId },
        });
        if (remainingMemberships > 0) {
          throw new Error(
            `Refusing to delete organization ${organizationId}: memberships still present.`
          );
        }
        await tx.organization.delete({ where: { id: organizationId } });
      }
    },
    { timeout: 600_000, maxWait: 30_000 }
  );

  return {
    deletedUsers: usersToDelete.length,
    deletedOrganizations: orgsToDelete.length,
  };
}
