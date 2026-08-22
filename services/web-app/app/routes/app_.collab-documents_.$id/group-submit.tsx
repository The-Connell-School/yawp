import { Check, Clock } from 'lucide-react';
import type { ComponentType } from 'react';
import { Button } from '~/components/ui/button';
import {
  describeGroupSubmitProgress,
  type GroupSubmitReadiness,
} from '~/domain/collaboration/submit-readiness';

/**
 * Telling a group where their submission stands.
 *
 * The rule — every member presses before the draft goes to the teacher — is only
 * safe if students can see it working. A button that says "Submit" and then
 * "Submitted" would describe a submission that has not happened, and a student
 * who believes their work is in is a student who stops working on it.
 *
 * So the page says three things at once, and never only one of them:
 *
 * 1. the button says what this press does — submit *your* part, not the group's;
 * 2. the strip under the nav says how many have pressed and who is left;
 * 3. the roster says which of those people is you.
 *
 * Presentational on purpose. The fetcher lives in the route, because the button
 * belongs in the nav and the strip belongs under it, and one fetcher has to
 * drive both.
 */

export type GroupSubmitState = {
  readiness: GroupSubmitReadiness;
  /** ISO timestamp of the group's submission, or null while it is still theirs. */
  submittedAt: string | null;
  /**
   * The teacher who submitted it for the group, when that is how it went in.
   * Null when the group completed it themselves — which is all but one case, and
   * the difference is one students are owed.
   */
  submittedByTeacherName?: string | null;
};

/**
 * A fetcher, or anything shaped enough like one to render a form — so these
 * components can be rendered in a test without a router around them.
 */
type FormLike = {
  // `any` rather than a hand-written props type: react-router's fetcher Form is
  // a forwardRef component whose propTypes make a narrower signature
  // unassignable, and pinning it exactly would tie this file to the router's
  // internal types for no gain.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Form: ComponentType<any>;
  state: 'idle' | 'loading' | 'submitting';
};

/** " at 22 Aug 2026, 11:00", or nothing at all if the timestamp is unreadable. */
const submittedWhen = (submittedAt: string) => {
  const date = new Date(submittedAt);
  if (Number.isNaN(date.getTime())) return '';
  return ` at ${date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })}`;
};

const submittedLabel = (submittedAt: string) =>
  `Submitted to your teacher${submittedWhen(submittedAt)}.`;

export function GroupSubmitButton({
  docId,
  fetcher,
  state,
}: {
  docId: string;
  fetcher: FormLike;
  state: GroupSubmitState;
}) {
  const busy = fetcher.state !== 'idle';
  const { readiness, submittedAt } = state;
  const submitted = Boolean(submittedAt);
  const solo = readiness.total <= 1;

  if (submitted) {
    return (
      <Button type="button" size="sm" variant="outline" disabled>
        Submitted
      </Button>
    );
  }

  // Already pressed, still waiting on somebody: the only thing left to offer is
  // the way back out.
  if (readiness.viewerSubmitted) {
    return (
      <fetcher.Form
        method="post"
        action={`/api/collab/${docId}/submit`}
        className="flex shrink-0 items-center gap-2"
      >
        <input type="hidden" name="intent" value="withdraw" />
        <span className="text-sm font-medium text-emerald-700">
          You submitted
        </span>
        <Button type="submit" size="sm" variant="outline" disabled={busy}>
          Undo my submit
        </Button>
      </fetcher.Form>
    );
  }

  return (
    <fetcher.Form
      method="post"
      action={`/api/collab/${docId}/submit`}
      className="shrink-0"
    >
      <input type="hidden" name="intent" value="submit" />
      <Button type="submit" size="sm" disabled={busy}>
        {/* Named for what it actually does. "Submit" alone, on a draft several
            people are writing, reads as submitting the whole thing. */}
        {solo ? 'Submit' : 'Submit my part'}
      </Button>
    </fetcher.Form>
  );
}

/**
 * The strip under the nav. Always present on a group draft, because the count is
 * the answer to "is this handed in?" and that question should never require a
 * click.
 */
export function GroupSubmitBanner({ state }: { state: GroupSubmitState }) {
  const { readiness, submittedAt } = state;
  const submitted = Boolean(submittedAt);

  if (submitted) {
    // Who submitted it matters here in a way it never does on solo work: a draft
    // that went in while you were still writing is not the same event as one
    // your group agreed to, and the page must not blur the two.
    if (state.submittedByTeacherName) {
      return (
        <p
          className="border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900"
          role="status"
        >
          {state.submittedByTeacherName} submitted this draft for your group
          {submittedWhen(submittedAt!)}. What your group had written by then is
          what your teacher has — talk to them if that is not what you expected.
        </p>
      );
    }

    return (
      <p
        className="border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900"
        role="status"
      >
        {submittedLabel(submittedAt!)}
        {readiness.total > 1 ? ' Everyone in your group pressed Submit.' : null}
      </p>
    );
  }

  // A shared draft with one active writer is solo work; a progress bar reading
  // "0 of 1" would be noise on the page.
  if (readiness.total <= 1) return null;

  return (
    <div
      className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900"
      role="status"
    >
      <p className="font-medium">
        Not submitted yet — {readiness.submittedCount} of {readiness.total} in{' '}
        {/* A teacher reading a group's draft sees the same count, and "your
            group" would be wrong for them. */}
        {readiness.viewerIsMember ? 'your group' : 'this group'} have pressed
        Submit.
      </p>
      <p>{describeGroupSubmitProgress(readiness)}</p>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {readiness.members.map((member) => (
          <li
            key={member.membershipId}
            className="flex items-center gap-1.5"
            // Screen readers get the same two facts the icon carries.
            aria-label={`${member.name}${member.isViewer ? ' (you)' : ''}: ${
              member.submitted ? 'submitted' : 'not submitted yet'
            }`}
          >
            {member.submitted ? (
              <Check className="h-4 w-4 text-emerald-700" aria-hidden />
            ) : (
              <Clock className="h-4 w-4 text-amber-700" aria-hidden />
            )}
            <span className={member.submitted ? 'line-through opacity-70' : ''}>
              {member.name}
              {member.isViewer ? ' (you)' : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
