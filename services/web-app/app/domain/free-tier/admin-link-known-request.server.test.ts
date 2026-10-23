import { afterAll, beforeAll, expect, test } from 'bun:test';

const realSignedLink =
  globalThis.__realModules['~/domain/free-tier/signed-link.server'];

beforeAll(() => {
  if (realSignedLink) {
    mock.module('~/domain/free-tier/signed-link.server', () => realSignedLink);
  }
});

afterAll(() => {
  if (realSignedLink) {
    mock.module('~/domain/free-tier/signed-link.server', () => realSignedLink);
  }
});

import { mock } from 'bun:test';

const { applicationIdForAdminLinkNaming } = await import(
  './admin-link-known-request.server'
);

test('invalid and purpose_mismatch peeks never resolve an application id', async () => {
  for (const reason of ['invalid', 'purpose_mismatch'] as const) {
    expect(
      await applicationIdForAdminLinkNaming(
        'not-a-token',
        { ok: false, reason },
        'ADMIN_APPROVE'
      )
    ).toBeNull();
  }
});

test('valid peek returns application id', async () => {
  expect(
    await applicationIdForAdminLinkNaming(
      'token',
      {
        ok: true,
        applicationId: 'app-1',
        purpose: 'ADMIN_APPROVE',
        linkId: 'link-1',
      },
      'ADMIN_APPROVE'
    )
  ).toBe('app-1');
});
