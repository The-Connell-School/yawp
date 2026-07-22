import { beforeEach, describe, expect, mock, test } from 'bun:test';

const initiateLtiLogin = mock();
mock.module('~/domain/lms/lti-pilot.server', () => ({ initiateLtiLogin }));

const { action, loader } = await import('./route');

describe('LTI login initiation route', () => {
  beforeEach(() => {
    initiateLtiLogin.mockReset();
    initiateLtiLogin.mockResolvedValue({
      transactionId: 'transaction-1',
      browserBindingSecret:
        'browser-binding-secret-with-at-least-thirty-two-characters',
      authorizationUrl: new URL('https://lms.example.edu/oidc/auth?state=safe'),
    });
  });

  test('redirects a GET initiation to the registered authorization endpoint', async () => {
    const response = await loader({
      request: new Request(
        'https://yawp.example/lti/login?iss=https%3A%2F%2Flms.example.edu&client_id=client&lti_deployment_id=deployment&login_hint=opaque&target_link_uri=https%3A%2F%2Fyawp.example%2Flti%2Flaunch'
      ),
      params: {},
      context: undefined,
    } as never);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://lms.example.edu/oidc/auth?state=safe'
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toContain('yawp-lti-bind');
    expect(initiateLtiLogin).toHaveBeenCalledTimes(1);
  });

  test('rejects an iframe presentation before persistence', async () => {
    const response = await loader({
      request: new Request('https://yawp.example/lti/login?iss=x', {
        headers: { 'sec-fetch-dest': 'iframe' },
      }),
      params: {},
      context: undefined,
    } as never);
    expect(response.headers.get('location')).toBe('/lti/error');
    expect(initiateLtiLogin).not.toHaveBeenCalled();
  });

  test('rejects media-type prefix tricks without calling the launch service', async () => {
    const response = await action({
      request: new Request('https://yawp.example/lti/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded-evil',
        },
        body: 'iss=https%3A%2F%2Flms.example.edu',
      }),
      params: {},
      context: undefined,
    } as never);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/lti/error');
    expect(initiateLtiLogin).not.toHaveBeenCalled();
  });

  test('rejects an oversized declared form without reading or persisting it', async () => {
    const response = await action({
      request: new Request('https://yawp.example/lti/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'content-length': '9000',
        },
        body: 'iss=x',
      }),
      params: {},
      context: undefined,
    } as never);
    expect(response.headers.get('location')).toBe('/lti/error');
    expect(initiateLtiLogin).not.toHaveBeenCalled();
  });
});
