import * as router from 'react-router';
import { afterAll, expect, mock, test } from 'bun:test';
import {
  mockCardPageChromeForSsr,
  renderWithCardPageChrome,
} from '~/components/card-page-chrome.ssr-test-setup';

afterAll(() => mock.restore());

function mockPage() {
  mockCardPageChromeForSsr();
  mock.module('react-router', () => ({
    ...router,
    useLoaderData: () => ({
      app: {
        status: 'SENT',
        name: 'Grace Okafor',
        schoolName: 'Lincoln High School',
      },
      pending: {
        adminName: 'Dr. Patel',
        adminEmail: 'patel@lincolnusd.org',
      },
      lastFailedEmail: null,
      showExploreClassroom: true,
      approvalV2: {
        enabled: true,
        approval: {
          id: 'current',
          adminName: 'Dr. Patel',
          adminEmail: 'patel@lincolnusd.org',
        },
        firstSentAt: new Date('2026-10-14'),
      },
      additionalSentAdmin: null,
    }),
    useActionData: () => undefined,
    useFetcher: () => ({ state: 'idle', data: undefined, submit: () => {} }),
    useRevalidator: () => ({ revalidate: () => {} }),
    useNavigation: () => ({ state: 'idle' }),
    Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
    Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
  }));
}

test('pending v2 shows additional administrator link under admin, not draft mailto', async () => {
  mockPage();
  const { default: Page } = await import('./route');
  const html = renderWithCardPageChrome(<Page />);
  expect(html).toContain(
    'It may be a good idea to give Dr. Patel a quick heads-up'
  );
  expect(html).toContain('Not the right person?');
  expect(html).toContain('pending-forward-disclosure');
  expect(html).not.toContain('to="/app/free-tier/onboarding?additional=1"');
  expect(html).not.toContain('Draft a Request');
  expect(html).not.toContain('pending-draft-request');
  expect(html).not.toContain('mailto:');
});
