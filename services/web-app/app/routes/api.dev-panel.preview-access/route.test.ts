import { describe, expect, mock, test } from 'bun:test';

mock.module('~/dev-panel/dev-panel-route-guard.server', () => ({
  assertDevPanelRoute: async () => null,
}));
mock.module('~/utils/preview-access.server', () => ({
  isPreviewAccessConfigured: () => true,
  findPreviewAccessCredentialByCode: async (code: string) => {
    if (code === 'seat-ok') {
      return {
        kind: 'organization',
        seat: { organizationId: 'org-1', label: 'Preview seat' },
      };
    }
    if (code === 'master-code') return { kind: 'master' };
    return null;
  },
  grantPreviewAccessCookie: async () => 'preview-access=test',
}));
mock.module('~/utils/preview-access-rate-limit.server', () => ({
  checkPreviewAccessAttempt: () => ({ allowed: true }),
  clearFailedPreviewAccessAttempts: () => {},
  recordFailedPreviewAccessAttempt: () => {},
}));

const { action } = await import('./route');

describe('api.dev-panel.preview-access', () => {
  test('accepts seat codes and returns seat label', async () => {
    const response = await action({
      request: new Request('http://localhost/api/dev-panel/preview-access', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'seat-ok' }),
      }),
    } as never);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.seatLabel).toBe('Preview seat');
  });

  test('rejects master credentials like a wrong seat code', async () => {
    const response = await action({
      request: new Request('http://localhost/api/dev-panel/preview-access', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'master-code' }),
      }),
    } as never);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('That access code did not work.');
  });
});
