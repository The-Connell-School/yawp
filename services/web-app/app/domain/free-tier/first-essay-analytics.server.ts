import type { Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import {
  acquisitionChannel,
  captureFreeTierAnalyticsEvent,
  freeTierOrganizationDistinctId,
  FREE_TIER_ANALYTICS_EVENTS,
  runFreeTierAnalytics,
} from './posthog-analytics.server';

/** Both solo and collaborative submission paths take this before document locks. */
export async function lockFreeTierFirstEssay(
  tx: Prisma.TransactionClient,
  organizationId: string
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('free_tier_first_essay:' || ${organizationId}))`;
}

export async function isFirstFreeTierEssayInTx(
  tx: Prisma.TransactionClient,
  organizationId: string
) {
  // Roll back only this optional read if SQL fails; preserve the submission writes.
  await tx.$executeRaw`SAVEPOINT free_tier_analytics`;
  let first = false;
  try {
    first =
      (await tx.submission.count({
        where: {
          document: {
            OR: [
              { membership: { organizationId } },
              { classAssignment: { class: { school: { organizationId } } } },
            ],
          },
        },
      })) === 1;
  } catch {
    await tx.$executeRaw`ROLLBACK TO SAVEPOINT free_tier_analytics`;
  }
  await tx.$executeRaw`RELEASE SAVEPOINT free_tier_analytics`;
  return first;
}

/** Called only after a successful commit and never on a replay. */
export async function captureFirstFreeTierEssay(input: {
  organizationId: string;
  submissionId: string;
  documentId: string;
  classId?: string | null;
}) {
  await runFreeTierAnalytics(async () => {
    const application = await prisma.freeTierApplication.findFirst({
      where: { organizationId: input.organizationId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        acquisitionTokenId: true,
        acquisitionToken: {
          select: {
            label: true,
            sourceName: true,
            eventLocation: true,
            eventDate: true,
            bypassWaitlist: true,
          },
        },
      },
    });
    captureFreeTierAnalyticsEvent({
      event: FREE_TIER_ANALYTICS_EVENTS.firstEssay,
      distinctId: freeTierOrganizationDistinctId(input.organizationId),
      properties: {
        application_id: application?.id ?? null,
        organization_id: input.organizationId,
        submission_id: input.submissionId,
        document_id: input.documentId,
        class_id: input.classId ?? null,
        is_first_essay: true,
        submission_count: 1,
        acquisition_token_id: application?.acquisitionTokenId ?? null,
        acquisition_channel: acquisitionChannel({
          acquisitionTokenId: application?.acquisitionTokenId,
          sourceName: application?.acquisitionToken?.sourceName,
        }),
        token_label: application?.acquisitionToken?.label ?? null,
        source_name: application?.acquisitionToken?.sourceName ?? null,
        event_location: application?.acquisitionToken?.eventLocation ?? null,
        event_date:
          application?.acquisitionToken?.eventDate?.toISOString() ?? null,
        bypass_waitlist: application?.acquisitionToken?.bypassWaitlist ?? null,
      },
    });
  });
}
