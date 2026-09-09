import { invariant } from '@epic-web/invariant';
import type { Prisma } from '@app/prisma';
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
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

class SubmissionCommentConflictError extends Error {}

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
        OR: [
          { artifactKind: 'ASSIGNMENT_GROUP' },
          { membership: { is: { userId: { not: userId } } } },
        ],
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

export async function action({ request, params }: ActionFunctionArgs) {
  invariant(params.id, 'No id provided');
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

  const comment = await prisma.submissionComment.findFirst({
    where: {
      id: params.id,
      submission: {
        is: {
          document: {
            is: documentAccessWhere,
          },
        },
      },
    },
    select: {
      id: true,
      content: true,
      updatedAt: true,
      excerpt: true,
      occurrence: true,
      submission: {
        select: {
          id: true,
          releasedAt: true,
          document: {
            select: {
              membership: { select: { organizationId: true } },
            },
          },
        },
      },
    },
  });

  if (!comment) {
    return dataResponse(
      { success: false, message: 'Comment not found.' },
      { status: 404 }
    );
  }

  if (request.method === 'DELETE') {
    try {
      await prisma.$transaction(async (tx) => {
        const stillAuthorized = await lockSubmissionCommentAccess(tx, {
          submissionId: comment.submission.id,
          actorMembershipId: profile.id,
          actorUserId: userId,
        });
        if (!stillAuthorized) throw new SubmissionCommentConflictError();

        const currentComment = await tx.submissionComment.findFirst({
          where: {
            id: params.id,
            submissionId: comment.submission.id,
          },
          select: {
            id: true,
            content: true,
            updatedAt: true,
            excerpt: true,
            occurrence: true,
            submission: {
              select: {
                id: true,
                releasedAt: true,
                document: {
                  select: {
                    membership: { select: { organizationId: true } },
                  },
                },
              },
            },
          },
        });
        if (!currentComment) throw new SubmissionCommentConflictError();

        const deleted = await tx.submissionComment.deleteMany({
          where: {
            id: params.id,
            updatedAt: currentComment.updatedAt,
            submission: {
              is: { document: { is: documentAccessWhere } },
            },
          },
        });
        if (deleted.count !== 1) throw new SubmissionCommentConflictError();
        const organizationId =
          currentComment.submission.document.membership?.organizationId ??
          profile.organization.id;
        await recordSubmissionActivity(tx, {
          submissionId: currentComment.submission.id,
          organizationId,
          actorMembershipId: resolveSubmissionActivityActorMembershipId({
            actorMembershipId: profile.id,
            actorOrganizationId: profile.organization.id,
            submissionOrganizationId: organizationId,
          }),
          actorUserId: userId,
          eventType: submissionActivityEventTypes.commentDeleted,
          source: 'submission-comment',
          occurredAfterRelease: currentComment.submission.releasedAt != null,
          changes: buildSubmissionActivityChanges({
            before: {
              comment: {
                id: currentComment.id,
                content: currentComment.content,
                excerpt: currentComment.excerpt,
                occurrence: currentComment.occurrence,
              },
            },
            after: { comment: null },
            fields: ['comment'],
          }),
        });
      });
    } catch (error) {
      if (error instanceof SubmissionCommentConflictError) {
        return dataResponse(
          {
            success: false,
            message: 'The comment changed before it could be deleted.',
          },
          { status: 409 }
        );
      }
      throw error;
    }
    return dataResponse(
      { success: true, commentId: params.id },
      { status: 200 }
    );
  }

  const formData = await request.formData();
  const content = formData.get('content')?.toString()?.trim();
  if (!content) {
    return dataResponse(
      { success: false, message: 'Content is required.' },
      { status: 400 }
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      const stillAuthorized = await lockSubmissionCommentAccess(tx, {
        submissionId: comment.submission.id,
        actorMembershipId: profile.id,
        actorUserId: userId,
      });
      if (!stillAuthorized) throw new SubmissionCommentConflictError();

      const currentComment = await tx.submissionComment.findFirst({
        where: {
          id: params.id,
          submissionId: comment.submission.id,
        },
        select: {
          id: true,
          content: true,
          updatedAt: true,
          submission: {
            select: {
              id: true,
              releasedAt: true,
              document: {
                select: {
                  membership: { select: { organizationId: true } },
                },
              },
            },
          },
        },
      });
      if (!currentComment) throw new SubmissionCommentConflictError();
      if (content === currentComment.content) return;

      const updated = await tx.submissionComment.updateMany({
        where: {
          id: params.id,
          updatedAt: currentComment.updatedAt,
          submission: {
            is: { document: { is: documentAccessWhere } },
          },
        },
        data: { content, updatedAt: new Date() },
      });
      if (updated.count !== 1) throw new SubmissionCommentConflictError();
      const organizationId =
        currentComment.submission.document.membership?.organizationId ??
        profile.organization.id;
      await recordSubmissionActivity(tx, {
        submissionId: currentComment.submission.id,
        organizationId,
        actorMembershipId: resolveSubmissionActivityActorMembershipId({
          actorMembershipId: profile.id,
          actorOrganizationId: profile.organization.id,
          submissionOrganizationId: organizationId,
        }),
        actorUserId: userId,
        eventType: submissionActivityEventTypes.commentUpdated,
        source: 'submission-comment',
        occurredAfterRelease: currentComment.submission.releasedAt != null,
        changes: buildSubmissionActivityChanges({
          before: { comment: { content: currentComment.content } },
          after: { comment: { content } },
          fields: ['comment'],
        }),
      });
    });
  } catch (error) {
    if (error instanceof SubmissionCommentConflictError) {
      return dataResponse(
        {
          success: false,
          message: 'The comment changed before it could be saved.',
        },
        { status: 409 }
      );
    }
    throw error;
  }

  return dataResponse({ success: true }, { status: 200 });
}
