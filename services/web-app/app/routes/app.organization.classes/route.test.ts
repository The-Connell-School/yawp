import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireOwner = mock(async () => ({ id: 'user-1' }));
const requireProfile = mock(async () => ({
  organization: { id: 'org-1' },
}));

mock.module('~/utils/auth.server', () => ({
  requireOwner,
  requireProfile,
}));

const prisma = {
  class: {
    findMany: mock(),
    update: mock(),
  },
  classStudentCourse: {
    deleteMany: mock(),
  },
  school: {
    findFirst: mock(),
  },
  teacherProfile: {
    findMany: mock(),
  },
  studentProfile: {
    findMany: mock(),
  },
  $transaction: mock(),
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { action } = await import('./route');

describe('app.organization.classes action', () => {
  beforeEach(() => {
    requireOwner.mockClear();
    requireProfile.mockClear();
    prisma.class.findMany.mockReset();
    prisma.class.update.mockReset();
    prisma.classStudentCourse.deleteMany.mockReset();
    prisma.school.findFirst.mockReset();
    prisma.teacherProfile.findMany.mockReset();
    prisma.studentProfile.findMany.mockReset();
    prisma.$transaction.mockReset();

    prisma.class.findMany.mockImplementation(
      async ({ where }: { where: { id?: { in: string[] } } }) => {
        const ids = where?.id?.in ?? [];
        return ids.map((id: string) => ({ id }));
      }
    );
    prisma.$transaction.mockImplementation(
      async (fn: (tx: typeof prisma) => Promise<void>) => {
        await fn(prisma as unknown as typeof prisma);
      }
    );
    prisma.classStudentCourse.deleteMany.mockResolvedValue({ count: 0 });
    prisma.class.update.mockResolvedValue({ id: 'c1' });
  });

  test('bulk-edit-classes rejects when no classes selected', async () => {
    const body = new URLSearchParams();
    body.set('intent', 'bulk-edit-classes');
    body.set('schoolYear', '2025-2026');

    const request = new Request('https://example.com/app/organization/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const result = (await action({ request } as any)) as {
      data: { error: string };
      init: { status: number };
    };
    expect(result.init.status).toBe(400);
    expect(result.data.error).toContain('No classes');
  });

  test('bulk-edit-classes rejects when nothing to change', async () => {
    const body = new URLSearchParams();
    body.set('intent', 'bulk-edit-classes');
    body.append('classIds', 'c1');

    const request = new Request('https://example.com/app/organization/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const result = (await action({ request } as any)) as {
      data: { error: string };
      init: { status: number };
    };
    expect(result.init.status).toBe(400);
    expect(result.data.error).toContain('at least one field');
  });

  test('bulk-edit-classes updates school year for each class', async () => {
    const body = new URLSearchParams();
    body.set('intent', 'bulk-edit-classes');
    body.append('classIds', 'c1');
    body.append('classIds', 'c2');
    body.set('schoolYear', '2025-2026');

    const request = new Request('https://example.com/app/organization/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const result = (await action({ request } as any)) as {
      data: { success: boolean };
    };
    expect(result.data.success).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(prisma.class.update).toHaveBeenCalledTimes(2);
    expect(prisma.class.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { schoolYear: '2025-2026' },
    });
    expect(prisma.class.update).toHaveBeenCalledWith({
      where: { id: 'c2' },
      data: { schoolYear: '2025-2026' },
    });
  });
});
