import { beforeAll, afterAll, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import type { Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import { dispatchUnifiedLogin } from './entry.server';
const suite = process.env.SIGNON_LOCAL_TEST === '1' ? test : test.skip;
const id = `class-student-${Date.now()}`;
const flag = 'feature_flag.unified-sign-on';
const password = 'local-password';
const details = {
  firstName: 'Brian',
  lastName: 'Connell',
  password,
  confirmPassword: password,
};
function browser(clientIp?: string) {
  let cookie = '',
    flowToken = '';
  const ip =
    clientIp ??
    `198.19.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  return async (intent: string, values: Record<string, string> = {}) => {
    const response = (await dispatchUnifiedLogin({
      request: new Request('http://localhost:5396/auth/login', {
        method: 'POST',
        headers: { cookie, 'x-forwarded-for': ip },
        body: new URLSearchParams({ intent, flowToken, ...values }),
      }),
      params: {},
      context: {},
    } as any)) as Response;
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(';')[0],
        name = pair.split('=')[0];
      cookie = cookie
        .split('; ')
        .filter((v) => v && !v.startsWith(name + '='))
        .concat(pair)
        .join('; ');
    }
    const data = response.headers.get('content-type')?.includes('json')
      ? await response.json()
      : null;
    if (data?.state?.flowToken) flowToken = data.state.flowToken;
    return { response, data };
  };
}
beforeAll(async () => {
  if (process.env.SIGNON_LOCAL_TEST !== '1') return;
  if (
    !['localhost', '127.0.0.1'].includes(
      new URL(process.env.DATABASE_URL!).hostname
    )
  )
    throw Error('Local database required');
  await prisma.setting.upsert({
    where: { name: flag },
    update: { value: 'true' },
    create: { name: flag, value: 'true', valueType: 'boolean' },
  });
  await prisma.organization.create({
    data: { id, name: 'Local student tests', plan: 'SCHOOL' },
  });
  await prisma.school.create({
    data: { id, name: 'Local', code: id, organizationId: id },
  });
  for (const suffix of ['', '-b'])
    await prisma.class.create({
      data: {
        id: id + suffix,
        code: id + suffix,
        schoolId: id,
        title: 'English 11',
      },
    });
});
afterAll(async () => {
  if (process.env.SIGNON_LOCAL_TEST !== '1') return;
  const users = await prisma.user.findMany({
    where: { memberships: { some: { organizationId: id } } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await prisma.signonIdentity.deleteMany({ where: { userId: { in: ids } } });
  await prisma.session.deleteMany({ where: { userId: { in: ids } } });
  await prisma.password.deleteMany({ where: { userId: { in: ids } } });
  await prisma.orgMembership.deleteMany({ where: { organizationId: id } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.class.deleteMany({ where: { schoolId: id } });
  await prisma.school.delete({ where: { id } });
  await prisma.organization.delete({ where: { id } });
  await prisma.signonFlow.deleteMany({});
  await prisma.setting.deleteMany({ where: { name: flag } });
  await prisma.$disconnect();
});
suite(
  'class registration generates per-class handles atomically under concurrent attempts',
  async () => {
    const attempts = await Promise.all(
      Array.from({ length: 3 }, async () => {
        const post = browser();
        expect(
          (await post('resolve', { identifier: id })).data.state.screen
        ).toBe('class-found');
        await post('student-choice', { choice: 'new' });
        return post('register-student', {
          ...details,
          username: 'forged',
          classId: id + '-b',
        });
      })
    );
    for (const result of attempts)
      expect(result.data.state.screen).toBe('joined');
    const handles = await prisma.classStudentHandle.findMany({
      where: { classId: id },
      include: { user: { include: { memberships: true } } },
    });
    expect(handles.map((h) => h.handle).sort()).toEqual([
      'BrianConnell',
      'BrianConnell1',
      'BrianConnell2',
    ]);
    for (const h of handles) {
      expect(h.user.email).toBeNull();
      expect(h.user.username).toBeTruthy();
      expect(h.user.memberships).toHaveLength(1);
    }
    const post = browser();
    await post('resolve', { identifier: id + '-b' });
    await post('student-choice', { choice: 'new' });
    expect(
      (
        await post('register-student', {
          ...details,
          password: 'other-password',
          confirmPassword: 'other-password',
        })
      ).data.state.identifier
    ).toBe('@BrianConnell');
  }
);
suite(
  'returning authentication is scoped, retains password protections and rejects forged transitions',
  async () => {
    const post = browser();
    await post('resolve', { identifier: id });
    expect((await post('register-student', details)).response.status).toBe(400);
    await post('student-choice', { choice: 'returning' });
    expect(
      (
        await post('student-password', {
          username: 'BrianConnell',
          password: 'wrong',
        })
      ).response.status
    ).toBe(400);
    expect(
      (
        await post('student-password', {
          username: 'BrianConnell2',
          password,
          classId: id + '-b',
        })
      ).data.state.screen
    ).toBe('joined');
    expect((await post('complete-student')).response.status).toBe(302);
    const other = browser();
    await other('resolve', { identifier: id + '-b' });
    await other('student-choice', { choice: 'returning' });
    expect(
      (await other('student-password', { username: 'BrianConnell2', password }))
        .response.status
    ).toBe(400);
    expect(
      (await other('student-password', { username: 'BrianConnell', password }))
        .response.status
    ).toBe(400);
    expect(
      (
        await other('student-password', {
          username: 'BrianConnell',
          password: 'other-password',
        })
      ).data.state.screen
    ).toBe('joined');
    expect((await other('complete-student')).response.status).toBe(302);
    const selected = await prisma.classStudentHandle.findUniqueOrThrow({
      where: {
        classId_handleKey: { classId: id + '-b', handleKey: 'brianconnell' },
      },
    });
    expect(
      await prisma.session.count({ where: { userId: selected.userId } })
    ).toBe(1);
  }
);
suite(
  'invalid names, confirmation, archived classes and stale context never create partial accounts',
  async () => {
    const post = browser();
    await post('resolve', { identifier: id });
    await post('student-choice', { choice: 'new' });
    const count = await prisma.user.count();
    for (const values of [
      { ...details, firstName: '😀' },
      { ...details, confirmPassword: 'different' },
    ])
      expect((await post('register-student', values)).response.status).toBe(
        400
      );
    await prisma.class.update({ where: { id }, data: { isArchived: true } });
    expect((await post('register-student', details)).response.status).toBe(400);
    await prisma.class.update({ where: { id }, data: { isArchived: false } });
    expect(await prisma.user.count()).toBe(count);
    const invalid = browser();
    expect(
      (await invalid('resolve', { identifier: 'does-not-exist' })).response
        .status
    ).toBe(400);
  }
);
suite(
  'duplicate codes require an authorized class choice and stale choices fail closed',
  async () => {
    const second = id + '-duplicate';
    await prisma.school.create({
      data: {
        id: second,
        name: 'Other local class',
        code: second,
        organizationId: id,
      },
    });
    await prisma.class.create({
      data: { id: second, code: id, schoolId: second },
    });
    try {
      const post = browser();
      const found = await post('resolve', { identifier: id });
      expect(found.data.state.variant).toBe('multiple');
      expect(
        (await post('student-choice', { choice: 'new' })).response.status
      ).toBe(400);
      expect(
        (await post('choose-class', { classId: 'forged' })).response.status
      ).toBe(400);
      await prisma.class.update({
        where: { id: second },
        data: { isArchived: true },
      });
      expect(
        (await post('choose-class', { classId: second })).response.status
      ).toBe(400);
      expect(
        (await post('choose-class', { classId: id })).data.state.screen
      ).toBe('class-found');
    } finally {
      await prisma.class.delete({ where: { id: second } });
      await prisma.school.delete({ where: { id: second } });
    }
  }
);
suite(
  'inactive enrollment, forced password changes, restart and foreign tokens retain their guards',
  async () => {
    const alias = await prisma.classStudentHandle.findFirstOrThrow({
      where: { classId: id, handle: 'BrianConnell' },
    });
    const membership = await prisma.orgMembership.findFirstOrThrow({
      where: { userId: alias.userId },
    });
    const post = browser();
    await post('resolve', { identifier: id });
    await post('student-choice', { choice: 'returning' });
    expect(
      (
        await post('student-password', {
          username: 'BrianConnell',
          password,
          flowToken: 'forged',
        })
      ).response.status
    ).toBe(400);
    await prisma.orgMembership.update({
      where: { id: membership.id },
      data: { isActive: false },
    });
    expect(
      (await post('student-password', { username: 'BrianConnell', password }))
        .response.status
    ).toBe(400);
    await prisma.orgMembership.update({
      where: { id: membership.id },
      data: { isActive: true },
    });
    await prisma.user.update({
      where: { id: alias.userId },
      data: { mustChangePassword: true },
    });
    expect(
      (
        await post('student-password', { username: 'BrianConnell', password })
      ).response.headers.get('location')
    ).toBe('/auth/required-password-change');
    await prisma.user.update({
      where: { id: alias.userId },
      data: { mustChangePassword: false },
    });
    const restart = browser();
    await restart('resolve', { identifier: id });
    await restart('student-choice', { choice: 'new' });
    await restart('resolve', { identifier: id + '-b' });
    expect((await restart('register-student', details)).response.status).toBe(
      400
    );
  }
);
suite(
  'identity write failure rolls back account, handle and enrollment together',
  async () => {
    const owner = await prisma.classStudentHandle.findFirstOrThrow({
      where: { classId: id },
    });
    await prisma.signonIdentity.create({
      data: { provider: 'google', subject: id, userId: owner.userId },
    });
    const post = browser();
    await post('resolve', { identifier: id });
    const state = (await post('student-choice', { choice: 'new' })).data.state;
    const flowId = (await import('./flow.server')).digest(state.flowToken);
    const flow = await prisma.signonFlow.findUniqueOrThrow({
      where: { id: flowId },
    });
    await prisma.signonFlow.update({
      where: { id: flowId },
      data: { data: { ...(flow.data as any), studentGoogle: { subject: id } } },
    });
    const before = await prisma.user.count();
    expect(
      (await post('register-student', { ...details, firstName: 'Rollback' }))
        .response.status
    ).toBe(503);
    expect(await prisma.user.count()).toBe(before);
    expect(
      await prisma.classStudentHandle.count({
        where: { handle: 'RollbackConnell' },
      })
    ).toBe(0);
  }
);
suite(
  'handle allocation exhausts its finite suffix budget without partial registration',
  async () => {
    const userIds = Array.from({ length: 100 }, (_, i) => `${id}-retry-${i}`);
    await prisma.user.createMany({
      data: userIds.map((userId) => ({ id: userId, username: userId })),
    });
    await prisma.classStudentHandle.createMany({
      data: userIds.map((userId, i) => ({
        userId,
        classId: id,
        handle: 'RetryBound' + (i || ''),
        handleKey: 'retrybound' + (i || ''),
      })),
    });
    try {
      const post = browser();
      await post('resolve', { identifier: id });
      await post('student-choice', { choice: 'new' });
      const before = await prisma.user.count();
      const result = await post('register-student', {
        ...details,
        firstName: 'Retry',
        lastName: 'Bound',
      });
      expect(result.response.status).toBe(400);
      expect(result.data.error).toContain('could not create a handle');
      expect(await prisma.user.count()).toBe(before);
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  }
);
suite(
  'legacy enrolled handles still authenticate and repeated failures are throttled',
  async () => {
    const user = await prisma.user.create({
      data: {
        username: id + '-legacy',
        password: {
          create: {
            hash: await (
              await import('~/utils/auth.server')
            ).getPasswordHash(password),
          },
        },
        memberships: {
          create: {
            organizationId: id,
            role: 'STUDENT',
            classesAsStudent: { connect: { id } },
          },
        },
      },
    });
    const post = browser();
    await post('resolve', { identifier: id });
    await post('student-choice', { choice: 'returning' });
    expect(
      (await post('student-password', { username: user.username!, password }))
        .data.state.screen
    ).toBe('joined');
    expect((await post('complete-student')).response.status).toBe(302);
    const failed = browser();
    await failed('resolve', { identifier: id });
    await failed('student-choice', { choice: 'returning' });
    let status = 400;
    for (let attempt = 0; attempt < 30 && status === 400; attempt++)
      status = (
        await failed('student-password', {
          username: 'BrianConnell',
          password: 'wrong',
        })
      ).response.status;
    expect(status).toBe(429);
  }
);
suite(
  'class links retain authoritative context when enabled and legacy behavior when off',
  async () => {
    const { loader } = await import('~/routes/join/route');
    await prisma.organization.update({
      where: { id },
      data: { plan: 'FREE_CLASSROOM' },
    });
    await prisma.class.update({
      where: { id },
      data: { studentJoinToken: id },
    });
    try {
      let response: Response | undefined;
      const request = new Request(`http://localhost:5396/join?t=${id}`);
      try {
        await loader({ request } as any);
      } catch (value) {
        response = value as Response;
      }
      expect(response?.status).toBe(302);
      expect(response?.headers.get('location')).toBe('/auth/login?continue=1');
      const cookie = response!.headers
        .getSetCookie()
        .map((h) => h.split(';')[0])
        .join('; ');
      const entry = await (
        await import('./entry.server')
      ).unifiedEntry(
        new Request('http://localhost:5396/auth/login?continue=1', {
          headers: { cookie },
        })
      );
      expect(entry?.initialState?.screen).toBe('class-found');
      expect(entry?.initialState?.classInfo?.id).toBe(id);
      await prisma.setting.update({
        where: { name: flag },
        data: { value: 'false' },
      });
      expect(((await loader({ request } as any)) as any).klass.id).toBe(id);
    } finally {
      await prisma.setting.update({
        where: { name: flag },
        data: { value: 'true' },
      });
      await prisma.organization.update({
        where: { id },
        data: { plan: 'SCHOOL' },
      });
    }
  }
);
suite(
  'full classes reject new registration while existing enrolled students can return',
  async () => {
    await prisma.organization.update({
      where: { id },
      data: { plan: 'FREE_CLASSROOM' },
    });
    await prisma.invitation.createMany({
      data: Array.from({ length: 35 }, (_, i) => ({
        type: 'onboard-student',
        target: `${id}-${i}@example.test`,
        studentClassId: id,
        secret: 'local',
        algorithm: 'SHA-256',
        digits: 6,
        period: 600,
        charSet: '0123456789',
        expiresAt: new Date(Date.now() + 600000),
      })),
    });
    try {
      const post = browser();
      expect(
        (await post('resolve', { identifier: id })).data.state.variant
      ).toBe('full');
      expect(
        (await post('student-choice', { choice: 'new' })).response.status
      ).toBe(400);
      expect(
        (await post('student-choice', { choice: 'returning' })).data.state
          .screen
      ).toBe('class-signin');
      expect(
        (
          await post('student-password', {
            username: 'BrianConnell1',
            password,
          })
        ).data.state.screen
      ).toBe('joined');
      expect((await post('complete-student')).response.status).toBe(302);
    } finally {
      await prisma.invitation.deleteMany({ where: { studentClassId: id } });
      await prisma.organization.update({
        where: { id },
        data: { plan: 'SCHOOL' },
      });
    }
  }
);

for (const budget of ['target', 'ip-handle'] as const)
  suite(
    `teacher reset unlocks class aliases and legacy handles after ${budget} lockout only for that student`,
    async () => {
      const { consumeLoginAttemptRateLimits } =
        await import('~/utils/rate-limit.server');
      const { hashLoginRateLimitTarget } =
        await import('~/utils/login-rate-limit-target');
      const { RATE_LIMITS } = await import('~/config/rate-limits');
      const { teacherResetStudentPassword } =
        await import('~/domain/free-tier/student-join.server');
      const post = browser();
      await post('resolve', { identifier: id });
      await post('student-choice', { choice: 'new' });
      const firstName = budget === 'target' ? 'Target' : 'Address';
      const handle = firstName + 'Unlock';
      expect(
        (
          await post('register-student', {
            ...details,
            firstName,
            lastName: 'Unlock',
          })
        ).data.state.screen
      ).toBe('joined');
      const alias = await prisma.classStudentHandle.findUniqueOrThrow({
        where: {
          classId_handleKey: { classId: id, handleKey: handle.toLowerCase() },
        },
        include: { user: { include: { memberships: true } } },
      });
      const legacy = `${id}-${budget}-login`;
      await prisma.user.update({
        where: { id: alias.userId },
        data: { username: legacy },
      });
      await prisma.orgMembership.update({
        where: { id: alias.user.memberships[0].id },
        data: { classesAsStudent: { connect: { id: id + '-b' } } },
      });
      await prisma.classStudentHandle.create({
        data: {
          classId: id + '-b',
          userId: alias.userId,
          handle: handle + 'Other',
          handleKey: (handle + 'Other').toLowerCase(),
        },
      });
      const teacher = await prisma.user.create({
        data: {
          email: `${id}-${budget}@example.test`,
          memberships: {
            create: {
              organizationId: id,
              role: 'TEACHER',
              classesAsTeacher: { connect: { id } },
            },
          },
        },
      });
      const ip = budget === 'target' ? '198.18.20.1' : '198.18.20.2';
      const targets = [
        legacy,
        `${id}:${handle.toLowerCase()}`,
        `${id}:${legacy}`,
        `${id}-b:${(handle + 'Other').toLowerCase()}`,
        `${id}-b:${legacy}`,
      ];
      // Same handle in another class belongs to somebody else and must stay locked.
      await prisma.user.create({
        data: {
          username: `other${budget}${Date.now()}`,
          memberships: {
            create: {
              organizationId: id,
              role: 'STUDENT',
              classesAsStudent: { connect: { id: id + '-b' } },
            },
          },
          classStudentHandles: {
            create: {
              classId: id + '-b',
              handle,
              handleKey: handle.toLowerCase(),
            },
          },
        },
      });
      const unrelated = `${id}-b:${handle.toLowerCase()}`;
      const locked = [...targets, unrelated];
      const cfg = RATE_LIMITS.unauth.login;
      for (const targetKey of locked) {
        const count =
          budget === 'target'
            ? cfg.perEmailPerHour
            : cfg.perIpHandlePer15Minutes;
        for (let attempt = 0; attempt < count; attempt++) {
          const decision = await consumeLoginAttemptRateLimits({
            request: new Request('http://localhost/auth/login', {
              headers: {
                'x-forwarded-for':
                  budget === 'target' ? `198.18.21.${attempt + 10}` : ip,
              },
            }),
            route: '/auth/login',
            targetKey,
            perIpPerMinute: 1000,
            perIpPerHour: 1000,
            perIpSprayPerHour: 1000,
            perTargetPerHour: budget === 'target' ? cfg.perEmailPerHour : 1000,
            perIpHandlePer15Minutes:
              budget === 'ip-handle' ? cfg.perIpHandlePer15Minutes : 1000,
          });
          expect(decision.allowed).toBe(true);
        }
      }
      const failed = browser(ip);
      await failed('resolve', { identifier: id });
      await failed('student-choice', { choice: 'returning' });
      expect(
        (await failed('student-password', { username: handle, password }))
          .response.status
      ).toBe(429);
      const bucketFilter = (target: string) => ({
        key: { contains: hashLoginRateLimitTarget(target) },
      });
      const before = await prisma.rateLimitBucket.findMany({
        where: bucketFilter(unrelated),
        orderBy: { key: 'asc' },
      });
      const reset = (actorUserId: string) =>
        teacherResetStudentPassword({
          studentMembershipId: alias.user.memberships[0].id,
          classId: id,
          organizationId: id,
          actorUserId,
          temporaryPassword: 'temporary-password',
        });
      expect((await reset(alias.userId)).status).toBe('error');
      expect(
        (await failed('student-password', { username: handle, password }))
          .response.status
      ).toBe(429);
      expect((await reset(teacher.id)).status).toBe('ok');
      for (const target of targets)
        expect(
          await prisma.rateLimitBucket.count({ where: bucketFilter(target) })
        ).toBe(0);
      expect(
        await prisma.rateLimitBucket.findMany({
          where: bucketFilter(unrelated),
          orderBy: { key: 'asc' },
        })
      ).toEqual(before);
      // Full-width input exercises the same normalization used when clearing aliases.
      const username = handle.replace('U', 'Ｕ');
      const result = await failed('student-password', {
        username: '@' + username,
        password: 'temporary-password',
      });
      expect(result.response.status).toBe(302);
      expect(result.response.headers.get('location')).toContain(
        '/auth/required-password-change'
      );
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: alias.userId } }))
          .mustChangePassword
      ).toBe(true);
    }
  );

suite(
  'join action blocks read-only mutations and still accepts anonymous flag-off enrollment',
  async () => {
    const { action } = await import('~/routes/join/route');
    const { authSessionStorage } =
      await import('~/cookie-session-storages/authentication.server');
    const session = await authSessionStorage.getSession();
    session.set('impersonationMode', 'read-only');
    session.set('impersonatorUserId', 'local-operator');
    const before = await prisma.user.count();
    await expect(
      action({
        request: new Request('http://localhost/join', {
          method: 'POST',
          headers: { cookie: await authSessionStorage.commitSession(session) },
          body: new URLSearchParams(),
        }),
      } as any)
    ).rejects.toMatchObject({ status: 403 });
    expect(await prisma.user.count()).toBe(before);
    await prisma.setting.update({
      where: { name: flag },
      data: { value: 'false' },
    });
    await prisma.organization.update({
      where: { id },
      data: { plan: 'FREE_CLASSROOM' },
    });
    await prisma.class.update({
      where: { id },
      data: { studentJoinToken: id },
    });
    try {
      const username = `anon${Date.now()}`;
      const response = await action({
        request: new Request('http://localhost/join', {
          method: 'POST',
          body: new URLSearchParams({
            name: 'Anonymous Student',
            username,
            classId: id,
            joinToken: id,
            password,
            confirmPassword: password,
          }),
        }),
      } as any);
      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(302);
      expect((response as Response).headers.get('location')).toBe('/app');
      expect(
        await prisma.orgMembership.count({
          where: {
            user: { username },
            role: 'STUDENT',
            classesAsStudent: { some: { id } },
          },
        })
      ).toBe(1);
    } finally {
      await prisma.setting.update({
        where: { name: flag },
        data: { value: 'true' },
      });
      await prisma.organization.update({
        where: { id },
        data: { plan: 'SCHOOL' },
      });
    }
  }
);

suite(
  'class handle audit triggers cover mutations, atomic rollback and truncation',
  async () => {
    const coverage = await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT t.tgname AS name FROM pg_trigger t
    WHERE t.tgrelid = '"ClassStudentHandle"'::regclass
      AND ((t.tgname = 'internal_impersonation_mutation_audit' AND t.tgtype = 29
        AND t.tgfoid = to_regprocedure('internal_impersonation_mutation_audit()'))
      OR (t.tgname = 'internal_impersonation_truncate_guard' AND t.tgtype = 34
        AND t.tgfoid = to_regprocedure('internal_impersonation_truncate_guard()')))
      AND t.tgenabled IN ('O', 'A')`;
    expect(coverage.map((t) => t.name).sort()).toEqual([
      'internal_impersonation_mutation_audit',
      'internal_impersonation_truncate_guard',
    ]);
    const user = await prisma.user.create({
      data: {
        username: `audit${Date.now()}`,
        memberships: {
          create: {
            organizationId: id,
            role: 'STUDENT',
            classesAsStudent: { connect: { id } },
          },
        },
      },
      include: { memberships: true },
    });
    const audit = {
      id: `${id}-audit`,
      actorId: 'local-operator',
      userId: user.id,
      organizationId: id,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    };
    const { InternalImpersonationSessions } =
      await import('~/utils/internal-impersonation-sessions.server');
    const service = new InternalImpersonationSessions(prisma, {
      redeem: async () => audit,
      context: async () => audit,
      end: async () => {},
    });
    await service.start(randomBytes(32).toString('base64url'));
    // Exercise the database triggers directly. Other tables added on main after
    // the original audit migration have independent coverage gaps; this test
    // neither exempts this table nor changes the application coverage guard.
    const attributed = async (
      requestId: string,
      work: (tx: Prisma.TransactionClient) => Promise<unknown>
    ) =>
      prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('yawp.impersonation.session', ${audit.id}, true),
      set_config('yawp.impersonation.request', ${requestId}, true),
      set_config('yawp.impersonation.action', 'test.class-handle', true)`;
        return work(tx);
      });
    const aliasId = `${id}-audit-handle`;
    try {
      await attributed(`${id}-commit`, async (tx) => {
        await tx.classStudentHandle.create({
          data: {
            id: aliasId,
            classId: id,
            userId: user.id,
            handle: 'AuditStudent',
            handleKey: 'auditstudent',
          },
        });
        await tx.classStudentHandle.update({
          where: { id: aliasId },
          data: { handle: 'AuditUpdated', handleKey: 'auditupdated' },
        });
      });
      const events = await prisma.internalImpersonationEvent.findMany({
        where: { sessionId: audit.id, resourceType: 'ClassStudentHandle' },
        orderBy: { createdAt: 'asc' },
      });
      expect(events).toHaveLength(2);
      expect(events.map((e) => e.action).sort()).toEqual([
        'row.created',
        'row.updated',
      ]);
      expect(
        events.every(
          (e) =>
            e.actorId === audit.actorId &&
            e.userId === user.id &&
            e.organizationId === id &&
            e.requestAction === 'test.class-handle' &&
            JSON.parse(e.resourceId).id === aliasId
        )
      ).toBe(true);
      expect(JSON.stringify(events)).not.toContain('AuditStudent');
      await expect(
        attributed(`${id}-rollback`, async (tx) => {
          await tx.classStudentHandle.delete({ where: { id: aliasId } });
          throw new Error('rollback alias and audit');
        })
      ).rejects.toThrow('rollback alias and audit');
      expect(
        await prisma.classStudentHandle.count({ where: { id: aliasId } })
      ).toBe(1);
      expect(
        await prisma.internalImpersonationEvent.count({
          where: { requestId: `${id}-rollback` },
        })
      ).toBe(0);
      await expect(
        attributed(`${id}-truncate`, async (tx) => {
          await tx.$executeRaw`TRUNCATE TABLE "ClassStudentHandle"`;
        })
      ).rejects.toThrow('Truncation cannot preserve impersonation audit');
      expect(
        await prisma.classStudentHandle.count({ where: { id: aliasId } })
      ).toBe(1);
      await attributed(`${id}-delete`, async (tx) => {
        await tx.classStudentHandle.delete({ where: { id: aliasId } });
      });
      expect(
        await prisma.internalImpersonationEvent.count({
          where: {
            sessionId: audit.id,
            resourceType: 'ClassStudentHandle',
            action: 'row.deleted',
          },
        })
      ).toBe(1);
      await prisma.classStudentHandle.create({
        data: {
          id: aliasId,
          classId: id,
          userId: user.id,
          handle: 'Ordinary',
          handleKey: 'ordinary',
        },
      });
      expect(
        await prisma.internalImpersonationEvent.count({
          where: { sessionId: audit.id, resourceType: 'ClassStudentHandle' },
        })
      ).toBe(3);
    } finally {
      await prisma.internalImpersonationSession.delete({
        where: { id: audit.id },
      });
    }
  }
);

// FAILURES.md: di-signon-fix-handle-validation-copy.
suite('registration validation copy preserves rejection and actual password boundaries', async () => {
  const post = browser();
  await post('resolve', { identifier: id });
  await post('student-choice', { choice: 'new' });
  const counts = () => Promise.all([
    prisma.user.count(), prisma.orgMembership.count(), prisma.session.count(),
    prisma.classStudentHandle.count(),
  ]);
  const before = await counts();
  const rejected = await post('register-student', {
    ...details, password: 'short', confirmPassword: 'different',
  });
  expect(rejected.response.status).toBe(400);
  expect(rejected.data.fieldErrors).toEqual({
    password: 'Use at least 6 characters.',
    confirmPassword: "These passwords don't match.",
  });
  expect(await counts()).toEqual(before);
  const tooLong = await post('register-student', {
    ...details, password: 'x'.repeat(101), confirmPassword: 'x'.repeat(101),
  });
  expect(tooLong.data.fieldErrors).toEqual({ password: 'Password is too long', confirmPassword: 'Password is too long' });
  expect(await counts()).toEqual(before);
  const valid = await post('register-student', {
    ...details, firstName: 'Boundary', lastName: 'Student', password: '123456', confirmPassword: '123456',
  });
  expect(valid.data.state.screen).toBe('joined');
  expect(await prisma.session.count()).toBe(before[2]);
});
