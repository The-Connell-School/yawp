import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  classAssignment: { findFirst: mock(), findMany: mock() },
  documentGroup: { findMany: mock() },
};

const requireUserId = mock();
const requireMembership = mock();
const arrangeGroups = mock();
const openGroups = mock();
const moveStudentToGroup = mock();
const addGroup = mock();
const removeEmptyGroup = mock();
const createLateStudentGroup = mock();
const redirectWithToast = mock();
class GroupProvisioningError extends Error {}
class GroupEditingError extends Error {}

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
const actualGroups =
  globalThis.__realModules['~/domain/collaboration/groups.server'];
mock.module('~/domain/collaboration/groups.server', () => ({
  ...actualGroups,
  arrangeGroups,
  openGroups,
  GroupProvisioningError,
}));
mock.module('~/domain/collaboration/group-editing.server', () => ({
  moveStudentToGroup,
  addGroup,
  removeEmptyGroup,
  createLateStudentGroup,
  GroupEditingError,
}));
mock.module('~/utils/toast.server', () => ({ redirectWithToast }));

const { action, loader } = await import('./route');

afterAll(() => {
  mock.restore();
  mock.module('~/domain/collaboration/groups.server', () => actualGroups);
});

const post = (fields: Record<string, string>) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return action({
    request: new Request(
      'https://example.com/app/class-assignments/ca-1/groups',
      { method: 'POST', body: form }
    ),
    params: { classAssignmentId: 'ca-1' },
  } as any);
};

const get = () =>
  loader({
    request: new Request(
      'https://example.com/app/class-assignments/ca-1/groups'
    ),
    params: { classAssignmentId: 'ca-1' },
  } as any);

const scoped = ({
  collaborationEnabled = true,
  typeSupported = true,
  mode = 'teacher',
  students = [
    { id: 'm1', user: { name: 'Ada', email: 'ada@example.com' } },
    { id: 'm2', user: { name: null, email: 'bo@example.com' } },
  ],
} = {}) => ({
  id: 'ca-1',
  assignment: {
    id: 'a-1',
    title: 'Carter essay',
    collaborationEnabled,
    collaborationGroupSize: 3,
    collaborationGroupMode: mode,
    assignmentType: { collaborationSupported: typeSupported },
  },
  class: {
    id: 'class-1',
    title: 'English 9',
    period: '3',
    students,
  },
});

async function readBody(response: any) {
  return typeof response.json === 'function' ? response.json() : response.data;
}

describe('class assignment groups', () => {
  beforeEach(() => {
    prisma.classAssignment.findFirst.mockReset();
    prisma.classAssignment.findMany.mockReset().mockResolvedValue([]);
    prisma.documentGroup.findMany.mockReset().mockResolvedValue([]);
    requireUserId.mockReset().mockResolvedValue('user-1');
    requireMembership.mockReset().mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
    });
    arrangeGroups.mockReset().mockResolvedValue({ groupCount: 2 });
    openGroups.mockReset().mockResolvedValue({ provisioned: 2 });
    moveStudentToGroup.mockReset().mockResolvedValue({ moved: true });
    addGroup
      .mockReset()
      .mockResolvedValue({ groupId: 'g-new', label: 'Group 3' });
    removeEmptyGroup.mockReset().mockResolvedValue({ removed: true });
    createLateStudentGroup
      .mockReset()
      .mockResolvedValue({ groupId: 'g-new', documentId: 'doc-new' });
    redirectWithToast
      .mockReset()
      .mockImplementation((to: string, options: any) => ({ to, options }));
  });

  describe('authorization', () => {
    test('the loader 404s for a non-teacher of the class', async () => {
      // The scoped query already filters on teachers.some, so a miss is a
      // permission failure and is reported as nonexistent.
      prisma.classAssignment.findFirst.mockResolvedValue(null);

      await expect(get()).rejects.toBeDefined();
    });

    test('the loader 404s when the assignment is not collaborative', async () => {
      prisma.classAssignment.findFirst.mockResolvedValue(
        scoped({ collaborationEnabled: false })
      );

      await expect(get()).rejects.toBeDefined();
    });

    test('the loader allows collaborative assignments with a legacy unsupported type flag', async () => {
      prisma.classAssignment.findFirst.mockResolvedValue(
        scoped({ typeSupported: false })
      );

      const response = await get();

      expect((await readBody(response)).assignmentId).toBe('a-1');
    });

    test('the action allows collaborative assignments with a legacy unsupported type flag', async () => {
      prisma.classAssignment.findFirst.mockResolvedValue(
        scoped({ typeSupported: false })
      );

      const result: any = await post({ intent: 'open' });

      expect(openGroups).toHaveBeenCalledWith({
        classAssignmentId: 'ca-1',
      });
      expect(result.options.type).toBe('success');
    });
  });

  describe('loader', () => {
    test('lists groups with member names and derives the unassigned bucket', async () => {
      prisma.classAssignment.findFirst.mockResolvedValue(scoped());
      prisma.documentGroup.findMany.mockResolvedValue([
        {
          id: 'g-1',
          label: 'Group 1',
          ordinal: 0,
          openedAt: null,
          documentId: null,
          members: [{ membershipId: 'm1', removedAt: null }],
        },
      ]);

      const body = await readBody(await get());

      expect(body.groups[0].members).toEqual([
        { membershipId: 'm1', name: 'Ada' },
      ]);
      // m2 is on the roster but in no group.
      expect(body.unassigned).toEqual([
        { membershipId: 'm2', name: 'bo@example.com' },
      ]);
      expect(body.finalized).toBe(false);
      expect(body.complete).toBe(false);
    });

    test('falls back to email when a student has no name', async () => {
      prisma.classAssignment.findFirst.mockResolvedValue(scoped());

      const body = await readBody(await get());

      expect(body.unassigned.map((s: any) => s.name)).toEqual([
        'Ada',
        'bo@example.com',
      ]);
    });

    test('a removed member frees the student back into the bucket', async () => {
      prisma.classAssignment.findFirst.mockResolvedValue(scoped());
      prisma.documentGroup.findMany.mockResolvedValue([
        {
          id: 'g-1',
          label: 'Group 1',
          ordinal: 0,
          openedAt: null,
          documentId: null,
          members: [
            { membershipId: 'm1', removedAt: new Date('2026-08-01') },
            { membershipId: 'm2', removedAt: null },
          ],
        },
      ]);

      const body = await readBody(await get());

      expect(body.groups[0].members).toEqual([
        { membershipId: 'm2', name: 'bo@example.com' },
      ]);
      expect(body.unassigned).toEqual([{ membershipId: 'm1', name: 'Ada' }]);
    });

    test('reports opened once every nonempty group has a draft', async () => {
      prisma.classAssignment.findFirst.mockResolvedValue(scoped());
      prisma.documentGroup.findMany.mockResolvedValue([
        {
          id: 'g-1',
          label: 'Group 1',
          ordinal: 0,
          openedAt: new Date('2026-08-17T10:00:00Z'),
          documentId: 'doc-1',
          members: [
            { membershipId: 'm1', removedAt: null },
            { membershipId: 'm2', removedAt: null },
          ],
        },
      ]);

      const body = await readBody(await get());

      expect(body.finalized).toBe(true);
      expect(body.complete).toBe(true);
      expect(body.groups[0].documentId).toBe('doc-1');
    });

    test('keeps setup editable if finalization is incomplete', async () => {
      prisma.classAssignment.findFirst.mockResolvedValue(scoped());
      prisma.documentGroup.findMany.mockResolvedValue([
        {
          id: 'g-1',
          label: 'Group 1',
          ordinal: 0,
          openedAt: new Date('2026-08-17T10:00:00Z'),
          documentId: 'doc-1',
          members: [{ membershipId: 'm1', removedAt: null }],
        },
        {
          id: 'g-2',
          label: 'Group 2',
          ordinal: 1,
          openedAt: null,
          documentId: null,
          members: [{ membershipId: 'm2', removedAt: null }],
        },
      ]);

      const body = await readBody(await get());

      expect(body.finalized).toBe(true);
      expect(body.complete).toBe(false);
    });
  });

  describe('arrange', () => {
    beforeEach(() => {
      prisma.classAssignment.findFirst.mockResolvedValue(scoped());
    });

    test('arranges with the chosen size and shuffles', async () => {
      await post({ intent: 'arrange', groupSize: '3', shuffle: 'true' });

      expect(arrangeGroups).toHaveBeenCalledWith({
        classAssignmentId: 'ca-1',
        groupSize: 3,
        shuffle: true,
      });
    });

    test('rejects a size outside the supported range', async () => {
      const result: any = await post({ intent: 'arrange', groupSize: '99' });

      expect(arrangeGroups).not.toHaveBeenCalled();
      expect(result.options.type).toBe('error');
      expect(result.options.description).toMatch(/between 2 and 8/);
    });

    test('rejects a non-numeric size', async () => {
      const result: any = await post({ intent: 'arrange', groupSize: 'three' });

      expect(arrangeGroups).not.toHaveBeenCalled();
      expect(result.options.type).toBe('error');
    });

    test('whole-class mode ignores size entirely', async () => {
      prisma.classAssignment.findFirst.mockResolvedValue(
        scoped({ mode: 'whole-class' })
      );

      await post({ intent: 'arrange' });

      expect(arrangeGroups).toHaveBeenCalledWith(
        expect.objectContaining({ groupSize: null })
      );
    });

    test('surfaces a provisioning refusal as an error toast', async () => {
      // Refusing to rearrange after opening is the important one: the domain
      // throws, and the teacher must see why rather than a crash.
      arrangeGroups.mockRejectedValue(
        new GroupProvisioningError('Groups have already been opened.')
      );

      const result: any = await post({ intent: 'arrange', groupSize: '3' });

      expect(result.options.type).toBe('error');
      expect(result.options.description).toMatch(/already been opened/);
    });

    test('lets an unexpected error propagate', async () => {
      arrangeGroups.mockRejectedValue(new Error('database on fire'));

      await expect(post({ intent: 'arrange', groupSize: '3' })).rejects.toThrow(
        'database on fire'
      );
    });
  });

  describe('open', () => {
    beforeEach(() => {
      prisma.classAssignment.findFirst.mockResolvedValue(scoped());
    });

    test('opens groups and reports how many drafts were created', async () => {
      const result: any = await post({ intent: 'open' });

      expect(openGroups).toHaveBeenCalledWith({ classAssignmentId: 'ca-1' });
      expect(result.options.type).toBe('success');
      expect(result.options.description).toMatch(/Finalized 2 groups/);
    });

    test('a repeat open reports already-open rather than an error', async () => {
      // openGroups is idempotent, so pressing the button twice is harmless and
      // should read that way.
      openGroups.mockResolvedValue({ provisioned: 0 });

      const result: any = await post({ intent: 'open' });

      expect(result.options.type).toBe('success');
      expect(result.options.description).toMatch(/already finalized/i);
    });

    test('advances to the next unfinished class deployment', async () => {
      prisma.classAssignment.findMany.mockResolvedValue([
        {
          id: 'ca-2',
          class: { students: [{ id: 'm1' }] },
          documentGroups: [],
        },
      ]);

      const result: any = await post({ intent: 'open' });

      expect(result.to).toBe('/app/class-assignments/ca-2/groups');
    });

    test('surfaces a refusal to open ungrouped students', async () => {
      openGroups.mockRejectedValue(
        new GroupProvisioningError('Arrange groups before opening them.')
      );

      const result: any = await post({ intent: 'open' });

      expect(result.options.type).toBe('error');
      expect(result.options.description).toMatch(/Arrange groups/);
    });
  });

  describe('drag-and-drop editing', () => {
    beforeEach(() => {
      prisma.classAssignment.findFirst.mockResolvedValue(scoped());
    });

    const body = async (response: any) =>
      typeof response.json === 'function' ? response.json() : response.data;

    test('a move answers with data rather than a redirect', async () => {
      // These arrive as fetcher submissions. A fetcher that receives a redirect
      // navigates the whole app, which would throw the teacher off the page
      // mid-arrangement.
      const result: any = await post({
        intent: 'move-student',
        membershipId: 'student-1',
        targetGroupId: 'group-2',
      });

      expect(redirectWithToast).not.toHaveBeenCalled();
      expect(await body(result)).toEqual({ success: true });
    });

    test('a move is passed through with the class assignment from the URL', async () => {
      await post({
        intent: 'move-student',
        membershipId: 'student-1',
        targetGroupId: 'group-2',
      });

      expect(moveStudentToGroup).toHaveBeenCalledWith({
        classAssignmentId: 'ca-1',
        membershipId: 'student-1',
        targetGroupId: 'group-2',
      });
    });

    test('an empty target group means the unassigned bucket', async () => {
      // The bucket is not a group and has no id, so the form posts an empty
      // string; sending it through as "" would look like a group named "".
      await post({
        intent: 'move-student',
        membershipId: 'student-1',
        targetGroupId: '',
      });

      expect(moveStudentToGroup).toHaveBeenCalledWith(
        expect.objectContaining({ targetGroupId: null })
      );
    });

    test('a move with no student is rejected', async () => {
      const result: any = await post({ intent: 'move-student' });

      expect(moveStudentToGroup).not.toHaveBeenCalled();
      expect((await body(result)).success).toBe(false);
    });

    test('a refused move is reported inline, not thrown', async () => {
      moveStudentToGroup.mockRejectedValue(
        new GroupEditingError('A group can hold at most 8 students.')
      );

      const result: any = await post({
        intent: 'move-student',
        membershipId: 'student-1',
        targetGroupId: 'group-2',
      });

      const data = await body(result);
      expect(data.success).toBe(false);
      expect(data.message).toMatch(/at most 8/);
    });

    test('an unexpected failure is not swallowed as a refusal', async () => {
      // A database outage must not read to the teacher as "that group is full".
      moveStudentToGroup.mockRejectedValue(new Error('connection reset'));

      await expect(
        post({
          intent: 'move-student',
          membershipId: 'student-1',
          targetGroupId: 'group-2',
        })
      ).rejects.toThrow(/connection reset/);
    });

    test('adds a group', async () => {
      const result: any = await post({ intent: 'add-group' });

      expect(addGroup).toHaveBeenCalledWith({ classAssignmentId: 'ca-1' });
      expect(await body(result)).toEqual({ success: true });
    });

    test('creates a new finalized group for a late-enrolled student', async () => {
      const result: any = await post({
        intent: 'create-late-group',
        membershipId: 'student-3',
      });

      expect(createLateStudentGroup).toHaveBeenCalledWith({
        classAssignmentId: 'ca-1',
        membershipId: 'student-3',
      });
      expect(await body(result)).toEqual({ success: true });
    });

    test('removes an empty group', async () => {
      const result: any = await post({
        intent: 'remove-group',
        groupId: 'group-3',
      });

      expect(removeEmptyGroup).toHaveBeenCalledWith({
        classAssignmentId: 'ca-1',
        groupId: 'group-3',
      });
      expect(await body(result)).toEqual({ success: true });
    });

    test('reports a refusal to remove a populated group', async () => {
      removeEmptyGroup.mockRejectedValue(
        new GroupEditingError('That group still has students in it.')
      );

      const result: any = await post({
        intent: 'remove-group',
        groupId: 'group-1',
      });

      expect((await body(result)).message).toMatch(/still has students/);
    });

    test('editing is allowed for a legacy unsupported assignment type flag', async () => {
      prisma.classAssignment.findFirst.mockResolvedValue(
        scoped({ typeSupported: false })
      );

      await post({
        intent: 'move-student',
        membershipId: 'student-1',
        targetGroupId: 'group-2',
      });

      expect(moveStudentToGroup).toHaveBeenCalledWith({
        classAssignmentId: 'ca-1',
        membershipId: 'student-1',
        targetGroupId: 'group-2',
      });
    });
  });

  test('an unknown intent is rejected', async () => {
    prisma.classAssignment.findFirst.mockResolvedValue(scoped());

    const result: any = await post({ intent: 'demolish' });

    expect(arrangeGroups).not.toHaveBeenCalled();
    expect(openGroups).not.toHaveBeenCalled();
    expect(result.options.type).toBe('error');
  });
});
