// Standalone Vite fixture entry. Never registered in app/routes or the build.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { AuthPageShell } from '../../../app/components/auth-brand-lockup';
import { UnifiedSignon } from '../../../app/components/unified-signon/unified-signon';
import type { SignonTransport } from '../../../app/domain/unified-signon/contracts';
import { signonFixtures } from './states';
import '../../../app/app.css';

const search = new URLSearchParams(location.search);
const classFound = signonFixtures.find((f) => f.id === 'class-found')!;
// Transition-only fixture; no extra artboard or deployed state selector.
const fixture =
  search.get('state') === 'class-found-email'
    ? {
        ...classFound,
        state: {
          ...classFound.state,
          classInfo: {
            ...classFound.state.classInfo!,
            accountMode: 'email' as const,
          },
        },
      }
    : (signonFixtures.find((f) => f.id === search.get('state')) ??
      signonFixtures[0]);
const transport: SignonTransport = async (operation, values, { state }) => {
  await new Promise((resolve) => setTimeout(resolve, 350));
  const target = (id: string) => ({
    state: {
      ...signonFixtures.find((f) => f.id === id)!.state,
      identifier: values.identifier || state.identifier,
    },
  });
  switch (operation) {
    case 'resolve':
      if (values.identifier === 'ENG-11X')
        return target('class-found-ambiguity');
      if (values.identifier === 'new@example.com')
        return target('account-type');
      return { state: { screen: 'password', identifier: values.identifier } };
    case 'resolve-class':
    case 'choose-class':
      return target('class-found');
    case 'send-code':
      return target('email-code');
    case 'resend-code':
      return {
        state: {
          ...state,
          variant: state.variant === 'expired' ? undefined : state.variant,
          error: undefined,
          notice: 'New code sent. Check spam too.',
          fieldErrors: {},
        },
      };
    case 'verify-code':
      return values.code === '123456'
        ? target('name-password')
        : {
            error: '',
            fieldErrors: {
              code: "That code isn't right. Use the one from our most recent email.",
            },
          };
    case 'trial-status':
      return {
        state: {
          ...state,
          notice: `If ${state.identifier} has applied, we emailed its status.`,
        },
      };
    case 'google':
      return {
        error:
          'Google sign-in was cancelled. Try again, or use your email below.',
      };
    case 'select-membership':
    case 'join-handle':
    case 'create-account':
    case 'password':
    case 'required-password':
    case 'link-google':
    case 'skip-google':
      return target('joined');
    default:
      return { error: 'Local fixture: no request was sent.' };
  }
};
createRoot(document.getElementById('root')!).render(
  <MemoryRouter>
    <AuthPageShell>
      <UnifiedSignon
        initialState={fixture.state}
        initialValues={fixture.initialValues}
        googleAvailable={
          search.get('google') === 'unset'
            ? false
            : (fixture.googleAvailable ?? false)
        }
        transport={transport}
        redirectTo={search.get('redirectTo')}
      />
    </AuthPageShell>
  </MemoryRouter>
);
