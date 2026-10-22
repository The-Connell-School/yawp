import { describe, expect, mock, test } from 'bun:test';

mock.module('~/dev-panel/dev-panel-route-guard.server', () => ({
  assertDevPanelRoute: async () => null,
}));
mock.module('~/dev-panel/dev-panel-orgs.server', () => ({
  listDevPanelOrganizations: async () => [
    { id: 'local-dev-org', name: 'Yawp Local Dev' },
  ],
}));

const { loader } = await import('./route');

describe('api.dev-panel.orgs', () => {
  test('returns organizations for dev panel', async () => {
    const response = await loader({
      request: new Request('http://localhost/api/dev-panel/orgs'),
      params: {},
      context: {},
      url: new URL('http://localhost/api/dev-panel/orgs'),
      pattern: '/api/dev-panel/orgs',
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.organizations[0].name).toBe('Yawp Local Dev');
  });
});
