import { Clock } from 'lucide-react';
import { Link } from 'react-router';
import { approvalSentDate } from '~/domain/free-tier/approval-waiting';
import { useTeachingAccess } from '~/components/free-tier/teaching-access-context';

export function LockedDashboardPendingCard() {
  const { state } = useTeachingAccess();
  if (state.variant !== 'locked') return null;

  const adminName = state.adminName;
  const sentLabel =
    state.approvalFirstSentAt != null
      ? `Sent on ${approvalSentDate(state.approvalFirstSentAt)}.`
      : null;

  return (
    <section
      className="rounded-xl border bg-popover p-5 shadow-sm"
      data-testid="locked-dashboard-pending-card"
      aria-label="Approval request"
    >
      <div className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary"
          aria-hidden
        >
          <Clock className="h-4 w-4 text-foreground" />
        </span>
        <p className="text-[15px] font-semibold leading-snug">
          Request sent to {adminName}
        </p>
      </div>
      {sentLabel ? (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {sentLabel} It may be a good idea to give {adminName} a quick heads-up
          so the email doesn&apos;t get buried. We&apos;ll let you know the
          moment they approve.
        </p>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          It may be a good idea to give {adminName} a quick heads-up so the
          email doesn&apos;t get buried. We&apos;ll let you know the moment they
          approve.
        </p>
      )}
      <p className="mt-4 text-[13px] text-muted-foreground">
        Not the right person?{' '}
        <Link
          to="/app/free-tier/pending?ask=1"
          className="font-medium text-primary underline underline-offset-2"
        >
          Send to an additional administrator
        </Link>
      </p>
    </section>
  );
}
