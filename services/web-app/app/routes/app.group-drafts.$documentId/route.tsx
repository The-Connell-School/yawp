import { invariant } from '@epic-web/invariant';
import { ArrowLeft } from 'lucide-react';
import {
  Link,
  data as dataResponse,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { Button } from '~/components/ui/button';
import {
  DraftCommentError,
  addDraftComment,
  listDraftComments,
  replyToDraftComment,
} from '~/domain/collaboration/comments.server';
import { DraftCommentThread } from '~/domain/collaboration/draft-comments';
import { buildContributionBreakdown } from '~/domain/collaboration/contribution.server';
import {
  GroupGradeError,
  readGroupGrade,
  recordGroupGrade,
} from '~/domain/collaboration/group-grade.server';
import {
  MemberGradeError,
  readMemberGrades,
  recordMemberGrade,
} from '~/domain/collaboration/member-grades.server';
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
          id: true,
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

  const [breakdown, grades, groupGrade, comments] = await Promise.all([
    buildContributionBreakdown({ documentId: doc.id, roster }),
    doc.group ? readMemberGrades({ groupId: doc.group.id }) : new Map(),
    readGroupGrade({ documentId: doc.id }),
    listDraftComments({ documentId: doc.id, documentLevelOnly: true }),
  ]);

  return dataResponse({
    documentId: doc.id,
    groupId: doc.group?.id ?? null,
    grades: Object.fromEntries(grades),
    groupGrade,
    comments,
    // Empty string, not null, is what a freshly created document carries, so
    // `??` would let a blank title through.
    title: doc.assignment?.title?.trim() || doc.title?.trim() || 'Shared draft',
    groupLabel: doc.group?.label ?? 'Group',
    backTo: doc.group?.classAssignmentId
      ? `/app/class-assignments/${doc.group.classAssignmentId}/groups`
      : '/app',
    breakdown,
  });
}

/**
 * Recording one student's individual grade.
 *
 * A fetcher submission per student, so grading one does not disturb a comment
 * being typed for another, and so nothing navigates mid-marking.
 */
export async function action({ request, params }: ActionFunctionArgs) {
  invariant(params.documentId, 'No document id provided');

  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const isAdmin = await getIsPlatformAdmin(userId);

  if (profile.role !== 'TEACHER' && !isAdmin) {
    return dataResponse(
      { success: false, message: 'Only teachers can grade.' },
      { status: 403 }
    );
  }

  // Re-derive the group from the document under the same scope the loader uses,
  // rather than trusting a group id posted from the form.
  const doc = await prisma.document.findFirst({
    where: {
      id: params.documentId,
      ...collaborationRoomWhere(),
      AND: [documentReadWhere({ profileId: profile.id, isAdmin })],
    },
    select: { group: { select: { id: true } } },
  });

  if (!doc?.group) {
    return dataResponse(
      { success: false, message: 'Draft not found.' },
      { status: 404 }
    );
  }

  const formData = await request.formData();
  const intent = formData.get('intent')?.toString();

  // Commenting is the teacher's whole channel into a group's draft: they never
  // write in it, so this is how they say anything at all about the work.
  if (intent === 'add-comment' || intent === 'reply-comment') {
    try {
      if (intent === 'add-comment') {
        await addDraftComment({
          documentId: params.documentId,
          membershipId: profile.id,
          content: formData.get('content')?.toString() ?? '',
        });
      } else {
        await replyToDraftComment({
          documentId: params.documentId,
          commentId: formData.get('commentId')?.toString() ?? '',
          membershipId: profile.id,
          content: formData.get('content')?.toString() ?? '',
        });
      }
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

  const releaseRaw = formData.get('release')?.toString();
  const release = releaseRaw === undefined ? undefined : releaseRaw === 'true';

  // The group's own grade: one judgement of the draft, shared by everyone.
  if (intent === 'group-grade') {
    try {
      await recordGroupGrade({
        documentId: params.documentId,
        gradedByMembershipId: profile.id,
        score: formData.get('score')?.toString() ?? null,
        feedback: formData.get('feedback')?.toString() ?? null,
        release,
      });
      return dataResponse({ success: true });
    } catch (error) {
      if (error instanceof GroupGradeError) {
        return dataResponse(
          { success: false, message: error.message },
          { status: 400 }
        );
      }
      throw error;
    }
  }

  const membershipId = formData.get('membershipId')?.toString();
  if (!membershipId) {
    return dataResponse(
      { success: false, message: 'No student to grade.' },
      { status: 400 }
    );
  }

  try {
    await recordMemberGrade({
      groupId: doc.group.id,
      membershipId,
      gradedByMembershipId: profile.id,
      score: formData.get('score')?.toString() ?? null,
      feedback: formData.get('feedback')?.toString() ?? null,
      release,
      useGroupGrade: formData.get('useGroupGrade')?.toString() === 'true',
    });
  } catch (error) {
    if (error instanceof MemberGradeError) {
      return dataResponse(
        { success: false, message: error.message },
        { status: 400 }
      );
    }
    throw error;
  }

  return dataResponse({ success: true, membershipId });
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

        <div className="grid gap-6">
          <ContributionPanel
            breakdown={data.breakdown}
            grades={data.grades}
            groupGrade={data.groupGrade}
          />
          {/* The teacher writes here; the group replies from their own page. */}
          <DraftCommentThread
            comments={data.comments}
            canComment
            canReply
          />
        </div>
      </div>
    </div>
  );
}
