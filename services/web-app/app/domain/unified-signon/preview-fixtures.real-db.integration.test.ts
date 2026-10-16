import { beforeAll, afterAll, expect, test } from 'bun:test';
import { readdir, readFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '~/utils/db.server';
import { dispatchUnifiedLogin, unifiedEntry } from './entry.server';
import {
  seedPreviewSignonQa,
  qaId,
  qaEmail,
  QA_CODES,
  QA_TRIAL_STATUSES,
} from '../../../../../packages/prisma/scripts/seed-preview-signon-qa';
import { LOCAL_DEV_PASSWORD } from '../../../../../packages/prisma/scripts/local-dev/dev-personas';
const enabled = process.env.SIGNON_PREVIEW_FIXTURE_TEST === '1';
const suite = enabled ? test : test.skip;
const capture = path.join(
  process.env.TMPDIR!,
  'di-signon-preview-fixtures',
  'mail'
);
const fixtureEnv = {
  ...process.env,
  YAWP_ENVIRONMENT: 'preview',
  PREVIEW_SLUG: 'pr-999565',
  PREVIEW_DATA_MODE: 'seed',
};
const flag = 'feature_flag.unified-sign-on';
let priorFlags: any[] = [];
let cookie = '',
  token = '',
  ip = 0;
async function post(intent: string, values: Record<string, string> = {}) {
  const result = (await dispatchUnifiedLogin({
    request: new Request('http://localhost:5396/auth/login', {
      method: 'POST',
      headers: { cookie, 'x-forwarded-for': `198.18.1.${ip}` },
      body: new URLSearchParams({ intent, flowToken: token, ...values }),
    }),
    params: {},
    context: {},
  } as any)) as Response;
  if (!(result instanceof Response))
    return { result: Response.json(result, { status: 422 }), data: result };
  for (const c of result.headers.getSetCookie()) {
    const part = c.split(';')[0];
    cookie = cookie
      .split('; ')
      .filter((p) => p && p.split('=')[0] !== part.split('=')[0])
      .concat(part)
      .join('; ');
  }
  const data = result.headers.get('content-type')?.includes('json')
    ? await result.json()
    : null;
  if (data?.state?.flowToken) token = data.state.flowToken;
  return { result, data };
}
function fresh() {
  cookie = '';
  token = '';
  ip++;
}
async function code(email: string) {
  for (const f of (await readdir(capture)).reverse()) {
    const v = JSON.parse(await readFile(path.join(capture, f), 'utf8'));
    if (v.email === email) return v.code;
  }
  throw new Error('Capture missing');
}
beforeAll(async () => {
  if (!enabled) return;
  if (
    !['127.0.0.1', 'localhost'].includes(
      new URL(process.env.DATABASE_URL!).hostname
    ) ||
    !process.env.DATABASE_URL?.endsWith('/yawp_pr_999565')
  )
    throw new Error('Disposable lane database required');
  priorFlags = await prisma.setting.findMany({
    where: { name: { in: [flag, 'feature_flag.free_tier'] } },
  });
  await prisma.setting.deleteMany({ where: { name: flag } });
  await rm(capture, { recursive: true, force: true });
  await mkdir(capture, { recursive: true });
  process.env.SIGNON_LOCAL_TEST = '1';
  process.env.SIGNON_MAIL_CAPTURE_DIR = capture;
});
afterAll(async () => {
  if (!enabled) return;
  await prisma.setting.deleteMany({
    where: { name: { in: [flag, 'feature_flag.free_tier'] } },
  });
  for (const row of priorFlags) await prisma.setting.create({ data: row });
  await rm(capture, { recursive: true, force: true });
  await prisma.$disconnect();
});
suite(
  'fixture relationships, create-only reruns, existing personas and flag OFF remain intact',
  async () => {
    const existing = await prisma.user.findUniqueOrThrow({
      where: { email: 'dev.teacher@yawp.local' },
      include: { password: true, memberships: true },
    });
    await seedPreviewSignonQa(prisma, fixtureEnv);
    const before = await prisma.user.findMany({
      where: { id: { startsWith: 'preview-signon-qa-' } },
      include: { password: true, memberships: true },
      orderBy: { id: 'asc' },
    });
    const invites = await prisma.invitation.findMany({
      where: { id: { startsWith: 'preview-signon-qa-' } },
      orderBy: { id: 'asc' },
    });
    await seedPreviewSignonQa(prisma, fixtureEnv);
    expect(
      await prisma.user.findMany({
        where: { id: { startsWith: 'preview-signon-qa-' } },
        include: { password: true, memberships: true },
        orderBy: { id: 'asc' },
      })
    ).toEqual(before);
    expect(
      await prisma.invitation.findMany({
        where: { id: { startsWith: 'preview-signon-qa-' } },
        orderBy: { id: 'asc' },
      })
    ).toEqual(invites);
    expect(
      await prisma.user.findUnique({
        where: { id: existing.id },
        include: { password: true, memberships: true },
      })
    ).toEqual(existing);
    expect(
      await prisma.setting.findUnique({ where: { name: flag } })
    ).toBeNull();
    expect(
      before.find((u) => u.id === qaId('passwordless'))?.password
    ).toBeNull();
    expect(
      before.find((u) => u.id === qaId('forced'))?.mustChangePassword
    ).toBe(true);
    expect(
      before
        .find((u) => u.id === qaId('multiple'))
        ?.memberships.filter((m) => m.isActive)
    ).toHaveLength(2);
    expect(
      before.find((u) => u.id === qaId('inactive'))?.memberships[0].isActive
    ).toBe(false);
    for (const status of QA_TRIAL_STATUSES)
      expect(
        (
          await prisma.freeTierApplication.findUniqueOrThrow({
            where: { id: qaId(`trial-${status.toLowerCase()}`) },
          })
        ).status
      ).toBe(status);
    expect(
      invites
        .find((i) => i.id === qaId('invite-expired-invite'))!
        .expiresAt!.getTime()
    ).toBeLessThan(Date.now());
    expect(
      await prisma.freeTierAdminApproval.findUnique({
        where: { id: qaId('admin-approval') },
      })
    ).not.toBeNull();
    expect(
      await unifiedEntry(new Request('http://localhost:5396/auth/login'))
    ).toBeNull();
    await prisma.setting.create({
      data: { name: flag, value: 'true', valueType: 'boolean' },
    });
  }
);
suite(
  'real handler password, forced change, memberships, inactive and trials use seeded records',
  async () => {
    for (const [key, screen, destination] of [
      ['password', null, '/app/my-classes'],
      ['forced', null, '/auth/required-password-change'],
      ['multiple', 'membership', null],
      ['inactive', 'inactive', null],
      ['trial-account_created', null, '/app/free-tier/onboarding'],
      ['trial-sent', null, '/app/free-tier/pending'],
      ['trial-approved', null, '/app/my-classes'],
      ['trial-rejected', null, '/app/free-tier/status'],
      ['trial-expired', null, '/app/free-tier/status'],
    ] as const) {
      fresh();
      expect(
        (
          await post('resolve', {
            identifier: qaEmail(key),
            redirectTo: '/app/my-classes',
          })
        ).data.state.screen
      ).toBe('password');
      const response = await post('password', { password: LOCAL_DEV_PASSWORD });
      if (key === 'forced')
        expect(response.result.headers.get('location')).toBe(destination);
      else {
        let continuation: any;
        try {
          continuation = await unifiedEntry(
            new Request('http://localhost:5396/auth/login?continue=1', {
              headers: { cookie },
            })
          );
        } catch (r) {
          continuation = r;
        }
        if (screen) expect(continuation.initialState.screen).toBe(screen);
        else expect(continuation.headers.get('location')).toBe(destination);
      }
    }
  }
);
suite(
  'real handler ambiguity, multiple choices, full seats and stale choices',
  async () => {
    fresh();
    expect(
      (await post('resolve', { identifier: QA_CODES.free })).data.state.screen
    ).toBe('ambiguity');
    fresh();
    const classes = await post('resolve', { identifier: QA_CODES.multiple });
    expect(classes.data.state.classes).toHaveLength(2);
    await prisma.class.update({
      where: { id: qaId('multiple-b') },
      data: { isArchived: true },
    });
    expect(
      (await post('choose-class', { classId: qaId('multiple-b') })).result
        .status
    ).toBe(400);
    await prisma.class.update({
      where: { id: qaId('multiple-b') },
      data: { isArchived: false },
    });
    fresh();
    expect(
      (await post('resolve', { identifier: QA_CODES.full })).data.state.variant
    ).toBe('full');
  }
);
suite(
  'real handler passwordless and invitation proof reveals expired invitation only after code',
  async () => {
    for (const key of ['passwordless', 'invited-student', 'expired-invite']) {
      fresh();
      expect(
        (
          await post('resolve', {
            identifier: qaEmail(key),
            redirectTo: '/app/my-classes',
          })
        ).data.state.screen
      ).toBe('activation');
      expect((await post('send-code')).result.status).toBe(200);
      const verified = await post('verify-code', {
        code: await code(qaEmail(key)),
      });
      if (key === 'expired-invite') {
        expect(verified.data.state.variant).toBe('expired');
        expect(
          (
            await post('create-account', {
              name: 'Preview expired',
              password: LOCAL_DEV_PASSWORD,
              confirmPassword: LOCAL_DEV_PASSWORD,
            })
          ).result.status
        ).toBe(400);
      } else expect(verified.data.state.screen).toBe('name-password');
    }
  }
);

suite(
  'connected database mismatch and reserved identity collision reject atomically',
  async () => {
    const count = await prisma.user.count();
    await expect(
      seedPreviewSignonQa(prisma, {
        ...fixtureEnv,
        PREVIEW_SLUG: 'pr-999566',
        DATABASE_URL: process.env.DATABASE_URL!.replaceAll('999565', '999566'),
      })
    ).rejects.toThrow('matching the connected');
    const collision = await prisma.user.create({
      data: { id: 'fixture-collision', email: qaEmail('orphan-collision') },
    });
    await prisma.user.update({
      where: { id: qaId('orphan') },
      data: { email: qaEmail('orphan-backup') },
    });
    await prisma.user.update({
      where: { id: collision.id },
      data: { email: qaEmail('orphan') },
    });
    await expect(seedPreviewSignonQa(prisma, fixtureEnv)).rejects.toThrow(
      'identity collision'
    );
    expect(await prisma.user.count()).toBe(count + 1);
    await prisma.user.delete({ where: { id: collision.id } });
    await prisma.user.update({
      where: { id: qaId('orphan') },
      data: { email: qaEmail('orphan') },
    });
  }
);
suite(
  'two normal handle joins contend for the last seeded race seat',
  async () => {
    // Only this test's disposable registrations are reset; the seed is create-only.
    const ids = ['qa-racer-one', 'qa-racer-two'];
    const racers = await prisma.user.findMany({
      where: { username: { in: ids } },
      select: { id: true },
    });
    const userIds = racers.map((u) => u.id);
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.orgMembership.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.password.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.setting.upsert({
      where: { name: flag },
      update: { value: 'true' },
      create: { name: flag, value: 'true', valueType: 'boolean' },
    });
    fresh();
    expect(
      (await post('resolve', { identifier: QA_CODES.race })).data.state.variant
    ).not.toBe('full');
    const first = { cookie, token };
    fresh();
    await post('resolve', { identifier: QA_CODES.race });
    expect(
      (
        await post('join-handle', {
          username: ids[0],
          name: 'Preview racer one',
          password: LOCAL_DEV_PASSWORD,
          confirmPassword: LOCAL_DEV_PASSWORD,
        })
      ).result.status
    ).toBe(302);
    cookie = first.cookie;
    token = first.token;
    const stale = await post('join-handle', {
      username: ids[1],
      name: 'Preview racer two',
      password: LOCAL_DEV_PASSWORD,
      confirmPassword: LOCAL_DEV_PASSWORD,
    });
    expect(stale.result.status).toBe(400);
    expect(JSON.stringify(stale.data)).toContain('full');
    expect(await prisma.user.count({ where: { username: ids[1] } })).toBe(0);
  }
);
suite(
  'partner data uses configured host/code and real email proof before billing',
  async () => {
    const keys = [
      'UA_PARTNER_HOSTNAME',
      'UA_STUDENT_BILLING_ENABLED',
      'UA_ORGANIZATION_ID',
      'UA_PARTNER_CODE',
    ];
    const old = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    Object.assign(process.env, {
      UA_PARTNER_HOSTNAME: 'localhost',
      UA_STUDENT_BILLING_ENABLED: 'true',
      UA_ORGANIZATION_ID: qaId('partner'),
      UA_PARTNER_CODE: 'local-qa-partner-code',
    });
    try {
      fresh();
      expect(
        (await post('resolve', { identifier: qaEmail('partner-new') })).data
          .state.screen
      ).toBe('partner-code');
      expect(
        (await post('partner-code', { organizationCode: 'invalid' })).result
          .status
      ).toBe(400);
      expect(
        (
          await post('partner-code', {
            organizationCode: 'local-qa-partner-code',
          })
        ).data.state.screen
      ).toBe('activation');
      expect(
        (
          await post('create-account', {
            name: 'Preview partner',
            password: LOCAL_DEV_PASSWORD,
            confirmPassword: LOCAL_DEV_PASSWORD,
          })
        ).result.status
      ).toBe(400);
      await post('send-code');
      expect(
        (
          await post('verify-code', {
            code: await code(qaEmail('partner-new')),
          })
        ).data.state.screen
      ).toBe('name-password');
      // Existing seeded student proves the real billing destination without creating a repeat-only identity.
      fresh();
      await post('resolve', {
        identifier: qaEmail('partner-student'),
        redirectTo: '/billing/ua',
      });
      await post('password', { password: LOCAL_DEV_PASSWORD });
      try {
        await unifiedEntry(
          new Request('http://localhost:5396/auth/login?continue=1', {
            headers: { cookie },
          })
        );
        throw new Error('Expected billing redirect');
      } catch (r) {
        expect((r as Response).headers.get('location')).toBe('/billing/ua');
      }
    } finally {
      for (const k of keys) {
        if (old[k] === undefined) delete process.env[k];
        else process.env[k] = old[k];
      }
    }
  }
);
suite(
  'private approval link helper uses the real signed-link loader and creates no email',
  async () => {
    const previous = { ...process.env };
    const file = path.join(
      process.env.TMPDIR!,
      'di-signon-preview-fixtures',
      'approval-link'
    );
    Object.assign(process.env, fixtureEnv, {
      PREVIEW_ACCESS_SECRET: 'local-fixture-preview-secret-32-characters',
      PRIMARY_APP_URL: 'http://localhost:5396',
    });
    await prisma.setting.upsert({
      where: { name: 'feature_flag.free_tier' },
      update: { value: 'true' },
      create: {
        name: 'feature_flag.free_tier',
        value: 'true',
        valueType: 'boolean',
      },
    });
    const mailCount = await prisma.freeTierEmailLog.count();
    try {
      const { writePreviewSignonApprovalLink } =
        await import('../../../scripts/preview-signon-approval-link');
      await writePreviewSignonApprovalLink(file);
      const { loader } = await import('~/routes/free.admin.approve/route');
      const result = await loader({
        request: new Request(
          'http://localhost:5396' + (await readFile(file, 'utf8'))
        ),
        params: {},
        context: {},
      } as any);
      expect(result.ok).toBe(true);
      const links = await prisma.freeTierSignedLink.count();
      await expect(writePreviewSignonApprovalLink(file)).rejects.toThrow();
      expect(await prisma.freeTierSignedLink.count()).toBe(links);
      await expect(
        writePreviewSignonApprovalLink('/outside-private-root')
      ).rejects.toThrow('TMPDIR');

      expect(await prisma.freeTierEmailLog.count()).toBe(mailCount);
    } finally {
      await rm(file, { force: true });
      for (const k of Object.keys(process.env))
        if (!(k in previous)) delete process.env[k];
      Object.assign(process.env, previous);
    }
  }
);

suite(
  'deployed seat mode accepts master-selected fixture org, filters multiple and rejects inactive recovery',
  async () => {
    const previous = { ...process.env };
    Object.assign(process.env, {
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
    const { createPreviewAccessAction } =
      await import('~/routes/auth.preview-access/action.server');
    const action = createPreviewAccessAction(); // All dependencies are real; no auth or header bypass.
    const merge = (response: Response) => {
      for (const c of response.headers.getSetCookie()) {
        const part = c.split(';')[0];
        cookie = cookie
          .split('; ')
          .filter((p) => p && p.split('=')[0] !== part.split('=')[0])
          .concat(part)
          .join('; ');
      }
    };
    async function access(values: Record<string, string>) {
      let result: Response;
      try {
        result = await action({
          request: new Request('http://localhost:5396/auth/preview-access', {
            method: 'POST',
            headers: { cookie },
            body: new URLSearchParams(values),
          }),
          params: {},
          context: {},
        } as any);
      } catch (r) {
        result = r as Response;
      }
      expect(result.status).toBe(302);
      merge(result);
    }
    try {
      for (const [key, expected] of [
        ['password', '/app/my-classes'],
        ['multiple', '/app/my-classes'],
        ['inactive', null],
      ] as const) {
        fresh();
        await access({ code: process.env.PREVIEW_MASTER_ACCESS_CODE! });
        await access({
          intent: 'select-organization',
          organizationId: qaId('school'),
          returnTo: '/auth/login',
        });
        expect(
          (
            await post('resolve', {
              identifier: qaEmail(key),
              redirectTo: '/app/my-classes',
            })
          ).data.state.screen
        ).toBe('password');
        const sessionCount = await prisma.session.count({
          where: { userId: qaId(key) },
        });
        const login = await post('password', { password: LOCAL_DEV_PASSWORD });
        if (key === 'inactive') {
          expect(login.result.status).not.toBe(302);
          expect(
            await prisma.session.count({ where: { userId: qaId(key) } })
          ).toBe(sessionCount);
        } else {
          expect(login.result.status).toBe(302);
          try {
            await unifiedEntry(
              new Request('http://localhost:5396/auth/login?continue=1', {
                headers: { cookie },
              })
            );
            throw new Error('Expected selected-seat redirect');
          } catch (r) {
            expect((r as Response).headers.get('location')).toBe(expected);
          }
        }
      }
    } finally {
      for (const k of Object.keys(process.env))
        if (!(k in previous)) delete process.env[k];
      Object.assign(process.env, previous);
    }
  }
);
