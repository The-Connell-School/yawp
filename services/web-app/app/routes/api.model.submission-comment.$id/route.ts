import { invariant } from '@epic-web/invariant';
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { hasEffectivePlatformAdmin } from '~/utils/preview-access.server';
import {
  buildSubmissionActivityChanges,
  recordSubmissionActivity,
  submissionActivityEventTypes,
} from '~/domain/submissions/submission-activity.server';

function teacherDocumentAccessWhere(
  membershipId: string,
  organizationId: string
) {
  return {
    membership: { organizationId },
    OR: [
      {
        classAssignment: {
          class: {
            school: { organizationId },
            teachers: { some: { id: membershipId } },
          },
        },
      },
      {
        membership: {
          classesAsStudent: {
            some: {
              school: { organizationId },
              teachers: { some: { id: membershipId } },
            },
          },
        },
      },
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
                : teacherDocumentAccessWhere(
                    profile.id,
                    profile.organization.id
                  )),
            },
          },
        },
      },
    },
    select: {
      id: true,
      content: true,
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
    await prisma.$transaction(async (tx) => {
      await tx.submissionComment.delete({ where: { id: params.id } });
      const organizationId =
        comment.submission.document.membership.organizationId ??
        profile.organization.id;
      await recordSubmissionActivity(tx, {
        submissionId: comment.submission.id,
        organizationId,
        actorMembershipId:
          profile.organization.id === organizationId ? profile.id : null,
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
    return dataResponse({ success: true, commentId: params.id }, { status: 200 });
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

  await prisma.$transaction(async (tx) => {
    await tx.submissionComment.update({
      where: { id: params.id },
      data: { content },
    });
    const organizationId =
      comment.submission.document.membership.organizationId ??
      profile.organization.id;
    await recordSubmissionActivity(tx, {
      submissionId: comment.submission.id,
      organizationId,
      actorMembershipId:
        profile.organization.id === organizationId ? profile.id : null,
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

  return dataResponse({ success: true }, { status: 200 });
}
