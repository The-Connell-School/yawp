import * as router from 'react-router';
import { afterAll, expect, mock, test } from 'bun:test';
import {
  mockCardPageChromeForSsr,
  renderWithCardPageChrome,
} from '~/components/card-page-chrome.ssr-test-setup';

afterAll(() => mock.restore());

function mockPage(approvalEmail: string) {
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
        adminEmail: approvalEmail,
      },
      lastFailedEmail: null,
      showExploreClassroom: true,
      approvalEmailFrom: 'hello@yawp.school',
      approvalV2: {
        enabled: true,
        approval: {
          id: 'current',
          adminName: 'Dr. Patel',
          adminEmail: approvalEmail,
        },
        firstSentAt: new Date('2026-10-14'),
      },
    }),
    useActionData: () => undefined,
    useNavigation: () => ({ state: 'idle' }),
    Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
    Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
  }));
}

test('hides draft request when administrator email is missing', async () => {
  mockPage('');
  const { default: Page } = await import('./route');
  const html = renderWithCardPageChrome(<Page />);
  expect(html).toContain(
    'It may be a good idea to give Dr. Patel a quick heads-up'
  );
  expect(html).not.toContain('data-testid="pending-draft-request"');
  expect(html).not.toContain('Draft a Request');
});

test('does not show draft request when administrator email is present', async () => {
  mockPage('patel@lincolnusd.org');
  const { default: Page } = await import('./route');
  const html = renderWithCardPageChrome(<Page />);
  expect(html).not.toContain('data-testid="pending-draft-request"');
  expect(html).not.toContain('Draft a Request');
  expect(html).toContain('Not the right person?');
});
