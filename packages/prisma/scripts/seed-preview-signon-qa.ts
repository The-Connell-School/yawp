/** Disposable PR seed only. No email delivery, flag writes, or shared seed imports. */
import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma';
import { isYawpPrPreviewDatabase } from '../../../services/web-app/app/utils/preview-email-capture.server';
import { LOCAL_DEV_PASSWORD } from './local-dev/dev-personas';

export const SIGNON_QA = 'preview-signon-qa';
export const qaId = (key: string) => `${SIGNON_QA}-${key}`;
export const qaEmail = (key: string) => `${key}@signon.preview.yawp.invalid`;
export const QA_CODES = {
  school: 'QA-EMAIL-101',
  free: 'qa-handle',
  multiple: 'QA-MULTI-101',
  full: 'QA-FULL-101',
  race: 'QA-RACE-101',
};
export const QA_TRIAL_STATUSES = [
  'LEAD',
  'INVITED',
  'ACCOUNT_CREATED',
  'SENT',
  'MANUAL_REVIEW',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
] as const;
const future = new Date('2099-01-01T00:00:00Z');
const past = new Date('2000-01-01T00:00:00Z');

/** Exact DB, role, host and PR identity; reject pg target/schema overrides too. */
export function assertPreviewSignonTarget(
  env: Record<string, string | undefined> = process.env
) {
  const fail = () => {
    throw new Error(
      'Sign-on fixtures require an isolated PR preview in seed mode'
    );
  };
  if (
    env.YAWP_ENVIRONMENT !== 'preview' ||
    env.PREVIEW_DATA_MODE !== 'seed' ||
    env.DATABASE_SCHEMA
  )
    fail();
  try {
    const url = new URL(env.DATABASE_URL ?? '');
    const name = url.pathname.slice(1);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.search ||
      url.hash ||
      !isYawpPrPreviewDatabase(name) ||
      url.pathname !== `/${name}` ||
      env.PREVIEW_SLUG !== `pr-${name.slice('yawp_pr_'.length)}` ||
      url.username !== `${name}_app` ||
      !['preview-postgres', '127.0.0.1', 'localhost'].includes(url.hostname)
    )
      fail();
    return { database: name, role: url.username };
  } catch {
    fail();
  }
}

export async function seedPreviewSignonQa(
  prisma: PrismaClient,
  env: Record<string, string | undefined> = process.env
) {
  const target = assertPreviewSignonTarget(env)!; // Must precede even opening a transaction.
  const { createPassword } = await import('./utils');
  return prisma.$transaction(
    async (tx) => {
      const [actual] = await tx.$queryRaw<
        { database: string; role: string }[]
      >`SELECT current_database() AS database, current_user AS role`;
      if (actual?.database !== target.database || actual?.role !== target.role)
        throw new Error(
          'Sign-on fixtures require an isolated PR preview matching the connected database and role'
        );
      // Create-only fixtures: never reset credentials or identities after someone uses them.
      // Fail atomically on a non-fixture account claiming one of our identifiers.
      async function user(
        key: string,
        options: {
          handle?: string;
          passwordless?: boolean;
          forced?: boolean;
        } = {}
      ) {
        const id = qaId(key);
        const email = options.handle ? null : qaEmail(key);
        const collision = await tx.user.findFirst({
          where: {
            OR: [
              ...(email ? [{ email }] : []),
              ...(options.handle ? [{ username: options.handle }] : []),
            ],
            id: { not: id },
          },
        });
        if (collision)
          throw new Error(`Sign-on fixture identity collision: ${key}`);
        return tx.user.upsert({
          where: { id },
          update: {},
          create: {
            id,
            email,
            username: options.handle,
            name: `Preview QA ${key}`,
            mustChangePassword: options.forced ?? false,
            ...(!options.passwordless
              ? { password: { create: createPassword(LOCAL_DEV_PASSWORD) } }
              : {}),
          },
        });
      }
      for (const [key, plan] of [
        ['school', 'SCHOOL'],
        ['second', 'SCHOOL'],
        ['free', 'FREE_CLASSROOM'],
        ['full', 'FREE_CLASSROOM'],
        ['race', 'FREE_CLASSROOM'],
        ['partner', 'SCHOOL'],
      ] as const) {
        await tx.organization.upsert({
          where: { id: qaId(key) },
          update: {},
          create: {
            id: qaId(key),
            name: `Preview QA ${key}`,
            plan,
            numOfStudentSeats: 100,
            numOfTeacherSeats: 20,
          },
        });
        await tx.school.upsert({
          where: { id: qaId(key) },
          update: {},
          create: {
            id: qaId(key),
            code: qaId(key),
            name: `Preview QA ${key}`,
            organizationId: qaId(key),
          },
        });
      }
      // Second location exercises the existing teacher location selector.
      await tx.school.upsert({
        where: { id: qaId('location-b') },
        update: {},
        create: {
          id: qaId('location-b'),
          code: qaId('location-b'),
          name: 'Preview QA second location',
          organizationId: qaId('school'),
        },
      });
      for (const [key, school, code] of [
        ['email', 'school', QA_CODES.school],
        ['free-class', 'free', QA_CODES.free],
        ['multiple-a', 'school', QA_CODES.multiple],
        ['multiple-b', 'second', QA_CODES.multiple],
        ['full-class', 'full', QA_CODES.full],
        ['race-class', 'race', QA_CODES.race],
      ])
        await tx.class.upsert({
          where: { id: qaId(key) },
          update: {},
          create: {
            id: qaId(key),
            schoolId: qaId(school),
            code,
            title: `Preview QA ${key}`,
            schoolYear: '2026-2027',
            ...(['free', 'full', 'race'].includes(school)
              ? { studentJoinToken: qaId(`join-${key}`) }
              : {}),
          },
        });
      async function member(
        key: string,
        userId: string,
        org: string,
        role: 'TEACHER' | 'STUDENT',
        active = true,
        klass?: string
      ) {
        return tx.orgMembership.upsert({
          where: { id: qaId(key) },
          update: {},
          create: {
            id: qaId(key),
            userId,
            organizationId: qaId(org),
            role,
            isActive: active,
            ...(klass
              ? role === 'TEACHER'
                ? { classesAsTeacher: { connect: { id: qaId(klass) } } }
                : { classesAsStudent: { connect: { id: qaId(klass) } } }
              : {}),
          },
        });
      }
      for (const [key, org, role, active, klass] of [
        ['password', 'school', 'STUDENT', true, 'email'],
        ['staff', 'school', 'TEACHER', true, 'email'],
        ['passwordless', 'school', 'STUDENT', true, 'email'],
        ['passwordless-teacher', 'school', 'TEACHER', true, undefined],
        ['forced', 'school', 'STUDENT', true, 'email'],
        ['handle', 'free', 'STUDENT', true, 'free-class'],
        ['inactive', 'school', 'STUDENT', false, 'email'],
        ['unassigned', 'school', 'STUDENT', true, undefined],
        ['multiple', 'school', 'STUDENT', true, 'email'],
        ['partner-student', 'partner', 'STUDENT', true, undefined],
      ] as const) {
        const account = await user(key, {
          handle: key === 'handle' ? QA_CODES.free : undefined,
          passwordless: key.startsWith('passwordless'),
          forced: key === 'forced',
        });
        await member(key, account.id, org, role, active, klass);
      }
      await user('orphan');
      await member('multiple-second', qaId('multiple'), 'second', 'TEACHER');
      await member(
        'multiple-inactive',
        qaId('multiple'),
        'free',
        'STUDENT',
        false
      );
      for (const status of QA_TRIAL_STATUSES) {
        const key = `trial-${status.toLowerCase()}`;
        const anonymous = status === 'LEAD' || status === 'INVITED';
        if (!anonymous) {
          const account = await user(key);
          await member(
            key,
            account.id,
            status === 'APPROVED' ? 'school' : 'second',
            'TEACHER'
          );
        }
        const collision = await tx.freeTierApplication.findUnique({
          where: { email: qaEmail(key) },
        });
        if (collision && collision.id !== qaId(key))
          throw new Error(`Sign-on fixture trial collision: ${key}`);
        await tx.freeTierApplication.upsert({
          where: { id: qaId(key) },
          update: {},
          create: {
            id: qaId(key),
            email: qaEmail(key),
            name: `Preview QA ${status}`,
            schoolName: 'Preview QA',
            location: 'Preview',
            gradeLevel: '11',
            status,
            ...(!anonymous
              ? {
                  userId: qaId(key),
                  organizationId: qaId(
                    status === 'APPROVED' ? 'school' : 'second'
                  ),
                }
              : {}),
            ...(status !== 'LEAD' ? { releasedAt: past } : {}),
          },
        });
      }
      await tx.freeTierAdminApproval.upsert({
        where: { id: qaId('admin-approval') },
        update: {},
        create: {
          id: qaId('admin-approval'),
          applicationId: qaId('trial-sent'),
          adminName: 'Preview QA administrator',
          adminEmail: qaEmail('approval-admin'),
          status: 'PENDING',
          emailCopyVersionHash: 'preview-qa-no-mail',
        },
      });
      async function invite(
        key: string,
        type: string,
        metadata: object,
        org: string,
        expired = false,
        studentClassId?: string
      ) {
        const target = qaEmail(key);
        const id = qaId(`invite-${key}`);
        const collision = await tx.invitation.findUnique({
          where: { target_type: { target, type } },
        });
        if (collision && collision.id !== id)
          throw new Error(`Sign-on fixture invitation collision: ${key}`);
        await tx.invitation.upsert({
          where: { id },
          update: {},
          create: {
            id,
            type,
            target,
            secret: randomBytes(32).toString('hex'),
            algorithm: 'SHA-256',
            digits: 6,
            period: 600,
            charSet: '0123456789',
            expiresAt: expired ? past : future,
            metadata: JSON.stringify(metadata),
            organizationId: qaId(org),
            studentClassId,
          },
        });
      }
      await invite(
        'invited-student',
        'onboard-student',
        { klassId: qaId('email') },
        'school',
        false,
        qaId('email')
      );
      await invite(
        'invited-multiple',
        'onboard-student',
        { klassIds: [qaId('email'), qaId('multiple-a')] },
        'school'
      );
      await invite(
        'invited-teacher',
        'onboard-teacher',
        { organizationId: qaId('school') },
        'school'
      );
      await invite(
        'passwordless-teacher',
        'onboard-teacher',
        { organizationId: qaId('school') },
        'school'
      );
      await invite(
        'expired-invite',
        'onboard-student',
        { klassId: qaId('email') },
        'school',
        true,
        qaId('email')
      );
      await invite(
        'expired-invite-mobile',
        'onboard-student',
        { klassId: qaId('email') },
        'school',
        true,
        qaId('email')
      );
      await invite(
        'partner-invite',
        'onboard-student',
        { partner: 'ua', organizationId: qaId('partner') },
        'partner'
      );
      for (const [key, count] of [
        ['full', 35],
        ['race', 34],
      ] as const)
        for (let i = 0; i < count; i++) {
          await invite(
            `${key}-seat-${i}`,
            'onboard-student',
            { klassId: qaId(`${key}-class`) },
            key,
            false,
            qaId(`${key}-class`)
          );
        }
      return { status: 'ok' as const, namespace: SIGNON_QA };
    },
    { timeout: 60000 }
  );
}

if (import.meta.main) {
  assertPreviewSignonTarget();
  const { createPrismaClient } = await import('./local-dev/connection');
  const prisma = createPrismaClient();
  try {
    await seedPreviewSignonQa(prisma);
    console.log('Preview sign-on QA fixtures ready.');
  } finally {
    await prisma.$disconnect();
  }
}
