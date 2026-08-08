import { invariant } from '@epic-web/invariant';
import {
  data as dataResponse,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireMembership, requireUserId } from '~/utils/auth.server.js';
import { getIsPlatformAdmin } from '~/utils/document-access.server';
import {
  inviteCollaborator,
  listCollaborators,
  listInvitableClassmates,
  removeCollaborator,
  type InviteFailure,
  type RemoveFailure,
} from '~/domain/document-collaborators.server';

/**
 * GET    /api/document/:id/collaborators            -> live collaborators (readers of the doc)
 * GET    /api/document/:id/collaborators?picker=1   -> invitable classmates (owner only)
 * POST   /api/document/:id/collaborators            -> invite   { membershipId }
 * DELETE /api/document/:id/collaborators            -> remove   { membershipId }
 *
 * This route is transport only. Every access decision lives in
 * app/domain/document-collaborators.server.ts as a Prisma predicate.
 */

const MutationBody = z.object({
  membershipId: z.string().min(1),
});

const INVITE_STATUS: Record<InviteFailure, number> = {
  document_not_found: 404,
  not_a_class_assignment: 400,
  not_a_classmate: 404,
  cannot_invite_self: 400,
  collaborator_limit: 400,
};

const INVITE_MESSAGE: Record<InviteFailure, string> = {
  document_not_found: 'Document not found.',
  not_a_class_assignment:
    'Only assignments from a class can be shared with classmates.',
  // Same wording and the same 404 as a nonexistent membership, so this cannot be
  // used to test whether a given membership id exists.
  not_a_classmate: 'That student is not in this class assignment.',
  cannot_invite_self: 'You are already on this document.',
  collaborator_limit: 'This document already has the maximum number of people on it.',
};

const REMOVE_STATUS: Record<RemoveFailure, number> = {
  document_not_found: 404,
  not_a_collaborator: 404,
};

const REMOVE_MESSAGE: Record<RemoveFailure, string> = {
  document_not_found: 'Document not found.',
  not_a_collaborator: 'That person is not on this document.',
};

export async function loader({ request, params }: LoaderFunctionArgs) {
  invariant(params.id, 'No document id found');
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  const url = new URL(request.url);

  if (url.searchParams.get('picker') === '1') {
    const classmates = await listInvitableClassmates({
      documentId: params.id,
      ownerProfileId: profile.id,
      organizationId: profile.organization.id,
    });

    if (!classmates) {
      return dataResponse({ error: 'Document not found.' }, { status: 404 });
    }

    return dataResponse({ classmates });
  }

  const isAdmin = await getIsPlatformAdmin(userId);
  const collaborators = await listCollaborators({
    documentId: params.id,
    profileId: profile.id,
    isAdmin,
  });

  if (!collaborators) {
    return dataResponse({ error: 'Document not found.' }, { status: 404 });
  }

  return dataResponse({ collaborators });
}

export async function action({ request, params }: ActionFunctionArgs) {
  invariant(params.id, 'No document id found');

  if (request.method !== 'POST' && request.method !== 'DELETE') {
    return dataResponse({ error: 'Method not allowed.' }, { status: 405 });
  }

  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  const { error, data } = await parseFormData(request, MutationBody);
  if (error) return validationError(error);

  if (request.method === 'DELETE') {
    const result = await removeCollaborator({
      documentId: params.id,
      actorProfileId: profile.id,
      targetMembershipId: data.membershipId,
    });

    if (!result.ok) {
      return dataResponse(
        { success: false, message: REMOVE_MESSAGE[result.reason] },
        { status: REMOVE_STATUS[result.reason] }
      );
    }

    return dataResponse({ success: true });
  }

  const result = await inviteCollaborator({
    documentId: params.id,
    ownerProfileId: profile.id,
    organizationId: profile.organization.id,
    inviteeMembershipId: data.membershipId,
  });

  if (!result.ok) {
    return dataResponse(
      { success: false, message: INVITE_MESSAGE[result.reason] },
      { status: INVITE_STATUS[result.reason] }
    );
  }

  return dataResponse({ success: true, collaborator: result.collaborator });
}
