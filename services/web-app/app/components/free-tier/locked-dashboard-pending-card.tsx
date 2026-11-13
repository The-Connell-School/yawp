import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFetcher, useRevalidator } from 'react-router';
import { approvalSentDate } from '~/domain/free-tier/approval-waiting';
import { teacherPendingForwardError } from '~/domain/free-tier/admin-approval-copy';
import { approvalForwardError } from '~/routes/free-tier/ApprovalForwardForm';
import { useTeachingAccess } from '~/components/free-tier/teaching-access-context';
import { PendingForwardDisclosure } from '~/routes/free-tier/PendingForwardDisclosure';

const FORWARD_ERROR_REASONS = new Set([
  'validation',
  'same_as_teacher',
  'same_administrator',
  'chain_cap',
  'email_failed',
  'superseded',
  'rate_limited',
  'unavailable',
]);

type ForwardActionData =
  | { ok: true; queued?: true; adminName?: string }
  | { ok: false; reason: string };

function isForwardActionError(
  data: ForwardActionData | undefined
): data is { ok: false; reason: string } {
  return Boolean(
    data &&
      !data.ok &&
      'reason' in data &&
      typeof data.reason === 'string' &&
      FORWARD_ERROR_REASONS.has(data.reason)
  );
}

function pendingForwardAlertMessage(
  reason: string,
  ctx: { schoolName: string; adminName?: string }
) {
  switch (reason) {
    case 'same_as_teacher':
    case 'same_administrator':
    case 'chain_cap':
    case 'email_failed':
      return teacherPendingForwardError({
        reason,
        schoolName: ctx.schoolName,
        adminName: ctx.adminName,
      });
    default:
      return approvalForwardError(reason, {
        pass1: false,
        schoolName: ctx.schoolName,
        adminName: ctx.adminName,
      });
  }
}

export function LockedDashboardPendingCard() {
  const { state } = useTeachingAccess();
  const fetcher = useFetcher<ForwardActionData>();
  const revalidator = useRevalidator();
  const [forwardOpen, setForwardOpen] = useState(false);
  const locked = state.variant === 'locked';
  const actionData = fetcher.data;

  useEffect(() => {
    if (!locked) return;
    if (isForwardActionError(actionData)) setForwardOpen(true);
  }, [actionData, locked]);

  useEffect(() => {
    if (!locked) return;
    if (actionData?.ok && 'queued' in actionData) {
      setForwardOpen(false);
      revalidator.revalidate();
    }
  }, [actionData, locked, revalidator]);

  if (!locked) return null;

  const adminName = state.adminName;
  const adminEmail = state.adminEmail ?? undefined;
  const sentLabel =
    state.approvalFirstSentAt != null
      ? `Sent on ${approvalSentDate(state.approvalFirstSentAt)}.`
      : null;
  const forwarding = fetcher.state !== 'idle';

  return (
    <section
      className="rounded-xl border bg-popover p-5 shadow-sm"
      data-testid="locked-dashboard-pending-card"
      aria-label="Approval request"
    >
      <div className="flex items-start gap-2">
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <h2 className="text-base font-semibold leading-snug text-foreground">
          Awaiting approval from {adminName}
        </h2>
      </div>
      {sentLabel ? (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {sentLabel} It may be a good idea to give {adminName} a quick heads-up
          so the email doesn&apos;t get buried. We&apos;ll let you know the
          moment they approve. In the meantime, feel free to explore your
          classroom!
        </p>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          It may be a good idea to give {adminName} a quick heads-up so the
          email doesn&apos;t get buried. We&apos;ll let you know the moment they
          approve. In the meantime, feel free to explore your classroom!
        </p>
      )}
      {state.forwardDisclosureAvailable && adminEmail ? (
        <div className="mt-4">
        <PendingForwardDisclosure
          triggerVariant="dashboard-rail"
          currentAdminName={adminName}
          currentAdminEmail={adminEmail}
          approvalId={state.pendingApprovalId ?? undefined}
          open={forwardOpen}
          onOpenChange={setForwardOpen}
          forwarding={forwarding}
          schoolName={state.schoolName}
          fetcher={fetcher}
          formAction="/app/free-tier/pending"
          serverAlert={
            isForwardActionError(actionData)
              ? pendingForwardAlertMessage(actionData.reason, {
                  schoolName: state.schoolName,
                  adminName,
                })
              : null
          }
          forwardRetry={
            isForwardActionError(actionData) &&
            (actionData.reason === 'unavailable' ||
              actionData.reason === 'email_failed')
          }
        />
        </div>
      ) : null}
      {actionData?.ok && 'queued' in actionData && actionData.adminName ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          Request sent to {actionData.adminName}!
        </p>
      ) : null}
    </section>
  );
}
