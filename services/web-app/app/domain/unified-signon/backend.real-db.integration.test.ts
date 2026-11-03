import { afterAll, beforeAll, beforeEach, expect, test, spyOn } from 'bun:test';
import { createHash } from 'node:crypto';
import { readdir, readFile, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '~/utils/db.server';
import { dispatchUnifiedLogin, unifiedEntry } from './entry.server';
import { getPasswordHash } from '~/utils/auth.server';

const enabled = process.env.SIGNON_LOCAL_TEST === '1';
const suite = enabled ? test : test.skip;
const prefix = `signon-${Date.now()}`;
const capture = path.join(process.env.TMPDIR!, prefix);
let testIp = `198.18.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
let cookie = '';
let flowToken = '';
const url = 'http://127.0.0.1:5396/auth/login';
beforeEach(() => {
  testIp = `198.18.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
});
async function post(
  intent: string,
  values: Record<string, string> = {},
  withCookie = true
) {
  const request = new Request(url, {
    method: 'POST',
    headers: { ...(withCookie ? { cookie } : {}), 'x-forwarded-for': testIp },
    body: new URLSearchParams({ intent, flowToken, ...values }),
  });
  const result = await dispatchUnifiedLogin({
    request,
    params: {},
    context: {},
  } as any);
  // The legacy password validator returns router data for a failed proof.
  const response =
    result instanceof Response
      ? result
      : Response.json(result, { status: 400 });
  for (const c of response.headers.getSetCookie()) {
    const entry = c.split(';')[0];
    const name = entry.split('=')[0];
    cookie = cookie
      .split('; ')
      .filter((p) => p && !p.startsWith(name + '='))
      .concat(entry)
      .join('; ');
  }
  const data = response.headers.get('content-type')?.includes('json')
    ? await response.json()
    : null;
  if (data?.state?.flowToken) flowToken = data.state.flowToken;
  return { response, data };
}
async function code(email: string) {
  for (const file of (await readdir(capture)).reverse()) {
    const data = JSON.parse(await readFile(path.join(capture, file), 'utf8'));
    if (data.email === email) return data.code as string;
  }
  throw new Error('Missing captured code');
}
beforeAll(async () => {
  if (!enabled) return;
  if (
    !['127.0.0.1', 'localhost'].includes(
      new URL(process.env.DATABASE_URL!).hostname
    )
  )
    throw new Error('Local database required');
  process.env.SIGNON_MAIL_CAPTURE_DIR = capture;
  await mkdir(capture, { recursive: true });
  await prisma.setting.upsert({
    where: { name: 'feature_flag.unified-sign-on' },
    update: { value: 'true' },
    create: {
      name: 'feature_flag.unified-sign-on',
      value: 'true',
      valueType: 'boolean',
    },
  });
  await prisma.organization.create({
    data: { id: prefix, name: 'Local signon test', plan: 'SCHOOL' },
  });
  await prisma.organization.create({
    data: {
      id: prefix + '-b',
      name: 'Second local organization',
      plan: 'SCHOOL',
    },
  });
  await prisma.school.create({
    data: {
      id: prefix,
      name: 'Local class',
      code: prefix,
      organizationId: prefix,
    },
  });
  await prisma.class.create({
    data: { id: prefix, code: prefix, schoolId: prefix, title: 'English 11' },
  });
});
afterAll(async () => {
  if (!enabled) return;
  await prisma.setting.deleteMany({
    where: { name: 'feature_flag.unified-sign-on' },
  });
  await prisma.signonFlow.deleteMany({
    where: { data: { path: ['identifier'], string_contains: prefix } },
  });
  const users = await prisma.user.findMany({
    where: {
      OR: [{ email: { contains: prefix } }, { username: { contains: prefix } }],
    },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await prisma.invitation.deleteMany({
    where: { target: { contains: prefix } },
  });
  await prisma.signonIdentity.deleteMany({ where: { userId: { in: ids } } });
  await prisma.session.deleteMany({ where: { userId: { in: ids } } });
  await prisma.password.deleteMany({ where: { userId: { in: ids } } });
  await prisma.orgMembership.deleteMany({
    where: { OR: [{ organizationId: prefix }, { userId: { in: ids } }] },
  });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.class.deleteMany({ where: { id: prefix } });
  await prisma.school.deleteMany({ where: { id: prefix } });
  await prisma.organization.deleteMany({
    where: { id: { in: [prefix, prefix + '-b'] } },
  });
  await rm(capture, { recursive: true, force: true });
  await prisma.$disconnect();
});
suite(
  'private preview capture uses the normal hashed challenge, verifier, cooldown, expiry and single use',
  async () => {
    // Prisma is already connected to the CLI's isolated local database. Simulate
    // preview deployment metadata only for capture/retrieval; never contact a host.
    const { action: retrieve } =
      await import('~/routes/api.preview.qa.signon-code/route');
    const original = {
      YAWP_ENVIRONMENT: process.env.YAWP_ENVIRONMENT,
      DATABASE_URL: process.env.DATABASE_URL,
      PREVIEW_ACCESS_SECRET: process.env.PREVIEW_ACCESS_SECRET,
    };
    try {
      process.env.YAWP_ENVIRONMENT = 'preview';
      process.env.DATABASE_URL =
        'postgresql://fixture@preview-postgres/yawp_pr_565';
      process.env.PREVIEW_ACCESS_SECRET =
        'fixture-private-preview-secret-32-characters';
      for (const expired of [false, true]) {
        cookie = '';
        flowToken = '';
        const email = `preview-${expired}-${prefix}@example.test`;
        await post('resolve', { identifier: email });
        await post('resolve-class', { classCode: prefix });
        expect((await post('send-code')).data.state.screen).toBe('email-code');
        expect((await post('resend-code')).response.status).toBe(429);
        const captured = await retrieve({
          request: new Request(
            'https://example.test/api/preview/qa/signon-code',
            {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${process.env.PREVIEW_ACCESS_SECRET}`,
              },
              body: JSON.stringify({ email }),
            }
          ),
        } as any);
        expect(captured.status).toBe(200);
        const otp = (await captured.json()).code as string;
        expect(/^\d{6}$/.test(otp)).toBe(true);
        const row = await prisma.signonFlow.findFirstOrThrow({
          where: { data: { path: ['identifier'], equals: email } },
        });
        const data = row.data as any;
        expect(data.otp.hash).toHaveLength(64);
        expect(JSON.stringify(row.data).includes(otp)).toBe(false);
        if (expired) {
          data.otp.expires = 0;
          await prisma.signonFlow.update({
            where: { id: row.id },
            data: { data },
          });
          expect(
            (await post('verify-code', { code: otp })).response.status
          ).toBe(400);
        } else {
          expect(
            (await post('verify-code', { code: otp })).data.state.screen
          ).toBe('name-password');
          expect(
            (await post('verify-code', { code: otp })).response.status
          ).toBe(400);
        }
      }
    } finally {
      cookie = '';
      flowToken = '';
      for (const [key, value] of Object.entries(original)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }
);
suite(
  'resolver derives identity and class context; a token alone and posted screens prove nothing',
  async () => {
    const email = `${prefix}@example.test`;
    const resolved = await post('resolve', {
      identifier: email,
      redirectTo: '//evil.test',
      screen: 'joined',
      role: 'TEACHER',
    });
    expect(resolved.data.state.screen).toBe('account-type');
    const stolen = await post('send-code', { email, classId: prefix }, false);
    expect(stolen.response.status).toBe(400);
    expect(
      (
        await post('create-account', {
          name: 'Attacker',
          password: 'abcdef',
          confirmPassword: 'abcdef',
          classId: prefix,
        })
      ).response.status
    ).toBe(400);
    expect(
      (await post('resolve-class', { classCode: prefix })).data.state.classInfo
        .id
    ).toBe(prefix);
    expect((await post('send-code')).data.state.screen).toBe('email-code');
    expect(
      (await post('verify-code', { code: '000000' })).response.status
    ).toBe(400);
    const otp = await code(email);
    const results = await Promise.all([
      post('verify-code', { code: otp }),
      post('verify-code', { code: otp }),
    ]);
    expect(results.map((r) => r.response.status).sort()).toEqual([200, 400]);
    expect((await post('verify-code', { code: otp })).response.status).toBe(
      400
    );
    const created = await post('create-account', {
      name: 'Local Student',
      password: 'abcdef',
      confirmPassword: 'abcdef',
      role: 'TEACHER',
      classId: 'foreign',
    });
    expect(created.data.state.screen).toBe('joined');
    expect(
      (await post('complete-student')).response.headers.get('location')
    ).toBe('/app');
    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { memberships: true },
    });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.memberships.map((m) => [m.organizationId, m.role])).toEqual([
      [prefix, 'STUDENT'],
    ]);
  }
);
suite(
  'reset responses are uniform; expiry, purpose substitution and resend cooldown fail closed',
  async () => {
    cookie = '';
    flowToken = '';
    const email = `missing-${prefix}@example.test`;
    await post('resolve', { identifier: email });
    const sent = await post('send-code', { purpose: 'reset-password' });
    expect(sent.data.state.variant).toBe('reset');
    expect((await post('resend-code')).response.status).toBe(429);
    const row = await prisma.signonFlow.findFirstOrThrow({
      where: { data: { path: ['identifier'], equals: email } },
    });
    const data = row.data as any;
    expect(data.otp.hash).toHaveLength(64);
    data.otp.expires = 0;
    await prisma.signonFlow.update({ where: { id: row.id }, data: { data } });
    expect(
      (
        await post('verify-code', {
          code: '123456',
          purpose: 'signup',
          email: 'foreign@example.test',
        })
      ).response.status
    ).toBe(400);
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  }
);
suite(
  'active membership selection requires the authenticated owner and rejects foreign or inactive IDs',
  async () => {
    cookie = '';
    flowToken = '';
    const email = `member-${prefix}@example.test`;
    await prisma.user.create({
      data: {
        email,
        name: 'Member Test',
        password: { create: { hash: await getPasswordHash('abcdef') } },
        memberships: { create: { organizationId: prefix, role: 'STUDENT' } },
      },
    });
    await post('resolve', { identifier: email });
    expect(
      (await post('select-membership', { membershipId: prefix })).response
        .status
    ).toBe(401);
  }
);
suite(
  'unset and partial Google configuration fail direct requests safely',
  async () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    cookie = '';
    flowToken = '';
    expect((await post('google')).response.status).toBe(503);
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'local-only';
    expect((await post('google')).response.status).toBe(503);
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
  }
);

suite(
  'enabled password POST keeps validators/session handling and ignores substituted identity and redirect',
  async () => {
    cookie = '';
    flowToken = '';
    const email = `password-${prefix}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        username: `user-${prefix}`,
        password: { create: { hash: await getPasswordHash('abcdef') } },
        memberships: { create: { organizationId: prefix, role: 'STUDENT' } },
      },
    });
    await post('resolve', {
      identifier: email,
      redirectTo: '/app/my-classes',
    });
    const result = await post('password', {
      email: 'foreign@example.test',
      password: 'abcdef',
      redirectTo: '//evil.test',
    });
    expect(result.response.status).toBe(302);
    expect(result.response.headers.get('location')).toBe(
      '/auth/login?continue=1'
    );
    expect(cookie).toContain('en_session=');
    await expect(
      unifiedEntry(new Request(url + '?continue=1', { headers: { cookie } }))
    ).rejects.toMatchObject({ status: 302 });
    const sessions = await prisma.session.findMany({
      where: { userId: user.id },
    });
    expect(sessions).toHaveLength(1);
  }
);
suite(
  'OTP attempts, supersession, context substitution and flow expiry are enforced by the database',
  async () => {
    cookie = '';
    flowToken = '';
    const email = `otp-${prefix}@example.test`;
    await post('resolve', { identifier: email });
    await post('send-code', { purpose: 'reset-password' });
    const row = await prisma.signonFlow.findFirstOrThrow({
      where: { data: { path: ['identifier'], equals: email } },
    });
    let data = row.data as any;
    data.otp.sent = 0;
    await prisma.signonFlow.update({ where: { id: row.id }, data: { data } });
    await post('resend-code');
    const current = await prisma.signonFlow.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect((current.data as any).otp.hash).not.toBe(data.otp.hash);
    for (let i = 0; i < 5; i++)
      expect(
        (await post('verify-code', { code: '111111' })).response.status
      ).toBe(400);
    data = (
      await prisma.signonFlow.findUniqueOrThrow({ where: { id: row.id } })
    ).data as any;
    expect(data.otp.attempts).toBe(5);
    expect(
      (await post('verify-code', { code: '111111' })).response.status
    ).toBe(400);
    await prisma.signonFlow.update({
      where: { id: row.id },
      data: { expiresAt: new Date(0) },
    });
    expect((await post('resend-code')).response.status).toBe(400);
  }
);
suite(
  'invitation email proof supplies student class context without posted roles or class IDs',
  async () => {
    cookie = '';
    flowToken = '';
    const email = `invited-${prefix}@example.test`;
    await prisma.invitation.create({
      data: {
        type: 'onboard-student',
        target: email,
        secret: 'legacy-secret',
        algorithm: 'SHA-256',
        digits: 6,
        period: 600,
        charSet: '0123456789',
        expiresAt: new Date(Date.now() + 600000),
        metadata: JSON.stringify({ klassId: prefix }),
      },
    });
    expect(
      (await post('resolve', { identifier: email })).data.state.screen
    ).toBe('activation');
    await post('send-code');
    const verified = await post('verify-code', { code: await code(email) });
    expect(verified.data.state.screen).toBe('name-password');
    expect(
      (
        await post('create-account', {
          name: 'Invited Student',
          password: 'abcdef',
          confirmPassword: 'abcdef',
          role: 'TEACHER',
          classId: 'foreign',
        })
      ).data.state.screen
    ).toBe('joined');
    expect((await post('complete-student')).response.status).toBe(302);
    expect(await prisma.invitation.count({ where: { target: email } })).toBe(0);
    expect(
      await prisma.orgMembership.count({
        where: {
          user: { email },
          role: 'STUDENT',
          classesAsStudent: { some: { id: prefix } },
        },
      })
    ).toBe(1);
  }
);
suite(
  'existing account accepts owner invitation only after real password proof and preserves inactive status',
  async () => {
    cookie = '';
    flowToken = '';
    const email = `owner-${prefix}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        password: { create: { hash: await getPasswordHash('abcdef') } },
        memberships: {
          create: { organizationId: prefix, role: 'STUDENT', isActive: false },
        },
      },
    });
    await prisma.invitation.create({
      data: {
        type: 'onboard-owner',
        target: email,
        secret: 'legacy-secret',
        algorithm: 'SHA-256',
        digits: 6,
        period: 600,
        charSet: '0123456789',
        expiresAt: new Date(Date.now() + 600000),
        metadata: JSON.stringify({ organizationId: prefix }),
      },
    });
    await post('resolve', { identifier: email });
    // Password resolution must bind an invitation as well as code resolution.
    await post('send-code');
    await post('verify-code', { code: await code(email) });
    const membership = await prisma.orgMembership.findUniqueOrThrow({
      where: {
        userId_organizationId: { userId: user.id, organizationId: prefix },
      },
    });
    expect(membership.role).toBe('TEACHER');
    expect(membership.isOrgOwner).toBe(true);
    expect(membership.isActive).toBe(false);
  }
);
suite(
  'Google callback state is browser-bound, single-use and gated even on cancellation',
  async () => {
    const { googleCallback } = await import('./google.server');
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'local-client';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'local-secret';
    cookie = '';
    flowToken = '';
    const started = await post('google', { redirectTo: '/app/my-classes' });
    const target = new URL(started.data.redirectTo);
    const callback = `http://127.0.0.1:5396/auth/unified/google/callback?error=access_denied&state=${target.searchParams.get('state')}`;
    const cancelled = await googleCallback(
      new Request(callback, { headers: { cookie } })
    );
    expect(cancelled.headers.get('location')).toBe('/auth/login?continue=1');
    const resumed = await unifiedEntry(
      new Request(url + '?continue=1', { headers: { cookie } })
    );
    expect(resumed?.initialState?.screen).toBe('entry');
    expect(resumed?.initialState?.notice).toContain('cancelled');
    await googleCallback(new Request(callback, { headers: { cookie } }));
    const replay = await unifiedEntry(
      new Request(url + '?continue=1', { headers: { cookie } })
    );
    expect(replay?.initialState?.error).toContain('connect to Google');
    await prisma.setting.update({
      where: { name: 'feature_flag.unified-sign-on' },
      data: { value: 'false' },
    });
    expect(
      (await googleCallback(new Request(callback, { headers: { cookie } })))
        .status
    ).toBe(404);
    await prisma.setting.update({
      where: { name: 'feature_flag.unified-sign-on' },
      data: { value: 'true' },
    });
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  }
);

suite(
  'membership picker validates active ownership and keeps the original destination',
  async () => {
    cookie = '';
    flowToken = '';
    const email = `picker-${prefix}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        password: { create: { hash: await getPasswordHash('abcdef') } },
        memberships: {
          create: [
            { organizationId: prefix, role: 'STUDENT' },
            { organizationId: prefix + '-b', role: 'STUDENT' },
          ],
        },
      },
      include: { memberships: true },
    });
    await post('resolve', { identifier: email, redirectTo: '/app/my-classes' });
    await post('password', { password: 'abcdef' });
    const entry = await unifiedEntry(
      new Request(url + '?continue=1', { headers: { cookie } })
    );
    expect(entry?.initialState?.screen).toBe('membership');
    expect(entry?.initialState?.memberships).toHaveLength(2);
    expect(
      (
        await post('select-membership', {
          membershipId: 'foreign',
          redirectTo: '//evil.test',
        })
      ).response.status
    ).toBe(403);
    const first = user.memberships[0];
    await prisma.orgMembership.update({
      where: { id: first.id },
      data: { isActive: false },
    });
    expect(
      (await post('select-membership', { membershipId: first.id })).response
        .status
    ).toBe(403);
    const selected = await post('select-membership', {
      membershipId: user.memberships[1].id,
      redirectTo: '//evil.test',
    });
    expect(selected.response.status).toBe(302);
    expect(selected.response.headers.get('location')).toBe('/app/my-classes');
    expect(cookie).toContain('membership-id=');
  }
);
suite(
  'required password change outranks membership and continues the safe flow after the existing action',
  async () => {
    cookie = '';
    flowToken = '';
    const email = `forced-${prefix}@example.test`;
    await prisma.user.create({
      data: {
        email,
        mustChangePassword: true,
        password: { create: { hash: await getPasswordHash('abcdef') } },
        memberships: { create: { organizationId: prefix, role: 'STUDENT' } },
      },
    });
    await post('resolve', { identifier: email, redirectTo: '/app/my-classes' });
    const signed = await post('password', { password: 'abcdef' });
    expect(signed.response.headers.get('location')).toBe(
      '/auth/required-password-change'
    );
    const { action } =
      await import('~/routes/auth.required-password-change/route');
    const result = await action({
      request: new Request(
        'http://127.0.0.1:5396/auth/required-password-change',
        {
          method: 'POST',
          headers: { cookie },
          body: new URLSearchParams({
            password: 'new-password',
            confirmPassword: 'new-password',
          }),
        }
      ),
      params: {},
      context: {},
    } as any);
    expect((result as Response).headers.get('location')).toBe(
      '/auth/login?continue=1'
    );
    try {
      await unifiedEntry(
        new Request(url + '?continue=1', { headers: { cookie } })
      );
      throw new Error('Expected redirect');
    } catch (response) {
      expect((response as Response).headers.get('location')).toBe(
        '/app/my-classes'
      );
    }
  }
);
suite(
  'class codes take precedence over legacy handle names; email still works',
  async () => {
    cookie = '';
    flowToken = '';
    const identifier = `code-${prefix}`;
    await prisma.class.update({
      where: { id: prefix },
      data: { code: identifier },
    });
    await prisma.user.create({
      data: {
        email: `ambiguity-${prefix}@example.test`,
        username: identifier,
        password: { create: { hash: await getPasswordHash('abcdef') } },
      },
    });
    const ambiguous = await post('resolve', { identifier });
    expect(ambiguous.data.state.screen).toBe('class-found');
    expect(
      (await post('resolve-class', { classCode: identifier })).data.state.screen
    ).toBe('class-found');
    expect(
      (await post('resolve', { identifier: `class-${prefix}@example.test` }))
        .data.state.screen
    ).toBe('activation');
    await prisma.class.update({
      where: { id: prefix },
      data: { code: prefix },
    });
  }
);

suite(
  'Google matching email requires account proof and explicit first-time linking; a linked subject can sign in',
  async () => {
    const { googleCallback } = await import('./google.server');
    const { generateKeyPair, exportJWK, SignJWT } = await import('jose');
    const originalFetch = globalThis.fetch;
    const pair = await generateKeyPair('RS256');
    const jwk = {
      ...(await exportJWK(pair.publicKey)),
      kid: 'local',
      alg: 'RS256',
    };
    const email = `google-${prefix}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        password: { create: { hash: await getPasswordHash('abcdef') } },
        memberships: { create: { organizationId: prefix, role: 'STUDENT' } },
      },
    });
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'local-client';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'local-secret';
    await prisma.invitation.create({
      data: {
        type: 'onboard-owner',
        target: email,
        secret: 'legacy-secret',
        algorithm: 'SHA-256',
        digits: 6,
        period: 600,
        charSet: '0123456789',
        expiresAt: new Date(Date.now() + 600000),
        metadata: JSON.stringify({ organizationId: prefix }),
      },
    });
    let nonce = '';
    let tokenRequests = 0;
    globalThis.fetch = (async (target: any, init?: RequestInit) => {
      if (target === 'https://oauth2.googleapis.com/token') {
        tokenRequests++;
        expect(
          new URLSearchParams(init?.body as URLSearchParams).get(
            'code_verifier'
          )
        ).toHaveLength(43);
        const id_token = await new SignJWT({
          nonce,
          email,
          email_verified: true,
        })
          .setProtectedHeader({ alg: 'RS256', kid: 'local' })
          .setIssuer('https://accounts.google.com')
          .setAudience('local-client')
          .setSubject(`subject-${prefix}`)
          .setIssuedAt()
          .setExpirationTime('5m')
          .sign(pair.privateKey);
        return Response.json({ id_token });
      }
      if (target === 'https://www.googleapis.com/oauth2/v3/certs')
        return Response.json({ keys: [jwk] });
      throw new Error('No external requests permitted');
    }) as typeof fetch;
    try {
      cookie = '';
      flowToken = '';
      const start = await post('google', { redirectTo: '/app/my-classes' });
      const authorization = new URL(start.data.redirectTo);
      nonce = authorization.searchParams.get('nonce')!;
      const callback = `http://127.0.0.1:5396/auth/unified/google/callback?code=mock&state=${authorization.searchParams.get('state')}`;
      expect(
        (await googleCallback(new Request(callback, { headers: { cookie } })))
          .status
      ).toBe(302);
      expect(await prisma.session.count({ where: { userId: user.id } })).toBe(
        0
      );
      expect(
        await prisma.signonIdentity.count({ where: { userId: user.id } })
      ).toBe(0);
      const entry = await unifiedEntry(
        new Request(url + '?continue=1', { headers: { cookie } })
      );
      flowToken = entry!.initialState!.flowToken!;
      expect(entry!.initialState!.screen).toBe('password');
      expect((await post('link-google')).response.status).toBe(401);
      await post('password', { password: 'abcdef' });
      const proven = await unifiedEntry(
        new Request(url + '?continue=1', { headers: { cookie } })
      );
      expect(proven!.initialState!.screen).toBe('link-google');
      expect((await post('link-google')).response.headers.get('location')).toBe(
        '/app/my-classes'
      );
      expect(
        await prisma.signonIdentity.count({
          where: { userId: user.id, subject: `subject-${prefix}` },
        })
      ).toBe(1);
      cookie = '';
      flowToken = '';
      expect(
        await prisma.orgMembership.count({
          where: { userId: user.id, organizationId: prefix, isOrgOwner: true },
        })
      ).toBe(1);
      await prisma.invitation.create({
        data: {
          type: 'onboard-teacher',
          target: email,
          secret: 'legacy-secret',
          algorithm: 'SHA-256',
          digits: 6,
          period: 600,
          charSet: '0123456789',
          expiresAt: new Date(Date.now() + 600000),
          metadata: JSON.stringify({ organizationId: prefix + '-b' }),
        },
      });
      const linkedStart = await post('google');
      const linkedAuthorization = new URL(linkedStart.data.redirectTo);
      nonce = linkedAuthorization.searchParams.get('nonce')!;
      const linkedCallback = `http://127.0.0.1:5396/auth/unified/google/callback?code=mock&state=${linkedAuthorization.searchParams.get('state')}`;
      const responses = await Promise.all([
        googleCallback(new Request(linkedCallback, { headers: { cookie } })),
        googleCallback(new Request(linkedCallback, { headers: { cookie } })),
      ]);
      expect(responses.filter((r) => r.headers.has('set-cookie'))).toHaveLength(
        1
      );
      expect(
        await prisma.orgMembership.count({
          where: {
            userId: user.id,
            organizationId: prefix + '-b',
            role: 'TEACHER',
          },
        })
      ).toBe(1);
      expect(tokenRequests).toBe(2); // One provider exchange for each distinct authorization.
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.GOOGLE_OAUTH_CLIENT_ID;
      delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    }
  }
);
suite(
  'trial routing uses existing application guards after proof and never reveals status during resolution',
  async () => {
    for (const [status, destination] of [
      ['ACCOUNT_CREATED', '/app/free-tier/onboarding'],
      ['SENT', '/app/free-tier/pending'],
      ['MANUAL_REVIEW', '/app/free-tier/pending'],
      ['REJECTED', '/app/free-tier/status'],
      ['EXPIRED', '/app/free-tier/status'],
      ['APPROVED', '/app/my-classes'],
    ] as const) {
      cookie = '';
      flowToken = '';
      const email = `trial-${status.toLowerCase()}-${prefix}@example.test`;
      const user = await prisma.user.create({
        data: {
          email,
          password: { create: { hash: await getPasswordHash('abcdef') } },
          memberships: { create: { organizationId: prefix, role: 'TEACHER' } },
        },
      });
      const app = await prisma.freeTierApplication.create({
        data: {
          email,
          userId: user.id,
          organizationId: prefix,
          name: 'Trial Teacher',
          schoolName: 'Local',
          location: 'Local',
          gradeLevel: '11',
          status,
        },
      });
      try {
        const resolved = await post('resolve', {
          identifier: email,
          redirectTo: '/app/my-classes',
        });
        expect(resolved.data.state.screen).toBe('password');
        expect(JSON.stringify(resolved.data)).not.toContain(status);
        await post('password', { password: 'abcdef' });
        try {
          await unifiedEntry(
            new Request(url + '?continue=1', { headers: { cookie } })
          );
          throw new Error('Expected routing');
        } catch (response) {
          expect((response as Response).headers.get('location')).toBe(
            destination
          );
        }
      } finally {
        await prisma.freeTierApplication.delete({ where: { id: app.id } });
      }
    }
  }
);
suite(
  'student without membership can recover through a class, but disabled membership and staff accounts stay protected',
  async () => {
    cookie = '';
    flowToken = '';
    const email = `unassigned-${prefix}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        password: { create: { hash: await getPasswordHash('abcdef') } },
      },
    });
    await post('resolve', { identifier: email });
    await post('password', { password: 'abcdef' });
    const entry = await unifiedEntry(
      new Request(url + '?continue=1', { headers: { cookie } })
    );
    expect(entry?.initialState?.screen).toBe('inactive');
    expect(
      (await post('resolve-class', { classCode: prefix })).data.state.screen
    ).toBe('joined');
    expect((await post('complete-student')).response.status).toBe(302);
    expect(
      await prisma.orgMembership.count({
        where: {
          userId: user.id,
          isActive: true,
          role: 'STUDENT',
          classesAsStudent: { some: { id: prefix } },
        },
      })
    ).toBe(1);
  }
);

suite(
  'free-class code uses handle-only registration, validates policy and rechecks capacity at submit',
  async () => {
    cookie = '';
    flowToken = '';
    await prisma.organization.update({
      where: { id: prefix },
      data: { plan: 'FREE_CLASSROOM' },
    });
    await prisma.class.update({
      where: { id: prefix },
      data: { studentJoinToken: `token-${prefix}` },
    });
    try {
      await post('resolve', {
        identifier: `${prefix}-handle-origin@example.test`,
      });
      const resolved = await post('resolve-class', { classCode: prefix });
      expect(resolved.data.state.classInfo.accountMode).toBe('handle');
      const chosen = await post('student-choice', { choice: 'new' });
      expect(chosen.data.state.emailOrigin).toBe(true);
      await post('student-choice', { choice: 'returning' });
      expect(
        (await post('student-choice', { choice: 'new' })).data.state.emailOrigin
      ).toBe(true);
      // Starting again with a direct code must clear the display-only marker;
      // a posted presentation value cannot manufacture email-origin context.
      await post('resolve', { identifier: prefix });
      expect(
        (await post('student-choice', { choice: 'new', emailOrigin: 'true' }))
          .data.state.emailOrigin
      ).toBe(false);
      await post('resolve', {
        identifier: `${prefix}-handle-origin@example.test`,
      });
      await post('resolve-class', { classCode: prefix });
      expect(
        (await post('student-choice', { choice: 'new' })).data.state.emailOrigin
      ).toBe(true);
      const values = {
        firstName: 'Local',
        lastName: 'Handle',
        password: 'abcdef',
        confirmPassword: 'abcdef',
      };
      expect(
        (await post('register-student', { ...values, firstName: '123' }))
          .response.status
      ).toBe(400);
      await prisma.invitation.createMany({
        data: Array.from({ length: 35 }, (_, i) => ({
          type: 'onboard-student',
          target: `seat-${i}-${prefix}@example.test`,
          studentClassId: prefix,
          secret: 'legacy-secret',
          algorithm: 'SHA-256',
          digits: 6,
          period: 600,
          charSet: '0123456789',
          expiresAt: new Date(Date.now() + 600000),
        })),
      });
      const full = await post('register-student', values);
      expect(full.response.status).toBe(400);
      // Main returns errors without a replacement state. Redisplay resumes the
      // existing server context, which must still carry the notice.
      const redisplay = await unifiedEntry(
        new Request(url + '?continue=1', { headers: { cookie } })
      );
      expect(redisplay?.initialState?.emailOrigin).toBe(true);
      expect(JSON.stringify(full.data)).toContain('full');
      expect(
        await prisma.classStudentHandle.count({ where: { classId: prefix } })
      ).toBe(0);
      await prisma.invitation.deleteMany({ where: { studentClassId: prefix } });
      expect((await post('register-student', values)).data.state.screen).toBe(
        'joined'
      );
      expect((await post('complete-student')).response.status).toBe(302);
      const handle = await prisma.user.findFirstOrThrow({
        where: {
          classStudentHandles: {
            some: { classId: prefix, handle: 'LocalHandle' },
          },
        },
        include: { memberships: true, sessions: true },
      });
      expect(handle.email).toBeNull();
      expect(handle.memberships[0].role).toBe('STUDENT');
      expect(handle.sessions).toHaveLength(1);
      expect(
        handle.sessions[0].expirationDate.getTime() - Date.now()
      ).toBeLessThanOrEqual(12 * 60 * 60 * 1000);
      await prisma.session.deleteMany({ where: { userId: handle.id } });
      await prisma.password.deleteMany({ where: { userId: handle.id } });
      await prisma.orgMembership.deleteMany({ where: { userId: handle.id } });
      await prisma.user.delete({ where: { id: handle.id } });
    } finally {
      await prisma.organization.update({
        where: { id: prefix },
        data: { plan: 'SCHOOL' },
      });
    }
  }
);

suite(
  'multiple class matches require a current server-issued choice and reject arbitrary/stale selections',
  async () => {
    cookie = '';
    flowToken = '';
    const schoolId = prefix + '-second';
    const classId = prefix + '-second';
    await prisma.school.create({
      data: {
        id: schoolId,
        code: schoolId,
        name: 'Second local class',
        organizationId: prefix,
      },
    });
    await prisma.class.create({
      data: {
        id: classId,
        code: prefix,
        schoolId,
        title: 'English 11, Period 5',
      },
    });
    try {
      const matches = await post('resolve', { identifier: prefix });
      expect(matches.data.state.variant).toBe('multiple');
      expect(matches.data.state.classes).toHaveLength(2);
      expect(
        (await post('choose-class', { classId: 'foreign' })).response.status
      ).toBe(400);
      await prisma.class.update({
        where: { id: classId },
        data: { isArchived: true },
      });
      expect((await post('choose-class', { classId })).response.status).toBe(
        400
      );
      expect(
        (await post('choose-class', { classId: prefix })).data.state.classInfo
          .id
      ).toBe(prefix);
    } finally {
      await prisma.class.delete({ where: { id: classId } });
      await prisma.school.delete({ where: { id: schoolId } });
    }
  }
);
suite(
  'partner context uses the existing UA organization/code/cookie guards and requires verified email',
  async () => {
    const previous = Object.fromEntries(
      [
        'UA_PARTNER_HOSTNAME',
        'UA_STUDENT_BILLING_ENABLED',
        'UA_ORGANIZATION_ID',
        'UA_PARTNER_CODE',
      ].map((k) => [k, process.env[k]])
    );
    Object.assign(process.env, {
      UA_PARTNER_HOSTNAME: '127.0.0.1',
      UA_STUDENT_BILLING_ENABLED: 'true',
      UA_ORGANIZATION_ID: prefix,
      UA_PARTNER_CODE: 'local-org-code',
    });
    try {
      cookie = '';
      flowToken = '';
      const email = `partner-${prefix}@example.test`;
      expect(
        (await post('resolve', { identifier: email })).data.state.screen
      ).toBe('partner-code');
      expect(
        (
          await post('partner-code', {
            organizationCode: 'forged',
            organizationId: 'foreign',
          })
        ).response.status
      ).toBe(400);
      const accepted = await post('partner-code', {
        organizationCode: ' LOCAL-ORG-CODE ',
        organizationId: 'foreign',
      });
      expect(accepted.data.state.screen).toBe('activation');
      expect(cookie).toContain('yawp_partner=');
      expect(
        (
          await post('create-account', {
            name: 'Partner Student',
            password: 'abcdef',
            confirmPassword: 'abcdef',
          })
        ).response.status
      ).toBe(400);
      await post('send-code');
      await post('verify-code', { code: await code(email) });
      expect(
        (
          await post('create-account', {
            name: 'Partner Student',
            password: 'abcdef',
            confirmPassword: 'abcdef',
            organizationId: 'foreign',
            role: 'TEACHER',
          })
        ).response.headers.get('location')
      ).toBe('/billing/ua');
      expect(
        await prisma.orgMembership.count({
          where: { user: { email }, organizationId: prefix, role: 'STUDENT' },
        })
      ).toBe(1);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }
);
suite(
  'local mailer captures existing free-tier helper delivery without network calls or sensitive logs',
  async () => {
    const { sendEmail } = await import('~/utils/email.server');
    const originalFetch = globalThis.fetch;
    const originalInfo = console.info;
    const messages: unknown[][] = [];
    globalThis.fetch = (async () => {
      throw new Error('External delivery is forbidden');
    }) as unknown as typeof fetch;
    console.info = (...values) => {
      messages.push(values);
    };
    try {
      const result = await sendEmail({
        to: `mail-${prefix}@example.test`,
        subject: 'Captured local helper',
        text: 'private-code-654321',
        html: '<p>private-code-654321</p>',
      });
      expect(result.status).toBe('success');
      expect(JSON.stringify(messages)).not.toContain('654321');
      expect(JSON.stringify(messages)).not.toContain(prefix);
      const files = await readdir(capture);
      const content = await Promise.all(
        files.map((file) => readFile(path.join(capture, file), 'utf8'))
      );
      expect(content.some((data) => data.includes('private-code-654321'))).toBe(
        true
      );
    } finally {
      globalThis.fetch = originalFetch;
      console.info = originalInfo;
    }
  }
);

suite(
  'an address changed after resolution cannot receive an old-account session or invitation grant',
  async () => {
    cookie = '';
    flowToken = '';
    const email = `changed-${prefix}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        password: { create: { hash: await getPasswordHash('abcdef') } },
      },
    });
    await post('resolve', { identifier: email });
    await post('send-code');
    const otp = await code(email);
    await prisma.user.update({
      where: { id: user.id },
      data: { email: `moved-${prefix}@example.test` },
    });
    expect((await post('verify-code', { code: otp })).response.status).toBe(
      400
    );
    expect(
      (await post('password', { password: 'abcdef' })).response.status
    ).toBe(400);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect(
      await prisma.orgMembership.count({
        where: { userId: user.id, isOrgOwner: true },
      })
    ).toBe(0);
  }
);

suite(
  'student invitations can choose among permitted classes with different codes',
  async () => {
    cookie = '';
    flowToken = '';
    const email = `multi-invite-${prefix}@example.test`;
    const second = prefix + '-invite';
    await prisma.class.create({
      data: { id: second, code: second, schoolId: prefix },
    });
    try {
      await prisma.invitation.create({
        data: {
          type: 'onboard-student',
          target: email,
          secret: 'legacy-secret',
          algorithm: 'SHA-256',
          digits: 6,
          period: 600,
          charSet: '0123456789',
          expiresAt: new Date(Date.now() + 600000),
          metadata: JSON.stringify({ klassIds: [prefix, second] }),
        },
      });
      await post('resolve', { identifier: email });
      await post('send-code');
      expect(
        (await post('verify-code', { code: await code(email) })).data.state
          .variant
      ).toBe('multiple');
      expect(
        (await post('choose-class', { classId: 'foreign' })).response.status
      ).toBe(400);
      expect(
        (await post('choose-class', { classId: second })).data.state.screen
      ).toBe('name-password');
      expect(
        (
          await post('create-account', {
            name: 'Invited Student',
            password: 'abcdef',
            confirmPassword: 'abcdef',
          })
        ).data.state.screen
      ).toBe('joined');
      expect((await post('complete-student')).response.status).toBe(302);
      expect(
        await prisma.orgMembership.count({
          where: {
            user: { email },
            classesAsStudent: { some: { id: second } },
          },
        })
      ).toBe(1);
    } finally {
      await prisma.class.delete({ where: { id: second } });
    }
  }
);
suite(
  'teacher invitations with multiple schools retain the existing selector and safe destination',
  async () => {
    cookie = '';
    flowToken = '';
    const email = `multi-teacher-${prefix}@example.test`;
    const second = prefix + '-teacher';
    await prisma.school.create({
      data: {
        id: second,
        code: second,
        name: 'Second campus',
        organizationId: prefix,
      },
    });
    try {
      await prisma.invitation.create({
        data: {
          type: 'onboard-teacher',
          target: email,
          secret: 'legacy-secret',
          algorithm: 'SHA-256',
          digits: 6,
          period: 600,
          charSet: '0123456789',
          expiresAt: new Date(Date.now() + 600000),
          metadata: JSON.stringify({ organizationId: prefix }),
        },
      });
      await post('resolve', {
        identifier: email,
        redirectTo: '/app/my-classes',
      });
      await post('send-code');
      const verified = await post('verify-code', { code: await code(email) });
      expect(verified.response.headers.get('location')).toBe(
        '/auth/inv/onboard-teacher'
      );
      const { loader, action } =
        await import('~/routes/auth.inv.onboard-teacher/route');
      const entry = await loader({
        request: new Request('http://127.0.0.1:5396/auth/inv/onboard-teacher', {
          headers: { cookie },
        }),
        params: {},
        context: {},
      } as any);
      expect(entry.schools).toHaveLength(2);
      const result = await action({
        request: new Request('http://127.0.0.1:5396/auth/inv/onboard-teacher', {
          method: 'POST',
          headers: { cookie },
          body: new URLSearchParams({
            name: 'Invited Teacher',
            schoolId: second,
            password: 'abcdef',
            confirmPassword: 'abcdef',
          }),
        }),
        params: {},
        context: {},
      } as any);
      expect((result as Response).headers.get('location')).toBe(
        '/app/my-classes'
      );
      expect(
        await prisma.orgMembership.count({
          where: {
            user: { email },
            role: 'TEACHER',
            schools: { some: { id: second } },
          },
        })
      ).toBe(1);
    } finally {
      await prisma.school.delete({ where: { id: second } });
    }
  }
);
suite(
  'existing passwordless teacher activation retains identity, memberships and destination through the location selector',
  async () => {
    cookie = '';
    flowToken = '';
    const email = `passwordless-teacher-${prefix}@example.test`;
    const second = prefix + '-activation';
    await prisma.school.create({
      data: {
        id: second,
        code: second,
        name: 'Selected location',
        organizationId: prefix,
      },
    });
    const user = await prisma.user.create({
      data: {
        email,
        name: 'Existing identity',
        username: `teacher-${prefix}`,
        mustChangePassword: true,
        memberships: {
          create: [
            {
              organizationId: prefix,
              role: 'STUDENT',
              schools: { connect: { id: prefix } },
            },
            { organizationId: prefix + '-b', role: 'STUDENT', isActive: false },
          ],
        },
      },
      include: { memberships: true },
    });
    const invitation = await prisma.invitation.create({
      data: {
        type: 'onboard-teacher',
        target: email,
        secret: 'local-secret',
        algorithm: 'SHA-256',
        digits: 6,
        period: 600,
        charSet: '0123456789',
        expiresAt: new Date(Date.now() + 600000),
        metadata: JSON.stringify({ organizationId: prefix }),
      },
    });
    try {
      await post('resolve', {
        identifier: email,
        redirectTo: '/app/my-classes',
      });
      await post('send-code');
      const verified = await post('verify-code', { code: await code(email) });
      expect(verified.response.headers.get('location')).toBe(
        '/auth/inv/onboard-teacher'
      );
      const { action } =
        await import('~/routes/auth.inv.onboard-teacher/route');
      const submit = (schoolId: string) =>
        action({
          request: new Request(
            'http://127.0.0.1:5396/auth/inv/onboard-teacher',
            {
              method: 'POST',
              headers: { cookie },
              body: new URLSearchParams({
                name: 'Activated Teacher',
                schoolId,
                password: 'abcdef',
                confirmPassword: 'abcdef',
                userId: 'foreign',
                organizationId: prefix + '-b',
                role: 'ADMIN',
              }),
            }
          ),
          params: {},
          context: {},
        } as any);
      await submit('foreign-location');
      expect(await prisma.password.count({ where: { userId: user.id } })).toBe(
        0
      );
      expect(
        await prisma.orgMembership.findMany({ where: { userId: user.id } })
      ).toEqual(user.memberships);
      expect(
        await prisma.invitation.count({ where: { id: invitation.id } })
      ).toBe(1);
      const result = await submit(second);
      expect((result as Response).headers.get('location')).toBe(
        '/app/my-classes'
      );
      const stored = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        include: {
          password: true,
          memberships: { include: { schools: true } },
          sessions: true,
        },
      });
      expect(stored.username).toBe(user.username);
      expect(stored.name).toBe('Activated Teacher');
      expect(stored.emailVerifiedAt).not.toBeNull();
      expect(stored.mustChangePassword).toBe(false);
      expect(await Bun.password.verify('abcdef', stored.password!.hash)).toBe(
        true
      );
      expect(stored.memberships).toHaveLength(2);
      const membership = stored.memberships.find(
        (m) => m.organizationId === prefix
      )!;
      expect(membership.id).toBe(
        user.memberships.find((m) => m.organizationId === prefix)!.id
      );
      expect(membership.role).toBe('TEACHER');
      expect(membership.schools.map((s) => s.id).sort()).toEqual(
        [prefix, second].sort()
      );
      const { schools, ...unrelated } = stored.memberships.find(
        (m) => m.organizationId === prefix + '-b'
      )!;
      expect(unrelated).toEqual(
        user.memberships.find((m) => m.organizationId === prefix + '-b')!
      );
      expect(stored.sessions).toHaveLength(1);
      expect(await prisma.user.count({ where: { email } })).toBe(1);
      expect(
        await prisma.invitation.count({ where: { id: invitation.id } })
      ).toBe(0);
      expect(
        (result as Response).headers
          .getSetCookie()
          .some((c) => c.startsWith('en_invitation=') && c.includes('Expires='))
      ).toBe(true);
    } finally {
      await prisma.school.delete({ where: { id: second } });
    }
  }
);
for (const change of [
  'expired',
  'revoked',
  'reassigned',
  'credentialed',
] as const)
  suite(
    `teacher activation rejects ${change} authorization without partial writes`,
    async () => {
      cookie = '';
      flowToken = '';
      const email = `${change}-teacher-${prefix}@example.test`;
      const second = `${prefix}-${change}`;
      await prisma.school.create({
        data: {
          id: second,
          code: second,
          name: 'Second location',
          organizationId: prefix,
        },
      });
      const user = await prisma.user.create({
        data: {
          email,
          name: 'Existing identity',
          memberships: { create: { organizationId: prefix, role: 'STUDENT' } },
        },
        include: { memberships: true },
      });
      const invitation = await prisma.invitation.create({
        data: {
          type: 'onboard-teacher',
          target: email,
          secret: 'local-only',
          algorithm: 'SHA-256',
          digits: 6,
          period: 600,
          charSet: '0123456789',
          expiresAt: new Date(Date.now() + 600000),
          metadata: JSON.stringify({ organizationId: prefix }),
        },
      });
      try {
        await post('resolve', { identifier: email });
        await post('send-code');
        expect(
          (
            await post('verify-code', { code: await code(email) })
          ).response.headers.get('location')
        ).toBe('/auth/inv/onboard-teacher');
        if (change === 'expired')
          await prisma.invitation.update({
            where: { id: invitation.id },
            data: { expiresAt: new Date(0) },
          });
        if (change === 'revoked')
          await prisma.invitation.delete({ where: { id: invitation.id } });
        if (change === 'reassigned')
          await prisma.user.update({
            where: { id: user.id },
            data: { email: `moved-${email}` },
          });
        if (change === 'credentialed')
          await prisma.password.create({
            data: {
              userId: user.id,
              hash: await getPasswordHash('existing-password'),
            },
          });
        const before = await prisma.user.findUniqueOrThrow({
          where: { id: user.id },
          include: { password: true, memberships: true },
        });
        const { action } =
          await import('~/routes/auth.inv.onboard-teacher/route');
        const result = await action({
          request: new Request(
            'http://127.0.0.1:5396/auth/inv/onboard-teacher',
            {
              method: 'POST',
              headers: { cookie },
              body: new URLSearchParams({
                name: 'Forbidden activation',
                schoolId: second,
                password: 'abcdef',
                confirmPassword: 'abcdef',
              }),
            }
          ),
          params: {},
          context: {},
        } as any);
        expect((result as Response).headers?.get('location')).toBeUndefined();
        expect(
          await prisma.user.findUniqueOrThrow({
            where: { id: user.id },
            include: { password: true, memberships: true },
          })
        ).toEqual(before);
        expect(await prisma.session.count({ where: { userId: user.id } })).toBe(
          0
        );
        expect(
          await prisma.orgMembership.count({
            where: { userId: user.id, schools: { some: { id: second } } },
          })
        ).toBe(0);
        expect(
          await prisma.invitation.count({ where: { id: invitation.id } })
        ).toBe(change === 'revoked' ? 0 : 1);
      } finally {
        await prisma.school.delete({ where: { id: second } });
      }
    }
  );
suite(
  'new Google identity ignores email, requires class selection and creates a password handle atomically',
  async () => {
    const { googleCallback } = await import('./google.server');
    const { generateKeyPair, exportJWK, SignJWT } = await import('jose');
    const previousFetch = globalThis.fetch;
    const pair = await generateKeyPair('RS256');
    const email = `new-google-${prefix}@example.test`;
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'local-client';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'local-secret';
    cookie = '';
    flowToken = '';
    await post('resolve', { identifier: prefix });
    let authorization = new URL((await post('google')).data.redirectTo);
    globalThis.fetch = (async (target: any) => {
      if (target === 'https://www.googleapis.com/oauth2/v3/certs')
        return Response.json({
          keys: [
            {
              ...(await exportJWK(pair.publicKey)),
              kid: 'local',
              alg: 'RS256',
            },
          ],
        });
      if (target === 'https://oauth2.googleapis.com/token')
        return Response.json({
          id_token: await new SignJWT({
            nonce: authorization.searchParams.get('nonce'),
            email,
            email_verified: true,
          })
            .setProtectedHeader({ alg: 'RS256', kid: 'local' })
            .setIssuer('https://accounts.google.com')
            .setAudience('local-client')
            .setSubject(`new-subject-${prefix}`)
            .setIssuedAt()
            .setExpirationTime('5m')
            .sign(pair.privateKey),
        });
      throw new Error('External calls forbidden');
    }) as typeof fetch;
    try {
      const response = await googleCallback(
        new Request(
          `http://127.0.0.1:5396/auth/unified/google/callback?code=mock&state=${authorization.searchParams.get('state')}`,
          { headers: { cookie } }
        )
      );
      expect(response.status).toBe(302);
      const entry = await unifiedEntry(
        new Request(url + '?continue=1', { headers: { cookie } })
      );
      expect(entry?.initialState?.screen).toBe('class-code');
      expect(entry?.initialState?.identifier).toBeUndefined();
      const row = await prisma.signonFlow.findUniqueOrThrow({
        where: { id: (await import('./flow.server')).digest(flowToken) },
      });
      expect(JSON.stringify(row.data)).not.toContain(email);
      expect(
        (await post('create-account', { name: 'Google Student' })).response
          .status
      ).toBe(400);
      expect(
        (
          await post('register-student', {
            firstName: 'Google',
            lastName: 'Student',
            password: 'abcdef',
            confirmPassword: 'abcdef',
          })
        ).response.status
      ).toBe(400);
      await post('resolve-class', { classCode: prefix });
      await post('student-choice', { choice: 'new' });
      expect(
        (
          await post('register-student', {
            firstName: 'Google',
            lastName: 'Student',
            password: 'abcdef',
            confirmPassword: 'abcdef',
          })
        ).data.state.screen
      ).toBe('joined');
      const user = await prisma.user.findFirstOrThrow({
        where: {
          signonIdentities: { some: { subject: `new-subject-${prefix}` } },
        },
        include: { signonIdentities: true, password: true },
      });
      expect(user.email).toBeNull();
      expect(user.password).not.toBeNull();
      expect(user.signonIdentities).toHaveLength(1);
      expect((await post('complete-student')).response.status).toBe(302);
      cookie = '';
      flowToken = '';
      await post('resolve', { identifier: prefix });
      authorization = new URL((await post('google')).data.redirectTo);
      const linkedResponse = await googleCallback(
        new Request(
          `http://127.0.0.1:5396/auth/unified/google/callback?code=mock&state=${authorization.searchParams.get('state')}`,
          { headers: { cookie } }
        )
      );
      expect(linkedResponse.status).toBe(302);
      expect(linkedResponse.headers.get('location')).toBe(
        '/auth/login?continue=1'
      );
      for (const header of linkedResponse.headers.getSetCookie())
        cookie += '; ' + header.split(';')[0];
      const joined = await unifiedEntry(
        new Request(url + '?continue=1', { headers: { cookie } })
      );
      expect(joined?.initialState?.screen).toBe('joined');
      expect(joined?.initialState?.variant).toBe('already');
      expect(
        (await post('complete-student')).response.headers.get('location')
      ).toBe('/app');
      const linkedFlow = await prisma.signonFlow.findUniqueOrThrow({
        where: { id: (await import('./flow.server')).digest(flowToken) },
      });
      expect(JSON.stringify(linkedFlow.data)).not.toContain(email);
      expect(await prisma.session.count({ where: { userId: user.id } })).toBe(
        2
      );
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.signonIdentity.deleteMany({ where: { userId: user.id } });
      await prisma.password.deleteMany({ where: { userId: user.id } });
      await prisma.orgMembership.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    } finally {
      globalThis.fetch = previousFetch;
      delete process.env.GOOGLE_OAUTH_CLIENT_ID;
      delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    }
  }
);

suite(
  'unified teacher handoff cannot fall back to legacy authorization after expiry or flag-off',
  async () => {
    cookie = '';
    flowToken = '';
    const email = `expired-handoff-${prefix}@example.test`;
    const second = prefix + '-handoff';
    await prisma.school.create({
      data: {
        id: second,
        code: second,
        name: 'Second campus',
        organizationId: prefix,
      },
    });
    try {
      await prisma.invitation.create({
        data: {
          type: 'onboard-teacher',
          target: email,
          secret: 'legacy-secret',
          algorithm: 'SHA-256',
          digits: 6,
          period: 600,
          charSet: '0123456789',
          expiresAt: new Date(Date.now() + 600000),
          metadata: JSON.stringify({ organizationId: prefix }),
        },
      });
      await post('resolve', { identifier: email });
      await post('send-code');
      await post('verify-code', { code: await code(email) });
      await prisma.setting.update({
        where: { name: 'feature_flag.unified-sign-on' },
        data: { value: 'false' },
      });
      const { action } =
        await import('~/routes/auth.inv.onboard-teacher/route');
      try {
        await action({
          request: new Request(
            'http://127.0.0.1:5396/auth/inv/onboard-teacher',
            {
              method: 'POST',
              headers: { cookie },
              body: new URLSearchParams({
                name: 'Forbidden Teacher',
                schoolId: second,
                password: 'abcdef',
                confirmPassword: 'abcdef',
              }),
            }
          ),
          params: {},
          context: {},
        } as any);
        throw new Error('Expected rejection');
      } catch (response) {
        expect((response as Response).headers.get('location')).toBe(
          '/auth/login'
        );
        expect(
          (response as Response).headers
            .getSetCookie()
            .some(
              (c) => c.startsWith('en_invitation=') && c.includes('Expires=')
            )
        ).toBe(true);
      }
      expect(await prisma.user.count({ where: { email } })).toBe(0);
    } finally {
      await prisma.setting.update({
        where: { name: 'feature_flag.unified-sign-on' },
        data: { value: 'true' },
      });
      await prisma.school.delete({ where: { id: second } });
    }
  }
);
suite(
  'reset proof cannot change credentials after email reassignment, and substituted class context invalidates a code',
  async () => {
    cookie = '';
    flowToken = '';
    const email = `reset-race-${prefix}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        password: { create: { hash: await getPasswordHash('abcdef') } },
      },
    });
    await post('resolve', { identifier: email });
    await post('send-code', { purpose: 'reset-password' });
    await post('verify-code', { code: await code(email) });
    const old = await prisma.password.findUniqueOrThrow({
      where: { userId: user.id },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { email: `reset-moved-${prefix}@example.test` },
    });
    expect(
      (
        await post('create-account', {
          password: 'new-password',
          confirmPassword: 'new-password',
        })
      ).response.status
    ).toBe(400);
    expect(
      (await prisma.password.findUniqueOrThrow({ where: { userId: user.id } }))
        .hash
    ).toBe(old.hash);
  }
);
suite(
  'new Google identities cannot use email invitations to skip class-code entry',
  async () => {
    const { googleCallback } = await import('./google.server');
    const { generateKeyPair, exportJWK, SignJWT } = await import('jose');
    const previousFetch = globalThis.fetch;
    const pair = await generateKeyPair('RS256');
    const email = `google-multi-${prefix}@example.test`;
    const second = prefix + '-google-multi';
    await prisma.class.create({
      data: { id: second, code: second, schoolId: prefix },
    });
    await prisma.invitation.create({
      data: {
        type: 'onboard-student',
        target: email,
        secret: 'legacy-secret',
        algorithm: 'SHA-256',
        digits: 6,
        period: 600,
        charSet: '0123456789',
        expiresAt: new Date(Date.now() + 600000),
        metadata: JSON.stringify({ klassIds: [prefix, second] }),
      },
    });
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'local-client';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'local-secret';
    cookie = '';
    flowToken = '';
    const authorization = new URL((await post('google')).data.redirectTo);
    globalThis.fetch = (async (target: any) => {
      if (target === 'https://www.googleapis.com/oauth2/v3/certs')
        return Response.json({
          keys: [
            {
              ...(await exportJWK(pair.publicKey)),
              kid: 'local',
              alg: 'RS256',
            },
          ],
        });
      if (target === 'https://oauth2.googleapis.com/token')
        return Response.json({
          id_token: await new SignJWT({
            nonce: authorization.searchParams.get('nonce'),
            email,
            email_verified: true,
          })
            .setProtectedHeader({ alg: 'RS256', kid: 'local' })
            .setIssuer('https://accounts.google.com')
            .setAudience('local-client')
            .setSubject(`multi-subject-${prefix}`)
            .setIssuedAt()
            .setExpirationTime('5m')
            .sign(pair.privateKey),
        });
      throw new Error('External calls forbidden');
    }) as typeof fetch;
    try {
      await googleCallback(
        new Request(
          `http://127.0.0.1:5396/auth/unified/google/callback?code=mock&state=${authorization.searchParams.get('state')}`,
          { headers: { cookie } }
        )
      );
      const entry = await unifiedEntry(
        new Request(url + '?continue=1', { headers: { cookie } })
      );
      flowToken = entry!.initialState!.flowToken!;
      expect(entry?.initialState?.screen).toBe('class-code');
      expect(entry?.initialState?.classes).toBeUndefined();
      expect(
        (await post('choose-class', { classId: second })).response.status
      ).toBe(400);
      expect(
        (await post('create-account', { name: 'Google Student' })).response
          .status
      ).toBe(400);
      expect(await prisma.user.count({ where: { email } })).toBe(0);
      expect(
        (await post('resolve-class', { classCode: second })).data.state.screen
      ).toBe('class-found');
    } finally {
      globalThis.fetch = previousFetch;
      delete process.env.GOOGLE_OAUTH_CLIENT_ID;
      delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      await prisma.class.delete({ where: { id: second } });
    }
  }
);

suite(
  'expired invitation status is revealed only after email proof and cannot create an account',
  async () => {
    cookie = '';
    flowToken = '';
    const email = `expired-invite-${prefix}@example.test`;
    await prisma.invitation.create({
      data: {
        type: 'onboard-owner',
        target: email,
        secret: 'legacy-secret',
        algorithm: 'SHA-256',
        digits: 6,
        period: 600,
        charSet: '0123456789',
        expiresAt: new Date(0),
        metadata: JSON.stringify({ organizationId: prefix }),
      },
    });
    const resolved = await post('resolve', { identifier: email });
    expect(resolved.data.state.screen).toBe('activation');
    expect(resolved.data.state.variant).toBeUndefined();
    await post('send-code');
    const verified = await post('verify-code', { code: await code(email) });
    expect(verified.data.state.variant).toBe('expired');
    expect(
      (
        await post('create-account', {
          name: 'Expired Teacher',
          password: 'abcdef',
          confirmPassword: 'abcdef',
        })
      ).response.status
    ).toBe(400);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  }
);

suite(
  'anonymous trial status requires email proof and resends only through the existing captured invitation contract',
  async () => {
    cookie = '';
    flowToken = '';
    const email = `status-${prefix}@example.test`;
    const flagName = 'feature_flag.free_tier';
    const oldFlag = await prisma.setting.findUnique({
      where: { name: flagName },
    });
    const oldKey = process.env.FREE_TIER_LINK_HMAC_SECRET;
    const oldOrigin = process.env.PRIMARY_APP_URL;
    process.env.FREE_TIER_LINK_HMAC_SECRET =
      'local-test-free-tier-signing-key-32bytes';
    process.env.PRIMARY_APP_URL = 'http://127.0.0.1:5396';
    await prisma.setting.upsert({
      where: { name: flagName },
      create: { name: flagName, value: 'true', valueType: 'boolean' },
      update: { value: 'true' },
    });
    const application = await prisma.freeTierApplication.create({
      data: {
        email,
        name: 'Local Teacher',
        schoolName: 'Local',
        location: 'Local',
        gradeLevel: '11',
        status: 'INVITED',
      },
    });
    try {
      await post('resolve', { identifier: email });
      expect((await post('resend-invite')).response.status).toBe(401);
      expect((await post('trial-status')).data.state.screen).toBe('email-code');
      expect(
        (await post('verify-code', { code: await code(email) })).data.state
          .variant
      ).toBe('invited');
      expect(
        (await post('resend-invite', { applicationId: 'foreign' })).response
          .status
      ).toBe(200);
      expect(
        await prisma.freeTierEmailLog.count({
          where: {
            applicationId: application.id,
            kind: 'release',
            success: true,
          },
        })
      ).toBe(1);
      expect(cookie).not.toContain('en_session=');
    } finally {
      await prisma.freeTierApplication.delete({
        where: { id: application.id },
      });
      if (oldFlag)
        await prisma.setting.update({
          where: { name: flagName },
          data: { value: oldFlag.value },
        });
      else await prisma.setting.delete({ where: { name: flagName } });
      if (oldKey === undefined) delete process.env.FREE_TIER_LINK_HMAC_SECRET;
      else process.env.FREE_TIER_LINK_HMAC_SECRET = oldKey;
      if (oldOrigin === undefined) delete process.env.PRIMARY_APP_URL;
      else process.env.PRIMARY_APP_URL = oldOrigin;
    }
  }
);
suite(
  'isolated preview resends capture real mail while proof, flow, status, ownership, feature gate and rate limits remain enforced',
  async () => {
    const original = { ...process.env };
    const { takePreviewCode } = await import('./preview-code.server');
    const emailModule = await import('~/utils/email.server');
    const mail = spyOn(emailModule, 'sendEmail'); // Call through the real mailer.
    const info = spyOn(console, 'info').mockImplementation(() => {});
    const originalFetch = globalThis.fetch;
    let providerCalls = 0;
    globalThis.fetch = (async () => {
      providerCalls++;
      throw new Error('External delivery forbidden');
    }) as any;
    const email = `preview-resend-${prefix}@example.test`;
    const foreign = `foreign-resend-${prefix}@example.test`;
    const flagName = 'feature_flag.free_tier';
    const oldFlag = await prisma.setting.findUnique({
      where: { name: flagName },
    });
    const user = await prisma.user.create({
      data: { email: `owner-resend-${prefix}@example.test` },
    });
    const otherUser = await prisma.user.create({
      data: { email: `other-owner-resend-${prefix}@example.test` },
    });
    const application = await prisma.freeTierApplication.create({
      data: {
        email,
        userId: user.id,
        name: 'Private QA Teacher',
        schoolName: 'Local',
        location: 'Local',
        gradeLevel: '11',
        status: 'INVITED',
      },
    });
    const foreignApplication = await prisma.freeTierApplication.create({
      data: {
        email: foreign,
        userId: otherUser.id,
        name: 'Other Teacher',
        schoolName: 'Local',
        location: 'Local',
        gradeLevel: '11',
        status: 'INVITED',
      },
    });
    try {
      process.env.YAWP_ENVIRONMENT = 'preview';
      process.env.PREVIEW_SLUG = 'pr-565';
      process.env.PREVIEW_DATA_MODE = 'seed';
      delete process.env.DATABASE_SCHEMA;
      process.env.DATABASE_URL =
        'postgresql://yawp_pr_565_app:fixture-password@preview-postgres:5432/yawp_pr_565';
      process.env.PREVIEW_ACCESS_SECRET =
        'local-preview-resend-private-secret-32bytes';
      process.env.FREE_TIER_LINK_HMAC_SECRET =
        'local-free-tier-resend-private-secret-32bytes';
      process.env.PRIMARY_APP_URL = 'http://127.0.0.1:5396';
      delete process.env.SIGNON_MAIL_CAPTURE_DIR;
      delete process.env.RESEND_API_KEY;
      delete process.env.EMAIL_PROVIDER;
      await prisma.setting.upsert({
        where: { name: flagName },
        create: { name: flagName, value: 'true', valueType: 'boolean' },
        update: { value: 'true' },
      });
      cookie = '';
      flowToken = '';
      await post('resolve', { identifier: email });
      expect((await post('resend-invite')).response.status).toBe(401);
      expect((await post('resend-approval')).response.status).toBe(401);
      await post('trial-status');
      const request = new Request('http://local/api/preview/qa/signon-code', {
        headers: {
          authorization: `Bearer ${process.env.PREVIEW_ACCESS_SECRET}`,
        },
      });
      const otp = takePreviewCode(request, email)!;
      expect(typeof otp === 'string').toBe(true);
      expect(
        (await post('verify-code', { code: otp })).data.state.variant
      ).toBe('invited');
      const proofCookie = cookie;
      expect((await post('resend-invite', {}, false)).response.status).toBe(
        400
      );
      cookie = proofCookie;
      const token = flowToken;
      expect(
        (await post('resend-invite', { flowToken: 'foreign-flow' })).response
          .status
      ).toBe(400);
      flowToken = token;
      for (const database of [
        undefined,
        'invalid/yawp_pr_565',
        'postgresql://postgres@preview-postgres:5432/yawp_pr_565',
        'postgresql://yawp_pr_565_app:fixture-password@preview-postgres:5432/yawp_pr_565?host=127.0.0.1',
      ]) {
        if (database === undefined)
          Reflect.deleteProperty(process.env, 'DATABASE_URL');
        else process.env.DATABASE_URL = database;
        for (const runtime of ['development', 'production'] as const) {
          process.env.NODE_ENV = runtime;
          expect((await post('resend-invite')).response.status).toBe(503);
          expect((await post('resend-approval')).response.status).toBe(503);
        }
      }
      process.env.NODE_ENV = 'development';
      process.env.DATABASE_URL =
        'postgresql://yawp_pr_565_app:fixture-password@preview-postgres:5432/yawp_pr_565';
      expect(mail.mock.calls.length).toBe(0);
      testIp = `198.18.2.${Math.floor(Math.random() * 250)}`;
      const result = await post('resend-invite', {
        applicationId: foreignApplication.id,
        identifier: foreign,
      });
      expect(result.response.status).toBe(200);
      expect(result.data.state.notice).toBe(
        'If available, an email is on its way.'
      );
      expect(mail.mock.calls.length).toBe(1);
      const delivered = mail.mock.calls[0][0] as any;
      // Never expose recipient/link values through failed assertion diagnostics.
      expect(delivered.to === email).toBe(true);
      expect(
        delivered.subject === "You're in — start your Yawp! classroom!"
      ).toBe(true);
      expect(delivered.text.includes('/free/join?t=')).toBe(true);
      expect(delivered.html.includes('/free/join?t=')).toBe(true);
      const { peekSignedLink } =
        await import('~/domain/free-tier/signed-link.server');
      const invitationLine = delivered.text
        .split('\n')
        .find((line: string) => line.includes('/free/join?t='));
      const invitation = await peekSignedLink({
        token: new URL(invitationLine).searchParams.get('t')!,
        expectedPurpose: 'RELEASE',
      });
      expect(invitation.ok && invitation.applicationId === application.id).toBe(
        true
      );

      expect(
        info.mock.calls.some((call) =>
          String(call[0]).includes('[preview-email-capture]')
        )
      ).toBe(true);
      expect(
        await prisma.freeTierEmailLog.count({
          where: {
            applicationId: application.id,
            kind: 'release',
            success: true,
          },
        })
      ).toBe(1);
      expect(
        await prisma.freeTierEmailLog.count({
          where: { applicationId: foreignApplication.id },
        })
      ).toBe(0);
      expect(cookie.includes('en_session=')).toBe(false);
      // Eligibility still comes from the persisted application, not posted state.
      for (const status of [
        'LEAD',
        'SENT',
        'REJECTED',
        'EXPIRED',
        'APPROVED',
        'MANUAL_REVIEW',
        'ACCOUNT_CREATED',
      ] as const) {
        testIp = `198.18.1.${Math.floor(Math.random() * 250)}`;
        // Each target has a six/hour cap; clear only this disposable test's bucket.
        await prisma.rateLimitBucket.deleteMany({
          where: {
            key: {
              startsWith: `target:${createHash('sha256').update(email).digest('hex').slice(0, 32)}:/auth/unified/forgotPassword`,
            },
          },
        });
        await prisma.freeTierApplication.update({
          where: { id: application.id },
          data: { status },
        });
        expect(
          (await post('resend-invite', { status: 'INVITED' })).response.status
        ).toBe(200);
        expect(mail.mock.calls.length).toBe(1);
      }
      await prisma.rateLimitBucket.deleteMany({
        where: {
          key: {
            startsWith: `target:${createHash('sha256').update(email).digest('hex').slice(0, 32)}:/auth/unified/forgotPassword`,
          },
        },
      });
      await prisma.freeTierApplication.update({
        where: { id: application.id },
        data: { status: 'SENT' },
      });
      await prisma.freeTierAdminApproval.create({
        data: {
          applicationId: application.id,
          adminEmail: `admin-${prefix}@example.test`,
          adminName: 'QA Admin',
          adminRole: 'Principal',
          status: 'PENDING',
          emailCopyVersionHash: 'local',
          firstSentAt: new Date(),
        },
      });
      expect((await post('resend-approval')).response.status).toBe(200); // Anonymous proof is insufficient.
      expect(mail.mock.calls.length).toBe(1);
      const { authSessionStorage } =
        await import('~/cookie-session-storages/authentication.server');
      const { sessionKey } = await import('~/utils/auth.server');
      const attachUser = async (userId: string) => {
        const row = await prisma.session.create({
          data: { userId, expirationDate: new Date(Date.now() + 600000) },
        });
        const session = await authSessionStorage.getSession(cookie);
        session.set(sessionKey, row.id);
        cookie =
          proofCookie +
          '; ' +
          (await authSessionStorage.commitSession(session)).split(';')[0];
      };
      await attachUser(otherUser.id);
      expect(
        (await post('resend-approval', { applicationId: application.id }))
          .response.status
      ).toBe(200);
      expect(mail.mock.calls.length).toBe(1);
      await attachUser(user.id);
      expect(
        (
          await post('resend-approval', {
            applicationId: foreignApplication.id,
          })
        ).response.status
      ).toBe(200);
      const reminderDeliveries = await prisma.freeTierApprovalDelivery.count({
        where: {
          approval: { applicationId: application.id },
          kind: 'admin_reminder',
          state: 'SENT',
        },
      });
      expect(mail.mock.calls.length + reminderDeliveries).toBeGreaterThanOrEqual(
        2
      );
      const reminder = (mail.mock.calls[1]?.[0] ??
        mail.mock.calls[0]?.[0]) as any;
      expect(reminder.to === `admin-${prefix}@example.test`).toBe(true);
      expect(reminder.text.includes('/free/admin/approve?t=')).toBe(true);
      expect(reminder.text.includes('/free/admin/not-right-person?t=')).toBe(
        true
      );
      await prisma.rateLimitBucket.deleteMany({
        where: {
          key: {
            startsWith: `target:${createHash('sha256').update(email).digest('hex').slice(0, 32)}:/auth/unified/forgotPassword`,
          },
        },
      });
      await prisma.freeTierApplication.update({
        where: { id: application.id },
        data: { status: 'REJECTED' },
      });
      expect((await post('resend-approval')).response.status).toBe(200);
      expect(mail.mock.calls.length).toBe(2);
      await prisma.freeTierApplication.delete({
        where: { id: application.id },
      });
      expect((await post('resend-invite')).response.status).toBe(200);
      expect((await post('resend-approval')).response.status).toBe(200);
      expect(mail.mock.calls.length).toBe(2);
      await prisma.freeTierApplication.create({
        data: {
          id: application.id,
          email,
          userId: user.id,
          name: 'Private QA Teacher',
          schoolName: 'Local',
          location: 'Local',
          gradeLevel: '11',
          status: 'INVITED',
        },
      });
      const previewEnv = process.env.YAWP_ENVIRONMENT;
      const previewSlug = process.env.PREVIEW_SLUG;
      delete process.env.YAWP_ENVIRONMENT;
      delete process.env.PREVIEW_SLUG;
      await prisma.setting.update({
        where: { name: flagName },
        data: { value: 'false' },
      });
      try {
        // The retained dispatcher maps the free-tier route's thrown data to 503.
        expect((await post('resend-invite')).response.status).toBe(503);
        expect(mail.mock.calls.length).toBe(2);
      } finally {
        await prisma.setting.update({
          where: { name: flagName },
          data: { value: 'true' },
        });
        if (previewEnv === undefined) delete process.env.YAWP_ENVIRONMENT;
        else process.env.YAWP_ENVIRONMENT = previewEnv;
        if (previewSlug === undefined) delete process.env.PREVIEW_SLUG;
        else process.env.PREVIEW_SLUG = previewSlug;
      }
      await prisma.rateLimitBucket.deleteMany({
        where: {
          key: {
            startsWith: `target:${createHash('sha256').update(email).digest('hex').slice(0, 32)}:/auth/unified/forgotPassword`,
          },
        },
      });
      await prisma.freeTierApplication.update({
        where: { id: application.id },
        data: { status: 'INVITED' },
      });
      for (let i = 0; i < 6; i++)
        expect((await post('resend-invite')).response.status).toBe(200);
      expect((await post('resend-invite')).response.status).toBe(429);
      expect(mail.mock.calls.length).toBe(8);
      expect(providerCalls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
      mail.mockRestore();
      info.mockRestore();
      await prisma.freeTierApplication.deleteMany({
        where: { id: { in: [application.id, foreignApplication.id] } },
      });
      if (oldFlag)
        await prisma.setting.update({
          where: { name: flagName },
          data: { value: oldFlag.value },
        });
      else await prisma.setting.deleteMany({ where: { name: flagName } });
      for (const key of Object.keys(process.env))
        if (!(key in original)) delete process.env[key];
      Object.assign(process.env, original);
    }
  }
);
suite(
  'enabled mutations retain the existing read-only impersonation guard',
  async () => {
    const { authSessionStorage } =
      await import('~/cookie-session-storages/authentication.server');
    const { readOnlyImpersonationMode, impersonationModeKey } =
      await import('~/utils/auth.server');
    cookie = '';
    flowToken = '';
    await post('resolve', { identifier: `readonly-${prefix}@example.test` });
    const session = await authSessionStorage.getSession(cookie);
    session.set(impersonationModeKey, readOnlyImpersonationMode);
    cookie +=
      '; ' + (await authSessionStorage.commitSession(session)).split(';')[0];
    expect((await post('send-code')).response.status).toBe(403);
  }
);
suite(
  'additive flow and identity tables expose the intended unique and foreign-key boundaries',
  async () => {
    const rows = await prisma.$queryRaw<
      Array<{ table_name: string; column_name: string }>
    >`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('SignonFlow','SignonIdentity')`;
    expect(
      rows
        .filter((r) => r.table_name === 'SignonFlow')
        .map((r) => r.column_name)
        .sort()
    ).toEqual(['browserHash', 'data', 'expiresAt', 'id']);
    expect(
      rows
        .filter((r) => r.table_name === 'SignonIdentity')
        .map((r) => r.column_name)
        .sort()
    ).toEqual(['createdAt', 'id', 'provider', 'subject', 'userId']);
    const indexes = await prisma.$queryRaw<
      Array<{ indexname: string }>
    >`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='SignonIdentity'`;
    expect(indexes.map((i) => i.indexname)).toContain(
      'SignonIdentity_provider_subject_key'
    );
    expect(indexes.map((i) => i.indexname)).toContain(
      'SignonIdentity_provider_userId_key'
    );
  }
);

suite(
  'existing passwordless account activates only after email proof and keeps its membership',
  async () => {
    cookie = '';
    flowToken = '';
    const email = `passwordless-${prefix}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        name: 'LTI Student',
        memberships: { create: { organizationId: prefix, role: 'STUDENT' } },
      },
    });
    expect(
      (
        await post('resolve', {
          identifier: email,
          redirectTo: '/app/my-classes',
        })
      ).data.state.screen
    ).toBe('activation');
    expect(
      (
        await post('create-account', {
          name: 'Student',
          password: 'abcdef',
          confirmPassword: 'abcdef',
        })
      ).response.status
    ).toBe(400);
    expect(await prisma.password.count({ where: { userId: user.id } })).toBe(0);
    await post('send-code');
    expect(
      (await post('verify-code', { code: await code(email) })).data.state.screen
    ).toBe('name-password');
    const activated = await post('create-account', {
      name: 'Activated Student',
      password: 'abcdef',
      confirmPassword: 'abcdef',
    });
    expect(activated.response.headers.get('location')).toBe('/app/my-classes');
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { password: true, memberships: true, sessions: true },
    });
    expect(stored.name).toBe('Activated Student');
    expect(await Bun.password.verify('abcdef', stored.password!.hash)).toBe(
      true
    );
    expect(stored.memberships).toHaveLength(1);
    expect(stored.sessions).toHaveLength(1);
  }
);
suite(
  'read-only authenticated GET continuation cannot accept invitations or enroll classes',
  async () => {
    cookie = '';
    flowToken = '';
    const email = `readonly-get-${prefix}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        password: { create: { hash: await getPasswordHash('abcdef') } },
      },
    });
    const invitation = await prisma.invitation.create({
      data: {
        type: 'onboard-student',
        target: email,
        secret: 'local-secret',
        algorithm: 'SHA-256',
        digits: 6,
        period: 600,
        charSet: '0123456789',
        expiresAt: new Date(Date.now() + 600000),
        metadata: JSON.stringify({ klassId: prefix }),
      },
    });
    await post('resolve', { identifier: email });
    await post('resolve-class', { classCode: prefix });
    await post('password', { password: 'abcdef' });
    const { authSessionStorage } =
      await import('~/cookie-session-storages/authentication.server');
    const { readOnlyImpersonationMode, impersonationModeKey } =
      await import('~/utils/auth.server');
    const session = await authSessionStorage.getSession(cookie);
    session.set(impersonationModeKey, readOnlyImpersonationMode);
    const entry = (await authSessionStorage.commitSession(session)).split(
      ';'
    )[0];
    cookie = cookie
      .split('; ')
      .filter((c) => !c.startsWith(entry.split('=')[0] + '='))
      .concat(entry)
      .join('; ');
    let blocked: unknown;
    try {
      await unifiedEntry(
        new Request(url + '?continue=1', { headers: { cookie } })
      );
    } catch (error) {
      blocked = error;
    }
    expect(blocked).toBeInstanceOf(Response);
    expect((blocked as Response).headers.get('location')).toBe('/app');
    expect(
      await prisma.orgMembership.count({ where: { userId: user.id } })
    ).toBe(0);
    expect(
      await prisma.invitation.count({ where: { id: invitation.id } })
    ).toBe(1);
    expect(
      await prisma.orgMembership.count({
        where: { userId: user.id, classesAsStudent: { some: { id: prefix } } },
      })
    ).toBe(0);
  }
);

suite(
  'school email signup shows an existing-account notice before ordinary proof and keeps the class',
  async () => {
    cookie = '';
    flowToken = '';
    const email = `${prefix}-class-existing@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        name: 'Local Existing',
        emailVerifiedAt: new Date(),
        password: { create: { hash: await getPasswordHash('local-password') } },
        memberships: { create: { organizationId: prefix, role: 'STUDENT' } },
      },
    });
    await post('resolve', { identifier: prefix, redirectTo: '//evil.test' });
    expect(
      (await post('student-choice', { choice: 'new' })).data.state.screen
    ).toBe('class-handle');
    expect((await post('student-email')).data.state.screen).toBe('class-email');
    const existing = await post('resolve', {
      identifier: email,
      classId: 'foreign',
    });
    expect(existing.data.state).toMatchObject({
      screen: 'class-email',
      variant: 'existing',
      identifier: email,
      classInfo: { id: prefix },
      notice:
        'You already have an account with this email. Sign in to join this class.',
    });
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect(
      await prisma.orgMembership.count({
        where: { userId: user.id, classesAsStudent: { some: { id: prefix } } },
      })
    ).toBe(0);
    const signin = await post('class-email-signin', {
      identifier: email,
      email: 'forged@example.test',
      redirectTo: '//evil.test',
    });
    expect(signin.data.state).toMatchObject({
      screen: 'password',
      identifier: email,
      classInfo: { id: prefix },
    });
    // Client Back does not change the authoritative flow. Resubmitting still
    // rediscovers the notice; neither a stale UI nor posted identity proves access.
    expect(
      (await post('resolve', { identifier: email })).data.state.variant
    ).toBe('existing');
    await post('resolve', {
      identifier: `${prefix}-back-unknown@example.test`,
    });
    expect(
      (await post('class-email-signin', { identifier: email })).data.state
    ).toMatchObject({ screen: 'password', identifier: email });
    const wrong = await dispatchUnifiedLogin({
      request: new Request(url, {
        method: 'POST',
        headers: { cookie, 'x-forwarded-for': testIp },
        body: new URLSearchParams({
          intent: 'password',
          flowToken,
          password: 'wrong-password',
          email: 'forged@example.test',
        }),
      }),
      params: {},
      context: {},
    } as any);
    expect(JSON.stringify(wrong)).toContain('Invalid email or password');
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect(
      await prisma.orgMembership.count({
        where: { userId: user.id, classesAsStudent: { some: { id: prefix } } },
      })
    ).toBe(0);
    const proved = await post('password', {
      password: 'local-password',
      redirectTo: '//evil.test',
    });
    expect(proved.response.status).toBe(302);
    expect(proved.response.headers.get('location')).toBe(
      '/auth/login?continue=1'
    );
    let continued: any;
    try {
      continued = await unifiedEntry(
        new Request(url + '?continue=1', { headers: { cookie } })
      );
    } catch (response) {
      continued = response;
    }
    expect(continued.initialState.screen).toBe('joined');
    expect(
      (await post('complete-student')).response.headers.get('location')
    ).toBe('/app');
    expect(
      await prisma.orgMembership.count({
        where: {
          userId: user.id,
          role: 'STUDENT',
          classesAsStudent: { some: { id: prefix } },
        },
      })
    ).toBe(1);
  }
);

suite(
  'school email option rejects forged/stale/free contexts and unknown email still requires proof',
  async () => {
    cookie = '';
    flowToken = '';
    expect(
      (await post('student-email', { classId: prefix })).response.status
    ).toBe(400);
    await post('resolve', { identifier: prefix });
    expect((await post('student-email')).response.status).toBe(400);
    await post('student-choice', { choice: 'returning' });
    expect((await post('student-email')).response.status).toBe(400);
    await post('student-choice', { choice: 'new' });
    await prisma.organization.update({
      where: { id: prefix },
      data: { plan: 'FREE_CLASSROOM' },
    });
    try {
      expect((await post('student-email')).response.status).toBe(400);
    } finally {
      await prisma.organization.update({
        where: { id: prefix },
        data: { plan: 'SCHOOL' },
      });
    }
    await prisma.class.update({
      where: { id: prefix },
      data: { isArchived: true },
    });
    try {
      expect((await post('student-email')).response.status).toBe(400);
    } finally {
      await prisma.class.update({
        where: { id: prefix },
        data: { isArchived: false },
      });
    }
    expect((await post('student-email')).data.state.screen).toBe('class-email');
    expect(
      (await post('resolve', { identifier: 'bad@' })).response.status
    ).toBe(400);
    expect(
      (await post('resolve', { identifier: '@forged' })).response.status
    ).toBe(400);
    const email = `${prefix}-school-new@example.test`;
    expect(
      (await post('resolve', { identifier: email })).data.state
    ).toMatchObject({
      screen: 'activation',
      identifier: email,
      classInfo: { id: prefix },
    });
    expect((await post('class-email-signin')).data.state).toMatchObject({
      screen: 'activation',
      identifier: email,
    });
    expect(await prisma.user.count({ where: { email } })).toBe(0);
    expect(
      (
        await post('create-account', {
          name: 'Forged',
          password: 'abcdef',
          confirmPassword: 'abcdef',
        })
      ).response.status
    ).toBe(400);
    expect((await post('send-code')).data.state.screen).toBe('email-code');
    const otp = await code(email);
    expect((await post('verify-code', { code: otp })).data.state.screen).toBe(
      'name-password'
    );
    expect(
      (
        await post('create-account', {
          name: 'School Student',
          password: 'abcdef',
          confirmPassword: 'abcdef',
        })
      ).data.state.screen
    ).toBe('joined');
    expect((await post('complete-student')).response.status).toBe(302);
    expect(
      await prisma.user.count({
        where: {
          email,
          emailVerifiedAt: { not: null },
          memberships: {
            some: {
              role: 'STUDENT',
              classesAsStudent: { some: { id: prefix } },
            },
          },
        },
      })
    ).toBe(1);
  }
);

suite(
  'school email existing passwordless accounts keep ordinary activation and unavailable Google fails closed',
  async () => {
    cookie = '';
    flowToken = '';
    const email = `${prefix}-school-passwordless@example.test`;
    const user = await prisma.user.create({
      data: { email, name: 'Local Passwordless' },
    });
    await post('resolve', { identifier: prefix });
    await post('student-choice', { choice: 'new' });
    await post('student-email');
    expect(
      (await post('resolve', { identifier: email })).data.state
    ).toMatchObject({
      screen: 'class-email',
      variant: 'existing',
      identifier: email,
    });
    expect((await post('class-email-signin')).data.state).toMatchObject({
      screen: 'activation',
      identifier: email,
      classInfo: { id: prefix },
    });
    const original = [
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    ];
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    try {
      expect((await post('google')).response.status).toBe(503);
    } finally {
      for (const [index, name] of [
        'GOOGLE_OAUTH_CLIENT_ID',
        'GOOGLE_OAUTH_CLIENT_SECRET',
      ].entries()) {
        if (original[index] === undefined) delete process.env[name];
        else process.env[name] = original[index];
      }
    }
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect(
      await prisma.orgMembership.count({ where: { userId: user.id } })
    ).toBe(0);
  }
);

for (const outcome of ['access_denied', 'server_error', 'invalid_state'])
  suite(
    `school email Google ${outcome} returns to ordinary class-code entry without proof`,
    async () => {
      cookie = '';
      flowToken = '';
      const original = [
        process.env.GOOGLE_OAUTH_CLIENT_ID,
        process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      ];
      const sessionCount = await prisma.session.count();
      process.env.GOOGLE_OAUTH_CLIENT_ID = 'local-client';
      process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'local-secret';
      try {
        await post('resolve', { identifier: prefix });
        await post('student-choice', { choice: 'new' });
        await post('student-email');
        const started = await post('google');
        const target = new URL(started.data.redirectTo);
        const callback = new URL('/auth/unified/google/callback', url);
        callback.searchParams.set(
          'state',
          outcome === 'invalid_state'
            ? 'invalid'
            : target.searchParams.get('state')!
        );
        callback.searchParams.set(
          'error',
          outcome === 'invalid_state' ? 'access_denied' : outcome
        );
        const { googleCallback } = await import('./google.server');
        const result = await googleCallback(
          new Request(callback, { headers: { cookie } })
        );
        expect(result.headers.get('location')).toBe('/auth/login?continue=1');
        const entry = await unifiedEntry(
          new Request(url + '?continue=1', { headers: { cookie } })
        );
        expect(entry?.initialState?.screen).toBe('entry');
        expect(
          (await post('resolve', { identifier: prefix })).data.state
        ).toMatchObject({ screen: 'class-found', classInfo: { id: prefix } });
        expect(
          (await post('student-choice', { choice: 'returning' })).data.state
            .screen
        ).toBe('class-signin');
        expect(await prisma.session.count()).toBe(sessionCount);
      } finally {
        for (const [index, name] of [
          'GOOGLE_OAUTH_CLIENT_ID',
          'GOOGLE_OAUTH_CLIENT_SECRET',
        ].entries()) {
          if (original[index] === undefined) delete process.env[name];
          else process.env[name] = original[index];
        }
      }
    }
  );

// FAILURES.md di-signon-fix-join-confirmation: real proof/enrollment/continuation.
async function resumeClass() {
  try {
    return await unifiedEntry(
      new Request(url + '?continue=1', { headers: { cookie } })
    );
  } catch (response) {
    if (response instanceof Response) return response;
    throw response;
  }
}
for (const already of [false, true]) {
  suite(
    `class password confirmation derives ${already ? 'already' : 'joined'} before enrollment and consumes once`,
    async () => {
      cookie = '';
      flowToken = '';
      const email = `joined-${already}-${prefix}@example.test`;
      const user = await prisma.user.create({
        data: {
          email,
          password: { create: { hash: await getPasswordHash('abcdef') } },
          memberships: {
            create: {
              organizationId: prefix,
              role: 'STUDENT',
              ...(already
                ? { classesAsStudent: { connect: { id: prefix } } }
                : {}),
            },
          },
        },
      });
      await post('resolve', {
        identifier: email,
        redirectTo: '/app/my-classes',
      });
      await post('resolve-class', { classCode: prefix });
      expect(
        (
          await post('complete-student', {
            screen: 'joined',
            variant: 'already',
            classId: prefix,
          })
        ).response.status
      ).toBe(400);
      expect(
        (await post('password', { password: 'wrong-password' })).response.status
      ).not.toBe(302);
      expect(await prisma.session.count({ where: { userId: user.id } })).toBe(
        0
      );
      await post('password', { password: 'abcdef' });
      const entry = await resumeClass();
      expect(entry).not.toBeInstanceOf(Response);
      expect((entry as any).initialState).toMatchObject({
        screen: 'joined',
        classInfo: {
          id: prefix,
          name: 'English 11',
          organization: 'Local class',
        },
      });
      expect((entry as any).initialState.variant).toBe(
        already ? 'already' : undefined
      );
      expect((entry as any).initialState.identifier).toBeUndefined();
      expect(((await resumeClass()) as any).initialState).toEqual(
        (entry as any).initialState
      );
      expect(await prisma.session.count({ where: { userId: user.id } })).toBe(
        1
      );
      const flowOnly = cookie
        .split('; ')
        .filter((c) => c.startsWith('yawp_signon='))
        .join('; ');
      const savedCookie = cookie;
      cookie = flowOnly;
      expect((await post('complete-student')).response.status).toBe(401);
      cookie = savedCookie;
      const complete = await post('complete-student', {
        redirectTo: '//evil.test',
        classId: 'forged',
        variant: 'already',
      });
      expect(complete.response.headers.get('location')).toBe('/app/my-classes');
      expect(cookie).toContain('membership-id=');
      expect((await post('complete-student')).response.status).toBe(400);
      expect(await prisma.user.count({ where: { email } })).toBe(1);
      expect(await prisma.session.count({ where: { userId: user.id } })).toBe(
        1
      );
      expect(
        await prisma.orgMembership.count({
          where: {
            userId: user.id,
            classesAsStudent: { some: { id: prefix } },
          },
        })
      ).toBe(1);
    }
  );
}
suite(
  'email-code class proof confirms only after verification, retaining email proof for continuation',
  async () => {
    cookie = '';
    flowToken = '';
    const email = `joined-code-${prefix}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        password: { create: { hash: await getPasswordHash('abcdef') } },
        memberships: { create: { organizationId: prefix, role: 'STUDENT' } },
      },
    });
    await post('resolve', { identifier: email });
    await post('resolve-class', { classCode: prefix });
    await post('send-code');
    expect((await post('complete-student')).response.status).toBe(400);
    expect(
      (await post('verify-code', { code: 'not-proof' })).response.status
    ).toBe(400);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    const verified = await post('verify-code', { code: await code(email) });
    expect(verified.data?.state.screen).toBe('joined');
    expect(verified.data.state.variant).not.toBe('already');
    expect(((await resumeClass()) as any).initialState.screen).toBe('joined');
    expect(
      (await post('complete-student')).response.headers.get('location')
    ).toBe('/app');
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
  }
);
for (const invalidation of [
  'inactive',
  'archived',
  'code',
  'expired',
] as const) {
  suite(
    `pending class confirmation revalidates ${invalidation} before explicit continuation`,
    async () => {
      cookie = '';
      flowToken = '';
      const email = `joined-invalid-${invalidation}-${prefix}@example.test`;
      const user = await prisma.user.create({
        data: {
          email,
          password: { create: { hash: await getPasswordHash('abcdef') } },
          memberships: { create: { organizationId: prefix, role: 'STUDENT' } },
        },
        include: { memberships: true },
      });
      await post('resolve', { identifier: email });
      await post('resolve-class', { classCode: prefix });
      await post('password', { password: 'abcdef' });
      expect(((await resumeClass()) as any).initialState?.screen).toBe(
        'joined'
      );
      try {
        if (invalidation === 'inactive')
          await prisma.orgMembership.update({
            where: { id: user.memberships[0].id },
            data: { isActive: false },
          });
        if (invalidation === 'archived')
          await prisma.class.update({
            where: { id: prefix },
            data: { isArchived: true },
          });
        if (invalidation === 'code')
          await prisma.class.update({
            where: { id: prefix },
            data: { code: prefix + '-changed' },
          });
        if (invalidation === 'expired')
          await prisma.signonFlow.updateMany({
            where: { data: { path: ['identifier'], equals: email } },
            data: { expiresAt: new Date(0) },
          });
        expect([400, 403]).toContain(
          (await post('complete-student')).response.status
        );
        expect(await prisma.session.count({ where: { userId: user.id } })).toBe(
          1
        );
        if (invalidation === 'inactive')
          expect(
            (
              await prisma.orgMembership.findUniqueOrThrow({
                where: { id: user.memberships[0].id },
              })
            ).isActive
          ).toBe(false);
      } finally {
        await prisma.class.update({
          where: { id: prefix },
          data: { code: prefix, isArchived: false },
        });
      }
    }
  );
}
suite(
  'class confirmation waits for forced password change and the active membership picker',
  async () => {
    cookie = '';
    flowToken = '';
    const email = `joined-forced-${prefix}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        mustChangePassword: true,
        password: { create: { hash: await getPasswordHash('abcdef') } },
        memberships: {
          create: [
            { organizationId: prefix, role: 'STUDENT' },
            { organizationId: prefix + '-b', role: 'STUDENT' },
          ],
        },
      },
      include: { memberships: true },
    });
    await post('resolve', { identifier: email, redirectTo: '/app/my-classes' });
    await post('resolve-class', { classCode: prefix });
    expect(
      (await post('password', { password: 'abcdef' })).response.headers.get(
        'location'
      )
    ).toBe('/auth/required-password-change');
    expect(
      await prisma.orgMembership.count({
        where: { userId: user.id, classesAsStudent: { some: { id: prefix } } },
      })
    ).toBe(0);
    expect((await post('complete-student')).response.status).toBe(400);
    const { action } =
      await import('~/routes/auth.required-password-change/route');
    const changed = await action({
      request: new Request(
        'http://127.0.0.1:5396/auth/required-password-change',
        {
          method: 'POST',
          headers: { cookie },
          body: new URLSearchParams({
            password: 'new-password',
            confirmPassword: 'new-password',
          }),
        }
      ),
      params: {},
      context: {},
    } as any);
    expect((changed as Response).headers.get('location')).toBe(
      '/auth/login?continue=1'
    );
    expect(((await resumeClass()) as any).initialState.screen).toBe(
      'membership'
    );
    expect(
      (await post('select-membership', { membershipId: 'foreign' })).response
        .status
    ).toBe(403);
    const selected = await post('select-membership', {
      membershipId: user.memberships.find((m) => m.organizationId === prefix)!
        .id,
    });
    expect(selected.data?.state.screen).toBe('joined');
    expect(selected.data.state.variant).not.toBe('already');
    expect(((await resumeClass()) as any).initialState.screen).toBe('joined');
    expect(
      (await post('complete-student')).response.headers.get('location')
    ).toBe('/app/my-classes');
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
  }
);

suite(
  'matching Google email keeps class context through password proof and explicit link or skip',
  async () => {
    const { googleCallback } = await import('./google.server');
    const { generateKeyPair, exportJWK, SignJWT } = await import('jose');
    const pair = await generateKeyPair('RS256');
    const jwk = {
      ...(await exportJWK(pair.publicKey)),
      kid: 'class-confirmation',
      alg: 'RS256',
    };
    const previous = {
      fetch: globalThis.fetch,
      id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    };
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'local-client';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'local-fixture-secret';
    let email = '',
      nonce = '',
      subject = '';
    globalThis.fetch = (async (target: any) => {
      if (target === 'https://www.googleapis.com/oauth2/v3/certs')
        return Response.json({ keys: [jwk] });
      if (target !== 'https://oauth2.googleapis.com/token')
        throw new Error('No external requests permitted');
      return Response.json({
        id_token: await new SignJWT({ email, email_verified: true, nonce })
          .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
          .setIssuer('https://accounts.google.com')
          .setAudience('local-client')
          .setSubject(subject)
          .setIssuedAt()
          .setExpirationTime('5m')
          .sign(pair.privateKey),
      });
    }) as typeof fetch;
    try {
      for (const intent of ['skip-google', 'link-google']) {
        cookie = '';
        flowToken = '';
        email = `joined-${intent}-${prefix}@example.test`;
        subject = `joined-${intent}-${prefix}`;
        const user = await prisma.user.create({
          data: {
            email,
            password: { create: { hash: await getPasswordHash('abcdef') } },
            memberships: {
              create: { organizationId: prefix, role: 'STUDENT' },
            },
          },
        });
        await post('resolve', {
          identifier: prefix,
          redirectTo: '/app/my-classes',
        });
        const authorization = new URL((await post('google')).data.redirectTo);
        nonce = authorization.searchParams.get('nonce')!;
        const callback = new URL('/auth/unified/google/callback', url);
        callback.searchParams.set('code', 'local-mock');
        callback.searchParams.set(
          'state',
          authorization.searchParams.get('state')!
        );
        expect(
          (
            await googleCallback(new Request(callback, { headers: { cookie } }))
          ).headers.get('location')
        ).toBe('/auth/login?continue=1');
        expect(await prisma.session.count({ where: { userId: user.id } })).toBe(
          0
        );
        expect(((await resumeClass()) as any).initialState.screen).toBe(
          'password'
        );
        expect((await post(intent)).response.status).toBe(401);
        await post('password', { password: 'abcdef' });
        expect(((await resumeClass()) as any).initialState.screen).toBe(
          'link-google'
        );
        expect(
          await prisma.orgMembership.count({
            where: {
              userId: user.id,
              classesAsStudent: { some: { id: prefix } },
            },
          })
        ).toBe(0);
        const confirmed = await post(intent);
        expect(confirmed.data?.state.screen).toBe('joined');
        expect(confirmed.data.state.variant).not.toBe('already');
        expect(confirmed.data.state.classInfo.id).toBe(prefix);
        expect(((await resumeClass()) as any).initialState.screen).toBe(
          'joined'
        );
        expect(
          (await post('complete-student')).response.headers.get('location')
        ).toBe('/app/my-classes');
        expect(await prisma.session.count({ where: { userId: user.id } })).toBe(
          1
        );
        expect(
          await prisma.signonIdentity.count({ where: { userId: user.id } })
        ).toBe(intent === 'link-google' ? 1 : 0);
      }
    } finally {
      globalThis.fetch = previous.fetch;
      if (previous.id === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_ID;
      else process.env.GOOGLE_OAUTH_CLIENT_ID = previous.id;
      if (previous.secret === undefined)
        delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      else process.env.GOOGLE_OAUTH_CLIENT_SECRET = previous.secret;
    }
  }
);

// FAILURES.md: di-signon-fix-recovery-code-copy. Exercise real OTP consumption,
// identity resolution, selected-class validation and database enrollment denial.
for (const denial of ['inactive', 'unavailable'] as const) {
  suite(
    `email verification returns a retryable class error for ${denial} enrollment without access`,
    async () => {
      cookie = '';
      flowToken = '';
      const email = `denied-code-${denial}-${prefix}@example.test`;
      const user = await prisma.user.create({
        data: {
          email,
          password: { create: { hash: await getPasswordHash('abcdef') } },
          memberships: {
            create: {
              organizationId: prefix,
              role: 'STUDENT',
              isActive: false,
            },
          },
        },
      });
      const snapshot = () =>
        prisma.orgMembership.findMany({
          where: { userId: user.id },
          include: { classesAsStudent: { select: { id: true } } },
        });
      const before = await snapshot();
      await post('resolve', { identifier: prefix });
      await post('student-choice', { choice: 'new' });
      await post('student-email');
      expect(
        (await post('resolve', { identifier: email })).data.state.variant
      ).toBe('existing');
      expect((await post('class-email-signin')).data.state.screen).toBe(
        'password'
      );
      expect((await post('send-code')).data.state.screen).toBe('email-code');
      if (denial === 'unavailable')
        await prisma.class.update({
          where: { id: prefix },
          data: { isArchived: true },
        });
      try {
        const denied = await post('verify-code', { code: await code(email) });
        expect(denied.response.status).toBe(400);
        expect(denied.data).toEqual({
          error: '',
          fieldErrors: {
            classCode:
              "We couldn't find a class with that code. Check it with your teacher.",
          },
        });
        expect(await snapshot()).toEqual(before);
        expect(await prisma.session.count({ where: { userId: user.id } })).toBe(
          0
        );
        expect((await post('complete-student')).response.status).toBe(400);
        expect(
          (await post('resolve-class', { classCode: 'unknown-local-code' }))
            .data.fieldErrors.classCode
        ).toBe(denied.data.fieldErrors.classCode);
        expect(await snapshot()).toEqual(before);
      } finally {
        if (denial === 'unavailable')
          await prisma.class.update({
            where: { id: prefix },
            data: { isArchived: false },
          });
      }
    }
  );
}
