import * as router from 'react-router';
import { expect, mock, test } from 'bun:test';
import type { ReactNode } from 'react';
import {
  mockCardPageChromeForSsr,
  renderWithCardPageChrome,
} from '~/components/card-page-chrome.ssr-test-setup';

let loaderData: Record<string, unknown> = {};

mockCardPageChromeForSsr();
mock.module('react-router', () => ({
  ...router,
  useLoaderData: () => loaderData,
  useActionData: () => undefined,
  useNavigation: () => ({ state: 'idle' }),
  Form: ({ children, ...props }: { children?: ReactNode }) => (
    <form {...props}>{children}</form>
  ),
  Link: ({ children, to, ...props }: { children?: ReactNode; to?: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const { default: Page } = await import('./route');

test('the administrator form still says Yawp will email that administrator', () => {
  loaderData = {
    app: {
      status: 'ACCOUNT_CREATED',
      email: 'teacher@school.edu',
      name: 'Ada',
      schoolName: 'North Ridge',
      gradeLevel: '10',
      starterClassName: 'English 10',
      starterClassGrade: '10',
    },
    lastFailedEmail: null,
    pending: null,
    onboardingV2: true,
    showClass: false,
    additionalAdministrator: false,
  };
  const html = renderWithCardPageChrome(
    <Page />,
    '/app/free-tier/onboarding'
  );
  expect(html).toContain(
    'We’ll send your administrator a short email explaining Yawp!'
  );
  expect(html).not.toContain(
    'Yawp! will review your request and email you when it is ready.'
  );
});
