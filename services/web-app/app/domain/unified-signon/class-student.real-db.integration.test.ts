import { beforeAll, afterAll, expect, test } from 'bun:test';
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
function browser() {
  let cookie = '',
    flowToken = '';
  const ip = `198.19.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
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
      ).response.status
    ).toBe(302);
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
      ).response.status
    ).toBe(302);
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
      data: userIds.map((userId) => ({ id: userId })),
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
        .response.status
    ).toBe(302);
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
        ).response.status
      ).toBe(302);
    } finally {
      await prisma.invitation.deleteMany({ where: { studentClassId: id } });
      await prisma.organization.update({
        where: { id },
        data: { plan: 'SCHOOL' },
      });
    }
  }
);
