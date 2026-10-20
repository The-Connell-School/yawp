import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';

const fixtureEnv = {
  BLACKBOARD_LTI_MOCK_URL: 'http://127.0.0.1:9473',
  YAWP_ENVIRONMENT: 'preview',
  PREVIEW_ACCESS_GATE: 'on',
  PREVIEW_DATA_MODE: 'seed',
};
const priorEnv = Object.fromEntries(
  Object.keys(fixtureEnv).map((key) => [key, process.env[key]])
);
const priorResponse = globalThis.Response;

const prisma = {
  user: {
    findFirst: mock(async () => null),
    findUnique: mock(async () => null),
    create: mock(async () => {
      throw new Error('user.create should not run for rejected launches');
    }),
  },
  session: {
    create: mock(async () => {
      throw new Error('session.create should not run for rejected launches');
    }),
    update: mock(async () => {
      throw new Error('session.update should not run for rejected launches');
    }),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/preview-access.server', () => ({
  rejectWithoutExplicitPreviewDevLoginAccess: async () => null,
  getPreviewAccessSeat: async () => null,
}));

afterAll(() => {
  for (const [key, value] of Object.entries(priorEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.Response = priorResponse;
});
beforeAll(() => {
  globalThis.Response = globalThis.__serverResponse;
  Object.assign(process.env, fixtureEnv);
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

describe('/lti/launch route', () => {
  test('rejects a forged resource-link launch on production', async () => {
    process.env.YAWP_ENVIRONMENT = 'production';
    delete process.env.BLACKBOARD_LTI_MOCK_URL;
    const { action } = await import('~/routes/lti.launch/route.ts');
    const payload = {
      iss: 'https://blackboard.com',
      aud: 'yawp-blackboard-mock',
      email: 'attacker@example.com',
      sub: 'attacker',
      'https://purl.imsglobal.org/spec/lti/claim/message_type':
        'LtiResourceLinkRequest',
    };
    const res = await action({
      request: formPost('https://yawp.school/lti/launch', {
        id_token: unsignedIdToken(payload),
      }),
      params: {},
    } as any);
    expect(res.status).toBe(401);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.session.create).not.toHaveBeenCalled();
    Object.assign(process.env, fixtureEnv);
  });

  test('posts the signed deep link server-side and redirects with cleared handshake cookies', async () => {
    const { action } = await import('~/routes/lti.launch/route.ts');
    const payload = {
      iss: 'https://blackboard.com',
      aud: 'yawp-blackboard-mock',
      nonce: 'n1',
      'https://purl.imsglobal.org/spec/lti/claim/message_type':
        'LtiDeepLinkingRequest',
      'https://purl.imsglobal.org/spec/lti/claim/deployment_id':
        'yawp-mock-deployment',
      'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings': {
        deep_link_return_url:
          'https://app.test/dev/blackboard-lti-mock/api/v1/lti/deep-linking',
      },
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
    let posts = 0;
    globalThis.fetch = (async () => {
      posts++;
      return new Response('accepted');
    }) as unknown as typeof fetch;
    try {
      const res = await action({ request: req, params: {} } as any);
      expect(posts).toBeGreaterThan(0);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/dev/blackboard-lti-mock/learn/courses');
      expect(res.headers.get('set-cookie')).toContain('yawp_lti_state=;');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
