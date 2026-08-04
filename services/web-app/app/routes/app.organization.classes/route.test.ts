import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireOwner = mock(async () => ({ id: 'user-1' }));
const requireMembership = mock(async () => ({
  organization: { id: 'org-1' },
}));

mock.module('~/utils/auth.server', () => ({
  requireOwner,
  requireMembership,
}));

const prisma = {
  class: {
    create: mock(),
    findFirst: mock(),
    findMany: mock(),
    update: mock(),
  },
  orgMembership: {
    findMany: mock(),
    update: mock(),
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
    requireMembership.mockClear();
    prisma.class.create.mockReset();
    prisma.class.findFirst.mockReset();
    prisma.class.findMany.mockReset();
    prisma.class.update.mockReset();
    prisma.orgMembership.findMany.mockReset();
    prisma.orgMembership.update.mockReset();
    prisma.school.findFirst.mockReset();
    prisma.teacherProfile.findMany.mockReset();
    prisma.studentProfile.findMany.mockReset();
    prisma.$transaction.mockReset();

    prisma.class.findMany.mockImplementation(
      async ({ where }: { where: { id?: { in: string[] } } }) => {
        const ids = where?.id?.in ?? [];
        return ids.map((id: string) => ({ id, schoolId: `${id}-school` }));
      }
    );
    prisma.$transaction.mockImplementation(
      async (fn: (tx: typeof prisma) => Promise<void>) => {
        await fn(prisma as unknown as typeof prisma);
      }
    );
    prisma.class.create.mockResolvedValue({ id: 'c1' });
    prisma.class.findFirst.mockResolvedValue({ id: 'c1' });
    prisma.class.update.mockResolvedValue({ id: 'c1' });
    prisma.orgMembership.findMany.mockResolvedValue([]);
    prisma.orgMembership.update.mockResolvedValue({ id: 'teacher-1' });
    prisma.school.findFirst.mockResolvedValue({ id: 'school-1' });
  });

  test('create-class connects selected teachers to the class school', async () => {
    const body = new URLSearchParams();
    body.set('intent', 'create-class');
    body.set('schoolId', 'school-1');
    body.set('schoolYear', '2025-2026');
    body.set('grade', '10');
    body.set('period', '2');
    body.set('code', 'ABC123');
    body.append('teacherIds', 'teacher-1');
    body.append('teacherIds', 'teacher-2');

    const request = new Request(
      'https://example.com/app/organization/classes',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      }
    );

    const result = (await action({ request } as any)) as {
      data: { success: boolean };
    };
    expect(result.data.success).toBe(true);
    expect(prisma.orgMembership.update).toHaveBeenCalledWith({
      where: { id: 'teacher-1' },
      data: { schools: { connect: { id: 'school-1' } } },
    });
    expect(prisma.orgMembership.update).toHaveBeenCalledWith({
      where: { id: 'teacher-2' },
      data: { schools: { connect: { id: 'school-1' } } },
    });
  });

  test('edit-class connects selected teachers to the class school', async () => {
    const body = new URLSearchParams();
    body.set('intent', 'edit-class');
    body.set('classId', 'c1');
    body.set('schoolId', 'school-1');
    body.set('schoolYear', '2025-2026');
    body.set('grade', '10');
    body.set('period', '2');
    body.set('code', 'ABC123');
    body.append('teacherIds', 'teacher-1');

    const request = new Request(
      'https://example.com/app/organization/classes',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      }
    );

    const result = (await action({ request } as any)) as {
      data: { success: boolean };
    };
    expect(result.data.success).toBe(true);
    expect(prisma.orgMembership.update).toHaveBeenCalledWith({
      where: { id: 'teacher-1' },
      data: { schools: { connect: { id: 'school-1' } } },
    });
  });

  test('bulk-edit-classes rejects when no classes selected', async () => {
    const body = new URLSearchParams();
    body.set('intent', 'bulk-edit-classes');
    body.set('schoolYear', '2025-2026');

    const request = new Request(
      'https://example.com/app/organization/classes',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      }
    );

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

    const request = new Request(
      'https://example.com/app/organization/classes',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      }
    );

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

    const request = new Request(
      'https://example.com/app/organization/classes',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      }
    );

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

  test('bulk-edit-classes connects selected teachers to each class school', async () => {
    prisma.orgMembership.findMany.mockResolvedValue([
      { id: 'teacher-1' },
      { id: 'teacher-2' },
    ]);
    const body = new URLSearchParams();
    body.set('intent', 'bulk-edit-classes');
    body.append('classIds', 'c1');
    body.append('classIds', 'c2');
    body.set('applyTeachers', 'on');
    body.append('teacherIds', 'teacher-1');
    body.append('teacherIds', 'teacher-2');

    const request = new Request(
      'https://example.com/app/organization/classes',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      }
    );

    const result = (await action({ request } as any)) as {
      data: { success: boolean };
    };
    expect(result.data.success).toBe(true);
    expect(prisma.orgMembership.update).toHaveBeenCalledWith({
      where: { id: 'teacher-1' },
      data: { schools: { connect: { id: 'c1-school' } } },
    });
    expect(prisma.orgMembership.update).toHaveBeenCalledWith({
      where: { id: 'teacher-2' },
      data: { schools: { connect: { id: 'c1-school' } } },
    });
    expect(prisma.orgMembership.update).toHaveBeenCalledWith({
      where: { id: 'teacher-1' },
      data: { schools: { connect: { id: 'c2-school' } } },
    });
    expect(prisma.orgMembership.update).toHaveBeenCalledWith({
      where: { id: 'teacher-2' },
      data: { schools: { connect: { id: 'c2-school' } } },
    });
  });
});
