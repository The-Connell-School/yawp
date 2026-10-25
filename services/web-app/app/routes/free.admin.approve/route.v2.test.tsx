import { afterAll, expect, mock, test } from 'bun:test';
import * as router from 'react-router';
import {
  mockCardPageChromeForSsr,
  renderWithCardPageChrome,
} from '~/components/card-page-chrome.ssr-test-setup';
afterAll(() => mock.restore());
mockCardPageChromeForSsr({ signedIn: false });
mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({
  requireFreeTierEnabled: async () => {},
}));
mock.module('~/utils/db.server', () => ({
  prisma: {
    freeTierApplication: {
      findUnique: async () => ({
        id: 'app',
        status: 'SENT',
        schoolName: 'Lincoln High School',
        name: 'Jordan Rivera',
        email: 'jrivera@lincolnhs.org',
      }),
    },
  },
}));
mock.module('~/domain/free-tier/signed-link.server', () => ({
  peekSignedLink: async () => ({ ok: true, applicationId: 'app' }),
  applicationIdFromSignedToken: () => 'app',
}));
mock.module('~/domain/free-tier/admin-link-gate.server', () => ({
  fetchFreeTierApplicationTerminalGate: async () => null,
  resolveAdminLinkTerminalGate: async () => null,
  resolveAdminLinkReplacedGate: async () => null,
}));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFeatureFlagEnabled: async () => true,
}));
mock.module('~/domain/free-tier/approval-deny.server', () => ({
  resolveAdminDenyAnsweredGate: async () => null,
}));
mock.module('~/domain/free-tier/admin-approve-forward-link.server', () => ({
  resolveAdminForwardTokenForApproveLink: async () => 'forward-token',
  buildAdminForwardPageSearch: (forwardToken: string, approveToken: string) =>
    `?t=${encodeURIComponent(forwardToken)}&approveT=${encodeURIComponent(approveToken)}`,
}));
const approve = mock(async () => ({ ok: true }));
mock.module('~/domain/free-tier/approval-flow.server', () => ({
  completeSchoolAdminApproval: approve,
}));
mock.module('react-router', () => ({
  ...router,
  useLoaderData: () => ({
    ok: true,
    token: 'approve-token',
    forwardToken: 'forward-token',
    teacherName: 'Jordan Rivera',
    schoolName: 'Lincoln High School',
    teacherEmail: 'jrivera@lincolnhs.org',
    showDenyAndQa: true,
  }),
  useActionData: () => undefined,
  useNavigation: () => ({ state: 'idle' }),
  Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
}));
const { default: Page, loader, action } = await import('./route');

test('valid signed administrator request includes teacher and school', async () => {
  const result = await loader({
    request: new Request('http://localhost/free/admin/approve?t=token'),
  } as never);
  expect(result).toMatchObject({
    ok: true,
    teacherName: 'Jordan Rivera',
    schoolName: 'Lincoln High School',
  });
});

test('approval rejects a blank role on the server without consuming a link', async () => {
  const result = await action({
    request: new Request('http://localhost/free/admin/approve', {
      method: 'POST',
      body: new URLSearchParams({
        token: 'token',
        adminRole: ' ',
        authorized: 'on',
      }),
    }),
  } as never);
  expect(result.ok).toBe(false);
  expect(approve).not.toHaveBeenCalled();
});

test('approve page uses the designed heading and forward link', () => {
  const html = renderWithCardPageChrome(
    <Page />,
    '/free/admin/approve?t=token'
  );
  expect(html).toContain(
    'Approve Yawp! for Jordan Rivera at Lincoln High School'
  );
  expect(html).toContain('Deny request');
  expect(html).toContain('I&#x27;d like to learn more first');
  expect(html).toContain('What Yawp! is');
  expect(html).toContain('Forward this request');
  expect(html).toContain(
    '/free/admin/not-right-person?t=forward-token&amp;approveT=approve-token'
  );
});

