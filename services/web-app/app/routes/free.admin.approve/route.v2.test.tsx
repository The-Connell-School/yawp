import { renderToStaticMarkup } from 'react-dom/server';
import * as router from 'react-router';
import { afterAll, expect, mock, test } from 'bun:test';
mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({
  requireFreeTierEnabled: async () => {},
}));
mock.module('~/utils/db.server', () => ({
  prisma: {
    freeTierApplication: {
      findUnique: async () => ({
        id: 'app',
        userId: 'teacher',
        organizationId: null,
        status: 'SENT',
        schoolName: 'Lincoln High',
        name: 'Ms. Okafor',
        email: 'okafor@example.org',
      }),
    },
  },
}));
mock.module('~/domain/free-tier/signed-link.server', () => ({
  peekSignedLink: async () => ({ ok: true, applicationId: 'app' }),
}));
mock.module('~/domain/free-tier/approval-v2.server', () => ({
  isApprovalV2Enabled: async () => true,
  forwardApprovalByToken: async () => ({ ok: true, queued: true }),
}));
const approve = mock(async () => ({ ok: true }));
mock.module('~/domain/free-tier/approval-flow.server', () => ({
  completeSchoolAdminApproval: approve,
}));
let approvalV2 = true;
mock.module('react-router', () => ({
  ...router,
  useLoaderData: () => ({
    ok: true,
    approvalV2,
    teacherName: 'Ms. Okafor',
    schoolName: 'Lincoln High',
    token: 'token',
  }),
  useActionData: () => undefined,
  Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
}));
const { default: Page, loader, action } = await import('./route');
afterAll(() => mock.restore());
test('valid signed administrator request includes flagged layout and teacher details', async () => {
  const result = await loader({
    request: new Request('http://localhost/free/admin/approve?t=token'),
  } as never);
  expect(result).toMatchObject({
    ok: true,
    approvalV2: true,
    teacherEmail: 'okafor@example.org',
  });
});
test('flagged approval rejects a blank role on the server without consuming a link', async () => {
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

test('calendar appears only in the flagged administrator learn-more section with a safe fallback', () => {
  approvalV2 = true;
  const html = renderToStaticMarkup(<Page />);
  expect(html).toContain('I&#x27;d like to learn more first');
  expect(html).toContain(
    'src="https://app.usemotion.com/meet/brian-connell/ryxkqvr"'
  );
  expect(html).toContain('title="Book a time with Brian"');
  expect(html).toContain('loading="lazy"');
  expect(html).toContain('height="700"');
  expect(html).toContain('target="_blank" rel="noopener noreferrer"');
  expect(html).toContain('Ms. Okafor&#x27;s request will stay open.');
  approvalV2 = false;
  const legacy = renderToStaticMarkup(<Page />);
  expect(legacy).not.toContain('<iframe');
  expect(legacy).not.toContain('Open the calendar');
});
