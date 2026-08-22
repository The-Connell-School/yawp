/**
 * Who in a group has pressed Submit, and what to tell them about it.
 *
 * A shared draft is one artefact with several authors, and submitting it ends
 * everybody's chance to change it. Letting whoever presses first submit for the
 * group means one student can end another student's work mid-sentence — the
 * collaborative equivalent of handing in a partner's paper. So a press is a
 * signal from one member, and the draft goes to the teacher only when every
 * active member has signalled.
 *
 * Pure on purpose: the server decides from these functions whether to create a
 * `Submission`, and the page renders the same numbers from the same function, so
 * what a student reads on screen cannot disagree with what the server did.
 */

export type GroupSubmitMemberInput = {
  membershipId: string;
  name: string | null;
  /** When this member pressed Submit for the current round; null if they have not. */
  submittedAt: Date | string | null;
};

export type GroupSubmitMember = {
  membershipId: string;
  name: string;
  submitted: boolean;
  submittedAt: string | null;
  isViewer: boolean;
};

export type GroupSubmitReadiness = {
  members: GroupSubmitMember[];
  total: number;
  submittedCount: number;
  /** Active members who have not pressed yet, in roster order. */
  waitingOn: GroupSubmitMember[];
  everyoneSubmitted: boolean;
  viewerSubmitted: boolean;
  viewerIsMember: boolean;
};

/** A student with no name on their account is still someone in the group. */
const displayName = (name: string | null) => name?.trim() || 'A classmate';

const asIsoString = (value: Date | string | null) => {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
};

export function summarizeGroupSubmitReadiness({
  members,
  viewerMembershipId,
}: {
  /**
   * ACTIVE members only — callers filter `removedAt: null`. A student who was
   * moved out of the group must not be able to hold their old group's draft
   * hostage by never pressing.
   */
  members: GroupSubmitMemberInput[];
  viewerMembershipId: string | null;
}): GroupSubmitReadiness {
  const rows: GroupSubmitMember[] = members.map((member) => ({
    membershipId: member.membershipId,
    name: displayName(member.name),
    submitted: Boolean(member.submittedAt),
    submittedAt: asIsoString(member.submittedAt),
    isViewer: member.membershipId === viewerMembershipId,
  }));

  const waitingOn = rows.filter((member) => !member.submitted);
  const viewer = rows.find((member) => member.isViewer) ?? null;

  return {
    members: rows,
    total: rows.length,
    submittedCount: rows.length - waitingOn.length,
    waitingOn,
    // An empty roster reads as ready rather than as permanently blocked: with
    // nobody left to press, "wait for everyone" would wedge the draft shut.
    everyoneSubmitted: waitingOn.length === 0,
    viewerSubmitted: Boolean(viewer?.submitted),
    viewerIsMember: Boolean(viewer),
  };
}

/** "Taylor", "Taylor and Alex", "Taylor, Alex and Sam". */
export function joinNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The sentence a student reads next to the button.
 *
 * Written to answer the question a student actually has — "has this been handed
 * in yet, and if not, why not?" — in one line, naming the classmates the group
 * is waiting on so nobody has to guess who to nudge.
 */
export function describeGroupSubmitProgress(
  readiness: GroupSubmitReadiness
): string {
  const { total, submittedCount, waitingOn, viewerSubmitted, viewerIsMember } =
    readiness;

  // A shared draft with one active writer behaves like solo work; counting "1 of
  // 1" at them would be noise.
  if (total <= 1) {
    return readiness.everyoneSubmitted
      ? 'Submitted to your teacher.'
      : 'Pressing Submit sends this draft to your teacher.';
  }

  if (readiness.everyoneSubmitted) {
    return `Everyone in your group has submitted, so this draft has gone to your teacher.`;
  }

  const others = waitingOn.filter((member) => !member.isViewer);
  const othersLabel = joinNames(others.map((member) => member.name));
  const count = `${submittedCount} of ${total}`;

  if (viewerSubmitted) {
    return `You have submitted. ${count} in your group have — nothing goes to your teacher until ${othersLabel} ${
      others.length === 1 ? 'does' : 'do'
    } too.`;
  }

  if (!viewerIsMember) {
    return `${count} members of this group have submitted. The draft goes to the teacher once ${othersLabel} ${
      others.length === 1 ? 'has' : 'have'
    } too.`;
  }

  const waitingLabel = othersLabel ? `you and ${othersLabel}` : 'you';

  return `${count} in your group have submitted — nothing goes to your teacher until ${waitingLabel} press Submit as well.`;
}

/**
 * What the teacher's page says about a group that has not submitted.
 *
 * Names, not a count: "waiting on Devon" is something a teacher can act on in
 * the next thirty seconds, and "1 of 2" is not.
 */
export function describeGroupSubmitWaiting(waitingNames: string[]): string {
  if (waitingNames.length === 0) {
    return 'Nobody in this group has pressed Submit yet.';
  }
  return `Waiting on ${joinNames(waitingNames)}. A shared draft goes in only once every member has pressed.`;
}

/**
 * What a teacher is asked to confirm before submitting for a group.
 *
 * Names who has not pressed, so the override is a decision about a specific
 * situation rather than a generic button — and says plainly what it costs the
 * students, because it ends their editing and they will be told who did it.
 */
export function describeTeacherSubmitConfirmation(
  waitingNames: string[]
): string {
  const who =
    waitingNames.length === 0
      ? 'Nobody in this group has pressed Submit.'
      : `${joinNames(waitingNames)} ${
          waitingNames.length === 1 ? 'has' : 'have'
        } not pressed Submit.`;

  // Deliberately not "this ends their editing": the room stays open after a
  // submission, and what is graded is the snapshot taken now. Saying otherwise
  // would be a promise the page does not keep.
  return `${who} What the group has written so far is what gets handed in, and they will see that you submitted it for them.`;
}
