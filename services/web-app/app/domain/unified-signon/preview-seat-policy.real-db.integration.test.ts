import { beforeAll, afterAll, expect, test } from 'bun:test';
import { prisma } from '~/utils/db.server';
import { dispatchUnifiedLogin, unifiedEntry } from './entry.server';
import { createPreviewAccessAction } from '~/routes/auth.preview-access/action.server';
import { createPreviewAccessMiddleware } from '~/utils/preview-access.server';
import {
  qaId,
  qaEmail,
  seedPreviewSignonQa,
} from '../../../../../packages/prisma/scripts/seed-preview-signon-qa';
import { LOCAL_DEV_PASSWORD } from '../../../../../packages/prisma/scripts/local-dev/dev-personas';
const enabled = process.env.SIGNON_PREVIEW_FIXTURE_TEST === '1';
const suite = enabled ? test : test.skip;
const priorEnv = { ...process.env };
const flag = 'feature_flag.unified-sign-on';
let previousFlag: any;
let cookie = '',
  token = '',
  ip = 0;
const url = 'http://localhost:5397';
function merge(response: Response) {
  for (const c of response.headers.getSetCookie()) {
    const part = c.split(';')[0];
    cookie = cookie
      .split('; ')
      .filter((p) => p && p.split('=')[0] !== part.split('=')[0])
      .concat(part)
      .join('; ');
  }
}
function fresh() {
  cookie = '';
  token = '';
  ip++;
}
const request = (pathname: string, values?: Record<string, string>) =>
  new Request(url + pathname, {
    method: values ? 'POST' : 'GET',
    headers: { cookie, Origin: url, 'x-forwarded-for': `198.19.1.${ip}` },
    ...(values ? { body: new URLSearchParams(values) } : {}),
  });
async function access(values: Record<string, string>) {
  let result: Response;
  try {
    result = await createPreviewAccessAction()({
      request: request('/auth/preview-access', values),
    } as any);
  } catch (r) {
    if (!(r instanceof Response)) throw r;
    result = r;
  }
  merge(result);
  return result;
}
async function master(key?: string) {
  expect(
    (await access({ code: process.env.PREVIEW_MASTER_ACCESS_CODE! })).status
  ).toBe(302);
  expect(
    (
      await access(
        key
          ? { intent: 'select-signon-qa', account: key }
          : {
              intent: 'select-organization',
              organizationId: qaId('school'),
            }
      )
    ).status
  ).toBe(302);
}
async function post(intent: string, values: Record<string, string> = {}) {
  const result = await dispatchUnifiedLogin({
    request: request('/auth/login', { intent, flowToken: token, ...values }),
  } as any);
  if (!(result instanceof Response))
    return {
      response: Response.json(result, { status: 422 }),
      data: result as any,
    };
  merge(result);
  const data = result.headers.get('content-type')?.includes('json')
    ? await result.json()
    : null;
  if (data?.state?.flowToken) token = data.state.flowToken;
  return { response: result, data };
}
async function login(key: string, password = LOCAL_DEV_PASSWORD) {
  expect(
    (
      await post('resolve', {
        identifier: qaEmail(key),
        redirectTo: '/app/my-classes',
      })
    ).data.state.screen
  ).toBe('password');
  return post('password', { password });
}
async function continuation(): Promise<Response> {
  // Run the actual request-boundary middleware as well as database-backed handlers.
  const response = await createPreviewAccessMiddleware()(
    { request: request('/auth/login?continue=1') } as any,
    async () => {
      try {
        return Response.json(
          await unifiedEntry(request('/auth/login?continue=1'))
        );
      } catch (r) {
        if (!(r instanceof Response)) throw r;
        return r;
      }
    }
  );
  if (!(response instanceof Response))
    throw new Error('Missing middleware response');
  return response;
}
beforeAll(async () => {
  if (!enabled) return;
  if (
    !process.env.DATABASE_URL?.endsWith('/yawp_pr_999565') ||
    new URL(process.env.DATABASE_URL).hostname !== '127.0.0.1'
  )
    throw new Error('Disposable lane database required');
  Object.assign(process.env, {
    YAWP_ENVIRONMENT: 'preview',
    PREVIEW_SLUG: 'pr-999565',
    PREVIEW_ACCESS_GATE: 'on',
    PREVIEW_DATA_MODE: 'seed',
    PREVIEW_ACCESS_SECRET: 'local-fixture-preview-secret-32-characters',
    PREVIEW_MASTER_ACCESS_CODE: 'local-fixture-master-access',
    PREVIEW_ACCESS_SEATS: JSON.stringify([
      {
        code: 'fixture-otter-4193',
        organizationId: 'local-dev-org',
        label: 'Master',
      },
    ]),
  });
  previousFlag = await prisma.setting.findUnique({ where: { name: flag } });
  await prisma.setting.upsert({
    where: { name: flag },
    update: { value: 'true' },
    create: { name: flag, value: 'true', valueType: 'boolean' },
  });
  await seedPreviewSignonQa(prisma);
});
afterAll(async () => {
  if (!enabled) return;
  await prisma.setting.deleteMany({ where: { name: flag } });
  if (previousFlag) await prisma.setting.create({ data: previousFlag });
  for (const k of Object.keys(process.env))
    if (!(k in priorEnv)) delete process.env[k];
  Object.assign(process.env, priorEnv);
  await prisma.$disconnect();
});
suite(
  'ordinary master-selected seat still filters row 21 and rejects inactive/orphan row 22',
  async () => {
    for (const key of ['multiple', 'inactive', 'orphan']) {
      fresh();
      await master();
      const result = await login(key);
      if (key === 'multiple') {
        expect(result.response.status).toBe(302);
        expect((await continuation()).headers.get('location')).toBe(
          '/app/my-classes'
        );
      } else expect(result.response.status).not.toBe(302);
    }
  }
);
suite(
  'authorized fixture context reaches owned active picker and rejects unowned/inactive selections',
  async () => {
    fresh();
    await master('multiple');
    expect((await login('multiple')).response.status).toBe(302);
    const next = await continuation();
    expect(next.status).toBe(200);
    const state = (await next.json()).initialState;
    expect(state.screen).toBe('membership');
    const owned = await prisma.orgMembership.findMany({
      where: { userId: qaId('multiple'), isActive: true },
      orderBy: { id: 'asc' },
    });
    expect(state.memberships.map((m: any) => m.id)).toEqual(
      owned.map((m) => m.id)
    );
    const foreign = await prisma.orgMembership.findFirstOrThrow({
      where: { userId: qaId('password'), isActive: true },
    });
    expect(
      (await post('select-membership', { membershipId: foreign.id })).response
        .status
    ).toBe(403);
    const inactive = await prisma.orgMembership.findFirstOrThrow({
      where: { userId: qaId('multiple'), isActive: false },
    });
    expect(
      (await post('select-membership', { membershipId: inactive.id })).response
        .status
    ).toBe(403);
    const second = owned.find((m) => m.organizationId === qaId('second'))!;
    expect(
      (
        await post('select-membership', { membershipId: second.id })
      ).response.headers.get('location')
    ).toBe('/app/my-classes');
    expect(
      (await createPreviewAccessMiddleware()(
        { request: request('/app/my-classes') } as any,
        async () => Response.json({ ok: true })
      ))!.status
    ).toBe(200);
  }
);
suite(
  'authorized inactive and orphan fixtures reach real recovery; unassigned retains its existing destination',
  async () => {
    for (const key of ['inactive', 'orphan', 'unassigned']) {
      fresh();
      await master(key);
      expect((await login(key)).response.status).toBe(302);
      const result = await continuation();
      if (key === 'unassigned')
        expect(result.headers.get('location')).toBe('/app/my-classes');
      else
        expect((await result.json()).initialState).toMatchObject({
          screen: 'inactive',
          variant: 'student',
        });
    }
  }
);
suite(
  'QA authorization does not authenticate wrong passwords or unrelated fixture accounts',
  async () => {
    fresh();
    await master('inactive');
    const before = await prisma.session.count({
      where: { userId: qaId('inactive') },
    });
    expect(
      (await login('inactive', 'incorrect-password')).response.status
    ).not.toBe(302);
    expect(
      await prisma.session.count({ where: { userId: qaId('inactive') } })
    ).toBe(before);
    fresh();
    await master('inactive');
    expect((await login('orphan')).response.status).not.toBe(302);
    fresh();
    await master('multiple');
    expect((await login('trial-account_created')).response.status).not.toBe(
      302
    );
  }
);
suite(
  'ordinary seat and missing master authorization cannot issue QA context',
  async () => {
    fresh();
    expect(
      (await access({ intent: 'select-signon-qa', account: 'inactive' })).status
    ).toBe(401);
    expect((await access({ code: 'fixture-otter-4193' })).status).toBe(302);
    expect(
      (await access({ intent: 'select-signon-qa', account: 'inactive' })).status
    ).toBe(401);
    expect((await login('inactive')).response.status).not.toBe(302);
    expect((await login('multiple')).response.status).not.toBe(302);
    fresh();
    expect(
      (await access({ code: process.env.PREVIEW_MASTER_ACCESS_CODE! })).status
    ).toBe(302);
    expect(
      (await access({ intent: 'select-signon-qa', account: 'password' })).status
    ).toBe(400);
  }
);

suite(
  'tampered, expired, future, missing and seat-swapped context cannot admit inactive fixtures',
  async () => {
    const { createPreviewSignonQaCookie, PREVIEW_SIGNON_QA_COOKIE } =
      await import('~/utils/preview-signon-qa.server');
    const kinds = [
      'tampered',
      'expired',
      'future',
      'missing',
      'ordinary-seat',
      'missing-access',
      'missing-secret',
      'revoked-master',
    ];
    for (const [index, kind] of kinds.entries()) {
      const account = index % 2 ? 'orphan' : 'inactive';
      fresh();
      await master(account);
      const qaCookie = createPreviewSignonQaCookie();
      const data = await qaCookie.parse(cookie);
      const oldSecret = process.env.PREVIEW_ACCESS_SECRET;
      const oldMaster = process.env.PREVIEW_MASTER_ACCESS_CODE;
      if (kind === 'tampered')
        cookie = cookie.replace(
          new RegExp(`${PREVIEW_SIGNON_QA_COOKIE}=[^;]+`),
          `${PREVIEW_SIGNON_QA_COOKIE}=forged`
        );
      if (kind === 'expired' || kind === 'future') {
        data.issuedAt =
          Math.floor(Date.now() / 1000) + (kind === 'expired' ? -601 : 60);
        merge(
          new Response(null, {
            headers: { 'Set-Cookie': await qaCookie.serialize(data) },
          })
        );
      }
      if (kind === 'missing')
        cookie = cookie
          .split('; ')
          .filter((c) => !c.startsWith(PREVIEW_SIGNON_QA_COOKIE + '='))
          .join('; ');
      if (kind === 'missing-access')
        cookie = cookie
          .split('; ')
          .filter((c) => !c.startsWith('__yawp_preview_access='))
          .join('; ');
      if (kind === 'ordinary-seat') {
        const savedQa = cookie
          .split('; ')
          .find((c) => c.startsWith(PREVIEW_SIGNON_QA_COOKIE + '='))!;
        expect((await access({ code: 'fixture-otter-4193' })).status).toBe(302);
        // Even a copied still-signed QA cookie cannot upgrade an organization code.
        cookie = cookie
          .split('; ')
          .filter((c) => !c.startsWith(PREVIEW_SIGNON_QA_COOKIE + '='))
          .concat(savedQa)
          .join('; ');
      }
      if (kind === 'missing-secret') delete process.env.PREVIEW_ACCESS_SECRET;
      if (kind === 'revoked-master')
        process.env.PREVIEW_MASTER_ACCESS_CODE = 'another-local-master-access';
      try {
        expect((await login(account)).response.status).not.toBe(302);
      } finally {
        process.env.PREVIEW_ACCESS_SECRET = oldSecret;
        process.env.PREVIEW_MASTER_ACCESS_CODE = oldMaster;
      }
    }
  }
);
suite(
  'demo, production, flag OFF, non-preview targets and connection mismatches cannot use or issue QA context',
  async () => {
    const { hasPreviewSignonQaContext, previewSignonQaAvailable } =
      await import('~/utils/preview-signon-qa.server');
    for (const patch of [
      { YAWP_ENVIRONMENT: 'demo' },
      { YAWP_ENVIRONMENT: 'production' },
      { PREVIEW_DATA_MODE: 'sanitized-production' },
      { PREVIEW_ACCESS_GATE: 'off' },
      {
        DATABASE_URL: process.env.DATABASE_URL!.replace(
          '/yawp_pr_999565',
          '/demo'
        ),
      },
      { DATABASE_URL: process.env.DATABASE_URL! + '?options=-c%20dbname=demo' },
      {
        DATABASE_URL: process.env.DATABASE_URL!.replaceAll('999565', '999566'),
        PREVIEW_SLUG: 'pr-999566',
      },
      {
        DATABASE_URL: process.env.DATABASE_URL!.replace(
          '127.0.0.1',
          'db.example.test'
        ),
      },
    ]) {
      fresh();
      await master('inactive');
      const saved = { ...process.env };
      Object.assign(process.env, patch);
      try {
        expect(
          await hasPreviewSignonQaContext(
            request('/auth/login'),
            qaId('inactive')
          )
        ).toBe(false);
        expect(await previewSignonQaAvailable()).toBe(false);
        // A signed, unexpired pending master token still cannot issue QA outside the target.
        expect(
          (await access({ code: process.env.PREVIEW_MASTER_ACCESS_CODE! }))
            .status
        ).toBe(302);
        expect(
          (await access({ intent: 'select-signon-qa', account: 'inactive' }))
            .status
        ).toBe(404);
      } finally {
        Object.assign(process.env, saved);
      }
    }
    fresh();
    await master('inactive');
    await prisma.setting.update({
      where: { name: flag },
      data: { value: 'false' },
    });
    try {
      expect(
        await hasPreviewSignonQaContext(
          request('/auth/login'),
          qaId('inactive')
        )
      ).toBe(false);
      const result = await post('password', {
        email: qaEmail('inactive'),
        password: LOCAL_DEV_PASSWORD,
      });
      expect(result.response.status).not.toBe(302);
      expect(await unifiedEntry(request('/auth/login'))).toBeNull();
    } finally {
      await prisma.setting.update({
        where: { name: flag },
        data: { value: 'true' },
      });
    }
  }
);
suite(
  'unrelated ordinary account, altered fixture identity and non-fixture membership cannot gain QA privileges',
  async () => {
    const { hasPreviewSignonQaContext } =
      await import('~/utils/preview-signon-qa.server');
    fresh();
    await master('inactive');
    expect(
      (await post('resolve', { identifier: 'dev.student@yawp.local' })).data
        .state.screen
    ).toBe('password');
    expect(
      (await post('password', { password: LOCAL_DEV_PASSWORD })).response.status
    ).not.toBe(302);
    const fixture = await prisma.user.findUniqueOrThrow({
      where: { id: qaId('inactive') },
    });
    await prisma.user.update({
      where: { id: fixture.id },
      data: { email: 'changed@signon.preview.yawp.invalid' },
    });
    try {
      expect(
        await hasPreviewSignonQaContext(request('/auth/login'), fixture.id)
      ).toBe(false);
    } finally {
      await prisma.user.update({
        where: { id: fixture.id },
        data: { email: fixture.email },
      });
    }
    const unexpected = await prisma.orgMembership.create({
      data: {
        userId: fixture.id,
        organizationId: 'local-dev-org',
        role: 'STUDENT',
        isActive: false,
      },
    });
    try {
      expect(
        await hasPreviewSignonQaContext(request('/auth/login'), fixture.id)
      ).toBe(false);
    } finally {
      await prisma.orgMembership.delete({ where: { id: unexpected.id } });
    }
  }
);
suite(
  'middleware rejects an unowned selected membership and removes the real session',
  async () => {
    const { setMembershipId } = await import('~/cookies/membership-id.server');
    fresh();
    await master('multiple');
    expect((await login('multiple')).response.status).toBe(302);
    const foreign = await prisma.orgMembership.findFirstOrThrow({
      where: { userId: qaId('password'), isActive: true },
    });
    merge(
      new Response(null, {
        headers: { 'Set-Cookie': await setMembershipId(foreign.id) },
      })
    );
    const result = await createPreviewAccessMiddleware()(
      {
        request: request('/api/membership-id', { membershipId: foreign.id }),
      } as any,
      async () => Response.json({ error: 'must not execute' })
    );
    expect((result as Response).status).toBe(401);
    expect(await (result as Response).json()).toEqual({
      error: 'Authenticated session does not belong to this preview seat.',
    });
  }
);
suite(
  'entering a QA context clears a stale membership from the previous account',
  async () => {
    const { setMembershipId, getMembershipId } =
      await import('~/cookies/membership-id.server');
    fresh();
    merge(
      new Response(null, {
        headers: {
          'Set-Cookie': await setMembershipId('old-account-membership'),
        },
      })
    );
    await master('inactive');
    expect(await getMembershipId(request('/auth/login'))).toBeFalsy();
    expect((await login('inactive')).response.status).toBe(302);
    expect((await (await continuation()).json()).initialState.screen).toBe(
      'inactive'
    );
  }
);
suite(
  'expired or forged pending master authorization cannot issue QA context',
  async () => {
    const { createPreviewMasterSelectionCookie } =
      await import('~/utils/preview-access.server');
    for (const kind of ['expired', 'forged']) {
      fresh();
      expect(
        (await access({ code: process.env.PREVIEW_MASTER_ACCESS_CODE! })).status
      ).toBe(302);
      const masterCookie = createPreviewMasterSelectionCookie();
      const value = await masterCookie.parse(cookie);
      const expired = value.replace(
        /master-v2:[0-9]+:/,
        `master-v2:${Math.floor(Date.now() / 1000) - 601}:`
      );
      merge(
        new Response(null, {
          headers: {
            'Set-Cookie':
              kind === 'expired'
                ? await masterCookie.serialize(expired)
                : '__yawp_preview_master=forged; Path=/',
          },
        })
      );
      expect(
        (await access({ intent: 'select-signon-qa', account: 'inactive' }))
          .status
      ).toBe(401);
    }
  }
);
suite(
  'expiry or removal of QA privilege rejects an already authenticated recovery session',
  async () => {
    const { createPreviewSignonQaCookie, PREVIEW_SIGNON_QA_COOKIE } =
      await import('~/utils/preview-signon-qa.server');
    for (const kind of ['expired', 'missing', 'tampered']) {
      fresh();
      await master('orphan');
      const before = await prisma.session.count({
        where: { userId: qaId('orphan') },
      });
      expect((await login('orphan')).response.status).toBe(302);
      const qaCookie = createPreviewSignonQaCookie();
      if (kind === 'expired') {
        const data = await qaCookie.parse(cookie);
        data.issuedAt = Math.floor(Date.now() / 1000) - 601;
        merge(
          new Response(null, {
            headers: { 'Set-Cookie': await qaCookie.serialize(data) },
          })
        );
      } else {
        cookie = cookie
          .split('; ')
          .filter((c) => !c.startsWith(PREVIEW_SIGNON_QA_COOKIE + '='))
          .join('; ');
        if (kind === 'tampered')
          cookie += '; ' + PREVIEW_SIGNON_QA_COOKIE + '=forged';
      }
      let reached = false;
      const response = await createPreviewAccessMiddleware()(
        { request: request('/auth/login?continue=1') } as any,
        async () => {
          reached = true;
          return Response.json({});
        }
      );
      expect(reached).toBe(false);
      expect((response as Response).status).toBe(302);
      expect((response as Response).headers.get('location')).toStartWith(
        '/auth/login?'
      );
      expect(
        await prisma.session.count({ where: { userId: qaId('orphan') } })
      ).toBe(before);
    }
  }
);
