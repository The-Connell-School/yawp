import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { hasEffectivePlatformAdmin } from '~/utils/preview-access.server';
import { buildTeacherDocumentAccessWhere } from '~/utils/grading-auth.server';
import {
  buildSubmissionActivityChanges,
  recordSubmissionActivity,
  resolveSubmissionActivityActorMembershipId,
  submissionActivityEventTypes,
} from '~/domain/submissions/submission-activity.server';

const POST = z
  .object({
    submissionId: z.string(),
    content: z.string().min(1),
    excerpt: z.string().min(1).optional(),
    occurrence: z
      .string()
      .optional()
      .transform((v) => (v ? Number(v) : 1))
      .refine((v) => Number.isFinite(v) && v >= 1, 'Invalid occurrence'),
  })
  .refine((data) => Boolean(data.excerpt?.trim()), {
    message:
      'Comments must be tied to specific text. Select text and use Comment.',
    path: ['excerpt'],
  });

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });
  const isAdmin = hasEffectivePlatformAdmin(user?.isAdmin);

  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const submission = await prisma.submission.findFirst({
    where: {
      id: data.submissionId,
      document: {
        is: {
          deletedAt: null,
          membershipId: { not: profile.id },
          ...(isAdmin
            ? {}
            : buildTeacherDocumentAccessWhere({
                membershipId: profile.id,
                organizationId: profile.organization.id,
              })),
        },
      },
    },
    select: {
      id: true,
      releasedAt: true,
      document: {
        select: {
          membership: { select: { organizationId: true } },
        },
      },
    },
  });

  if (!submission) {
    return dataResponse(
      {
        success: false,
        message: 'Only teachers or admins can add submission comments.',
      },
      { status: 403 }
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    const comment = await tx.submissionComment.create({
      data: {
        submission: { connect: { id: submission.id } },
        membership: { connect: { id: profile.id } },
        content: data.content,
        occurrence: data.occurrence,
        ...(data.excerpt != null &&
          data.excerpt !== '' && { excerpt: data.excerpt }),
      },
      include: {
        membership: {
          include: { user: { select: { name: true, email: true } } },
        },
      },
    });
    const organizationId =
      submission.document.membership.organizationId ?? profile.organization.id;
    await recordSubmissionActivity(tx, {
      submissionId: submission.id,
      organizationId,
      actorMembershipId: resolveSubmissionActivityActorMembershipId({
        actorMembershipId: profile.id,
        actorOrganizationId: profile.organization.id,
        submissionOrganizationId: organizationId,
      }),
      eventType: submissionActivityEventTypes.commentCreated,
      source: 'submission-comment',
      occurredAfterRelease: submission.releasedAt != null,
      changes: buildSubmissionActivityChanges({
        before: { comment: null },
        after: {
          comment: {
            id: comment.id,
            content: data.content,
            excerpt: data.excerpt ?? null,
            occurrence: data.occurrence,
          },
        },
        fields: ['comment'],
      }),
    });
    return comment;
  });

  return dataResponse({ success: true, comment: created }, { status: 201 });
}
