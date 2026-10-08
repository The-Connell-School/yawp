import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { action, loader } from '~/routes/lti.launch.ts';

const fixtureEnv={BLACKBOARD_LTI_MOCK_URL:'http://127.0.0.1:9473',YAWP_ENVIRONMENT:'preview',PREVIEW_ACCESS_GATE:'on',PREVIEW_DATA_MODE:'seed'};
const priorEnv=Object.fromEntries(Object.keys(fixtureEnv).map(key=>[key,process.env[key]]));
const priorResponse = globalThis.Response;
afterAll(() => { for(const [key,value] of Object.entries(priorEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}globalThis.Response=priorResponse; });
beforeAll(() => {
  globalThis.Response=globalThis.__serverResponse;
  Object.assign(process.env,fixtureEnv);
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
  test('posts the signed deep link server-side and redirects with cleared handshake cookies', async () => {
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
    const originalFetch = globalThis.fetch;
    let postedJwt = '';
    let posts = 0;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('http://127.0.0.1:9473/api/v1/lti/deep-linking');
      expect(init?.method).toBe('POST');
      expect(new Headers(init?.headers).get('content-type')).toContain('application/x-www-form-urlencoded');
      postedJwt = new URLSearchParams(String(init?.body)).get('JWT') ?? '';
      posts++;
      return new Response('accepted');
    }) as typeof fetch;
    try {
      const res = await action({ request: req, params: {} } as any);
      expect(posts).toBe(1);
      expect(postedJwt.split('.')).toHaveLength(3);
      expect(postedJwt.split('.')[2].length).toBeGreaterThan(0);
      const sent = JSON.parse(Buffer.from(postedJwt.split('.')[1], 'base64url').toString());
      expect(sent.iss).toBe('yawp-blackboard-mock');
      expect(sent.aud).toBe('https://blackboard.com');
      expect(sent['https://purl.imsglobal.org/spec/lti-dl/claim/data']).toBe('dl_1');
      expect(sent['https://purl.imsglobal.org/spec/lti-dl/claim/content_items'][0].url).toBe('https://app.test/lti/launch');
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/dev/blackboard-lti-mock/dev/deep-links');
      expect(res.headers.get('set-cookie')).toContain('yawp_lti_state=;');
      expect(res.headers.get('set-cookie')).toContain('yawp_lti_nonce=;');
    } finally { globalThis.fetch = originalFetch; }
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
    // With the preview access gate on and no session, the launch hands off to
    // dev-login instead (covered below); the plain redirect is the gate-off path.
    process.env.PREVIEW_ACCESS_GATE = 'off';
    try {
      const res = await loader({ request: req, params: {} } as any);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('https://app.test/app');
    } finally {
      process.env.PREVIEW_ACCESS_GATE = fixtureEnv.PREVIEW_ACCESS_GATE;
    }
  });

  test('hands a sessionless preview launch to dev-login', async () => {
    const payload = {
      iss: 'https://blackboard.com',
      aud: 'yawp-blackboard-mock',
      nonce: 'n3',
      'https://purl.imsglobal.org/spec/lti/claim/message_type':
        'LtiResourceLinkRequest',
      'https://purl.imsglobal.org/spec/lti/claim/target_link_uri':
        'https://app.test/app',
      'https://purl.imsglobal.org/spec/lti/claim/roles': [
        'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
      ],
    };
    const req = formPost('https://app.test/lti/launch', {
      id_token: unsignedIdToken(payload),
      state: 's3',
    });
    req.headers.set(
      'cookie',
      'yawp_lti_state=s3; yawp_lti_nonce=n3; yawp_lti_client=yawp-blackboard-mock'
    );
    const res = await loader({ request: req, params: {} } as any);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('dev.teacher@yawp.local');
  });
});

