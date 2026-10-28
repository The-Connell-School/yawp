import { useEffect, useId, useRef, useState } from 'react';
import { Form, Link, useNavigation } from 'react-router';
import { Checkbox } from '~/components/ui/checkbox';
import {
  approveCheckboxError,
  approveCheckboxLabel,
  approveValidationSummary,
  forwardValidationSummary,
} from '~/domain/free-tier/admin-approval-copy';
import {
  FreeTierButton,
  FreeTierFieldLabel,
  FreeTierTextInput,
} from './FreeTierAuthCard';
import { AdminForwardLink } from './AdminApprovalStates';

type FieldErrors = {
  adminRole?: string;
  authorized?: string;
  adminName?: string;
  adminEmail?: string;
  summary?: string;
};

function ValidationSummary({
  errors,
  intro,
}: {
  errors: FieldErrors;
  intro: string;
}) {
  const messages = [
    errors.adminRole,
    errors.authorized,
    errors.adminName,
    errors.adminEmail,
  ].filter(Boolean) as string[];
  if (!messages.length) return null;
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

const LEARN_MORE_URL = 'https://app.usemotion.com/meet/brian-connell/ryxkqvr';

export function AdminApproveForm({
  token,
  forwardToken,
  schoolName,
  teacherName,
  serverErrors,
  showDenyAndQa = false,
}: {
  token: string;
  forwardToken?: string;
  schoolName: string;
  teacherName: string;
  serverErrors?: FieldErrors;
  showDenyAndQa?: boolean;
}) {
  const navigation = useNavigation();
  const submitting =
    navigation.state === 'submitting' &&
    navigation.formData?.get('intent') !== 'forward';
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const [authorized, setAuthorized] = useState(false);
  const [adminRole, setAdminRole] = useState('');
  const summaryRef = useRef<HTMLDivElement>(null);
  const roleRef = useRef<HTMLInputElement>(null);
  const checkboxRef = useRef<HTMLButtonElement>(null);
  const roleErrorId = useId();
  const checkboxErrorId = useId();
  const errors = { ...clientErrors, ...serverErrors };

  useEffect(() => {
    const hasClient = Object.keys(clientErrors).length > 0;
    const hasServer = Boolean(
      serverErrors?.adminRole || serverErrors?.authorized
    );
    if (!hasClient && !hasServer) return;
    summaryRef.current?.focus();
    const roleError = clientErrors.adminRole ?? serverErrors?.adminRole;
    const authorizedError =
      clientErrors.authorized ?? serverErrors?.authorized;
    if (roleError) roleRef.current?.focus();
    else if (authorizedError) checkboxRef.current?.focus();
  }, [clientErrors, serverErrors]);

  return (
    <Form
      method="post"
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        const next: FieldErrors = {};
        if (!adminRole.trim()) next.adminRole = 'Enter your role.';
        if (!authorized)
          next.authorized = approveCheckboxError(teacherName, schoolName);
        if (Object.keys(next).length) {
          event.preventDefault();
          setClientErrors(next);
          return;
        }
        setClientErrors({});
      }}
    >
      <input type="hidden" name="token" value={token} />
      <div ref={summaryRef}>
        <ValidationSummary
          errors={errors}
          intro={approveValidationSummary(
            Number(Boolean(errors.adminRole)) +
              Number(Boolean(errors.authorized))
          )}
        />
      </div>
      <FreeTierFieldLabel label="Your role" htmlFor="adminRole">
        <FreeTierTextInput
          ref={roleRef}
          id="adminRole"
          name="adminRole"
          value={adminRole}
          onChange={(event) => {
            setAdminRole(event.target.value);
            if (clientErrors.adminRole)
              setClientErrors((current) => ({ ...current, adminRole: undefined }));
          }}
          placeholder="Principal, Technology Director"
          aria-invalid={errors.adminRole ? true : undefined}
          aria-describedby={errors.adminRole ? roleErrorId : undefined}
        />
        {errors.adminRole ? (
          <span id={roleErrorId} className="text-xs text-destructive">
            {errors.adminRole}
          </span>
        ) : null}
      </FreeTierFieldLabel>
      <div className="flex flex-col gap-1.5">
        <label className="flex gap-2 text-sm items-start text-left">
          {authorized ? (
            <input type="hidden" name="authorized" value="on" />
          ) : null}
          <Checkbox
            ref={checkboxRef}
            checked={authorized}
            onCheckedChange={(checked) => {
              setAuthorized(checked === true);
              if (clientErrors.authorized)
                setClientErrors((current) => ({
                  ...current,
                  authorized: undefined,
                }));
            }}
            aria-invalid={errors.authorized ? true : undefined}
            aria-describedby={errors.authorized ? checkboxErrorId : undefined}
            className="mt-1"
          />
          <span>{approveCheckboxLabel(teacherName, schoolName)}</span>
        </label>
        {errors.authorized ? (
          <span id={checkboxErrorId} className="text-xs text-destructive">
            {errors.authorized}
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <FreeTierButton type="submit" isLoading={submitting} disabled={submitting}>
          {submitting ? 'Approving…' : 'Approve Yawp!'}
        </FreeTierButton>
        {showDenyAndQa ? (
          <FreeTierButton asChild variant="outline">
            <a href={LEARN_MORE_URL} target="_blank" rel="noopener noreferrer">
              I&apos;d like to learn more first
            </a>
          </FreeTierButton>
        ) : null}
        {showDenyAndQa ? (
          <FreeTierButton
            asChild
            variant="ghost"
            className="free-tier-deny-button h-auto py-2 text-card-foreground shadow-none hover:bg-muted/60"
          >
            <Link to={`/free/admin/approve/deny?t=${encodeURIComponent(token)}`}>
              Deny request
            </Link>
          </FreeTierButton>
        ) : null}
      </div>
      {!showDenyAndQa && forwardToken ? (
        <AdminForwardLink forwardToken={forwardToken} approveToken={token} />
      ) : null}
    </Form>
  );
}

export function AdminForwardForm({
  token,
  serverErrors,
}: {
  token: string;
  serverErrors?: FieldErrors;
}) {
  const navigation = useNavigation();
  const submitting = navigation.state === 'submitting';
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const summaryRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const nameErrorId = useId();
  const emailErrorId = useId();
  const errors = { ...clientErrors, ...serverErrors };

  useEffect(() => {
    const hasClient = Object.keys(clientErrors).length > 0;
    const hasServer = Boolean(
      serverErrors?.adminName || serverErrors?.adminEmail
    );
    if (!hasClient && !hasServer) return;
    summaryRef.current?.focus();
    const nameError = clientErrors.adminName ?? serverErrors?.adminName;
    const emailError = clientErrors.adminEmail ?? serverErrors?.adminEmail;
    if (nameError) nameRef.current?.focus();
    else if (emailError) emailRef.current?.focus();
  }, [clientErrors, serverErrors]);

  return (
    <Form
      method="post"
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        const next: FieldErrors = {};
        if (!adminName.trim()) next.adminName = 'Enter their name.';
        if (!adminEmail.trim()) next.adminEmail = 'Enter a valid email address.';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim()))
          next.adminEmail = 'Enter a valid email address.';
        if (Object.keys(next).length) {
          event.preventDefault();
          setClientErrors(next);
          return;
        }
        setClientErrors({});
      }}
    >
      <input type="hidden" name="token" value={token} />
      <div ref={summaryRef}>
        <ValidationSummary
          errors={errors}
          intro={forwardValidationSummary(
            Number(Boolean(errors.adminName)) +
              Number(Boolean(errors.adminEmail))
          )}
        />
      </div>
      <FreeTierFieldLabel label="Their name" htmlFor="adminName">
        <FreeTierTextInput
          ref={nameRef}
          id="adminName"
          name="adminName"
          value={adminName}
          onChange={(event) => {
            setAdminName(event.target.value);
            if (clientErrors.adminName)
              setClientErrors((current) => ({ ...current, adminName: undefined }));
          }}
          aria-invalid={errors.adminName ? true : undefined}
          aria-describedby={errors.adminName ? nameErrorId : undefined}
        />
        {errors.adminName ? (
          <span id={nameErrorId} className="text-xs text-destructive">
            {errors.adminName}
          </span>
        ) : null}
      </FreeTierFieldLabel>
      <FreeTierFieldLabel label="Their email" htmlFor="adminEmail">
        <FreeTierTextInput
          ref={emailRef}
          id="adminEmail"
          name="adminEmail"
          type="email"
          placeholder="name@district.org"
          value={adminEmail}
          onChange={(event) => {
            setAdminEmail(event.target.value);
            if (clientErrors.adminEmail)
              setClientErrors((current) => ({
                ...current,
                adminEmail: undefined,
              }));
          }}
          aria-invalid={errors.adminEmail ? true : undefined}
          aria-describedby={errors.adminEmail ? emailErrorId : undefined}
        />
        {errors.adminEmail ? (
          <span id={emailErrorId} className="text-xs text-destructive">
            {errors.adminEmail}
          </span>
        ) : null}
      </FreeTierFieldLabel>
      <FreeTierButton type="submit" isLoading={submitting} disabled={submitting}>
        {submitting ? 'Forwarding…' : 'Forward request'}
      </FreeTierButton>
    </Form>
  );
}
