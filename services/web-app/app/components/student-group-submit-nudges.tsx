import { Clock } from 'lucide-react';
import { Link } from 'react-router';
import {
  describeGroupSubmitNudge,
  type GroupSubmitReadiness,
} from '~/domain/collaboration/submit-readiness';

/**
 * "Your group is waiting on you", on the dashboard.
 *
 * A shared draft goes to the teacher only when every member has pressed Submit.
 * Everywhere else that rule is visible — the draft page, the teacher's board —
 * requires already being on the page in question. A student who pressed and
 * walked away, and a student who never pressed at all, both believe they are
 * done. This is the only surface that reaches them.
 *
 * Ordered so the ones the student can act on come first: their own press is the
 * only thing here they control. The rest are there so they know who to chase,
 * which is the difference between a group missing a deadline and a group
 * sending one message.
 */

export type StudentGroupSubmitNudge = {
  documentId: string;
  title: string;
  groupLabel: string;
  waitingOnViewer: boolean;
  readiness: GroupSubmitReadiness;
};

export function StudentGroupSubmitNudges({
  nudges,
}: {
  nudges: StudentGroupSubmitNudge[];
}) {
  if (nudges.length === 0) return null;

  return (
    <section className="mb-4" data-testid="student-group-submit-nudges">
      <p className="my-2 text-foreground/60">Group work waiting to go in</p>
      <ul className="grid gap-2">
        {nudges.map((nudge) => (
          <li key={nudge.documentId}>
            <Link
              to={`/app/collab-documents/${nudge.documentId}?exitTo=/app`}
              className={`flex items-start gap-2 rounded border p-3 text-sm hover:bg-muted/50 ${
                nudge.waitingOnViewer
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : ''
              }`}
            >
              <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                <span className="font-medium">
                  {nudge.title} · {nudge.groupLabel}
                </span>
                <br />
                {describeGroupSubmitNudge(nudge.readiness)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
