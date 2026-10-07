import { afterEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  $transaction: mock(),
  $queryRaw: mock(),
  freeTierApplication: {
    findFirst: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { provisionFreeClassroom, teacherEmailDomainMatchesSchoolOrg } =
  await import('./provision-free-classroom.server');

afterEach(() => {
  prisma.$transaction.mockReset();
  prisma.$queryRaw.mockReset();
  prisma.freeTierApplication.findFirst.mockReset();
});

describe('teacherEmailDomainMatchesSchoolOrg', () => {
  test('returns true when a school org teacher shares the domain', async () => {
    prisma.$queryRaw.mockResolvedValue([{ exists: true }]);
    await expect(teacherEmailDomainMatchesSchoolOrg('northridge.edu')).resolves.toBe(
      true
    );
  });
});

describe('provisionFreeClassroom', () => {
  test('is idempotent when organizationId is already set', async () => {
    prisma.$transaction.mockImplementation(async (fn: any) =>
      fn({
        $executeRaw: mock(),
        freeTierApplication: {
          findUnique: mock().mockResolvedValue({
            id: 'app-1',
            email: 't@example.com',
            schoolName: 'North',
            userId: 'user-1',
            organizationId: 'org-existing',
          }),
        },
      })
    );

    const result = await provisionFreeClassroom('app-1');
    expect(result).toEqual({
      status: 'already_provisioned',
      organizationId: 'org-existing',
    });
  });
});
