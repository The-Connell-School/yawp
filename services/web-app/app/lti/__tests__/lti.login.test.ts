import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { loader } from '~/routes/lti.login.ts';

const priorUrl = process.env.BLACKBOARD_LTI_MOCK_URL;
const priorResponse = globalThis.Response;
afterAll(() => { if(priorUrl===undefined)delete process.env.BLACKBOARD_LTI_MOCK_URL;else process.env.BLACKBOARD_LTI_MOCK_URL=priorUrl;globalThis.Response=priorResponse; });
beforeAll(() => {
  globalThis.Response=globalThis.__serverResponse;
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
    expect(location.startsWith('https://app.test/dev/blackboard-lti-mock/api/v1/gateway/oidcauth')).toBe(
      true
    );
    const cookie = res.headers.get('set-cookie') || '';
    expect(cookie).toContain('yawp_lti_state=');
    expect(cookie).toContain('yawp_lti_nonce=');
  });
});

