import { AlertCircle } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Form } from 'react-router';
import {
  forwardValidationSummary,
  teacherPendingForwardError,
} from '~/domain/free-tier/admin-approval-copy';
import { Button } from '~/components/ui/button';
import {
  FreeTierFieldLabel,
  FreeTierTextInput,
} from './FreeTierAuthCard';

type FieldErrors = {
  adminName?: string;
  adminEmail?: string;
};

function ForwardValidationSummary({
  errors,
}: {
  errors: FieldErrors;
}) {
  const messages = [errors.adminName, errors.adminEmail].filter(Boolean) as string[];
  if (!messages.length) return null;
  const intro = forwardValidationSummary(messages.length);
  return (
    <div
      role="alert"
      tabIndex={-1}
      className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
    >
      <p className="font-medium">{intro}</p>
      <ul className="mt-1 list-disc pl-5">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  );
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BAD_EMAIL_HINT =
  'Enter a valid email address, like name@school.org.';

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function PendingApprovalForwardForm({
  approvalId,
  forwarding,
  currentAdminEmail,
  currentAdminName,
  schoolName,
  serverAlert,
  forwardRetry = false,
  onCancel,
  focusNameOnMount,
}: {
  approvalId?: string;
  forwarding: boolean;
  currentAdminEmail: string;
  currentAdminName: string;
  schoolName: string;
  serverAlert?: string | null;
  forwardRetry?: boolean;
  onCancel: () => void;
  focusNameOnMount?: boolean;
}) {
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const summaryRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const nameErrorId = useId();
  const emailErrorId = useId();
  const showRetry = forwardRetry;

  const formComplete =
    adminName.trim().length > 0 &&
    adminEmail.trim().length > 0 &&
    EMAIL_PATTERN.test(adminEmail.trim());

  useEffect(() => {
    if (focusNameOnMount && !forwarding) {
      nameRef.current?.focus();
    }
  }, [focusNameOnMount, forwarding]);

  useEffect(() => {
    if (!Object.keys(clientErrors).length) return;
    summaryRef.current?.focus();
    if (clientErrors.adminName) nameRef.current?.focus();
    else if (clientErrors.adminEmail) emailRef.current?.focus();
  }, [clientErrors]);

  useEffect(() => {
    if (serverAlert) summaryRef.current?.focus();
  }, [serverAlert]);

  return (
    <Form
      method="post"
      className="flex flex-col gap-4 text-sm"
      noValidate
      onSubmit={(event) => {
        const next: FieldErrors = {};
        if (!adminName.trim()) next.adminName = 'Enter their name.';
        const trimmedEmail = adminEmail.trim();
        if (!trimmedEmail) next.adminEmail = BAD_EMAIL_HINT;
        else if (!EMAIL_PATTERN.test(trimmedEmail)) {
          next.adminEmail = BAD_EMAIL_HINT;
        } else if (
          normalizeEmail(trimmedEmail) === normalizeEmail(currentAdminEmail)
        ) {
          next.adminEmail = teacherPendingForwardError({
            reason: 'same_administrator',
            schoolName,
            adminName: currentAdminName,
          });
        }
        if (Object.keys(next).length) {
          event.preventDefault();
          setClientErrors(next);
          return;
        }
        setClientErrors({});
      }}
    >
      <input type="hidden" name="intent" value="forward" />
      {approvalId ? (
        <input type="hidden" name="approvalId" value={approvalId} />
      ) : null}
      <div ref={summaryRef}>
        {serverAlert ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {serverAlert}
          </div>
        ) : null}
        <ForwardValidationSummary errors={clientErrors} />
      </div>
      <FreeTierFieldLabel
        label="Administrator name"
        htmlFor="pending-forward-adminName"
      >
        <FreeTierTextInput
          ref={nameRef}
          id="pending-forward-adminName"
          name="adminName"
          value={adminName}
          readOnly={forwarding}
          onChange={(event) => {
            setAdminName(event.target.value);
            if (clientErrors.adminName) {
              setClientErrors((current) => ({
                ...current,
                adminName: undefined,
              }));
            }
          }}
          maxLength={120}
          aria-invalid={clientErrors.adminName ? true : undefined}
          aria-describedby={clientErrors.adminName ? nameErrorId : undefined}
        />
        {clientErrors.adminName ? (
          <span id={nameErrorId} className="text-xs text-destructive">
            {clientErrors.adminName}
          </span>
        ) : null}
      </FreeTierFieldLabel>
      <FreeTierFieldLabel
        label="Administrator email"
        htmlFor="pending-forward-adminEmail"
      >
        <FreeTierTextInput
          ref={emailRef}
          id="pending-forward-adminEmail"
          name="adminEmail"
          type="email"
          placeholder="name@school.org"
          value={adminEmail}
          readOnly={forwarding}
          onChange={(event) => {
            setAdminEmail(event.target.value);
            if (clientErrors.adminEmail) {
              setClientErrors((current) => ({
                ...current,
                adminEmail: undefined,
              }));
            }
          }}
          maxLength={254}
          aria-invalid={clientErrors.adminEmail ? true : undefined}
          aria-describedby={clientErrors.adminEmail ? emailErrorId : undefined}
        />
        {clientErrors.adminEmail ? (
          <span
            id={emailErrorId}
            className="flex items-start gap-1 text-xs text-destructive"
          >
            <AlertCircle
              aria-hidden
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
            />
            {clientErrors.adminEmail}
          </span>
        ) : null}
      </FreeTierFieldLabel>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant="outline"
          className={`h-10 rounded-full px-5 text-sm${
            !formComplete && !forwarding ? ' opacity-50' : ''
          }`}
          disabled={forwarding}
          aria-busy={forwarding ? true : undefined}
        >
          {forwarding
            ? 'Forwarding…'
            : showRetry
              ? 'Try again'
              : 'Forward request'}
        </Button>
        <Button
          type="button"
          variant="link"
          className="h-auto px-0.5 py-0 text-sm"
          disabled={forwarding}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </Form>
  );
}
