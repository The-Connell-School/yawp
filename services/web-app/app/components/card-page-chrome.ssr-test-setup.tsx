import { mock } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import type { ReactNode } from 'react';

/** SSR tests that render AuthPageShell need router + root loader hooks mocked. */
export function mockCardPageChromeForSsr(options?: {
  signedIn?: boolean;
  origin?: string;
}) {
  const signedIn = options?.signedIn ?? true;
  mock.module('~/hooks/useUser', () => ({
    useOptionalUser: () => (signedIn ? { id: 'test-user' } : undefined),
  }));
  mock.module('~/hooks/useRequestInfo', () => ({
    useRequestInfo: () => ({
      origin: options?.origin ?? 'http://localhost:5194',
      path: '/app/free-tier/pending',
      hints: {},
      userPrefs: { navState: 'expanded' as const, contrastPreference: 'standard' as const },
    }),
  }));
}

export function renderWithCardPageChrome(
  node: ReactNode,
  location = '/app/free-tier/pending'
) {
  return renderToStaticMarkup(
    <StaticRouter location={location}>{node}</StaticRouter>
  );
}
