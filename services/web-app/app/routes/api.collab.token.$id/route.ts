import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { collaborationRoomWhere } from '~/domain/collaboration/room.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { signCollabToken } from '~/utils/collab-token.server';
import { prisma } from '~/utils/db.server';
import {
  documentAuthorWhere,
  documentReadWhere,
  getIsPlatformAdmin,
} from '~/utils/document-access.server';

/**
 * Mints a document-scoped access token for the realtime collaboration provider.
 *
 * Authorization stays here rather than at the provider: the browser connects
 * straight to the provider over WSS, so this endpoint is the only place that can
 * decide who may join a room and whether they may write. That makes it the first
 * production call site for `documentAuthorWhere`.
 *
 * POST rather than GET so a credential is never sat in a cache or a browser
 * history entry.
 */
export async function action({ request, params }: ActionFunctionArgs) {
  const documentId = params.id;
  if (!documentId) {
    return dataResponse(
      { success: false, message: 'Document is required.' },
      { status: 400 }
    );
  }

  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const isAdmin = await getIsPlatformAdmin(userId);

  // Cheapest and broadest check first: is this document actually a live
  // collaboration room? Both roads qualify — a teacher-arranged group and a
  // student's own shared draft — but an ordinary solo document never does, which
  // is what keeps the two editors from meeting at runtime.
  const room = await prisma.document.findFirst({
    where: { id: documentId, ...collaborationRoomWhere() },
    select: { id: true },
  });

  if (!room) {
    return dataResponse(
      { success: false, message: 'This document is not a collaborative draft.' },
      { status: 403 }
    );
  }

  // Author scope first: the owner or an active co-author may write.
  const asAuthor = await prisma.document.findFirst({
    where: { id: documentId, ...documentAuthorWhere({ profileId: profile.id, isAdmin }) },
    select: { id: true },
  });

  let readOnly: boolean;
  if (asAuthor) {
    readOnly = false;
  } else {
    // Falling back to read scope is what lets a teacher of the owning student's
    // class join to read and comment without being able to write student prose.
    const asReader = await prisma.document.findFirst({
      where: { id: documentId, ...documentReadWhere({ profileId: profile.id, isAdmin }) },
      select: { id: true },
    });
    if (!asReader) {
      return dataResponse(
        { success: false, message: 'You do not have access to this document.' },
        { status: 403 }
      );
    }
    readOnly = true;
  }

  const secret = process.env.TIPTAP_COLLAB_SECRET;
  const appId = process.env.TIPTAP_COLLAB_APP_ID;
  if (!secret || !appId) {
    // Misconfiguration, not a client error. Report it as such rather than
    // returning something the editor would read as "you may not join".
    return dataResponse(
      {
        success: false,
        message: 'Collaboration is not configured on this server.',
      },
      { status: 500 }
    );
  }

  let token: string;
  try {
    token = signCollabToken({
      documentId,
      membershipId: profile.id,
      readOnly,
      secret,
      nowSeconds: Math.floor(Date.now() / 1000),
    });
  } catch {
    return dataResponse(
      {
        success: false,
        message: 'Collaboration is not configured on this server.',
      },
      { status: 500 }
    );
  }

  return dataResponse({
    success: true,
    token,
    // The room name is the document id, so one Yawp document is one room.
    documentName: documentId,
    appId,
    readOnly,
  });
}
