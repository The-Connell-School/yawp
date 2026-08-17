import { invariant } from '@epic-web/invariant';
import { ArrowLeft } from 'lucide-react';
import {
  Link,
  data as dataResponse,
  useLoaderData,
  type LoaderFunctionArgs,
} from 'react-router';
import { Button } from '~/components/ui/button';
import { buildContributionBreakdown } from '~/domain/collaboration/contribution.server';
import { collaborationRoomWhere } from '~/domain/collaboration/room.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import {
  documentReadWhere,
  getIsPlatformAdmin,
} from '~/utils/document-access.server';
import { ContributionPanel } from './contribution-panel';

/**
 * The teacher's view of one group's draft: what it says, and who wrote it.
 *
 * Two gaps closed at once. Until now nothing linked a teacher to the documents
 * the groups page created, so an opened group was a dead end; and the
 * contribution data being recorded had no reader.
 *
 * Read-only by construction — there is no editor here at all, which is the
 * cleanest possible expression of "teachers comment, they do not write in a
 * student's draft".
 *
 * The panel is evidence, never a computed score. See `contribution.ts` for why
 * every automatic contribution metric fails on ordinary group-work patterns.
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  invariant(params.documentId, 'No document id provided');

  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const isAdmin = await getIsPlatformAdmin(userId);

  // Teacher-only: a student must not see their partner's session times and
  // character counts. Their own view of the draft is the collaborative editor.
  if (profile.role !== 'TEACHER' && !isAdmin) {
    throw dataResponse(
      { message: 'Not found.' },
      { status: 404, statusText: 'Not Found' }
    );
  }

  const doc = await prisma.document.findFirst({
    where: {
      id: params.documentId,
      // Only an opened collaborative draft has contributions to break down.
      ...collaborationRoomWhere(),
      AND: [documentReadWhere({ profileId: profile.id, isAdmin })],
    },
    select: {
      id: true,
      title: true,
      assignment: { select: { id: true, title: true } },
      group: {
        select: {
          label: true,
          classAssignmentId: true,
          classAssignment: { select: { classId: true } },
          members: {
            where: { removedAt: null },
            orderBy: { membershipId: 'asc' },
            select: {
              membershipId: true,
              membership: {
                select: { user: { select: { name: true, email: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!doc) {
    // Indistinguishable from nonexistent for anyone who does not teach it.
    throw dataResponse(
      { message: 'Draft not found.' },
      { status: 404, statusText: 'Not Found' }
    );
  }

  const roster = (doc.group?.members ?? []).map((member) => ({
    membershipId: member.membershipId,
    name:
      member.membership.user.name?.trim() || member.membership.user.email,
  }));

  const breakdown = await buildContributionBreakdown({
    documentId: doc.id,
    roster,
  });

  return dataResponse({
    documentId: doc.id,
    title: doc.assignment?.title ?? doc.title ?? 'Shared draft',
    groupLabel: doc.group?.label ?? 'Group',
    backTo: doc.group?.classAssignmentId
      ? `/app/class-assignments/${doc.group.classAssignmentId}/groups`
      : '/app',
    breakdown,
  });
}

export default function GroupDraftRoute() {
  const data = useLoaderData<typeof loader>();

  return (
    // The app shell hands each page a fixed-height box and expects the page to
    // own its scrolling.
    <div className="no-scrollbar h-full w-full overflow-y-scroll">
      <div className="mx-auto w-full max-w-5xl p-6">
        <div className="mb-4">
          <Button asChild variant="ghost" size="sm">
            <Link to={data.backTo} className="w-fit">
              <ArrowLeft className="mr-1 h-4 w-4" /> Back to groups
            </Link>
          </Button>
        </div>

        <header className="mb-6">
          <h1 className="text-xl font-semibold">{data.title}</h1>
          <p className="text-sm text-muted-foreground">
            {data.groupLabel} · who wrote what
          </p>
        </header>

        <ContributionPanel breakdown={data.breakdown} />
      </div>
    </div>
  );
}
