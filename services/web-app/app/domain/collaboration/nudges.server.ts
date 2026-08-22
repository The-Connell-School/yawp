import { prisma } from '~/utils/db.server';
import { collaborationRoomWhere } from './room.server';
import {
  summarizeGroupSubmitReadiness,
  type GroupSubmitReadiness,
} from './submit-readiness';

/**
 * Shared drafts a student's group has not handed in yet.
 *
 * The last gap in "every member presses Submit". The rule is visible on the
 * draft page and on the teacher's board, but a student who is being waited on —
 * or who is waiting — learns nothing unless they happen to open the draft. A
 * group can therefore miss a deadline while every member believes they are done.
 *
 * This is an in-app nudge on the dashboard rather than an email. Two reasons,
 * both worth stating because the email version is the obvious first instinct:
 * there is no background scheduler in this app, so a "you are holding up your
 * group" email would have to be sent from whatever request happened to notice,
 * which is nobody's idea of a mail schedule; and mailing K-12 students is a
 * product and compliance decision (COPPA, and whatever a school's own rules
 * say), not one to make inside a UI change.
 */

export type GroupSubmitNudge = {
  documentId: string;
  /** What the student calls this piece of work. */
  title: string;
  groupLabel: string;
  /** True when this student is one of the people the group is waiting on. */
  waitingOnViewer: boolean;
  readiness: GroupSubmitReadiness;
};

export async function listGroupSubmitNudges({
  membershipId,
}: {
  membershipId: string;
}): Promise<GroupSubmitNudge[]> {
  const drafts = await prisma.document.findMany({
    where: {
      deletedAt: null,
      // The same room predicate everything else uses, so a draft whose
      // assignment or organization is outside the pilot cannot surface here.
      ...collaborationRoomWhere(),
      AND: [
        // Membership, not `documentAuthorWhere`: that also matches the nominal
        // owner of a draft, and being the row's owner is not the same as being
        // one of the people whose press is still wanted.
        {
          group: {
            is: { members: { some: { membershipId, removedAt: null } } },
          },
        },
        // Nothing to press once it is in. A dashboard that nags about work
        // already handed in is a dashboard students learn to scroll past.
        { submissions: { none: { unsubmittedAt: null } } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      assignment: { select: { title: true } },
      group: {
        select: {
          label: true,
          members: {
            where: { removedAt: null },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: {
              membershipId: true,
              submittedAt: true,
              membership: { select: { user: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });

  const nudges: GroupSubmitNudge[] = [];
  for (const draft of drafts) {
    if (!draft.group) continue;

    const readiness = summarizeGroupSubmitReadiness({
      members: draft.group.members.map((member) => ({
        membershipId: member.membershipId,
        name: member.membership.user.name,
        submittedAt: member.submittedAt,
      })),
      viewerMembershipId: membershipId,
    });

    // Everyone has pressed but no submission exists yet: the two are written in
    // the same breath, so this is a page loaded in the gap between them. Saying
    // "waiting on nobody" would be worse than saying nothing.
    if (readiness.everyoneSubmitted) continue;

    nudges.push({
      documentId: draft.id,
      title:
        draft.assignment?.title?.trim() ||
        draft.title?.trim() ||
        'Shared draft',
      groupLabel: draft.group.label,
      waitingOnViewer: !readiness.viewerSubmitted,
      readiness,
    });
  }

  // The ones this student can act on come first: their own press is the only
  // thing on this list they control.
  return nudges.sort(
    (a, b) => Number(b.waitingOnViewer) - Number(a.waitingOnViewer)
  );
}
