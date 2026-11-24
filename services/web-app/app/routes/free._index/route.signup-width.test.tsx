import { afterAll, expect, mock, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { mockCardPageChromeForSsr } from '~/components/card-page-chrome.ssr-test-setup';
import { WHAT_IS_YAWP_LABEL } from '~/components/what-is-yawp-link';

mockCardPageChromeForSsr({ signedIn: false, origin: 'http://localhost:5194' });

mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({
  requireFreeTierEnabled: async () => {},
}));

mock.module('~/domain/free-tier/public-onboarding.server', () => ({
  isPublicOnboardingV2Enabled: async () => true,
  isSupportedSignupGrade: () => true,
}));

mock.module('./free-tier-dev-prefill-applier', () => ({
  FreeTierDevPrefillApplier: () => null,
}));

type SignupLoaderData = {
  onboardingV2: boolean;
  mode: 'waitlist';
  tokenValid: null;
  linkClosed: false;
};

let loaderData: SignupLoaderData = {
  onboardingV2: true,
  mode: 'waitlist',
  tokenValid: null,
  linkClosed: false,
};

const router = { ...(await import('react-router')) };
mock.module('react-router', () => ({
  ...router,
  useLoaderData: () => loaderData,
  useFetcher: () => ({
    data: undefined,
    state: 'idle',
    Form: ({ children, ...props }: { children: React.ReactNode }) => (
      <form {...props}>{children}</form>
    ),
  }),
  Form: ({ children, ...props }: { children: React.ReactNode }) => (
    <form {...props}>{children}</form>
  ),
}));

const { StaticRouter } = router;
const { default: FreeTierLanding } = await import('./route');
const { ClassPreparationForm } = await import('../free-tier/ClassPreparationForm');

afterAll(() => mock.restore());

const appCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../app.css'),
  'utf8'
);

/** Tailwind's default `max-w-xs` is 20rem (320px). This theme does not override it. */
const NARROW_CARD_CLASS = 'max-w-xs';

function renderSignup() {
  return renderToStaticMarkup(
    <StaticRouter location="/free">
      <FreeTierLanding />
    </StaticRouter>
  );
}

function formCardClass(html: string) {
  const match = html.match(/class="([^"]*\bfree-tier-form-card\b[^"]*)"/);
  expect(match).not.toBeNull();
  return match?.[1] ?? '';
}

test('teacher sign-up stays the narrow centered card when the What is Yawp! link is above it', () => {
  loaderData = { ...loaderData, onboardingV2: true };
  const html = renderSignup();
  const card = formCardClass(html);

  expect(html).toContain('Welcome to Yawp!');
  expect(html.indexOf(WHAT_IS_YAWP_LABEL)).toBeLessThan(
    html.indexOf('free-tier-form-card')
  );
  expect(html).not.toContain('free-tier-setup-page');
  expect(card.split(/\s+/)).toContain(NARROW_CARD_CLASS);
  expect(card.split(/\s+/)).toContain('mx-auto');
  expect(card).not.toContain('max-w-none');
  expect(card).not.toContain('max-w-screen');
  expect(html).toContain('flex w-full flex-col items-center gap-4');
});

test('legacy waitlist sign-up stays the narrow centered card', () => {
  loaderData = { ...loaderData, onboardingV2: false };
  const html = renderSignup();
  const card = formCardClass(html);

  expect(html).toContain('Try Yawp! with your students');
  expect(html).toContain(WHAT_IS_YAWP_LABEL);
  expect(html).not.toContain('free-tier-setup-page');
  expect(card.split(/\s+/)).toContain(NARROW_CARD_CLASS);
});

test('class setup still shares the 640px column with the timeline card', () => {
  const html = renderToStaticMarkup(
    <StaticRouter location="/app/free-tier/onboarding">
      <ClassPreparationForm className="English 9" grade="9" saving={false} />
    </StaticRouter>
  );
  expect(html).toContain('free-tier-setup-page');
  expect(html).toContain('free-tier-setup-timeline-card');
  expect(html).toContain('Tell us about your class');
});

test('the 640px column and max-width override apply only on setup pages', () => {
  expect(appCss).toContain(
    '.free-tier-setup-page .free-tier-form-card {\n  max-width: none;'
  );
  expect(appCss).toContain('width: min(100%, 640px);');
  const plainCard = appCss.match(
    /\.free-tier-page \.free-tier-form-card \{[^}]+\}/
  );
  expect(plainCard?.[0]).not.toContain('max-width');
  expect(plainCard?.[0]).not.toContain('640px');
  expect(appCss).not.toMatch(
    /\.free-tier-page \.free-tier-form-card[^{]*\{\s*max-width:\s*none/
  );
});
