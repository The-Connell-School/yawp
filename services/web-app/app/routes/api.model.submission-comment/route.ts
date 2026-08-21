import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import type { Prisma } from '@app/prisma';
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
import { lockSubmissionCommentAccess } from '~/domain/submissions/submission-comment-access.server';

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

class SubmissionCommentAccessConflictError extends Error {}

function buildCommentDocumentAccessWhere({
  userId,
  membershipId,
  organizationId,
  isAdmin,
}: {
  userId: string;
  membershipId: string;
  organizationId: string;
  isAdmin: boolean;
}): Prisma.DocumentWhereInput {
  return {
    deletedAt: null,
    AND: [
      {
        membership: {
          is: {
            userId: { not: userId },
          },
        },
      },
      ...(isAdmin
        ? []
        : [
            buildTeacherDocumentAccessWhere({
              membershipId,
              organizationId,
            }),
          ]),
    ],
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });
  const isAdmin = hasEffectivePlatformAdmin(user?.isAdmin);
  const documentAccessWhere = buildCommentDocumentAccessWhere({
    userId,
    membershipId: profile.id,
    organizationId: profile.organization.id,
    isAdmin,
  });

  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const submission = await prisma.submission.findFirst({
    where: {
      id: data.submissionId,
      document: {
        is: documentAccessWhere,
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

  try {
    const created = await prisma.$transaction(async (tx) => {
      const stillAuthorized = await lockSubmissionCommentAccess(tx, {
        submissionId: submission.id,
        actorMembershipId: profile.id,
        actorUserId: userId,
      });
      if (!stillAuthorized) {
        throw new SubmissionCommentAccessConflictError();
      }

      const currentSubmission = await tx.submission.findFirst({
        where: {
          id: submission.id,
          document: { is: documentAccessWhere },
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
      if (!currentSubmission) {
        throw new SubmissionCommentAccessConflictError();
      }

      const comment = await tx.submissionComment.create({
        data: {
          submission: { connect: { id: currentSubmission.id } },
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
      const currentOrganizationId =
        currentSubmission.document.membership.organizationId ??
        profile.organization.id;
      await recordSubmissionActivity(tx, {
        submissionId: currentSubmission.id,
        organizationId: currentOrganizationId,
        actorMembershipId: resolveSubmissionActivityActorMembershipId({
          actorMembershipId: profile.id,
          actorOrganizationId: profile.organization.id,
          submissionOrganizationId: currentOrganizationId,
        }),
        actorUserId: userId,
        eventType: submissionActivityEventTypes.commentCreated,
        source: 'submission-comment',
        occurredAfterRelease: currentSubmission.releasedAt != null,
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
  } catch (error) {
    if (error instanceof SubmissionCommentAccessConflictError) {
      return dataResponse(
        {
          success: false,
          message: 'Your access changed before the comment could be saved.',
        },
        { status: 409 }
      );
    }
    throw error;
  }
}
