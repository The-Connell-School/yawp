import { CircleAlert, X } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '~/utils/misc';
import {
  TEACHING_ACCESS_ERROR_TOAST_BODY,
  TEACHING_ACCESS_ERROR_TOAST_TITLE,
} from '~/domain/free-tier/teaching-access-copy';
import useBreakpoint from '~/hooks/useBreakpoint';

/** Keeps teaching-access toasts above the demo "Give feedback" control when present. */
export const TEACHING_ACCESS_TOAST_DESKTOP_POSITION =
  'bottom-[var(--teaching-access-toast-bottom,1.5rem)] right-6';

export function ApprovalRequiredToast({
  onDismiss,
  mobilePinned,
}: {
  onDismiss: () => void;
  mobilePinned?: boolean;
}) {
  const breakpoint = useBreakpoint();
  const isMobile = mobilePinned ?? (breakpoint === 'base' || breakpoint === 'sm');
  return (
    <div
      role="alert"
      data-testid="teaching-access-error-toast"
      className={cn(
        'fixed z-[100] w-[min(100%,22rem)] rounded-lg border bg-popover p-4 shadow-lg',
        isMobile
          ? 'left-3 right-3 top-[calc(var(--teaching-access-banner-offset,3.5rem)+0.5rem)]'
          : TEACHING_ACCESS_TOAST_DESKTOP_POSITION
      )}
    >
      <div className="flex gap-3">
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {TEACHING_ACCESS_ERROR_TOAST_TITLE}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {TEACHING_ACCESS_ERROR_TOAST_BODY}
          </p>
          <Link
            to="/app/free-tier/pending"
            className="mt-2 inline-block text-sm text-link underline underline-offset-4"
          >
            View status
          </Link>
        </div>
        <button
          type="button"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
