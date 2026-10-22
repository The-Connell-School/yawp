import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { AlertCircle } from 'lucide-react';
import {
  TEACHING_APPROVAL_REQUIRED_ALERT_BODY,
  TEACHING_APPROVAL_REQUIRED_ALERT_TITLE,
} from '~/domain/free-tier/teaching-access-copy';

export function TeachingApprovalRequiredAlert() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      data-testid="teaching-approval-required-alert"
      className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 outline-none"
    >
      <div className="flex gap-3">
        <AlertCircle
          className="mt-0.5 size-5 shrink-0 text-destructive"
          aria-hidden
        />
        <div className="space-y-2 text-sm">
          <p className="font-semibold text-foreground">
            {TEACHING_APPROVAL_REQUIRED_ALERT_TITLE}
          </p>
          <p className="text-muted-foreground">
            {TEACHING_APPROVAL_REQUIRED_ALERT_BODY}
          </p>
          <Link
            to="/app/free-tier/pending"
            className="font-medium text-primary underline underline-offset-4"
          >
            View status
          </Link>
        </div>
      </div>
    </div>
  );
}
