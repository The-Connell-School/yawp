import { useEffect, useRef, useState } from 'react';
import {
  Form,
  Link,
  useFetcher,
  useNavigation,
  useSearchParams,
} from 'react-router';
import { useField, useForm } from '@rvf/react-router';
import { LoginSchema } from '~/components/login-form';
import { FormInput } from '~/components/forms/form-input-2';
import { Button } from '~/components/ui/button';
import { UnifiedSignon } from './unified-signon';
import type {
  SignonResult,
  SignonTransport,
} from '~/domain/unified-signon/contracts';

export function UnifiedLogin({
  entry,
}: {
  entry: { redirectTo: string; googleAvailable: boolean };
}) {
  const [search] = useSearchParams();
  const fetcher = useFetcher<{ error?: string }>();
  const completion = useRef<((result: SignonResult) => void) | null>(null);
  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data || !completion.current)
      return;
    const resolve = completion.current;
    completion.current = null;
    resolve({
      error:
        fetcher.data.error ??
        'This sign-in option is not available yet. Please try again later.',
    });
  }, [fetcher.state, fetcher.data]);
  const transport: SignonTransport = async (intent, values, context) => {
    const form = new FormData();
    form.set('intent', intent);
    form.set('redirectTo', context.redirectTo);
    if (context.state.flowToken) form.set('flowToken', context.state.flowToken);
    for (const [key, value] of Object.entries(values)) form.set(key, value);
    // Router actions use the router's data protocol. PR 3 will add validated
    // next-screen responses here; this item exposes only an unavailable result.
    return new Promise<SignonResult>((resolve) => {
      completion.current = resolve;
      void fetcher.submit(form, { method: 'POST', action: '/auth/login' });
    });
  };
  return (
    <UnifiedSignon
      initialState={{
        screen: 'entry',
        variant:
          search.get('message') === 'existing_account'
            ? 'existing-account'
            : undefined,
      }}
      redirectTo={entry.redirectTo}
      googleAvailable={entry.googleAvailable}
      transport={transport}
      passwordForm={(state) => (
        <UnifiedPasswordForm
          identifier={state.identifier ?? ''}
          redirectTo={entry.redirectTo}
        />
      )}
    />
  );
}

/** Reuse LoginSchema and the existing route action verbatim when PR 3 resolves
 * an identifier to the password step. No new password/session implementation. */
export function UnifiedPasswordForm({
  identifier,
  redirectTo,
}: {
  identifier: string;
  redirectTo: string;
}) {
  const navigation = useNavigation();
  const [forgotHandle, setForgotHandle] = useState(false);
  const loginIdentifier = identifier.startsWith('@')
    ? identifier.slice(1)
    : identifier;
  const form = useForm({
    schema: LoginSchema,
    method: 'POST',
    defaultValues: { email: loginIdentifier, password: '', redirectTo },
  });
  const identifierField = useField(form.scope('email'));
  const error = identifierField.error();
  const message =
    error === 'Invalid email or password'
      ? identifier.includes('@') && !identifier.startsWith('@')
        ? "That password isn't right. Try again, or reset it."
        : "That handle and password don't match."
      : error;
  return (
    <Form {...form.getFormProps()} className="signon-fields">
      <input type="hidden" name="intent" value="password" />
      <input type="hidden" name="email" value={loginIdentifier} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <div className="signon-password-row">
        <FormInput
          scope={form.scope('password')}
          label="Password"
          type="password"
          autoComplete="current-password"
        />
        {identifier.startsWith('@') || !identifier.includes('@') ? (
          <Button
            type="button"
            variant="link"
            className="signon-text-button"
            onClick={() => setForgotHandle(true)}
          >
            Forgot password?
          </Button>
        ) : (
          <Link className="signon-text-button" to="/auth/inv/forgot-password">
            Forgot password?
          </Link>
        )}
      </div>
      {forgotHandle && (
        <p role="status" className="signon-banner">
          Ask your teacher to reset it.
        </p>
      )}

      {message && (
        <p role="alert" className="signon-field-error">
          {message}
        </p>
      )}
      <Button
        type="submit"
        className="signon-primary"
        disabled={navigation.state !== 'idle'}
      >
        Log In
      </Button>
    </Form>
  );
}
