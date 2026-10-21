import { useFetcher } from 'react-router';
import { Clock } from 'lucide-react';
import type { LockedPreviewShellState } from '~/domain/free-tier/locked-preview-shell.server';
import {
  ApprovalForwardForm,
  approvalForwardError,
} from '~/routes/free-tier/ApprovalForwardForm';
import { approvalMailto } from '~/domain/free-tier/approval-waiting';
import { Button } from '~/components/ui/button';

export function LockedPreviewBanner({
  lockedPreview,
  teacherName,
}: {
  lockedPreview: LockedPreviewShellState;
  teacherName: string;
}) {
  const fetcher = useFetcher<unknown>();
  const resending =
    fetcher.state !== 'idle' && fetcher.formData?.get('intent') === 'resend';
  const actionData = fetcher.data;
  const current = lockedPreview.approvalV2?.approval;
  const adminName = lockedPreview.adminName ?? 'your administrator';
  const title =
    lockedPreview.status === 'MANUAL_REVIEW'
      ? "We're reviewing your request"
      : lockedPreview.sentOnLabel
        ? `Sent to ${adminName} on ${lockedPreview.sentOnLabel}`
        : `Waiting for ${adminName}`;

  return (
    <div
      data-testid="locked-preview-banner"
      className="border-b bg-secondary/50 px-3 py-4 sm:px-5"
    >
      <div className="mx-auto flex w-full max-w-screen-lg flex-col gap-3">
        <div className="flex items-start gap-3">
          <Clock
            className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-sm text-muted-foreground">
              {lockedPreview.message}
            </p>
          </div>
        </div>
        {lockedPreview.canResend ? (
          <div className="flex flex-wrap items-center gap-2">
            <fetcher.Form method="post" action="/app/free-tier/pending">
              <input type="hidden" name="intent" value="resend" />
              <Button type="submit" variant="outline" size="sm" disabled={resending}>
                {resending ? 'Sending…' : 'Resend reminder'}
              </Button>
            </fetcher.Form>
            {current ? (
              <a
                className="text-sm text-primary underline"
                href={approvalMailto({
                  adminEmail: current.adminEmail,
                  adminName: current.adminName,
                  teacherName,
                })}
              >
                Draft an email
              </a>
            ) : null}
          </div>
        ) : null}
        {current && lockedPreview.status === 'SENT' ? (
          <details className="text-sm">
            <summary className="cursor-pointer text-primary underline underline-offset-4">
              Not the right person? Forward this request
            </summary>
            <div className="pt-3">
              <ApprovalForwardForm
                approvalId={current.id}
                busy={fetcher.state !== 'idle'}
                action="/app/free-tier/pending"
              />
            </div>
          </details>
        ) : null}
        {renderActionFeedback(actionData)}
      </div>
    </div>
  );
}

function renderActionFeedback(actionData: unknown) {
  if (!actionData || typeof actionData !== 'object' || !('ok' in actionData)) {
    return null;
  }
  const data = actionData as Record<string, unknown>;
  if (data.ok) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {'queued' in data
          ? 'Request forwarded. We will notify your administrator and email you an update.'
          : 'Reminder sent.'}
      </p>
    );
  }
  if ('rateLimited' in data && data.rateLimited) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Too many resend attempts. Please wait a few minutes and try again.
      </p>
    );
  }
  if (data.reason === 'email_failed') {
    return (
      <p className="text-sm text-destructive" role="alert">
        We could not send the reminder. Try again later or contact
        support@yawp.school.
      </p>
    );
  }
  if (data.reason === 'config') {
    return (
      <p className="text-sm text-destructive" role="alert">
        {typeof data.message === 'string'
          ? data.message
          : 'Free-tier links are temporarily unavailable.'}
      </p>
    );
  }
  if (typeof data.reason === 'string') {
    return (
      <p className="text-sm text-destructive" role="alert">
        {approvalForwardError(data.reason)}
      </p>
    );
  }
  return null;
}
