import { afterAll, describe, expect, test } from 'bun:test';
import { basePrisma as prisma } from '~/utils/db.server';
import { generateStudentJoinToken } from '~/utils/student-join-token';
import { registerFreeTierStudent } from './student-join.server';

const createdOrgIds: string[] = [];

afterAll(async () => {
  try {
    await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
    await prisma.$disconnect();
  } catch {
    // ignore
  }
});

describe('DB: free-tier student join races', () => {
  test('concurrent handle sign-ups: one succeeds, one gets taken handle error', async () => {
    const org = await prisma.organization.create({
      data: { name: `Join race ${Date.now()}`, plan: 'FREE_CLASSROOM' },
    });
    createdOrgIds.push(org.id);
    const school = await prisma.school.create({
      data: {
        name: 'Race School',
        code: `RACE-${Date.now()}`,
        organizationId: org.id,
      },
    });
    const joinToken = generateStudentJoinToken();
    const klass = await prisma.class.create({
      data: {
        code: 'RACE01',
        schoolId: school.id,
        studentJoinToken: joinToken,
      },
    });

    const handle = `race${Date.now().toString(36).slice(-8)}`;
    const password = 'race-pass-12';

    const [a, b] = await Promise.all([
      registerFreeTierStudent({
        name: 'Race A',
        username: handle,
        password,
        classId: klass.id,
        joinToken,
      }),
      registerFreeTierStudent({
        name: 'Race B',
        username: handle,
        password,
        classId: klass.id,
        joinToken,
      }),
    ]);

    const outcomes = [a.status, b.status].sort();
    expect(outcomes).toEqual(['error', 'ok']);
    const failed = a.status === 'error' ? a : b;
    if (failed.status === 'error') {
      expect(failed.field).toBe('username');
    }
  });
});
