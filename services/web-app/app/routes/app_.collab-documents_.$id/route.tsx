import { invariant } from '@epic-web/invariant';
import { ArrowLeft } from 'lucide-react';
import {
  data as dataResponse,
  useFetcher,
  useLoaderData,
  useNavigate,
  useSearchParams,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { Button } from '~/components/ui/button';
import { CollabPromptPanel } from './collab-prompt-panel';
import {
  DraftCommentError,
  listDraftComments,
  replyToDraftComment,
} from '~/domain/collaboration/comments.server';
import { DraftCommentThread } from '~/domain/collaboration/draft-comments';
import { collaborationRoomWhere } from '~/domain/collaboration/room.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import {
  documentAuthorWhere,
  documentReadWhere,
  getIsPlatformAdmin,
} from '~/utils/document-access.server';
import { CollabEditor, colorForMembership } from './collab-editor';

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
 * VERIFIED, with gaps that are known rather than unknown.
 *
 * Proven by running it: two browsers converge on one document (Sam typed, Taylor
 * saw it, Taylor typed back, Sam saw it), the loader's authorization holds, the
 * room is seeded server-side from existing HTML exactly once, and the dual-write
 * keeps Document.html/text/revision current for grading, search and submission.
 *
 * The transport is our own HTTP provider polling `api/collab/$id/updates`, not a
 * hosted service — App Runner has no WebSockets and nothing was purchased. Yjs
 * updates are commutative and idempotent, so polling converges; the cost is
 * about one second before a collaborator's text appears, never before your own.
 *
 * Still missing, each deliberate rather than forgotten:
 *
 * 1. NO SUBMISSION PATH. Submitting a group draft is not wired.
 * 2. NO COMMENTS, TUTOR, MODULE SESSIONS, OR GRADE PANELS. This page is the
 *    writing surface and the prompt. Acceptable for the ungraded small-group
 *    pilot, not beyond it.
 * 3. NO CONTRIBUTION BREAKDOWN. Attribution is captured per update row but
 *    compaction currently discards it once a room passes its threshold.
 * 4. NO E2E SPEC. The two-browser proof was run by hand, not in CI.
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
      // Only an opened collaborative draft belongs on this page — by either
      // road. Anything else, including every document that exists today, stays
      // with the solo editor so the two never mix at runtime.
      ...collaborationRoomWhere(),
      AND: [documentReadWhere({ profileId: profile.id, isAdmin })],
    },
    select: {
      id: true,
      title: true,
      submissions: {
        where: { unsubmittedAt: null },
        orderBy: { submittedAt: 'desc' },
        take: 1,
        select: { id: true, submittedAt: true },
      },
      assignment: {
        // promptAttachmentName so the prompt panel can offer the same PDF the
        // solo editor does; without it the attachment silently disappears for
        // group work.
        select: {
          id: true,
          title: true,
          prompt: true,
          promptAttachmentName: true,
        },
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

  const [user, comments] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    }),
    // Document-level only: the collaborative schema has no comment mark, so an
    // anchored comment would point at text this page cannot highlight.
    listDraftComments({ documentId: doc.id, documentLevelOnly: true }),
  ]);

  return dataResponse({
    doc,
    membershipId: profile.id,
    userName: user?.name?.trim() || 'Someone',
    canWrite: Boolean(asAuthor),
    submittedAt: doc.submissions[0]?.submittedAt?.toISOString() ?? null,
    comments,
  });
}

/**
 * Replying to the teacher. Students never open a comment thread on their own
 * work — the teacher starts it, the group answers.
 */
export async function action({ request, params }: ActionFunctionArgs) {
  invariant(params.id, 'No document id provided');

  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const isAdmin = await getIsPlatformAdmin(userId);

  // Author scope: a member of this group, not merely someone who can read it.
  const doc = await prisma.document.findFirst({
    where: {
      id: params.id,
      ...collaborationRoomWhere(),
      AND: [documentAuthorWhere({ profileId: profile.id, isAdmin })],
    },
    select: { id: true },
  });

  if (!doc) {
    return dataResponse(
      { success: false, message: 'Draft not found.' },
      { status: 404 }
    );
  }

  const formData = await request.formData();

  try {
    await replyToDraftComment({
      documentId: doc.id,
      commentId: formData.get('commentId')?.toString() ?? '',
      membershipId: profile.id,
      content: formData.get('content')?.toString() ?? '',
    });
    return dataResponse({ success: true });
  } catch (error) {
    if (error instanceof DraftCommentError) {
      return dataResponse(
        { success: false, message: error.message },
        { status: 400 }
      );
    }
    throw error;
  }
}

export default function CollabDocumentRoute() {
  const { doc, canWrite, submittedAt, comments } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const submitFetcher = useFetcher<{ success?: boolean; message?: string }>();
  const submitting = submitFetcher.state !== 'idle';
  const submitError =
    submitFetcher.data && submitFetcher.data.success === false
      ? submitFetcher.data.message
      : '';
  const [searchParams] = useSearchParams();
  const exitTarget = searchParams.get('exitTo') || '/app';

  const groupMemberCount = doc.group?.members.length ?? 0;

  return (
    /* The page shell is deliberately the same shape as the solo editor's:
       full-height white page, a max-w-screen-2xl nav, and a content row holding
       the prompt column beside the writing surface. It is duplicated rather than
       extracted because the solo page must not be touched — but the earlier
       version duplicated only the writing surface, which left this page as one
       column stretched across the viewport with no prompt, no chrome, and a
       stray right border where the comments column would be. */
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-white">
      <nav className="mx-auto flex w-full max-w-screen-2xl items-center gap-4 border-b px-3 py-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate(exitTarget)}
        >
          <ArrowLeft className="h-4" />
          Exit
        </Button>

        <div className="flex min-w-0 flex-1 flex-col md:flex-row md:items-baseline md:gap-3">
          <span className="truncate font-bold">
            {/* Documents are created with an empty-string title, which `??` does
                not catch — the header rendered blank for every student-shared
                draft. */}
            {doc.assignment?.title?.trim() ||
              doc.title?.trim() ||
              'Untitled document'}
          </span>
          <span className="shrink-0 text-sm text-muted-foreground">
            {doc.group?.label ?? 'Group'} · {groupMemberCount}{' '}
            {groupMemberCount === 1 ? 'writer' : 'writers'}
            {canWrite ? '' : ' · read only'}
          </span>
        </div>

        {/* Any member may submit for the group, which is what the group agreed
            when they asked for it. Pressing twice is harmless: the route returns
            the existing submission rather than creating a second. */}
        {canWrite ? (
          <submitFetcher.Form
            method="post"
            action={`/api/collab/${doc.id}/submit`}
            className="shrink-0"
          >
            <Button
              type="submit"
              size="sm"
              variant={submittedAt ? 'outline' : 'default'}
              disabled={submitting || Boolean(submittedAt)}
            >
              {submittedAt ? 'Submitted' : 'Submit'}
            </Button>
          </submitFetcher.Form>
        ) : null}

        {/* The group's roster, in the colors their carets use in the document,
            so one color means one person everywhere on the page. */}
        <ul
          className="flex shrink-0 items-center -space-x-1.5"
          aria-label="Writers in this draft"
        >
          {(doc.group?.members ?? []).map((member) => {
            const name = member.membership.user.name?.trim() || 'Student';
            return (
              <li
                key={member.membershipId}
                title={name}
                aria-label={name}
                className="grid h-7 w-7 place-items-center rounded-full text-[10px] font-medium text-white ring-2 ring-white"
                style={{
                  backgroundColor: colorForMembership(member.membershipId),
                }}
              >
                {name
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part[0]?.toUpperCase() ?? '')
                  .join('')}
              </li>
            );
          })}
        </ul>
      </nav>

      {submitError ? (
        <p
          className="border-b bg-red-50 px-4 py-2 text-sm text-red-800"
          role="alert"
        >
          {submitError}
        </p>
      ) : null}

      <div className="mx-auto flex min-h-0 w-full max-w-screen-2xl flex-1 overflow-hidden">
        {/* Prompt and teacher comments share the left column: both are things to
            read while writing, and neither should take width from the draft. */}
        <div className="flex w-full shrink-0 flex-col overflow-y-auto border-r md:w-[340px] lg:w-[380px]">
          <CollabPromptPanel assignment={doc.assignment} />
          {comments.length > 0 || canWrite ? (
            <div className="p-3">
              <DraftCommentThread
                comments={comments}
                canComment={false}
                canReply={canWrite}
              />
            </div>
          ) : null}
        </div>
        <CollabEditor docId={doc.id} canWrite={canWrite} />
      </div>
    </main>
  );
}
