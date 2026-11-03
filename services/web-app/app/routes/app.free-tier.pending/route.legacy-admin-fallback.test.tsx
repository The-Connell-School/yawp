import { renderToStaticMarkup } from 'react-dom/server';
import * as router from 'react-router';
import { afterAll, expect, mock, test } from 'bun:test';

afterAll(() => mock.restore());

function mockLegacyPending(pending: { adminName: string | null; adminEmail: string }) {
  mock.module('react-router', () => ({
    ...router,
    useLoaderData: () => ({
      app: { status: 'SENT', name: 'Teacher', schoolName: 'Demo School' },
      pending,
      lastFailedEmail: null,
      showExploreClassroom: false,
      approvalEmailFrom: 'from@example.org',
      approvalV2: null,
    }),
    useActionData: () => undefined,
    useNavigation: () => ({ state: 'idle' }),
    Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
    Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
  }));
}

test('legacy pending without admin name capitalizes progress step and keeps mid-sentence copy', async () => {
  mockLegacyPending({ adminName: null, adminEmail: 'admin@example.org' });
  const { default: Page } = await import('./route');
  const html = renderToStaticMarkup(<Page />);
  expect(html).toContain('Your administrator approves');
  expect(html).toContain('Sent to your administrator.');
  expect(html).not.toContain('your administrator approves');
});
