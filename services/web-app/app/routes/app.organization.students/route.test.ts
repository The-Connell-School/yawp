import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireOwner = mock(async () => ({ id: 'owner-user-1' }));
const requireProfile = mock(async () => ({
  organization: { id: 'org-1' },
}));
const getPasswordHash = mock(async (password: string) => `hashed:${password}`);

mock.module('~/utils/auth.server', () => ({
  requireOwner,
  requireProfile,
  getPasswordHash,
}));

const prisma = {
  class: {
    findFirst: mock(),
  },
  user: {
    findUnique: mock(),
  },
  studentProfile: {
    update: mock(),
    create: mock(),
  },
  profile: {
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
    requireProfile.mockClear();
    getPasswordHash.mockClear();
    prisma.class.findFirst.mockReset();
    prisma.user.findUnique.mockReset();
    prisma.studentProfile.update.mockReset();
    prisma.studentProfile.create.mockReset();
    prisma.profile.create.mockReset();

    prisma.class.findFirst.mockResolvedValue({ id: 'class-1' });
  });

  test('bulk import enrolls an existing organization student from an email-only row', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      profiles: [
        {
          id: 'profile-1',
          organizationId: 'org-1',
          studentProfile: { id: 'student-profile-1', classes: [] },
        },
      ],
    });
    prisma.studentProfile.update.mockResolvedValue({ id: 'student-profile-1' });

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
    expect(prisma.studentProfile.update).toHaveBeenCalledWith({
      where: { id: 'student-profile-1' },
      data: { classes: { connect: { id: 'class-1' } } },
    });
    expect(getPasswordHash).not.toHaveBeenCalled();
    expect(prisma.profile.create).not.toHaveBeenCalled();
  });

  test('bulk import still creates a new student from a name, email, password row', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.profile.create.mockResolvedValue({ id: 'profile-2' });

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
    expect(prisma.profile.create).toHaveBeenCalledWith({
      data: {
        user: {
          create: {
            email: 'maya.carter@example.com',
            name: 'Maya Carter',
            password: { create: { hash: 'hashed:starter123' } },
          },
        },
        organization: { connect: { id: 'org-1' } },
        studentProfile: { create: { classes: { connect: { id: 'class-1' } } } },
      },
    });
  });
});
