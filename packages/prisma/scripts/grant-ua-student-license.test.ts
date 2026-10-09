import { describe, expect, test, mock } from 'bun:test';

function fakePrisma({
  userId = 'user-1',
  membershipId = 'm-1',
  organizationId = 'org-ua',
  existingLicense,
}: {
  userId?: string | null;
  membershipId?: string | null;
  organizationId?: string;
  existingLicense?: { id: string; status: string; validUntil: Date } | null;
} = {}) {
  const calls: Record<string, unknown[]> = {
    upsert: [],
  };
  const prisma = {
    user: {
      findFirst: async (_: unknown) => (userId ? { id: userId, email: 'jncrew@gmail.com' } : null),
    },
    orgMembership: {
      findFirst: async (_: unknown) =>
        membershipId ? { id: membershipId, organizationId } : null,
    },
    studentLicense: {
      findUnique: async (_: unknown) => existingLicense ?? null,
      upsert: async (args: unknown) => {
        calls.upsert.push(args);
        return { id: 'license-1', status: 'ACTIVE', validUntil: new Date('2026-12-31T23:59:59.999Z') };
      },
    },
    internalImpersonationEvent: {
      create: async (_: unknown) => ({}),
    },
  };
  return { prisma: prisma as any, calls };
}

describe('planGrantUaStudentLicense', () => {
  test('errors when user is missing', async () => {
    mock.module('@app/prisma', () => ({ PrismaClient: class {} }));
    mock.module('../../../services/web-app/app/domain/student-license/student-license.server.ts', () => ({
      UA_STUDENT_LICENSE_COHORT: 'ua-2026',
      UA_STUDENT_LICENSE_VALID_UNTIL: new Date('2026-12-31T23:59:59.999Z'),
    }));
    const { planGrantUaStudentLicense } = await import('./grant-ua-student-license');
    const { prisma } = fakePrisma({ userId: null });
    const result = await planGrantUaStudentLicense(prisma, {
      email: 'jncrew@gmail.com',
      organizationId: 'org-ua',
    });
    expect(result.kind).toBe('error');
  });

  test('errors when membership is missing', async () => {
    mock.module('@app/prisma', () => ({ PrismaClient: class {} }));
    mock.module('../../../services/web-app/app/domain/student-license/student-license.server.ts', () => ({
      UA_STUDENT_LICENSE_COHORT: 'ua-2026',
      UA_STUDENT_LICENSE_VALID_UNTIL: new Date('2026-12-31T23:59:59.999Z'),
    }));
    const { planGrantUaStudentLicense } = await import('./grant-ua-student-license');
    const { prisma } = fakePrisma({ membershipId: null });
    const result = await planGrantUaStudentLicense(prisma, {
      email: 'jncrew@gmail.com',
      organizationId: 'org-ua',
    });
    expect(result.kind).toBe('error');
  });

  test('noops when an active valid license already exists', async () => {
    mock.module('@app/prisma', () => ({ PrismaClient: class {} }));
    mock.module('../../../services/web-app/app/domain/student-license/student-license.server.ts', () => ({
      UA_STUDENT_LICENSE_COHORT: 'ua-2026',
      UA_STUDENT_LICENSE_VALID_UNTIL: new Date('2026-12-31T23:59:59.999Z'),
    }));
    const { planGrantUaStudentLicense } = await import('./grant-ua-student-license');
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const { prisma } = fakePrisma({ existingLicense: { id: 'l-1', status: 'ACTIVE', validUntil: future } });
    const result = await planGrantUaStudentLicense(prisma, {
      email: 'jncrew@gmail.com',
      organizationId: 'org-ua',
    });
    expect(result.kind).toBe('noop');
  });

  test('plans a grant when license missing or not active', async () => {
    mock.module('@app/prisma', () => ({ PrismaClient: class {} }));
    mock.module('../../../services/web-app/app/domain/student-license/student-license.server.ts', () => ({
      UA_STUDENT_LICENSE_COHORT: 'ua-2026',
      UA_STUDENT_LICENSE_VALID_UNTIL: new Date('2026-12-31T23:59:59.999Z'),
    }));
    const { planGrantUaStudentLicense } = await import('./grant-ua-student-license');
    const { prisma } = fakePrisma({ existingLicense: null });
    const result = await planGrantUaStudentLicense(prisma, {
      email: 'jncrew@gmail.com',
      organizationId: 'org-ua',
    });
    expect(result.kind).toBe('plan');
    if (result.kind === 'plan') {
      expect(result.membershipId).toBe('m-1');
      expect(result.organizationId).toBe('org-ua');
      expect(result.cohort).toBe('ua-2026');
    }
  });
});

describe('grantUaStudentLicense', () => {
  test('upserts ACTIVE manual license', async () => {
    mock.module('@app/prisma', () => ({ PrismaClient: class {} }));
    mock.module('../../../services/web-app/app/domain/student-license/student-license.server.ts', () => ({
      UA_STUDENT_LICENSE_COHORT: 'ua-2026',
      UA_STUDENT_LICENSE_VALID_UNTIL: new Date('2026-12-31T23:59:59.999Z'),
    }));
    const { planGrantUaStudentLicense, grantUaStudentLicense } = await import('./grant-ua-student-license');
    const { prisma, calls } = fakePrisma();
    const result = await planGrantUaStudentLicense(prisma, {
      email: 'jncrew@gmail.com',
      organizationId: 'org-ua',
    });
    if (result.kind !== 'plan') throw new Error('expected plan');
    const applied = await grantUaStudentLicense(prisma, result);
    expect(applied.status).toBe('ACTIVE');
    expect(calls.upsert).toHaveLength(1);
    const upsert = calls.upsert[0] as any;
    expect(upsert.where.membershipId_cohort.membershipId).toBe('m-1');
    expect(upsert.create.source).toBe('MANUAL');
  });
});

