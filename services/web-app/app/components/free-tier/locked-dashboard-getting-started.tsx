import { useEffect, useState } from 'react';
import { useFetcher, useRevalidator } from 'react-router';
import { LOCKED_DASHBOARD_GETTING_STARTED_TITLE } from '~/domain/free-tier/locked-dashboard-copy';
import { teacherPendingForwardError } from '~/domain/free-tier/admin-approval-copy';
import { FreeTierGettingStartedTimeline } from '~/components/free-tier/free-tier-getting-started-timeline';
import { useTeachingAccess } from '~/components/free-tier/teaching-access-context';
import { PendingForwardDisclosure } from '~/routes/free-tier/PendingForwardDisclosure';
import { approvalForwardError } from '~/routes/free-tier/ApprovalForwardForm';

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

const STEPS = [
  { key: 'awaiting', label: 'Awaiting administrative approval', current: true },
  { key: 'approved', label: 'Administrator approved', current: false },
  { key: 'assignment', label: 'Create your first assignment', current: false },
  { key: 'invite', label: 'Invite students', current: false },
] as const;

export function LockedDashboardGettingStarted() {
  const { state } = useTeachingAccess();
  const fetcher = useFetcher<ForwardActionData>();
  const revalidator = useRevalidator();
  const [forwardOpen, setForwardOpen] = useState(false);
  const actionData = fetcher.data;
  const forwarding = fetcher.state !== 'idle';

  useEffect(() => {
    if (isForwardActionError(actionData)) setForwardOpen(true);
  }, [actionData]);

  useEffect(() => {
    if (actionData?.ok && 'queued' in actionData) {
      setForwardOpen(false);
      revalidator.revalidate();
    }
  }, [actionData, revalidator]);

  const currentIndex = STEPS.findIndex((step) => step.current);
  const stepNumber = currentIndex >= 0 ? currentIndex + 1 : 1;

  const showForward =
    state.variant === 'locked' &&
    state.forwardDisclosureAvailable &&
    state.adminEmail &&
    state.pendingApprovalId;

  const awaitingForward =
    showForward && state.variant === 'locked' ? (
      <>
        <PendingForwardDisclosure
          triggerVariant="timeline"
          currentAdminName={state.adminName}
          currentAdminEmail={state.adminEmail!}
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
                  adminName: state.adminName,
                })
              : null
          }
          forwardRetry={
            isForwardActionError(actionData) &&
            (actionData.reason === 'unavailable' ||
              actionData.reason === 'email_failed')
          }
        />
        {actionData?.ok && 'queued' in actionData && actionData.adminName ? (
          <p role="status" className="mt-2 text-xs font-normal text-muted-foreground">
            Request sent to {actionData.adminName}!
          </p>
        ) : null}
      </>
    ) : null;

  return (
    <FreeTierGettingStartedTimeline
      title={LOCKED_DASHBOARD_GETTING_STARTED_TITLE}
      progressLabel={`Step ${stepNumber} of ${STEPS.length}`}
      testId="locked-dashboard-getting-started"
      steps={STEPS.map((step) => ({
        key: step.key,
        label: step.label,
        state: step.current ? 'current' : 'upcoming',
        content: step.key === 'awaiting' ? awaitingForward : undefined,
      }))}
    />
  );
}
