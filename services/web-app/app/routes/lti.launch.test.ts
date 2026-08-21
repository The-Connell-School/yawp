import { beforeAll, describe, expect, test } from 'bun:test';
import { action, loader } from './lti.launch.ts';

beforeAll(() => {
  process.env.BLACKBOARD_LTI_MOCK_URL = 'http://127.0.0.1:9473';
});

function formPost(url: string, fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new Request(url, { method: 'POST', body: fd });
}

function unsignedIdToken(payload: Record<string, unknown>) {
  const header = Buffer.from(
    JSON.stringify({ alg: 'none', kid: 'test' }),
    'utf8'
  ).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${header}.${body}.`;
}

describe('/lti/launch', () => {
  test('returns Deep Linking response html', async () => {
    const payload = {
      iss: 'https://blackboard.com',
      aud: 'yawp-blackboard-mock',
      nonce: 'n1',
      'https://purl.imsglobal.org/spec/lti/claim/message_type':
        'LtiDeepLinkingRequest',
      'https://purl.imsglobal.org/spec/lti/claim/deployment_id':
        'yawp-mock-deployment',
      'https://purl.imsglobal.org/spec/lti/claim/resource_link': {
        id: '_1_1',
        title: 'Yawp Assignment',
      },
      'https://purl.imsglobal.org/spec/lti-dl/claim/data': 'dl_1',
    };
    const req = formPost('https://app.test/lti/launch', {
      id_token: unsignedIdToken(payload),
      state: 's1',
    });
    req.headers.set(
      'cookie',
      'yawp_lti_state=s1; yawp_lti_nonce=n1; yawp_lti_client=yawp-blackboard-mock'
    );
    const res = await action({ request: req, params: {} } as any);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('/api/v1/lti/deep-linking');
    expect(html).toContain('name="JWT"');
  });

  test('redirects on resource link request', async () => {
    const payload = {
      iss: 'https://blackboard.com',
      aud: 'yawp-blackboard-mock',
      nonce: 'n2',
      'https://purl.imsglobal.org/spec/lti/claim/message_type':
        'LtiResourceLinkRequest',
      'https://purl.imsglobal.org/spec/lti/claim/target_link_uri':
        'https://app.test/app',
    };
    const req = formPost('https://app.test/lti/launch', {
      id_token: unsignedIdToken(payload),
      state: 's2',
    });
    req.headers.set(
      'cookie',
      'yawp_lti_state=s2; yawp_lti_nonce=n2; yawp_lti_client=yawp-blackboard-mock'
    );
    const res = await loader({ request: req, params: {} } as any);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://app.test/app');
  });
});

