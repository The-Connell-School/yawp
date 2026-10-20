import { renderToStaticMarkup } from 'react-dom/server';
import * as router from 'react-router';
import { afterAll, expect, mock, test } from 'bun:test';

mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({
  requireFreeTierEnabled: async () => {},
}));

mock.module('react-router', () => ({
  ...router,
  useLoaderData: () => ({
    app: { status: 'APPROVED', name: 'Teacher' },
    pending: null,
    lastFailedEmail: null,
    lockedPreview: false,
    approvalV2: { enabled: true, approval: null, firstSentAt: null },
  }),
  useActionData: () => undefined,
  useNavigation: () => ({ state: 'idle' }),
  Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const { default: Page } = await import('./route');

afterAll(() => mock.restore());

test('approved teachers get a Start teaching link to /app', () => {
  const html = renderToStaticMarkup(<Page />);
  expect(html).toContain('Your classroom is approved');
  expect(html).toContain('all set to start teaching with Yawp!');
  expect(html).toContain('Start teaching');
  expect(html).toContain('href="/app"');
});
