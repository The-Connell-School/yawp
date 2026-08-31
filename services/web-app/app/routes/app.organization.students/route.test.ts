import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireOwner = mock(async () => ({ id: 'owner-user-1' }));
const requireMembership = mock(async () => ({
  organization: { id: 'org-1' },
}));
const getPasswordHash = mock(async (password: string) => `hashed:${password}`);
const replaceStudentClassRoster = mock();

mock.module('~/utils/auth.server', () => ({
  requireOwner,
  requireMembership,
  getPasswordHash,
}));
mock.module('~/domain/collaboration/student-roster.server', () => ({
  replaceStudentClassRoster,
}));

const prisma = {
  class: {
    findFirst: mock(),
    findMany: mock(),
  },
  user: {
    findUnique: mock(),
  },
  orgMembership: {
    findFirst: mock(),
    update: mock(),
    create: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { action } = await import('./route');

const createBulkImportRequest = (students: string) => {
  const body = new URLSearchParams();
  body.set('intent', 'import-students-bulk');
  body.set('classId', 'class-1');
  body.set('students', students);

  return new Request('https://example.com/app/organization/students', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
};

describe('app.organization.students action', () => {
  beforeEach(() => {
    requireOwner.mockClear();
    requireMembership.mockClear();
    getPasswordHash.mockClear();
    prisma.class.findFirst.mockReset();
    prisma.class.findMany.mockReset();
    prisma.user.findUnique.mockReset();
    prisma.orgMembership.update.mockReset();
    prisma.orgMembership.findFirst.mockReset();
    prisma.orgMembership.create.mockReset();

    prisma.class.findFirst.mockResolvedValue({ id: 'class-1' });
    replaceStudentClassRoster
      .mockReset()
      .mockResolvedValue({ id: 'student-1' });
  });

  test('edits a roster through the collaboration-safe replacement boundary', async () => {
    prisma.orgMembership.findFirst.mockResolvedValue({
      id: 'student-1',
      classesAsStudent: [{ id: 'class-a' }, { id: 'class-b' }],
    });
    prisma.class.findMany.mockResolvedValue([
      { id: 'class-b' },
      { id: 'class-c' },
    ]);
    const body = new URLSearchParams();
    body.set('intent', 'edit-student');
    body.set('studentId', 'student-1');
    body.append('classIds', 'class-b');
    body.append('classIds', 'class-c');

    const response = (await action({
      request: new Request('https://example.com/app/organization/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      }),
    } as any)) as { data: { success: boolean } };

    expect(response.data.success).toBe(true);
    expect(replaceStudentClassRoster).toHaveBeenCalledWith({
      membershipId: 'student-1',
      nextClassIds: ['class-b', 'class-c'],
    });
    expect(prisma.orgMembership.update).not.toHaveBeenCalled();
  });

  test('bulk import enrolls an existing organization student from an email-only row', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      memberships: [
        {
          id: 'student-profile-1',
          role: 'STUDENT',
          classesAsStudent: [],
        },
      ],
    });
    prisma.orgMembership.update.mockResolvedValue({ id: 'student-profile-1' });

    const result = (await action({
      request: createBulkImportRequest('elijah.mayes@kalama.k12.wa.us'),
    } as any)) as {
      data: {
        intent: string;
        results: Array<{ success: boolean; email: string }>;
        invalidLines: number[];
        dedupedCount: number;
      };
    };

    expect(result.data.intent).toBe('import-students-bulk');
    expect(result.data.invalidLines).toEqual([]);
    expect(result.data.dedupedCount).toBe(1);
    expect(result.data.results).toEqual([
      { success: true, email: 'elijah.mayes@kalama.k12.wa.us' },
    ]);
    expect(prisma.orgMembership.update).toHaveBeenCalledWith({
      where: { id: 'student-profile-1' },
      data: { classesAsStudent: { connect: { id: 'class-1' } } },
    });
    expect(getPasswordHash).not.toHaveBeenCalled();
    expect(prisma.orgMembership.create).not.toHaveBeenCalled();
  });

  test('bulk import still creates a new student from a name, email, password row', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.orgMembership.create.mockResolvedValue({ id: 'membership-2' });

    const result = (await action({
      request: createBulkImportRequest(
        'Maya Carter, maya.carter@example.com, starter123'
      ),
    } as any)) as {
      data: {
        results: Array<{ success: boolean; email: string }>;
        invalidLines: number[];
        dedupedCount: number;
      };
    };

    expect(result.data.invalidLines).toEqual([]);
    expect(result.data.dedupedCount).toBe(1);
    expect(result.data.results).toEqual([
      { success: true, email: 'maya.carter@example.com' },
    ]);
    expect(getPasswordHash).toHaveBeenCalledWith('starter123');
    expect(prisma.orgMembership.create).toHaveBeenCalledWith({
      data: {
        role: 'STUDENT',
        user: {
          create: {
            email: 'maya.carter@example.com',
            name: 'Maya Carter',
            password: { create: { hash: 'hashed:starter123' } },
          },
        },
        organization: { connect: { id: 'org-1' } },
        classesAsStudent: { connect: { id: 'class-1' } },
      },
    });
  });
});
