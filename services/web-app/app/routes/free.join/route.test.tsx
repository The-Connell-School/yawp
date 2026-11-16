import * as router from 'react-router';
import { beforeEach, expect, mock, test } from 'bun:test';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mockCardPageChromeForSsr } from '~/components/card-page-chrome.ssr-test-setup';

const peekSignedLink = mock(
  async (): Promise<
    | { ok: false; reason: 'expired' }
    | { ok: false; reason: 'used'; applicationId: string }
  > => ({ ok: false, reason: 'expired' })
);
const findUnique = mock(async () => ({
  email: 'teacher@school.edu',
  name: 'Ada',
  status: 'ACCOUNT_CREATED',
  releaseEmailCopyVersion: null,
}));
let loaderData: Record<string, unknown> = {
  ok: false,
  reason: 'expired',
};

mockCardPageChromeForSsr({ signedIn: false });
mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({
  requireFreeTierEnabled: async () => {},
}));
mock.module('~/domain/free-tier/signed-link.server', () => ({ peekSignedLink }));
mock.module('~/utils/db.server', () => ({
  prisma: { freeTierApplication: { findUnique } },
}));
mock.module('react-router', () => ({
  ...router,
  useLoaderData: () => loaderData,
  useActionData: () => undefined,
  Form: ({ children, ...props }: { children?: ReactNode }) => (
    <form {...props}>{children}</form>
  ),
}));

const { loader, default: FreeJoinRoute } = await import('./route');

beforeEach(() => {
  peekSignedLink.mockReset();
  findUnique.mockReset();
  findUnique.mockResolvedValue({
    email: 'teacher@school.edu',
    name: 'Ada',
    status: 'ACCOUNT_CREATED',
    releaseEmailCopyVersion: null,
  });
});

function renderJoin() {
  const { StaticRouter } = require('react-router') as typeof import('react-router');
  return renderToStaticMarkup(
    <StaticRouter location="/free/join">
      <FreeJoinRoute />
    </StaticRouter>
  ).replace(/&#x27;/g, "'");
}

test('an expired invite keeps the 30-day copy and does not reveal an email', async () => {
  peekSignedLink.mockResolvedValue({ ok: false, reason: 'expired' });
  const result = await loader({
    request: new Request('https://yawp.test/free/join?t=expired-token'),
  } as never);
  expect(result).toEqual({ ok: false, reason: 'expired' });
  expect(findUnique).not.toHaveBeenCalled();
  loaderData = result;
  const html = renderJoin();
  expect(html).toContain("This invite link isn't valid");
  expect(html).toContain('Invites last 30 days.');
  expect(html).not.toContain('already used');
  expect(html).not.toContain('teacher@school.edu');
});

test('a used invite says it was used and links to sign-in with the teacher email', async () => {
  peekSignedLink.mockResolvedValue({
    ok: false,
    reason: 'used',
    applicationId: 'app-1',
  });
  const result = await loader({
    request: new Request('https://yawp.test/free/join?t=used-token'),
  } as never);
  expect(findUnique).toHaveBeenCalledTimes(1);
  expect(result).toEqual({
    ok: false,
    reason: 'used',
    email: 'teacher@school.edu',
    signInHref: '/auth/login?email=teacher%40school.edu',
  });
  loaderData = result;
  const html = renderJoin();
  expect(html).toContain('This invite was already used');
  expect(html).toContain(
    'already used to create an account for teacher@school.edu'
  );
  expect(html).toContain('href="/auth/login?email=teacher%40school.edu"');
  expect(html).toContain('Sign in');
  expect(html).not.toContain('Invites last 30 days.');
});

test('a used invite with an unsafe stored email still offers sign-in without prefilling', async () => {
  peekSignedLink.mockResolvedValue({
    ok: false,
    reason: 'used',
    applicationId: 'app-1',
  });
  findUnique.mockResolvedValue({
    email: 'teacher@school.edu\nBcc:evil@example.com',
    name: 'Ada',
    status: 'ACCOUNT_CREATED',
    releaseEmailCopyVersion: null,
  });
  const result = await loader({
    request: new Request('https://yawp.test/free/join?t=used-token'),
  } as never);
  expect(result).toEqual({
    ok: false,
    reason: 'used',
    email: null,
    signInHref: '/auth/login',
  });
  loaderData = result;
  const html = renderJoin();
  expect(html).toContain('href="/auth/login"');
  expect(html).not.toContain('Bcc:');
  expect(html).toContain('This invite link was already used. Sign in');
});
