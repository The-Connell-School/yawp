import { invariant } from '@epic-web/invariant';
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import {
  GroupSubmitError,
  submitGroupDraft,
} from '~/domain/collaboration/submit.server';
import { collaborationRoomWhere } from '~/domain/collaboration/room.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import {
  documentAuthorWhere,
  getIsPlatformAdmin,
} from '~/utils/document-access.server';

/**
 * Submitting a shared draft. Any member of the group may press it.
 *
 * `documentAuthorWhere` is the whole authorization story: owner or active
 * co-author, teachers deliberately excluded. A teacher submitting on a group's
 * behalf would put words in students' mouths on a graded artefact.
 */
export async function action({ request, params }: ActionFunctionArgs) {
  invariant(params.id, 'No document id provided');

  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const isAdmin = await getIsPlatformAdmin(userId);

  const document = await prisma.document.findFirst({
    where: {
      id: params.id,
      deletedAt: null,
      ...collaborationRoomWhere(),
      AND: [documentAuthorWhere({ profileId: profile.id, isAdmin })],
    },
    select: {
      id: true,
      title: true,
      revision: true,
      html: true,
      text: true,
      classAssignment: {
        select: {
          class: { select: { school: { select: { organizationId: true } } } },
        },
      },
    },
  });

  if (!document) {
    return dataResponse(
      { success: false, message: 'Draft not found.' },
      { status: 404 }
    );
  }

  try {
    const result = await submitGroupDraft({
      document,
      userId,
      membershipId: profile.id,
      organizationId:
        document.classAssignment?.class.school.organizationId ??
        profile.organization.id,
    });

    return dataResponse({
      success: true,
      submissionId: result.submissionId,
      message: result.created
        ? 'Submitted for your group.'
        : 'Your group has already submitted this draft.',
    });
  } catch (error) {
    if (error instanceof GroupSubmitError) {
      return dataResponse(
        { success: false, message: error.message },
        { status: 400 }
      );
    }
    throw error;
  }
}
