import { Check, Clock } from 'lucide-react';
import {
  joinNames,
  type BoardGroupSubmitStatus,
} from '~/domain/collaboration/submit-readiness';

/**
 * Whether one group has handed their draft in, and who is holding it up.
 *
 * A shared draft goes to the teacher only when every member has pressed Submit,
 * which means a group can sit at "2 of 3" indefinitely because one student is
 * absent or has stopped caring. Until this badge existed, that was invisible
 * from the board: a teacher had to open each group's draft page and count. The
 * names matter more than the fraction — "waiting on Devon" is something a
 * teacher can act on before the bell.
 *
 * No router, no fetcher, nothing but props: the board around it is a drag-and-
 * drop surface that cannot be rendered in a unit test, and this is the part
 * worth testing.
 */

const when = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString(undefined, {
        dateStyle: 'short',
        timeStyle: 'short',
      });
};

export function GroupSubmitBadge({
  status,
}: {
  status: BoardGroupSubmitStatus;
}) {
  if (status.submittedAt) {
    return (
      <p
        className="mt-2 flex items-start gap-1.5 text-xs text-emerald-700"
        data-testid="group-board-submit-status"
      >
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Submitted {when(status.submittedAt)}
          {/* Named, because "submitted" alone would hide that the group never
              agreed to it — a teacher looking at this board later, or a
              different teacher, should not have to guess. */}
          {status.submittedByTeacherName
            ? ` · submitted for them by ${status.submittedByTeacherName}`
            : ''}
        </span>
      </p>
    );
  }

  return (
    <p
      className="mt-2 flex items-start gap-1.5 text-xs text-amber-700"
      data-testid="group-board-submit-status"
    >
      <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        {status.submittedCount} of {status.total} submitted
        {status.outstanding.length > 0
          ? ` · waiting on ${joinNames(status.outstanding)}`
          : ''}
      </span>
    </p>
  );
}
