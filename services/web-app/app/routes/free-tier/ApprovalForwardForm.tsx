import { useEffect, useId, useRef, useState } from 'react';
import { Form } from 'react-router';
import {
  FreeTierButton,
  FreeTierFieldLabel,
  FreeTierTextInput,
} from './FreeTierAuthCard';

type FieldErrors = {
  adminName?: string;
  adminEmail?: string;
};

function ForwardValidationSummary({ errors }: { errors: FieldErrors }) {
  const messages = [errors.adminName, errors.adminEmail].filter(Boolean) as string[];
  if (!messages.length) return null;
  return (
    <div
      role="alert"
      tabIndex={-1}
      className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
    >
      <p className="font-medium">Enter their name and a valid email address.</p>
      <ul className="mt-1 list-disc pl-5">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  );
}

export function ApprovalForwardForm({
  approvalId,
  token,
  busy = false,
  action = '',
}: {
  approvalId?: string;
  token?: string;
  busy?: boolean;
  action?: string;
}) {
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const summaryRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const nameErrorId = useId();
  const emailErrorId = useId();

  useEffect(() => {
    if (!Object.keys(clientErrors).length) return;
    summaryRef.current?.focus();
    if (clientErrors.adminName) nameRef.current?.focus();
    else if (clientErrors.adminEmail) emailRef.current?.focus();
  }, [clientErrors]);

  return (
    <Form
      method="post"
      action={action}
      className="flex flex-col gap-4 text-sm"
      noValidate
      onSubmit={(event) => {
        const next: FieldErrors = {};
        if (!adminName.trim()) next.adminName = 'Enter their name.';
        if (!adminEmail.trim()) next.adminEmail = 'Enter a valid email address.';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim())) {
          next.adminEmail = 'Enter a valid email address.';
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
      {token ? <input type="hidden" name="token" value={token} /> : null}
      <div ref={summaryRef}>
        <ForwardValidationSummary errors={clientErrors} />
      </div>
      <FreeTierFieldLabel
        label="Administrator name"
        htmlFor="forward-adminName"
      >
        <FreeTierTextInput
          ref={nameRef}
          id="forward-adminName"
          name="adminName"
          value={adminName}
          onChange={(event) => {
            setAdminName(event.target.value);
            if (clientErrors.adminName) {
              setClientErrors((current) => ({ ...current, adminName: undefined }));
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
        htmlFor="forward-adminEmail"
      >
        <FreeTierTextInput
          ref={emailRef}
          id="forward-adminEmail"
          name="adminEmail"
          type="email"
          value={adminEmail}
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
          <span id={emailErrorId} className="text-xs text-destructive">
            {clientErrors.adminEmail}
          </span>
        ) : null}
      </FreeTierFieldLabel>
      <FreeTierButton type="submit" disabled={busy}>
        {busy ? 'Forwarding…' : 'Forward request'}
      </FreeTierButton>
    </Form>
  );
}

export function approvalForwardError(reason: string) {
  switch (reason) {
    case 'validation':
      return 'Enter their name and a valid email address.';
    case 'same_administrator':
      return 'Choose a different administrator to forward this request.';
    case 'chain_cap':
      return 'This request was forwarded too many times. Email support@yawp.school and we will sort it out.';
    case 'superseded':
      return 'This request has changed. Reload the page to see the current administrator.';
    case 'rate_limited':
      return 'Please wait a few minutes before trying again.';
    default:
      return 'We could not forward this request. Reload the page or contact support@yawp.school.';
  }
}
