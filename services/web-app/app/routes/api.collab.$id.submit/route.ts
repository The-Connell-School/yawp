import { invariant } from '@epic-web/invariant';
import {
  data as dataResponse,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import {
  GroupSubmitError,
  readGroupSubmitState,
  submitGroupDraft,
  withdrawGroupSubmit,
} from '~/domain/collaboration/submit.server';
import { describeGroupSubmitProgress } from '~/domain/collaboration/submit-readiness';
import { collaborationRoomWhere } from '~/domain/collaboration/room.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import {
  documentAuthorWhere,
  documentReadWhere,
  getIsPlatformAdmin,
} from '~/utils/document-access.server';

/**
 * Submitting a shared draft. Every member has to press it.
 *
 * A press records that one member is ready; the press that completes the set is
 * the one that creates the submission. That is the difference from solo work and
 * the reason this endpoint answers with the group's progress rather than a bare
 * success: the student who presses first needs to be told, in the same breath,
 * that nothing has gone to the teacher yet.
 *
 * `documentAuthorWhere` is the whole authorization story for pressing: owner or
 * active co-author, teachers deliberately excluded. A teacher submitting on a
 * group's behalf would put words in students' mouths on a graded artefact.
 */

/** Reading the progress. Widened to anyone who may read the draft, because a
 * teacher looking at a group's page should see how far along they are — but
 * reading is all this does. */
export async function loader({ request, params }: LoaderFunctionArgs) {
  invariant(params.id, 'No document id provided');

  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const isAdmin = await getIsPlatformAdmin(userId);

  const document = await prisma.document.findFirst({
    where: {
      id: params.id,
      deletedAt: null,
      ...collaborationRoomWhere(),
      AND: [documentReadWhere({ profileId: profile.id, isAdmin })],
    },
    select: { id: true },
  });

  if (!document) {
    return dataResponse(
      { success: false, message: 'Draft not found.' },
      { status: 404 }
    );
  }

  const state = await readGroupSubmitState({
    documentId: document.id,
    viewerMembershipId: profile.id,
  });

  return dataResponse({
    success: true,
    ...state,
    progress: describeGroupSubmitProgress(state.readiness),
  });
}

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
    select: { id: true, title: true, revision: true, html: true, text: true },
  });

  if (!document) {
    return dataResponse(
      { success: false, message: 'Draft not found.' },
      { status: 404 }
    );
  }

  const formData = await request.formData();
  const intent = formData.get('intent')?.toString() ?? 'submit';

  try {
    // Taking a press back, which only works while the group is still waiting on
    // somebody. It is the way out for a student who pressed too early, and it
    // exists because the alternative — a classmate's mistake needing a teacher —
    // is the kind of friction that gets a feature switched off.
    if (intent === 'withdraw') {
      const { readiness } = await withdrawGroupSubmit({
        documentId: document.id,
        membershipId: profile.id,
      });

      return dataResponse({
        success: true,
        status: 'withdrawn' as const,
        submissionId: null,
        submittedAt: null,
        readiness,
        progress: describeGroupSubmitProgress(readiness),
        message: 'Your submit was taken back. Your group has not submitted.',
      });
    }

    const result = await submitGroupDraft({
      document,
      userId,
      membershipId: profile.id,
    });

    const message =
      result.status === 'submitted'
        ? 'Everyone has submitted, so this draft has gone to your teacher.'
        : result.status === 'already-submitted'
          ? 'Your group has already submitted this draft.'
          : // The important one. A student who presses and sees "Submitted"
            // would reasonably stop working and walk away from a draft that is
            // still sitting with the group.
            `Your submit is recorded. ${describeGroupSubmitProgress(result.readiness)}`;

    return dataResponse({
      success: true,
      status: result.status,
      submissionId: result.submissionId,
      submittedAt: result.submittedAt,
      readiness: result.readiness,
      progress: describeGroupSubmitProgress(result.readiness),
      message,
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
