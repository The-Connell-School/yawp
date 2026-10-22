import { afterAll, expect, mock, test } from 'bun:test';
import * as router from 'react-router';
import {
  mockCardPageChromeForSsr,
  renderWithCardPageChrome,
} from '~/components/card-page-chrome.ssr-test-setup';

mockCardPageChromeForSsr({ signedIn: false });

mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({
  requireFreeTierEnabled: async () => {},
}));
mock.module('~/utils/db.server', () => ({
  prisma: { freeTierApplication: { findUnique: async () => null } },
}));
mock.module('~/domain/free-tier/signed-link.server', () => ({
  peekSignedLink: async () => ({ ok: false, reason: 'invalid' }),
  applicationIdFromSignedToken: () => null,
}));
mock.module('~/domain/free-tier/admin-link-gate.server', () => ({
  fetchFreeTierApplicationTerminalGate: async () => null,
  resolveAdminLinkTerminalGate: async () => null,
  resolveAdminLinkReplacedGate: async () => null,
}));
mock.module('~/domain/free-tier/approval-flow.server', () => ({
  completeSchoolAdminApproval: async () => ({ ok: true }),
}));

mock.module('react-router', () => ({
  ...router,
  useLoaderData: () => ({
    ok: true,
    token: 'token',
    teacherName: 'Jordan Rivera',
    schoolName: 'Lincoln High School',
    teacherEmail: 'jrivera@lincolnhs.org',
  }),
  useActionData: () => undefined,
  useNavigation: () => ({ state: 'idle' }),
  Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
}));

const { default: Page } = await import('./route');
afterAll(() => mock.restore());

test('approve page renders teacher at school in heading without intro paragraph', () => {
  const html = renderWithCardPageChrome(
    <Page />,
    '/free/admin/approve?t=token'
  );
  expect(html).toContain(
    'Approve Yawp! for Jordan Rivera at Lincoln High School'
  );
  expect(html).not.toContain(
    'Jordan Rivera at Lincoln High School would like to use Yawp! in their classroom.'
  );
  expect(html).toContain('Teacher at Lincoln High School');
  expect(html).toContain('Forward this request');
});
