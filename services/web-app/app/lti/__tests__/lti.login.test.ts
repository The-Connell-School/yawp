import { beforeAll, describe, expect, test } from 'bun:test';
import { loader } from '~/routes/lti.login.ts';

beforeAll(() => {
  process.env.BLACKBOARD_LTI_MOCK_URL = 'http://127.0.0.1:9473';
});

function req(url: string): Request {
  return new Request(url);
}

describe('/lti/login', () => {
  test('redirects to platform OIDC auth with state/nonce', async () => {
    const res = await loader({
      request: req(
        'https://app.test/lti/login?iss=https://blackboard.com&client_id=yawp-blackboard-mock&login_hint=login-user&lti_message_hint=hint-1&target_link_uri=https%3A%2F%2Fapp.test%2Flti%2Flaunch'
      ),
      params: {},
    } as any);
    expect(res.status).toBe(302);
    const location = res.headers.get('location') || '';
    expect(location.startsWith('http://127.0.0.1:9473/api/v1/gateway/oidcauth')).toBe(
      true
    );
    const cookie = res.headers.get('set-cookie') || '';
    expect(cookie).toContain('yawp_lti_state=');
    expect(cookie).toContain('yawp_lti_nonce=');
  });
});

