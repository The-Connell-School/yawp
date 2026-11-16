import * as router from 'react-router';
import { expect, mock, test } from 'bun:test';
import type { ReactNode } from 'react';
import {
  mockCardPageChromeForSsr,
  renderWithCardPageChrome,
} from '~/components/card-page-chrome.ssr-test-setup';

const MANUAL_REVIEW_PENDING_COPY =
  'Yawp! will review your request and email you when it is ready.';

let loaderData: Record<string, unknown> = {};

mockCardPageChromeForSsr();
mock.module('react-router', () => ({
  ...router,
  useLoaderData: () => loaderData,
  useActionData: () => undefined,
  useFetcher: () => ({ state: 'idle', data: undefined, submit: () => {} }),
  useRevalidator: () => ({ revalidate: () => {} }),
  useNavigation: () => ({ state: 'idle' }),
  Form: ({ children, ...props }: { children?: ReactNode }) => (
    <form {...props}>{children}</form>
  ),
  Link: ({ children, ...props }: { children?: ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));

const { default: Page } = await import('./route');

test('MANUAL_REVIEW tells the teacher that Yawp will review and email them', () => {
  for (const approvalV2 of [
    null,
    { enabled: true, approval: null, firstSentAt: null },
    {
      enabled: true,
      approval: {
        id: 'held',
        adminName: 'Patel',
        adminEmail: 'patel@gmail.com',
      },
      firstSentAt: null,
    },
  ]) {
    loaderData = {
      app: { status: 'MANUAL_REVIEW', name: 'Teacher', schoolName: 'Demo' },
      pending: {
        adminName: 'Patel',
        adminEmail: 'patel@gmail.com',
      },
      lastFailedEmail: null,
      showExploreClassroom: false,
      approvalEmailFrom: 'from@example.org',
      approvalV2,
    };
    const html = renderWithCardPageChrome(<Page />).replace(/&#x27;/g, "'");
    expect(html).toContain(MANUAL_REVIEW_PENDING_COPY);
    expect(html).toContain("We're reviewing your request");
    expect(html).not.toContain('We will email you when your request is ready.');
    expect(html).not.toContain('send your administrator');
    expect(html).not.toContain('is queued');
    expect(html).not.toContain('Sent to Patel');
  }
});

test('a sent administrator request keeps the waiting copy', () => {
  loaderData = {
    app: { status: 'SENT', name: 'Teacher', schoolName: 'Demo' },
    pending: { adminName: 'Patel', adminEmail: 'patel@school.edu' },
    lastFailedEmail: null,
    showExploreClassroom: false,
    approvalEmailFrom: 'from@example.org',
    approvalV2: null,
  };
  const html = renderWithCardPageChrome(<Page />).replace(/&#x27;/g, "'");
  expect(html).toContain('Sent to Patel.');
  expect(html).not.toContain(MANUAL_REVIEW_PENDING_COPY);
});
