import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  ChevronRight,
  CircleCheck,
  Clock,
  Info,
  Mail,
  Shield,
} from 'lucide-react';
import { safeRedirect } from 'remix-utils/safe-redirect';
import { z } from 'zod';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { AuthFormCard } from '~/components/auth-form-card';
import {
  PasswordAndConfirmPasswordSchema,
  PasswordSchema,
  NameSchema,
} from '~/utils/schemas/user';
import {
  StudentNameSchema,
  studentHandleBase,
} from '~/domain/unified-signon/student-handle';
import { validateUsername } from '~/utils/username';
import { signonValidationMessage } from '~/domain/unified-signon/validation-copy';
import {
  identifierKind,
  type SignonClass,
  type SignonOperation,
  type SignonState,
  type SignonTransport,
} from '~/domain/unified-signon/contracts';
import './unified-signon.css';

const passwordHint = 'At least 6 characters.'; // Existing account policy; do not silently raise it.
const unavailable =
  'This sign-in option is not available yet. Please try again later.';

export function UnifiedSignon({
  initialState = { screen: 'entry' },
  initialValues = {},
  redirectTo: rawRedirect = '/app',
  googleAvailable = false,
  googleVisible = true,
  transport,
  passwordForm,
}: {
  initialState?: SignonState;
  initialValues?: Record<string, string>;
  redirectTo?: string | null;
  googleAvailable?: boolean;
  /** When false the Google button (and its "or" divider) is not rendered. */
  googleVisible?: boolean;
  transport: SignonTransport;
  /** Existing RVF login/required-password form; server semantics stay intact. */
  passwordForm?: ReactNode | ((state: SignonState) => ReactNode);
}) {
  const [state, setState] = useState(initialState);
  const [pending, setPending] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({
    identifier: initialState.identifier ?? '',
    ...initialValues,
  });
  const [history, setHistory] = useState<SignonState[]>([]);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const entry = useRef<HTMLInputElement>(null);
  const active = useRef(false);
  const mounted = useRef(false);
  const invalidFieldToFocus = useRef<string | undefined>(undefined);
  const redirectTo = safeRedirect(rawRedirect, '/app');
  const busy = pending || !!state.pending;
  const blocked = busy || !!state.retryAfterSeconds;
  const screen = state.screen;
  const renderedPasswordForm =
    typeof passwordForm === 'function' ? passwordForm(state) : passwordForm;
  const variant = state.variant ?? '';
  const googleUser = state.provider === 'google' || variant.includes('google');
  const identifier = state.identifier ?? '';
  const handleUser = identifierKind(identifier) !== 'email';

  useEffect(() => {
    if (screen === 'entry' && mounted.current) entry.current?.focus();
    else if (screen !== 'entry') {
      heading.current?.setAttribute('tabindex', '-1');
      heading.current?.focus();
    }
    mounted.current = true;
  }, [screen]);

  useEffect(() => {
    if (busy || !invalidFieldToFocus.current) return;
    // Inputs are disabled during submission. Focus only after the enabled DOM
    // has committed, and only for a server error (never while clearing errors).
    document.getElementById(`signon-${invalidFieldToFocus.current}`)?.focus();
    invalidFieldToFocus.current = undefined;
  }, [busy, state.fieldErrors]);

  useEffect(() => {
    if (!state.retryAfterSeconds) return;
    const timer = setTimeout(
      () => setState((s) => ({ ...s, retryAfterSeconds: 0, error: undefined })),
      state.retryAfterSeconds * 1000
    );
    return () => clearTimeout(timer);
  }, [state.retryAfterSeconds]);

  const go = (next: SignonState) => {
    setHistory((h) => [...h, state]);
    setValues({ identifier: next.identifier ?? identifier });
    setState({
      ...next,
      flowToken: next.flowToken ?? state.flowToken,
      classInfo: next.classInfo ?? state.classInfo,
    });
  };
  const createClassAccount = () =>
    void run('student-choice', { choice: 'new' });
  const reset = () => {
    setHistory([]);
    setState({ screen: 'entry' });
    setValues({ identifier: '' });
  };
  const back = () => {
    const previous = history.at(-1);
    if (!previous) return reset();
    if (screen === 'class-email' && previous.screen === 'class-handle')
      return void run('student-choice', { choice: 'new' }, true);
    setHistory((h) => h.slice(0, -1));
    setState(previous);
    setValues({ identifier: previous.identifier ?? '' });
  };
  const run = async (
    operation: SignonOperation,
    extra: Record<string, string> = {},
    backToPrevious = false
  ) => {
    if (active.current || blocked) return;
    active.current = true;
    setPending(true);
    setState((s) => ({
      ...s,
      error: undefined,
      fieldErrors: undefined,
      notice: undefined,
    }));
    try {
      const result = await transport(
        operation,
        { ...values, ...extra },
        { state, redirectTo }
      );
      if ('redirectTo' in result) window.location.assign(result.redirectTo);
      else if ('state' in result) {
        if (backToPrevious) {
          setHistory((h) => h.slice(0, -1));
          setState(result.state);
          setValues({ identifier: result.state.identifier ?? '' });
        } else go(result.state);
      } else {
        invalidFieldToFocus.current = Object.keys(
          result.fieldErrors || {}
        ).find((name) => result.fieldErrors?.[name]);
        setState((s) => ({
          ...s,
          // Enrollment can fail after a class choice or email verification.
          // Render its field error on the retryable code form for every caller.
          ...(result.fieldErrors?.classCode
            ? { screen: 'class-code' as const, variant: undefined }
            : {}),
          ...result,
        }));
      }
    } catch {
      setState((s) => ({
        ...s,
        error: 'Something went wrong. Please try again.',
      }));
    } finally {
      active.current = false;
      setPending(false);
    }
  };
  const field = (
    name: string,
    label: string,
    options: {
      type?: string;
      hint?: string;
      placeholder?: string;
      autoComplete?: string;
    } = {}
  ) => {
    const error = state.fieldErrors?.[name];
    const id = `signon-${name}`;
    return (
      <div className="signon-field" key={name}>
        <label htmlFor={id}>{label}</label>
        <div
          className={name === 'username' ? 'signon-handle-input' : undefined}
        >
          {name === 'username' && <span aria-hidden="true">@</span>}
          <Input
            ref={
              name === 'identifier' && screen === 'entry' ? entry : undefined
            }
            id={id}
            name={name}
            type={options.type ?? 'text'}
            value={values[name] ?? ''}
            onChange={(event) => {
              setValues((v) => ({ ...v, [name]: event.target.value }));
              if (
                ['class-handle', 'handle-join', 'class-signin'].includes(screen)
              )
                setState((s) => ({
                  ...s,
                  error: undefined,
                  fieldErrors: { ...s.fieldErrors, [name]: '' },
                }));
            }}
            placeholder={options.placeholder}
            autoComplete={options.autoComplete}
            inputMode={name === 'code' ? 'numeric' : undefined}
            aria-invalid={!!error}
            aria-describedby={error || options.hint ? `${id}-help` : undefined}
            disabled={busy}
          />
        </div>
        {(error || options.hint) && (
          <p
            id={`${id}-help`}
            className={error ? 'signon-field-error' : 'signon-hint'}
            role={error ? 'alert' : undefined}
          >
            {error ?? options.hint}
          </p>
        )}
        {name === 'username' && variant === 'taken' && (
          <div className="signon-chips">
            {(
              state.handleSuggestions ??
              (screen === 'class-handle'
                ? ['maya.r', 'maya-11', 'mayawrites']
                : ['maya_r', 'maya7', 'mayawrites'])
            ).map((handle) => (
              <Button
                type="button"
                variant="outline"
                key={handle}
                onClick={() => {
                  setValues((v) => ({ ...v, username: handle }));
                  setState((s) => ({ ...s, fieldErrors: {} }));
                }}
              >
                @{handle}
              </Button>
            ))}
          </div>
        )}
      </div>
    );
  };
  const primary = (
    label: string,
    operation?: SignonOperation,
    disabled = false
  ) => (
    <Button
      className="signon-primary"
      type={operation ? 'button' : 'submit'}
      disabled={blocked || disabled}
      onClick={operation ? () => void run(operation) : undefined}
    >
      {pending ? 'Continuing…' : label}
    </Button>
  );
  const textButton = (label: string, action: () => void, disabled = false) => (
    <Button
      type="button"
      variant="link"
      className="signon-text-button"
      disabled={busy || disabled}
      onClick={action}
    >
      {label}
    </Button>
  );
  const google = () =>
    !googleVisible ? null : (
      <>
        <Button
          type="button"
          variant="outline"
          className="signon-google"
          disabled={blocked || !googleAvailable}
          onClick={() => void run('google')}
          title={
            !googleAvailable ? 'Google sign-in is not available yet' : undefined
          }
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
            <path
              fill="#4285F4"
              d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.8 3-4.3 3-7.4Z"
            />
            <path
              fill="#34A853"
              d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5a6 6 0 0 1-9-3.1H3.1v2.6A10 10 0 0 0 12 22Z"
            />
            <path
              fill="#FBBC05"
              d="M6.4 14a6 6 0 0 1 0-4V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14Z"
            />
            <path
              fill="#EA4335"
              d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.9 5.4L6.4 10A6 6 0 0 1 12 6Z"
            />
          </svg>
          Continue with Google
        </Button>
      </>
    );
  const divider = googleVisible && (
    <div className="signon-divider">
      <span />
      or
      <span />
    </div>
  );
  const identity = identifier && (
    <div className="signon-identity">
      <span>{identifier}</span>
      {textButton('Change', reset)}
    </div>
  );
  const classCard = (info: SignonClass | undefined = state.classInfo) =>
    info && (
      <div className="signon-class">
        <strong>{info.name}</strong>
        <span>
          {info.teacher} · {info.organization}
        </span>
      </div>
    );
  const choice = (title: string, subtitle: string, action: () => void) => (
    <Button
      type="button"
      variant="outline"
      className="signon-choice"
      disabled={blocked}
      onClick={action}
    >
      <span className="signon-choice-copy">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </span>
      <ChevronRight aria-hidden="true" width={18} height={18} />
    </Button>
  );
  const passwords = (isNew = false, handle = false) => (
    <>
      {field('password', isNew ? 'New password' : 'Password', {
        type: 'password',
        autoComplete: 'new-password',
        hint: handle
          ? 'Write it down. Only your teacher can reset it.'
          : passwordHint,
      })}
      {field(
        'confirmPassword',
        isNew ? 'Confirm new password' : 'Confirm password',
        { type: 'password', autoComplete: 'new-password' }
      )}
    </>
  );
  const classPicker = (
    <fieldset className="signon-class-picker">
      <legend>Choose your class</legend>
      {state.classes?.map((info, i) => (
        <label key={info.id}>
          <input
            type="radio"
            name="classId"
            value={info.id}
            checked={(values.classId ?? state.classes?.[0]?.id) === info.id}
            onChange={() => setValues((v) => ({ ...v, classId: info.id }))}
            disabled={blocked}
          />
          <span>
            <strong>{info.name}</strong>
            <small>
              {info.teacher} · {info.organization}
            </small>
          </span>
        </label>
      ))}
    </fieldset>
  );

  let title = '';
  let body: ReactNode;
  let below: ReactNode = textButton('Back', back);
  let showIdentity = false;
  let subtitle: ReactNode;
  switch (screen) {
    case 'entry':
      title = 'Sign in or create an account';
      body = (
        <>
          {google()}
          {divider}
          {field('identifier', 'Email or class code', {
            placeholder: 'Email or class code',
            autoComplete: 'username',
          })}
          {primary(state.pending ? 'Continuing…' : 'Continue')}
        </>
      );
      below = (
        <>
          <p>
            Teachers: new to YAWP!? <Link to="/free">Start a free trial</Link>
          </p>
          <p>
            Joining a class?{' '}
            {textButton('Type the class code above', () =>
              entry.current?.focus()
            )}
          </p>
        </>
      );
      break;
    case 'password':
      title = 'Enter your password';
      showIdentity = true;
      body = renderedPasswordForm ?? (
        <>
          <div className="signon-password-row">
            {field('password', 'Password', {
              type: 'password',
              autoComplete: 'current-password',
            })}
            {textButton('Forgot password?', () =>
              handleUser
                ? setState((s) => ({
                    ...s,
                    notice: 'Ask your teacher to reset it.',
                  }))
                : void run('send-code', { purpose: 'reset-password' })
            )}
          </div>
          {primary('Log In')}
        </>
      );
      below = (
        <>
          {state.classInfo?.accountMode === 'email' && textButton('Back', back)}
          {textButton('Use a different account', reset)}
          {!handleUser &&
            textButton(
              'Email me a sign-in code instead',
              () => void run('send-code')
            )}
        </>
      );
      break;
    case 'required-password':
      title = 'Choose a new password';
      subtitle = 'Your teacher reset it. Pick one only you know.';
      body = renderedPasswordForm ?? (
        <>
          {passwords(true)}
          {primary('Save password')}
        </>
      );
      below = (
        <form method="post" action="/auth/logout">
          <Button type="submit" variant="link">
            Sign out
          </Button>
        </form>
      );
      break;
    case 'account-type':
      title = 'Welcome to YAWP!';
      showIdentity = true;
      body = (
        <>
          {choice("I'm a student", 'I have a class code', () =>
            go({ screen: 'class-code', identifier, variant })
          )}
          {choice("I'm a teacher", 'Start or check a free trial', () =>
            go({ screen: 'teacher', identifier })
          )}
        </>
      );
      below = (
        <>
          {textButton(
            googleUser
              ? 'Different email? Use it instead'
              : 'Expected an account? Try a different email',
            reset
          )}
          {googleUser && textButton('Have a handle? Sign in with it', reset)}
        </>
      );
      break;
    case 'class-code':
      title = 'Enter your class code';
      showIdentity = true;
      body =
        variant === 'multiple' ? (
          <>
            <p className="signon-copy">
              This code matches more than one class. Pick yours.
            </p>
            {classPicker}
            {primary('Join class')}
          </>
        ) : (
          <>
            {field('classCode', 'Class code', { hint: 'From your teacher' })}
            {primary('Continue')}
          </>
        );
      break;
    case 'email-code':
      title = variant === 'reset' ? 'Reset your password' : 'Check your email';
      subtitle =
        variant === 'reset' ? (
          `If ${identifier} has an account, a code is on its way.`
        ) : (
          <>
            Sent to <b>{identifier}</b>. Expires in 10 minutes.
          </>
        );
      body = (
        <>
          {field('code', 'Code', { autoComplete: 'one-time-code' })}
          {primary(
            variant === 'expired' ? 'Send a new code' : 'Verify',
            variant === 'expired' ? 'resend-code' : undefined
          )}
        </>
      );
      below = (
        <>
          <p>
            Didn't get it?{' '}
            {textButton('Resend code', () => void run('resend-code'))}
          </p>
          {textButton('Use a different email', reset)}
        </>
      );
      break;
    case 'name-password': {
      showIdentity = true;
      const invited =
        variant.startsWith('teacher') || variant.startsWith('admin');
      title =
        variant === 'reset'
          ? 'Set a new password'
          : invited
            ? 'Finish setting up your account'
            : googleUser
              ? 'Confirm your name'
              : 'Create your account';
      subtitle = invited
        ? `${state.organizationName ?? 'Your organization'} invited you ${variant.startsWith('teacher') ? 'to teach' : 'as school admin'}.`
        : undefined;
      body = (
        <>
          {!invited && variant !== 'reset' && classCard()}
          {variant !== 'reset' &&
            field('name', 'Your name', { autoComplete: 'name' })}
          {!googleUser && passwords(variant === 'reset')}
          {primary(
            variant === 'reset'
              ? 'Save password'
              : invited
                ? 'Finish setup'
                : googleUser
                  ? 'Join class'
                  : 'Create Account'
          )}
        </>
      );
      below = textButton(
        variant === 'reset' ? 'Back to sign in' : 'Back',
        variant === 'reset' ? reset : back
      );
      break;
    }
    case 'handle-join':
    case 'class-handle':
      title =
        variant === 'full'
          ? 'This class is full'
          : variant === 'invalid-link'
            ? "This class link doesn't work"
            : screen === 'class-handle'
              ? 'Create your account'
              : 'Join your class';
      body =
        variant === 'invalid-link' ? (
          <p className="signon-copy">Ask your teacher for a new one.</p>
        ) : (
          <>
            {classCard()}
            {screen === 'class-handle' && state.emailOrigin && (
              <div role="status" className="signon-banner signon-origin-notice">
                <Shield aria-hidden="true" width={16} height={16} />
                <span>
                  We won't save your email. This class uses a handle and
                  password.
                </span>
              </div>
            )}
            {variant === 'full' ? (
              <p className="signon-copy">Ask your teacher to make room.</p>
            ) : (
              <>
                {field('firstName', 'First name', {
                  autoComplete: 'given-name',
                })}
                {field('lastName', 'Last name', {
                  autoComplete: 'family-name',
                })}
                <p className="signon-copy" aria-live="polite">
                  Your handle:{' '}
                  <strong>
                    {(() => {
                      try {
                        return (
                          '@' +
                          studentHandleBase(
                            values.firstName || '',
                            values.lastName || ''
                          )
                        );
                      } catch {
                        return 'Created from your name';
                      }
                    })()}
                  </strong>
                  <br />
                  We add a number if someone in your class has the same handle.
                </p>
                {passwords(false, true)}
                {primary('Join class', undefined, variant === 'filled')}
              </>
            )}
          </>
        );
      below =
        variant === 'invalid-link' ? (
          <p>
            Already have an account? <Link to="/auth/login">Sign in</Link>
          </p>
        ) : screen === 'class-handle' ? (
          <>
            {state.classInfo?.accountMode === 'email' &&
              textButton('Use school email', () => void run('student-email'))}
            {textButton('Back', back)}
          </>
        ) : (
          textButton('Already have an account? Sign in', () =>
            go({ screen: 'class-signin', classInfo: state.classInfo })
          )
        );
      break;
    case 'teacher':
      title = 'Teachers start with a free trial';
      subtitle = 'Your school admin approves it.';
      body = (
        <Button asChild className="signon-primary">
          <Link to="/free">Start a free trial</Link>
        </Button>
      );
      below = (
        <>
          {textButton(
            'Already applied? Email me my status',
            () => void run('trial-status')
          )}
          <p>School uses YAWP!? Ask your admin for an invite.</p>
          {textButton('Back', back)}
        </>
      );
      break;
    case 'trial-status': {
      const status: Record<string, [string, string]> = {
        lead: [
          "You're on the waitlist",
          `We will email ${identifier} when a spot opens.`,
        ],
        invited: [
          'Check your email for your invite',
          `Open the link we sent to ${identifier}.`,
        ],
        sent: [
          'Waiting on your administrator',
          state.adminName && state.sentDate
            ? `Sent to ${state.adminName} on ${state.sentDate}.`
            : 'Waiting for your administrator to respond.',
        ],
        review: [
          "We're reviewing your request",
          'We will email you within [2 school days].',
        ],
        rejected: [
          'Request not approved',
          state.adminName
            ? `${state.adminName} declined your free trial.`
            : 'Your free trial was not approved.',
        ],
        expired: ['Your invite expired', 'Email support for a new link.'],
      };
      [title, subtitle] = status[variant] ?? status.lead;
      body =
        variant === 'invited' ? (
          primary('Resend invite', 'resend-invite')
        ) : variant === 'sent' ? (
          <>
            {primary('Resend email', 'resend-approval')}
            <Link to="/app/free-tier/onboarding">Change administrator</Link>
          </>
        ) : variant === 'rejected' || variant === 'expired' ? (
          <a href="mailto:support@yawp.school">
            {variant === 'expired' ? 'Email support' : 'Contact support'}
          </a>
        ) : null;
      below = ['lead', 'invited', ''].includes(variant) ? (
        textButton('Back to sign in', reset)
      ) : (
        <form method="post" action="/auth/logout">
          <Button type="submit" variant="link">
            Sign out
          </Button>
        </form>
      );
      break;
    }
    case 'activation':
      showIdentity = true;
      title =
        variant === 'lti'
          ? 'Get a code to sign in'
          : variant === 'google'
            ? 'Sign in with Google'
            : variant === 'expired'
              ? 'Your invitation expired'
              : 'Finish setting up your account';
      body =
        variant === 'google' ? (
          <>
            {google()}
            {textButton(
              'Prefer a password? Email me a code',
              () => void run('send-code')
            )}
          </>
        ) : (
          <>
            <p className="signon-copy">
              {variant === 'lti'
                ? 'This account has no password yet.'
                : variant === 'expired'
                  ? 'Ask your school admin to invite you again.'
                  : state.organizationName
                    ? `${state.organizationName} invited you. Finish with a code by email.`
                    : 'Finish with a code by email.'}
            </p>
            {variant !== 'expired' && primary('Email me a code', 'send-code')}
          </>
        );
      below = (
        <>
          {state.classInfo?.accountMode === 'email' && textButton('Back', back)}
          {textButton('Use a different account', reset)}
        </>
      );
      break;
    case 'inactive':
      title = "Your account isn't active";
      subtitle =
        variant === 'staff'
          ? 'Ask your school admin to turn it back on.'
          : 'You are not in any active classes.';
      body =
        variant === 'staff' ? (
          <form method="post" action="/auth/logout">
            <Button type="submit" className="signon-primary">
              Sign out
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            className="signon-primary"
            onClick={() => go({ screen: 'class-code', identifier })}
          >
            Enter a class code
          </Button>
        );
      below =
        variant === 'staff' ? (
          <a href="mailto:support@yawp.school">Contact support</a>
        ) : (
          <form method="post" action="/auth/logout">
            <Button type="submit" variant="link">
              Sign out
            </Button>
          </form>
        );
      break;
    case 'membership':
      title = 'Where are you working today?';
      body = (
        <div
          className="signon-memberships"
          role="group"
          aria-label="Choose organization and role"
        >
          {state.memberships?.map((membership) => (
            <Button
              key={membership.id}
              type="button"
              variant="outline"
              className="signon-membership"
              disabled={blocked}
              onClick={() =>
                void run('select-membership', { membershipId: membership.id })
              }
            >
              <span className="signon-membership-name">
                {membership.organization}
              </span>
              <span className="signon-membership-role">{membership.role}</span>
              <ChevronRight aria-hidden="true" width={16} height={16} />
            </Button>
          ))}
        </div>
      );
      below = (
        <form method="post" action="/auth/logout">
          <Button type="submit" variant="link" className="signon-text-button">
            Sign out
          </Button>
        </form>
      );
      break;
    case 'link-google':
      title = 'Use Google to sign in?';
      showIdentity = true;
      subtitle = 'Skip your password next time.';
      body = primary('Link Google', 'link-google', !googleAvailable);
      below = textButton(
        'Not now, just sign me in',
        () => void run('skip-google')
      );
      break;
    case 'partner-code':
      title = 'Enter your organization code';
      showIdentity = true;
      body = (
        <>
          {field('organizationCode', 'Organization code', {
            hint: 'From your program coordinator',
          })}
          {primary('Continue')}
        </>
      );
      break;
    case 'class-found':
      title =
        variant === 'full'
          ? 'This class is full'
          : variant === 'multiple'
            ? 'Which class is yours?'
            : 'Join your class';
      subtitle =
        variant === 'multiple'
          ? 'This code matches more than one class.'
          : undefined;
      body =
        variant === 'multiple' ? (
          <>
            {classPicker}
            {primary('Continue')}
          </>
        ) : (
          <>
            {classCard()}
            {variant === 'full' ? (
              <p className="signon-copy">Ask your teacher to make room.</p>
            ) : (
              <>{choice('New', 'Create an account', createClassAccount)}</>
            )}
            {choice(
              'Returning',
              'Sign in with your handle',
              () => void run('student-choice', { choice: 'returning' })
            )}
          </>
        );
      below = textButton('Wrong class? Re-enter the code', () =>
        go({ screen: 'class-code', identifier })
      );
      break;
    case 'ambiguity':
      title = `Is ${identifier} a class code?`;
      body = (
        <>
          {choice(
            "Yes, it's a class code",
            `Join ${state.classInfo?.name ?? 'your class'}`,
            () => void run('resolve-class', { classCode: identifier })
          )}
          {choice(
            "No, it's my handle",
            `Sign in as @${identifier.toLowerCase()}`,
            () =>
              go({
                screen: 'password',
                identifier: '@' + identifier.toLowerCase(),
              })
          )}
        </>
      );
      break;
    case 'class-email':
      title = 'Create your account';
      body = (
        <>
          {classCard()}
          {variant === 'existing' && (
            <div
              role="status"
              className="signon-banner signon-origin-notice text-foreground"
            >
              <Info aria-hidden="true" width={16} height={16} />
              <span>
                You already have an account with this email. Sign in to join
                this class.
              </span>
            </div>
          )}
          {google()}
          {divider}
          {field('identifier', 'School email', {
            autoComplete: 'email',
            type: 'email',
          })}
          {primary(variant === 'existing' ? 'Sign in instead' : 'Continue')}
        </>
      );
      break;
    case 'class-signin':
      title = 'Sign in to your class';
      body = (
        <>
          {classCard()}
          {field('username', 'Handle', { autoComplete: 'username' })}
          {field('password', 'Password', {
            type: 'password',
            autoComplete: 'current-password',
          })}
          <p className="signon-copy">
            Forgot your password? Ask your teacher to reset it.
          </p>
          {primary('Log In')}
        </>
      );
      below = textButton('New to YAWP? Create an account', createClassAccount);
      break;
    case 'joined':
      title =
        variant === 'already' ? "You're already in this class" : "You're in!";
      body = (
        <>
          {classCard()}
          {identifier?.startsWith('@') && (
            <p className="signon-copy">
              Your handle is <strong>{identifier}</strong>. Write it down to
              sign in to this class.
            </p>
          )}
          {primary('Go to my class', 'complete-student')}
        </>
      );
      below = null;
  }

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (blocked) return;
    const errors: Record<string, string> = {};
    const id = (values.identifier ?? '').trim();
    if (['entry', 'class-email'].includes(screen)) {
      if (!id) errors.identifier = 'Enter your email or class code.';
      else if (id.length > 100)
        errors.identifier = "That's too long. Check for extra spaces.";
      else if (
        (identifierKind(id) === 'email' || screen === 'class-email') &&
        !z.string().email().safeParse(id).success
      )
        errors.identifier =
          'That email looks incomplete. Check it and try again.';
      else if (id.startsWith('@')) {
        const result = validateUsername(id.replace(/^@/, ''));
        if (!result.ok) errors.identifier = result.message;
      }
    }
    if (screen === 'class-signin') {
      if (!values.username?.trim()) errors.username = 'Enter your handle.';
      if (!values.password) errors.password = 'Enter your password.';
    }
    if (screen === 'password') {
      const result = PasswordSchema.safeParse(values.password ?? '');
      if (!result.success) errors.password = result.error.issues[0].message;
    }
    if (
      [
        'required-password',
        'name-password',
        'handle-join',
        'class-handle',
      ].includes(screen)
    ) {
      if (
        !['required-password', 'handle-join', 'class-handle'].includes(
          screen
        ) &&
        variant !== 'reset'
      ) {
        const name = NameSchema.safeParse(values.name ?? '');
        if (!name.success) errors.name = name.error.issues[0].message;
      }
      if (!googleUser || ['handle-join', 'class-handle'].includes(screen)) {
        const result = PasswordAndConfirmPasswordSchema.safeParse(values);
        if (!result.success)
          for (const issue of result.error.issues)
            errors[String(issue.path[0])] = signonValidationMessage(issue);
      }
      if (screen === 'handle-join' || screen === 'class-handle') {
        for (const name of ['firstName', 'lastName']) {
          const result = StudentNameSchema.safeParse(values[name] || '');
          if (!result.success) errors[name] = result.error.issues[0].message;
        }
      }
    }
    if (
      screen === 'class-code' &&
      variant !== 'multiple' &&
      !values.classCode?.trim()
    )
      errors.classCode = 'Enter your class code.';
    if (screen === 'email-code' && !/^\d{6}$/.test(values.code ?? ''))
      errors.code = 'Enter the 6-digit code from your email.';
    if (screen === 'partner-code' && !values.organizationCode?.trim())
      errors.organizationCode = 'Enter your organization code.';
    if (Object.keys(errors).length) {
      setState((s) => ({ ...s, fieldErrors: errors }));
      requestAnimationFrame(() =>
        document.getElementById(`signon-${Object.keys(errors)[0]}`)?.focus()
      );
      return;
    }
    if (screen === 'class-found' && variant !== 'multiple')
      return createClassAccount();
    const operations: Partial<Record<SignonState['screen'], SignonOperation>> =
      {
        entry: 'resolve',
        password: 'password',
        'required-password': 'required-password',
        'class-code': variant === 'multiple' ? 'choose-class' : 'resolve-class',
        'email-code': 'verify-code',
        'name-password': 'create-account',
        'handle-join': 'register-student',
        'class-handle': 'register-student',
        'class-email':
          variant === 'existing' && id === identifier
            ? 'class-email-signin'
            : 'resolve',
        'class-signin': 'student-password',
        'partner-code': 'partner-code',
        'class-found': 'choose-class',
      };
    void run(operations[screen] ?? 'resolve', {
      classId: values.classId ?? state.classes?.[0]?.id ?? '',
    });
  };

  const StatusIcon =
    screen === 'email-code'
      ? Mail
      : screen === 'joined'
        ? CircleCheck
        : screen === 'inactive' ||
            (['handle-join', 'class-handle'].includes(screen) &&
              variant === 'invalid-link')
          ? Info
          : screen === 'trial-status'
            ? variant === 'invited'
              ? Mail
              : ['rejected', 'expired'].includes(variant)
                ? Info
                : Clock
            : undefined;
  const hasNativeForm =
    (!!passwordForm && ['password', 'required-password'].includes(screen)) ||
    (screen === 'inactive' && variant === 'staff') ||
    (['handle-join', 'class-handle'].includes(screen) &&
      variant === 'invalid-link');

  return (
    <section
      className="unified-signon"
      data-signon-screen={screen}
      data-signon-variant={variant}
      aria-busy={busy}
    >
      <div className="signon-stack">
        {variant === 'existing-account' && (
          <div role="status" className="signon-banner">
            You already have a YAWP! account. Sign in to continue setting up
            your free trial.
          </div>
        )}
        <AuthFormCard
          title={title}
          className="signon-card"
          icon={
            StatusIcon ? (
              <div
                className={`signon-status-badge${screen === 'email-code' ? ' signon-email-badge' : ''}`}
                aria-hidden="true"
              >
                <StatusIcon width={22} height={22} />
              </div>
            ) : undefined
          }
        >
          {/* AuthFormCard retains the shared heading; focus it after transitions. */}
          <span
            ref={(node) => {
              if (node)
                heading.current =
                  node.parentElement?.parentElement?.querySelector('h1') ??
                  null;
            }}
            hidden
          />
          <div className="signon-fields">
            {showIdentity && identity}
            {subtitle && <p className="signon-copy">{subtitle}</p>}
            {state.error && (
              <div role="alert" className="signon-banner signon-error">
                {state.error}
              </div>
            )}
            {state.notice &&
              !(screen === 'class-email' && variant === 'existing') && (
                <div role="status" className="signon-banner">
                  {state.notice}
                </div>
              )}
            {hasNativeForm ? (
              body
            ) : body ? (
              <form noValidate onSubmit={submit} className="signon-fields">
                <input type="hidden" name="redirectTo" value={redirectTo} />
                {body}
              </form>
            ) : null}
          </div>
        </AuthFormCard>
        {below && <div className="signon-below">{below}</div>}
      </div>
      <footer className="signon-footer">
        <Link to="/terms">Terms</Link>
        <span aria-hidden="true">·</span>
        <Link to="/privacy">Privacy</Link>
      </footer>
    </section>
  );
}

export { unavailable as unifiedSignonUnavailable };
