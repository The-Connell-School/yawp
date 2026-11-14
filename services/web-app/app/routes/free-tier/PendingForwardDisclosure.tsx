import { useRef } from 'react';
import type { FetcherWithComponents } from 'react-router';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { PendingApprovalForwardForm } from './PendingApprovalForwardForm';

export function PendingForwardDisclosure({
  currentAdminName,
  currentAdminEmail,
  approvalId,
  open,
  onOpenChange,
  forwarding,
  serverAlert,
  forwardRetry = false,
  schoolName,
  triggerVariant = 'pending-page',
  fetcher,
  formAction,
}: {
  currentAdminName: string;
  currentAdminEmail: string;
  approvalId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  forwarding: boolean;
  serverAlert?: string | null;
  forwardRetry?: boolean;
  schoolName: string;
  triggerVariant?: 'pending-page' | 'dashboard-rail' | 'timeline';
  fetcher?: FetcherWithComponents<unknown>;
  formAction?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);

  const triggerLabel =
    triggerVariant === 'timeline'
      ? 'Send to another administrator'
      : triggerVariant === 'dashboard-rail'
        ? 'Send to an additional administrator'
        : 'Not the right person?';

  return (
    <div
      className={`free-tier-pending-forward${
        triggerVariant === 'timeline' ? ' free-tier-pending-forward-timeline' : ''
      }`}
      data-testid="pending-forward-disclosure"
    >
      <button
        type="button"
        ref={triggerRef}
        className="free-tier-pending-forward-trigger"
        aria-haspopup="dialog"
        onClick={() => onOpenChange(true)}
      >
        <span>{triggerLabel}</span>
      </button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="sm:max-w-md"
          data-testid="pending-forward-modal"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Send to a different administrator</DialogTitle>
            <DialogDescription>
              We&apos;ll forward your request and stop reminders to{' '}
              {currentAdminName}.
            </DialogDescription>
          </DialogHeader>
          <PendingApprovalForwardForm
            approvalId={approvalId}
            forwarding={forwarding}
            currentAdminEmail={currentAdminEmail}
            currentAdminName={currentAdminName}
            schoolName={schoolName}
            serverAlert={serverAlert}
            forwardRetry={forwardRetry}
            fetcher={fetcher}
            formAction={formAction}
            onCancel={() => onOpenChange(false)}
            focusNameOnMount={open}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
