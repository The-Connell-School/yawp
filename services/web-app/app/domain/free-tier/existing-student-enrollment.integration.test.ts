import { afterAll, describe, expect, test } from 'bun:test';
import { basePrisma as db } from '~/utils/db.server';
import {
  resolveStudentClassCode,
  enrollExistingStudentByCode,
} from './existing-student-enrollment.server';
const suite = process.env.FREE_TIER_DB_TESTS === '1' ? describe : describe.skip;
const tag = `existing-enrollment-${Date.now()}`;
const orgs: string[] = [],
  users: string[] = [];
afterAll(async () => {
  if (!orgs.length) return;
  await db.freeTierApplication.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await db.orgMembership.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await db.class.deleteMany({
    where: { school: { organizationId: { in: orgs } } },
  });
  await db.school.deleteMany({ where: { organizationId: { in: orgs } } });
  await db.organization.deleteMany({ where: { id: { in: orgs } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
});
async function fixture(
  plan: 'FREE_CLASSROOM' | 'SCHOOL' = 'FREE_CLASSROOM',
  code = `${tag}-${orgs.length}`
) {
  const org = await db.organization.create({ data: { name: tag, plan } });
  orgs.push(org.id);
  const teacher = await db.user.create({
    data: { name: 'Local teacher', email: `${crypto.randomUUID()}@yawp.local` },
  });
  users.push(teacher.id);
  const school = await db.school.create({
    data: { name: tag, code: `${tag}-${org.id}`, organizationId: org.id },
  });
  const klass = await db.class.create({
    data: {
      code,
      schoolId: school.id,
      teachers: {
        create: {
          userId: teacher.id,
          organizationId: org.id,
          role: 'TEACHER',
          isOrgOwner: true,
        },
      },
    },
  });
  const application = await db.freeTierApplication.create({
    data: {
      name: tag,
      email: `${org.id}@yawp.local`,
      schoolName: tag,
      location: 'Local',
      gradeLevel: '10',
      userId: teacher.id,
      organizationId: org.id,
      status: 'APPROVED',
    },
  });
  return { org, klass, school, application };
}
async function student(orgId: string) {
  const user = await db.user.create({
    data: { name: 'Local student', email: `${crypto.randomUUID()}@yawp.local` },
  });
  users.push(user.id);
  const member = await db.orgMembership.create({
    data: { userId: user.id, organizationId: orgId, role: 'STUDENT' },
  });
  return {
    userId: user.id,
    sourceMembershipId: member.id,
    sourceOrganizationId: orgId,
  };
}
suite('existing student enrollment with PostgreSQL', () => {
  test('creates only a target student membership; repeat joins and prior access persist', async () => {
    const source = await fixture('SCHOOL'),
      target = await fixture();
    const actor = await student(source.org.id);
    await db.orgMembership.update({
      where: { id: actor.sourceMembershipId },
      data: { classesAsStudent: { connect: { id: source.klass.id } } },
    });
    const before = await db.orgMembership.findUniqueOrThrow({
      where: { id: actor.sourceMembershipId },
      include: { classesAsStudent: true },
    });
    const result = await enrollExistingStudentByCode({
      ...actor,
      code: ` ${target.klass.code.toUpperCase()} `,
    });
    expect(result.ok).toBe(true);
    const member = await db.orgMembership.findUniqueOrThrow({
      where: {
        userId_organizationId: {
          userId: actor.userId,
          organizationId: target.org.id,
        },
      },
      include: { classesAsStudent: true },
    });
    expect(member).toMatchObject({
      role: 'STUDENT',
      isOrgOwner: false,
      isActive: true,
    });
    expect(member.classesAsStudent.map((c) => c.id)).toEqual([target.klass.id]);
    expect(
      await enrollExistingStudentByCode({ ...actor, code: target.klass.code })
    ).toEqual(result);
    expect(
      await db.orgMembership.count({ where: { userId: actor.userId } })
    ).toBe(2);
    expect(
      await db.orgMembership.findUniqueOrThrow({
        where: { id: actor.sourceMembershipId },
        include: { classesAsStudent: true },
      })
    ).toEqual(before);
  });
  test('paid cross-organization targets and free collisions reveal no class choices', async () => {
    const source = await fixture('SCHOOL'),
      paid = await fixture('SCHOOL'),
      one = await fixture(),
      two = await fixture('FREE_CLASSROOM', one.klass.code);
    const actor = await student(source.org.id);
    for (const target of [paid, one, two]) {
      expect(
        await resolveStudentClassCode(db, source.org.id, target.klass.code)
      ).toEqual([]);
      expect(
        (
          await enrollExistingStudentByCode({
            ...actor,
            code: target.klass.code,
            classId: target.klass.id,
          })
        ).ok
      ).toBe(false);
    }
    expect(
      await db.orgMembership.count({ where: { userId: actor.userId } })
    ).toBe(1);
  });
  test('own-organization collision wins and legitimate same-org disambiguation persists', async () => {
    const own = await fixture('SCHOOL'),
      foreign = await fixture('FREE_CLASSROOM', own.klass.code);
    const actor = await student(own.org.id);
    const secondSchool = await db.school.create({
      data: { name: tag, code: `${tag}-second`, organizationId: own.org.id },
    });
    const second = await db.class.create({
      data: { schoolId: secondSchool.id, code: own.klass.code },
    });
    expect(
      (await resolveStudentClassCode(db, own.org.id, own.klass.code))
        .map((c) => c.id)
        .sort()
    ).toEqual([own.klass.id, second.id].sort());
    expect(
      (await enrollExistingStudentByCode({ ...actor, code: own.klass.code })).ok
    ).toBe(false);
    expect(
      (
        await enrollExistingStudentByCode({
          ...actor,
          code: own.klass.code,
          classId: foreign.klass.id,
        })
      ).ok
    ).toBe(false);
    expect(
      (
        await enrollExistingStudentByCode({
          ...actor,
          code: own.klass.code,
          classId: second.id,
        })
      ).ok
    ).toBe(true);
  });
  test('rejects forged source membership, missing/wrong code, stale selection and terminal/inactive targets without writes', async () => {
    const source = await fixture('SCHOOL'),
      target = await fixture();
    const actor = await student(source.org.id),
      other = await student(source.org.id);
    for (const override of [
      { sourceMembershipId: other.sourceMembershipId },
      { sourceOrganizationId: target.org.id },
      { code: '' },
      { code: 'wrong' },
      { classId: source.klass.id },
    ]) {
      expect(
        (
          await enrollExistingStudentByCode({
            ...actor,
            code: target.klass.code,
            ...override,
          })
        ).ok
      ).toBe(false);
    }
    await db.class.update({
      where: { id: target.klass.id },
      data: { isArchived: true },
    });
    expect(
      (
        await enrollExistingStudentByCode({
          ...actor,
          code: target.klass.code,
          classId: target.klass.id,
        })
      ).ok
    ).toBe(false);
    await db.class.update({
      where: { id: target.klass.id },
      data: { isArchived: false },
    });
    for (const status of ['EXPIRED', 'REJECTED', 'SENT'] as const) {
      await db.freeTierApplication.update({
        where: { id: target.application.id },
        data: { status },
      });
      expect(
        (
          await enrollExistingStudentByCode({
            ...actor,
            code: target.klass.code,
          })
        ).ok
      ).toBe(false);
    }
    await db.freeTierApplication.update({
      where: { id: target.application.id },
      data: { status: 'APPROVED' },
    });
    await db.orgMembership.updateMany({
      where: { organizationId: target.org.id },
      data: { isActive: false },
    });
    expect(
      (await enrollExistingStudentByCode({ ...actor, code: target.klass.code }))
        .ok
    ).toBe(false);
    expect(
      await db.orgMembership.count({ where: { userId: actor.userId } })
    ).toBe(1);
  });
  test('does not reactivate or change target teacher, owner or disabled memberships', async () => {
    for (const override of [
      { role: 'TEACHER' as const },
      { isOrgOwner: true },
      { isActive: false },
    ]) {
      const source = await fixture('SCHOOL'),
        target = await fixture();
      const actor = await student(source.org.id);
      const prior = await db.orgMembership.create({
        data: {
          userId: actor.userId,
          organizationId: target.org.id,
          role: 'STUDENT',
          ...override,
        },
      });
      expect(
        (
          await enrollExistingStudentByCode({
            ...actor,
            code: target.klass.code,
          })
        ).ok
      ).toBe(false);
      expect(
        await db.orgMembership.findUnique({ where: { id: prior.id } })
      ).toEqual(prior);
    }
  });
  test('concurrent final-seat admissions serialize; repeat at capacity succeeds; denial has no membership', async () => {
    const source = await fixture('SCHOOL'),
      target = await fixture();
    const actors = await Promise.all(
      Array.from({ length: 36 }, () => student(source.org.id))
    );
    for (const actor of actors.slice(0, 34))
      await db.orgMembership.create({
        data: {
          userId: actor.userId,
          organizationId: target.org.id,
          role: 'STUDENT',
          classesAsStudent: { connect: { id: target.klass.id } },
        },
      });
    const results = await Promise.all(
      actors
        .slice(34)
        .map((actor) =>
          enrollExistingStudentByCode({ ...actor, code: target.klass.code })
        )
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(
      await db.orgMembership.count({
        where: {
          classesAsStudent: { some: { id: target.klass.id } },
          role: 'STUDENT',
        },
      })
    ).toBe(35);
    const loser = actors[results[0]!.ok ? 35 : 34]!;
    expect(
      await db.orgMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: loser.userId,
            organizationId: target.org.id,
          },
        },
      })
    ).toBeNull();
    expect(
      (
        await enrollExistingStudentByCode({
          ...actors[0]!,
          code: target.klass.code,
        })
      ).ok
    ).toBe(true);
  });
  test('source teacher, owner and inactive membership cannot authorize enrollment', async () => {
    const source = await fixture('SCHOOL'),
      target = await fixture();
    for (const override of [
      { role: 'TEACHER' as const },
      { isOrgOwner: true },
      { isActive: false },
    ]) {
      const actor = await student(source.org.id);
      await db.orgMembership.update({
        where: { id: actor.sourceMembershipId },
        data: override,
      });
      expect(
        (
          await enrollExistingStudentByCode({
            ...actor,
            code: target.klass.code,
          })
        ).ok
      ).toBe(false);
      expect(
        await db.orgMembership.count({ where: { userId: actor.userId } })
      ).toBe(1);
    }
  });
  test('production flag off keeps foreign enrollment closed and paid same-org enrollment open', async () => {
    const source = await fixture('SCHOOL'),
      target = await fixture();
    const actor = await student(source.org.id);
    const previousEnv = process.env.YAWP_ENVIRONMENT,
      previousSlug = process.env.PREVIEW_SLUG;
    process.env.YAWP_ENVIRONMENT = 'production';
    delete process.env.PREVIEW_SLUG;
    const name = 'feature_flag.free_tier';
    const priorFlag = await db.setting.findUnique({ where: { name } });
    await db.setting.upsert({
      where: { name },
      create: { name, value: JSON.stringify({ mode: 'off' }) },
      update: { value: JSON.stringify({ mode: 'off' }) },
    });
    try {
      expect(
        await resolveStudentClassCode(db, source.org.id, target.klass.code)
      ).toEqual([]);
      expect(
        (
          await enrollExistingStudentByCode({
            ...actor,
            code: target.klass.code,
          })
        ).ok
      ).toBe(false);
      expect(
        (
          await enrollExistingStudentByCode({
            ...actor,
            code: source.klass.code,
          })
        ).ok
      ).toBe(true);
    } finally {
      if (previousEnv === undefined) delete process.env.YAWP_ENVIRONMENT;
      else process.env.YAWP_ENVIRONMENT = previousEnv;
      if (previousSlug === undefined) delete process.env.PREVIEW_SLUG;
      else process.env.PREVIEW_SLUG = previousSlug;
      if (priorFlag)
        await db.setting.update({
          where: { name },
          data: { value: priorFlag.value },
        });
      else await db.setting.delete({ where: { name } });
    }
  });
  test('environment budget denial creates no membership; existing enrollment stays idempotent', async () => {
    const source = await fixture('SCHOOL'),
      target = await fixture();
    const actor = await student(source.org.id);
    const previous = process.env.FREE_TIER_PREVIEW_BUDGET_USD;
    process.env.FREE_TIER_PREVIEW_BUDGET_USD = '0';
    try {
      expect(
        (
          await enrollExistingStudentByCode({
            ...actor,
            code: target.klass.code,
          })
        ).ok
      ).toBe(false);
      expect(
        await db.orgMembership.count({ where: { userId: actor.userId } })
      ).toBe(1);
      await db.orgMembership.create({
        data: {
          userId: actor.userId,
          organizationId: target.org.id,
          role: 'STUDENT',
          classesAsStudent: { connect: { id: target.klass.id } },
        },
      });
      expect(
        (
          await enrollExistingStudentByCode({
            ...actor,
            code: target.klass.code,
          })
        ).ok
      ).toBe(true);
    } finally {
      if (previous === undefined)
        delete process.env.FREE_TIER_PREVIEW_BUDGET_USD;
      else process.env.FREE_TIER_PREVIEW_BUDGET_USD = previous;
    }
  });
});
