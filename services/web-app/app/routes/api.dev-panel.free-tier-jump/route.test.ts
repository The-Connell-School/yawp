import { describe, expect, mock, test } from 'bun:test';

const orgScope = mock(async () => null as Response | null);
const executeJump = mock(async () => ({
  ok: true as const,
  redirectTo: '/app',
  steps: [],
  headers: new Headers(),
}));

mock.module('~/dev-panel/dev-panel-route-guard.server', () => ({
  assertDevPanelRoute: async () => null,
}));
mock.module('~/dev-panel/dev-panel-orgs.server', () => ({
  assertDevPanelOrganizationInSeatScope: orgScope,
}));
mock.module('~/dev-panel/free-tier-jump.server', () => ({
  executeFreeTierStateJump: executeJump,
}));
mock.module('~/utils/auth.server', () => ({
  getUserId: async () => 'user-1',
}));

const { action } = await import('./route');

describe('api.dev-panel.free-tier-jump', () => {
  test('rejects organization outside preview seat scope', async () => {
    orgScope.mockImplementationOnce(async () =>
      Response.json(
        { error: 'Organization is not in your preview seat.' },
        { status: 403 }
      )
    );
    const response = await action({
      request: new Request('http://localhost/api/dev-panel/free-tier-jump', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          stateId: 'approved.usage-plenty-left',
          organizationId: 'other-org',
          throwaway: true,
        }),
      }),
      params: {},
      context: {},
    });
    expect(response.status).toBe(403);
    expect(executeJump).not.toHaveBeenCalled();
  });

  test('calls jump when organization is in seat scope', async () => {
    orgScope.mockImplementationOnce(async () => null);
    executeJump.mockClear();
    const response = await action({
      request: new Request('http://localhost/api/dev-panel/free-tier-jump', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          stateId: 'approved.usage-plenty-left',
          organizationId: 'preview-org',
          throwaway: true,
        }),
      }),
      params: {},
      context: {},
    });
    expect(response.status).toBe(200);
    expect(executeJump).toHaveBeenCalled();
  });
});
