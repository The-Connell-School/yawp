import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { PendingApprovalForwardForm } from './PendingApprovalForwardForm';

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduced;
}

export function PendingForwardDisclosure({
  currentAdminName,
  currentAdminEmail,
  approvalId,
  open,
  onOpenChange,
  forwarding,
  serverAlert,
  schoolName,
}: {
  currentAdminName: string;
  currentAdminEmail: string;
  approvalId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  forwarding: boolean;
  serverAlert?: string | null;
  schoolName: string;
}) {
  const panelId = useId();
  const buttonId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const durationMs = open ? 200 : 160;
  const closedInert = !open && !reducedMotion;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChange(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  return (
    <div
      className="free-tier-pending-forward"
      data-testid="pending-forward-disclosure"
    >
      <button
        type="button"
        id={buttonId}
        ref={triggerRef}
        className="free-tier-pending-forward-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
      >
        <span>Not the right person?</span>
        <span
          aria-hidden
          className={`free-tier-pending-forward-chevron-wrap${
            open ? ' free-tier-pending-forward-chevron-wrap-open' : ''
          }${reducedMotion ? ' free-tier-pending-forward-chevron-wrap-reduced' : ''}`}
          style={
            reducedMotion ? undefined : { transitionDuration: `${durationMs}ms` }
          }
        >
          <ChevronDown className="free-tier-pending-forward-chevron" />
        </span>
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        {...(closedInert ? ({ inert: '' } as Record<string, string>) : {})}
        className={`free-tier-pending-forward-panel${
          open ? ' free-tier-pending-forward-panel-open' : ''
        }${reducedMotion ? ' free-tier-pending-forward-panel-reduced' : ''}`}
        style={
          reducedMotion
            ? { display: open ? 'block' : 'none' }
            : { transitionDuration: `${durationMs}ms` }
        }
      >
        <div className="free-tier-pending-forward-panel-inner">
          <div className="free-tier-pending-forward-panel-surface">
            <h2 className="text-sm font-semibold text-card-foreground">
              Send to a different administrator
            </h2>
            <p className="text-sm text-muted-foreground">
              We&apos;ll forward your request and stop reminders to{' '}
              {currentAdminName}.
            </p>
            <PendingApprovalForwardForm
              approvalId={approvalId}
              forwarding={forwarding}
              currentAdminEmail={currentAdminEmail}
              currentAdminName={currentAdminName}
              schoolName={schoolName}
              serverAlert={serverAlert}
              onCancel={() => {
                onOpenChange(false);
                triggerRef.current?.focus();
              }}
              focusNameOnMount={open}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
