import { invariant } from '@epic-web/invariant';
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

class SubmissionCommentConflictError extends Error {}

export async function action({ request, params }: ActionFunctionArgs) {
  invariant(params.id, 'No id provided');
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });
  const isAdmin = hasEffectivePlatformAdmin(user?.isAdmin);

  const comment = await prisma.submissionComment.findFirst({
    where: {
      id: params.id,
      submission: {
        is: {
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
        const deleted = await tx.submissionComment.deleteMany({
          where: { id: params.id, updatedAt: comment.updatedAt },
        });
        if (deleted.count !== 1) throw new SubmissionCommentConflictError();
        const organizationId =
          comment.submission.document.membership.organizationId ??
          profile.organization.id;
        await recordSubmissionActivity(tx, {
          submissionId: comment.submission.id,
          organizationId,
          actorMembershipId: resolveSubmissionActivityActorMembershipId({
            actorMembershipId: profile.id,
            actorOrganizationId: profile.organization.id,
            submissionOrganizationId: organizationId,
          }),
          eventType: submissionActivityEventTypes.commentDeleted,
          source: 'submission-comment',
          occurredAfterRelease: comment.submission.releasedAt != null,
          changes: buildSubmissionActivityChanges({
            before: {
              comment: {
                id: comment.id,
                content: comment.content,
                excerpt: comment.excerpt,
                occurrence: comment.occurrence,
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

  if (content === comment.content) {
    return dataResponse({ success: true }, { status: 200 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.submissionComment.updateMany({
        where: { id: params.id, updatedAt: comment.updatedAt },
        data: { content, updatedAt: new Date() },
      });
      if (updated.count !== 1) throw new SubmissionCommentConflictError();
      const organizationId =
        comment.submission.document.membership.organizationId ??
        profile.organization.id;
      await recordSubmissionActivity(tx, {
        submissionId: comment.submission.id,
        organizationId,
        actorMembershipId: resolveSubmissionActivityActorMembershipId({
          actorMembershipId: profile.id,
          actorOrganizationId: profile.organization.id,
          submissionOrganizationId: organizationId,
        }),
        eventType: submissionActivityEventTypes.commentUpdated,
        source: 'submission-comment',
        occurredAfterRelease: comment.submission.releasedAt != null,
        changes: buildSubmissionActivityChanges({
          before: { comment: { content: comment.content } },
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
