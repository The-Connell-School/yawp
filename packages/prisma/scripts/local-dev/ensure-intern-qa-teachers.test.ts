import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { createPrismaClient } from './connection';
import { LOCAL_DEV_ORG_ID } from './dev-personas';
import {
  assertEnsureInternQaTeachersTarget,
  canUsePreferredEmailForInternQa,
  ensureInternQaTeachers,
  INTERN_QA_TEACHER_AVA,
  INTERN_QA_TEACHER_THOMAS,
  isDemoInternQaEnvironment,
  resolveInternQaTeacherEmail,
} from './ensure-intern-qa-teachers';

const BASE_DB = 'postgresql://postgres:postgres@127.0.0.1:5432/yawp_migration_ci';
const TEST_DB = 'yawp_intern_qa_teachers_ci';
let postgresIntegrationAvailable = false;

function databaseUrlForName(databaseName: string) {
  const url = new URL(BASE_DB.replace(/^postgres:/, 'postgresql:'));
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function adminDatabaseUrl() {
  const url = new URL(BASE_DB.replace(/^postgres:/, 'postgresql:'));
  url.pathname = '/postgres';
  return url.toString();
}

function adminPsql(sql: string) {
  const res = spawnSync(
    'psql',
    ['-v', 'ON_ERROR_STOP=1', adminDatabaseUrl(), '-c', sql],
    { encoding: 'utf8' }
  );
  if (res.status !== 0) {
    throw new Error(`admin psql failed: ${res.stderr}\n${res.stdout}`);
  }
}

function templateDatabaseName() {
  const name = new URL(BASE_DB.replace(/^postgres:/, 'postgresql:')).pathname
    .replace(/^\//, '')
    .split('/')[0];
  if (!name) throw new Error('Could not parse template database from DATABASE_URL');
  return name;
}

describe('ensureInternQaTeachers guards', () => {
  test('detects demo environment', () => {
    expect(isDemoInternQaEnvironment({ PREVIEW_SLUG: 'demo' })).toBe(true);
    expect(isDemoInternQaEnvironment({ DATABASE_NAME: 'yawp_demo' })).toBe(true);
    expect(
      isDemoInternQaEnvironment({
        DATABASE_URL: 'postgresql://u:p@host/yawp_demo',
      })
    ).toBe(true);
    expect(isDemoInternQaEnvironment({ PREVIEW_SLUG: 'pr-42' })).toBe(false);
  });

  test('refuses production and requires demo when flagged', () => {
    expect(() =>
      assertEnsureInternQaTeachersTarget(
        'postgresql://u:p@host/yawp_production',
        {}
      )
    ).toThrow(/production/);
    expect(() =>
      assertEnsureInternQaTeachersTarget(
        'postgresql://u:p@host/yawp_pr_1',
        { ENSURE_INTERN_QA_REQUIRE_DEMO: '1' }
      )
    ).toThrow(/requires demo/);
    expect(() =>
      assertEnsureInternQaTeachersTarget(
        'postgresql://u:p@host/yawp_demo',
        { ENSURE_INTERN_QA_REQUIRE_DEMO: '1', PREVIEW_SLUG: 'demo' }
      )
    ).not.toThrow();
  });

  test('resolves preferred vs fallback email', () => {
    expect(
      resolveInternQaTeacherEmail(
        INTERN_QA_TEACHER_THOMAS,
        {
          email: INTERN_QA_TEACHER_THOMAS.preferredEmail,
          simulatedForClassId: null,
          memberships: [],
        },
        null
      )
    ).toEqual({
      email: INTERN_QA_TEACHER_THOMAS.preferredEmail,
      emailSource: 'preferred',
    });
    expect(
      resolveInternQaTeacherEmail(
        INTERN_QA_TEACHER_AVA,
        {
          email: INTERN_QA_TEACHER_AVA.preferredEmail,
          simulatedForClassId: 'class-1',
          memberships: [],
        },
        null
      ).emailSource
    ).toBe('fallback');
    expect(
      canUsePreferredEmailForInternQa({
        simulatedForClassId: null,
        memberships: [
          {
            organizationId: LOCAL_DEV_ORG_ID,
            role: 'STUDENT',
            isActive: true,
          },
        ],
      })
    ).toBe(false);
  });
});

describe('ensureInternQaTeachers integration', () => {
  const testUrl = databaseUrlForName(TEST_DB);
  let prisma = createPrismaClient(testUrl);

  beforeAll(() => {
    const ping = spawnSync(
      'psql',
      ['-Atc', 'SELECT 1', adminDatabaseUrl()],
      { encoding: 'utf8' }
    );
    if (ping.status !== 0) return;
    const template = templateDatabaseName();
    const templateCheck = spawnSync(
      'psql',
      ['-Atc', `SELECT 1 FROM pg_database WHERE datname = '${template}'`],
      { encoding: 'utf8', env: process.env }
    );
    if (templateCheck.stdout.trim() !== '1') return;
    postgresIntegrationAvailable = true;
    adminPsql(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEST_DB}' AND pid <> pg_backend_pid();`
    );
    adminPsql(`DROP DATABASE IF EXISTS "${TEST_DB}";`);
    adminPsql(`CREATE DATABASE "${TEST_DB}" TEMPLATE "${template}";`);
    prisma = createPrismaClient(testUrl);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('creates teachers with empty classes and is idempotent', async () => {
    if (!postgresIntegrationAvailable) {
      expect(postgresIntegrationAvailable).toBe(false);
      return;
    }
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = testUrl;
    const first = await ensureInternQaTeachers(prisma);
    const second = await ensureInternQaTeachers(prisma);
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;

    expect(first.teachers).toHaveLength(2);
    expect(second.teachers).toHaveLength(2);
    for (const teacher of second.teachers) {
      expect(teacher.organizationId).toBe(LOCAL_DEV_ORG_ID);
      expect(teacher.studentCount).toBe(0);
      expect(teacher.name).toMatch(/Thomas Patton|Ava Crossman/);
    }

    const emails = second.teachers.map((teacher) => teacher.email).sort();
    expect(emails).toEqual(
      [
        INTERN_QA_TEACHER_AVA.fallbackEmail,
        INTERN_QA_TEACHER_THOMAS.fallbackEmail,
      ].sort()
    );

    const classCounts = await prisma.class.count({
      where: {
        code: {
          in: [INTERN_QA_TEACHER_THOMAS.classCode, INTERN_QA_TEACHER_AVA.classCode],
        },
        isArchived: false,
      },
    });
    expect(classCounts).toBe(2);
  });
});

test('ensureInternQaTeachers wires org, users, memberships, and classes', async () => {
  const executeRaw = mock(async () => 0);
  const classCreate = mock(async () => ({
    id: 'class-1',
    teachers: [{ id: 'membership-1' }],
    students: [],
  }));
  const classFindFirst = mock(async () => null);
  const classUpdate = mock(async () => ({}));
  const classCount = mock(async () => 0);
  const schoolFindFirst = mock(async () => ({ id: 'school-1' }));
  const orgUpsert = mock(async () => ({}));
  const userFindUnique = mock(async () => null);
  const userCreate = mock(async () => ({ id: 'user-1' }));
  const userUpdate = mock(async () => ({}));
  const membershipUpsert = mock(async () => ({ id: 'membership-1' }));
  const orgMembershipCount = mock(async () => 0);

  const prisma = {
    organization: { upsert: orgUpsert },
    user: {
      findUnique: userFindUnique,
      create: userCreate,
      update: userUpdate,
    },
    password: { create: mock(async () => ({})) },
    orgMembership: {
      upsert: membershipUpsert,
      count: orgMembershipCount,
    },
    school: { findFirst: schoolFindFirst, create: mock(async () => ({ id: 'school-1' })) },
    class: {
      findFirst: classFindFirst,
      create: classCreate,
      update: classUpdate,
      count: classCount,
    },
    $executeRaw: executeRaw,
  };

  const result = await ensureInternQaTeachers(prisma as never, {
    DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/yawp_migration_ci',
  });

  expect(result.teachers).toHaveLength(2);
  expect(orgUpsert).toHaveBeenCalled();
  expect(membershipUpsert.mock.calls.length).toBeGreaterThanOrEqual(2);
  expect(classCreate.mock.calls.length).toBeGreaterThanOrEqual(2);
});
