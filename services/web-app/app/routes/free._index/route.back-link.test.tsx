import { afterAll, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import {
  mockCardPageChromeForSsr,
} from '~/components/card-page-chrome.ssr-test-setup';

mockCardPageChromeForSsr({ signedIn: false, origin: 'http://localhost:5194' });

mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({
  requireFreeTierEnabled: async () => {},
}));

mock.module('~/domain/free-tier/public-onboarding.server', () => ({
  isPublicOnboardingV2Enabled: async () => true,
  isSupportedSignupGrade: () => true,
}));

const router = { ...(await import('react-router')) };
mock.module('react-router', () => ({
  ...router,
  useLoaderData: () => ({
    onboardingV2: true,
    mode: 'waitlist' as const,
    tokenValid: null,
    linkClosed: false as const,
  }),
  useFetcher: () => ({
    data: undefined,
    state: 'idle',
    Form: ({ children, ...props }: { children: React.ReactNode }) => (
      <form {...props}>{children}</form>
    ),
  }),
}));

const { default: FreeTierLanding } = await import('./route');

afterAll(() => mock.restore());

test('/free waitlist renders Back to sign in when signed out', () => {
  const html = renderToStaticMarkup(
    <StaticRouter location="/free">
      <FreeTierLanding />
    </StaticRouter>
  );
  expect(html).toContain('card-page-back-link');
  expect(html).toContain('Back to sign in');
  expect(html).toContain('href="/auth/login"');
});
