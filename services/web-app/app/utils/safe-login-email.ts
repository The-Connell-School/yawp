import type { SignonState } from '~/domain/unified-signon/contracts';

/** Display prefill only. Never proof of an account. */
const SAFE_LOGIN_EMAIL =
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

const GOOGLE_SIGNON_ERROR =
  "We couldn't connect to Google. Try again, or use your email below.";

export function safeLoginEmailPrefill(
  value: string | null | undefined
): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim();
  if (!email || email.length > 320) return null;
  if (!SAFE_LOGIN_EMAIL.test(email)) return null;
  return email;
}

/** Sign-in route. The email is included only when it is safe to put in a URL. */
export function loginPathWithEmail(email: string | null | undefined): string {
  const safe = safeLoginEmailPrefill(email);
  if (!safe) return '/auth/login';
  return `/auth/login?${new URLSearchParams({ email: safe }).toString()}`;
}

/**
 * Client entry state for /auth/login. A verified server flow always wins, so a
 * query-string email cannot replace sign-on state.
 */
export function loginInitialStateFromSearch(
  search: URLSearchParams,
  serverState?: SignonState
): SignonState {
  if (serverState) return serverState;
  const email = safeLoginEmailPrefill(search.get('email'));
  return {
    screen: 'entry',
    ...(email ? { identifier: email } : {}),
    error: search.has('googleError') ? GOOGLE_SIGNON_ERROR : undefined,
    variant:
      search.get('message') === 'existing_account'
        ? 'existing-account'
        : undefined,
  };
}
