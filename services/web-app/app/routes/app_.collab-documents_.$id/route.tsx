import { invariant } from '@epic-web/invariant';
import {
  data as dataResponse,
  useLoaderData,
  type LoaderFunctionArgs,
} from 'react-router';
import { useState } from 'react';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import {
  documentAuthorWhere,
  documentReadWhere,
  getIsPlatformAdmin,
} from '~/utils/document-access.server';
import { CollabEditor } from './collab-editor';

/**
 * The collaborative draft page: `/app/collab-documents/:id`.
 *
 * A SEPARATE route from `/app/documents/:id` by deliberate decision, not by
 * accident. The solo editor, `use-editor-sync.ts`, `api.document.$id.save` and
 * `api.domain.submit-document` are not touched by this feature at all — a flag
 * threaded through them would put collaborative and solo writing in one code
 * path, where a mistake reaches every student. This subsystem has already had one
 * attempt reverted from main for breaking adjacent behavior
 * (docs/decisions/2026-03-30-revert-local-first-persistence.md).
 *
 * Duplication here is accepted as temporary insurance. The toolbar and custom
 * extensions are imported from the solo editor rather than copied, so the two
 * pages look the same without drifting.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PARTIALLY VERIFIED — NOT SHIPPABLE YET
 *
 * What has actually been run, against a real Postgres and a real browser:
 * this page renders with live data (title, group label, writer count, presence,
 * the assignment prompt), the loader's authorization holds, and the token
 * endpoint mints a correctly document-scoped JWT for a group member.
 *
 * What has NOT been run: anything past the provider boundary. No real
 * collaboration provider was reachable, so two carets in one document, live
 * text, and the schema-version handshake are all still unproven.
 *
 * Known-missing pieces, each required before a student sees this:
 *
 * 1. NO SERVER-SIDE SEEDING. An existing document's HTML is never loaded into the
 *    Y.Doc. A group opening a draft that already has content will see it empty.
 *    Seeding must happen once, server-side, into a confirmed-empty room — doing
 *    it client-side duplicates the content once per participant.
 * 2. NO SUBMISSION PATH. Submitting a group draft is not wired, including the
 *    availability fallback the plan calls for.
 * 3. NO COMMENTS, TUTOR, MODULE SESSIONS, OR GRADE PANELS. The solo page has all
 *    of these; this page is the editor surface only. Acceptable for the ungraded
 *    small-group pilot, not beyond it.
 * 4. PROVIDER URL IS UNCONFIRMED. The Hocuspocus URL in `collab-editor.tsx` is
 *    the documented Tiptap Cloud shape but has not been checked against a real
 *    app.
 * 5. NO E2E SPEC. AGENTS.md requires e2e first for UI. The two-browser test that
 *    actually proves collaboration works needs a provider.
 *
 * Dual-write back to Postgres — previously the worst gap here — now exists in
 * `api/collab/webhook` and has been verified end to end against a running
 * server: a signed webhook carrying real Yjs state updates `Document.html`,
 * `Document.text` and `revision`, journals the write with attribution, and cuts
 * a `DocumentRevision`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  invariant(params.id, 'No document id provided');

  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const isAdmin = await getIsPlatformAdmin(userId);

  // Read scope decides whether the page renders at all; the token endpoint
  // independently decides whether this person may write. Both are enforced
  // server-side, and the token endpoint is authoritative for write access.
  const doc = await prisma.document.findFirst({
    where: {
      id: params.id,
      // Only an opened collaborative draft belongs on this page. Anything else
      // — including every document that exists today — is sent back to the solo
      // editor, so the two never mix at runtime.
      assignment: { is: { collaborationEnabled: true } },
      group: { is: { openedAt: { not: null } } },
      membership: {
        is: { organization: { is: { collaborativeDraftsEnabled: true } } },
      },
      ...documentReadWhere({ profileId: profile.id, isAdmin }),
    },
    select: {
      id: true,
      title: true,
      assignment: {
        select: { id: true, title: true, prompt: true },
      },
      group: {
        select: {
          id: true,
          label: true,
          members: {
            where: { removedAt: null },
            select: {
              membershipId: true,
              membership: {
                select: { id: true, user: { select: { name: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!doc) {
    // Not found rather than forbidden: this page should be indistinguishable
    // from nonexistent for anyone who is not in the group or teaching it.
    throw dataResponse(
      { message: 'Draft not found.' },
      { status: 404, statusText: 'Not Found' }
    );
  }

  const asAuthor = await prisma.document.findFirst({
    where: {
      id: params.id,
      ...documentAuthorWhere({ profileId: profile.id, isAdmin }),
    },
    select: { id: true },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });

  return dataResponse({
    doc,
    membershipId: profile.id,
    userName: user?.name?.trim() || 'Someone',
    canWrite: Boolean(asAuthor),
  });
}

export default function CollabDocumentRoute() {
  const { doc, membershipId, userName, canWrite } =
    useLoaderData<typeof loader>();
  const [peers, setPeers] = useState<
    { clientId: number; name: string; color: string }[]
  >([]);

  const groupMemberCount = doc.group?.members.length ?? 0;

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">
            {doc.assignment?.title ?? doc.title}
          </h1>
          <p className="text-xs text-gray-600">
            {doc.group?.label ?? 'Group'} · {groupMemberCount}{' '}
            {groupMemberCount === 1 ? 'writer' : 'writers'}
            {canWrite ? '' : ' · read only'}
          </p>
        </div>

        {/* Presence. Shows who else is in the draft right now, in the same
            colors their carets use. */}
        <div className="flex items-center gap-2">
          {peers.length === 0 ? (
            <span className="text-xs text-gray-500">No one else here yet</span>
          ) : (
            <ul className="flex items-center gap-1" aria-label="People editing now">
              {peers.map((peer) => (
                <li
                  key={peer.clientId}
                  title={peer.name}
                  aria-label={peer.name}
                  className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-medium text-white"
                  style={{ backgroundColor: peer.color }}
                >
                  {peer.name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part[0]?.toUpperCase() ?? '')
                    .join('')}
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>

      {doc.assignment?.prompt ? (
        <div className="max-h-[22vh] overflow-y-auto border-b bg-gray-50 px-4 py-3 text-sm">
          {doc.assignment.prompt}
        </div>
      ) : null}

      <div className="min-h-0 grow">
        <CollabEditor
          docId={doc.id}
          userName={userName}
          membershipId={membershipId}
          canWrite={canWrite}
          onPeersChange={setPeers}
        />
      </div>
    </div>
  );
}
