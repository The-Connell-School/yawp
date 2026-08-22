import { useState } from 'react';
import { useFetcher } from 'react-router';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import { Button } from '~/components/ui/button';
import {
  describeGroupSubmitWaiting,
  describeTeacherSubmitConfirmation,
} from '~/domain/collaboration/submit-readiness';

/**
 * Where a group's submission stands, on the teacher's page — and the way to
 * submit it for them.
 *
 * A shared draft goes to the teacher only when every member has pressed Submit.
 * That rule has one failure mode: a group waiting on a student who is absent,
 * has given up, or simply never pressed. Nobody inside the group can resolve
 * that, and the deadline does not move. This is the way out.
 *
 * Two things this deliberately does NOT do:
 *
 * 1. **Not one click.** Submitting ends four students' ability to change their
 *    work. The confirmation names who has not pressed, so the teacher overrides
 *    a specific situation rather than a generic button.
 * 2. **Not silent.** The submission records which teacher did it and the group's
 *    own page says so. A draft that went in without them is something they
 *    should learn from the page, not from a grade.
 */

export type TeacherGroupSubmitState = {
  submittedAt: string | null;
  submittedByTeacherName: string | null;
  readiness: {
    total: number;
    submittedCount: number;
    waitingOn: { membershipId: string; name: string }[];
    everyoneSubmitted: boolean;
  };
};

const when = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
};

export function GroupSubmitStatusPanel({
  documentId,
  state,
}: {
  documentId: string;
  state: TeacherGroupSubmitState;
}) {
  const fetcher = useFetcher<{ success?: boolean; message?: string }>();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const busy = fetcher.state !== 'idle';
  const { readiness, submittedAt, submittedByTeacherName } = state;
  const waiting = readiness.waitingOn.map((member) => member.name);

  if (submittedAt) {
    return (
      <section className="rounded-lg border bg-emerald-50 p-4 text-sm text-emerald-900">
        <h2 className="font-semibold">Submitted</h2>
        <p>
          {when(submittedAt)}
          {submittedByTeacherName
            ? ` · submitted for the group by ${submittedByTeacherName}`
            : ' · the group submitted it themselves'}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border bg-amber-50 p-4 text-sm text-amber-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">
            Not submitted — {readiness.submittedCount} of {readiness.total} have
            pressed Submit
          </h2>
          <p>{describeGroupSubmitWaiting(waiting)}</p>
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => setConfirmOpen(true)}
        >
          Submit for this group
        </Button>
      </div>

      {fetcher.data?.message ? (
        <p
          className="mt-2"
          role={fetcher.data.success === false ? 'alert' : 'status'}
        >
          {fetcher.data.message}
        </p>
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Submit this draft for the group?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {describeTeacherSubmitConfirmation(waiting)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                fetcher.submit(
                  { intent: 'submit-for-group' },
                  { method: 'post', action: `/app/group-drafts/${documentId}` }
                )
              }
            >
              Submit for the group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
