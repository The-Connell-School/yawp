import { invariant } from '@epic-web/invariant';
import { type ActionFunctionArgs } from 'react-router';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import {
  buildSubmissionTitleEditWhere,
  findSubmissionForTitleEdit,
} from '~/utils/submission-access.server';
import { hasEffectivePlatformAdmin } from '~/utils/preview-access.server';
import {
  buildSubmissionActivityChanges,
  recordSubmissionActivity,
  resolveSubmissionActivityActorMembershipId,
  submissionActivityEventTypes,
} from '~/domain/submissions/submission-activity.server';

const MAX_TITLE_LEN = 500;

class SubmissionTitleConflictError extends Error {}

function normalizeSubmissionTitle(raw: unknown) {
  if (typeof raw !== 'string') {
    return { ok: false as const, message: 'title must be a string.' };
  }
  const title = raw.trim();
  if (title.length > MAX_TITLE_LEN) {
    return { ok: false as const, message: 'Title is too long.' };
  }
  return { ok: true as const, title };
}

export async function action({ request, params }: ActionFunctionArgs) {
  invariant(params.id, 'No submission id provided');

  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'updateTitle') {
    const normalized = normalizeSubmissionTitle(formData.get('title'));
    if (!normalized.ok) {
      return Response.json(
        { success: false, message: normalized.message },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });

    const titleAccess = {
      submissionId: params.id,
      userId,
      membershipId: profile.id,
      organizationId: profile.organization.id,
      isAdmin: hasEffectivePlatformAdmin(user?.isAdmin),
    };
    const submission = await findSubmissionForTitleEdit(titleAccess);

    if (!submission) {
      return Response.json(
        { success: false, message: 'Submission not found.' },
        { status: 404 }
      );
    }

    if (submission.title === normalized.title) {
      return Response.json({ success: true, title: normalized.title });
    }

    try {
      await prisma.$transaction(async (tx) => {
        const update = await tx.submission.updateMany({
          where: {
            ...buildSubmissionTitleEditWhere(titleAccess),
            updatedAt: submission.updatedAt,
          },
          data: {
            title: normalized.title,
            updatedAt: new Date(),
          },
        });
        if (update.count !== 1) throw new SubmissionTitleConflictError();

        const organizationId =
          submission.document.membership.organizationId ??
          profile.organization.id;
        await recordSubmissionActivity(tx, {
          submissionId: submission.id,
          organizationId,
          actorMembershipId: resolveSubmissionActivityActorMembershipId({
            actorMembershipId: profile.id,
            actorOrganizationId: profile.organization.id,
            submissionOrganizationId: organizationId,
          }),
          actorUserId: userId,
          eventType: submissionActivityEventTypes.titleUpdated,
          source: 'submission-title',
          occurredAfterRelease: submission.releasedAt != null,
          changes: buildSubmissionActivityChanges({
            before: { title: submission.title },
            after: { title: normalized.title },
            fields: ['title'],
          }),
        });
      });
    } catch (error) {
      if (error instanceof SubmissionTitleConflictError) {
        return Response.json(
          {
            success: false,
            message: 'The submission changed before the title could be saved.',
          },
          { status: 409 }
        );
      }
      throw error;
    }

    return Response.json({ success: true, title: normalized.title });
  }

  // Archive is retired: Unsubmit (POST /api/domain/unsubmit-submission) is
  // the single way a student takes a submission out of active state. Archive
  // had no grading guard, so a student could archive an already-graded
  // submission with no attribution and no block — that hole is closed by
  // removing the capability rather than reachable-but-disabled. Existing
  // Submission.archivedAt rows are untouched and still partition as
  // inactive; this only blocks creating new ones.
  if (intent === 'archive' || intent === 'unarchive') {
    return Response.json(
      {
        success: false,
        message:
          'Archiving submissions is no longer supported. Use unsubmit instead.',
      },
      { status: 400 }
    );
  }

  return Response.json(
    { success: false, message: 'Expected intent=updateTitle.' },
    { status: 400 }
  );
}
