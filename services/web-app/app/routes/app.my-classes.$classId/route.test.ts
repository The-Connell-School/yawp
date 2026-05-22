import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  class: { findFirst: mock() },
  documentClassForensic: { findMany: mock() },
  assignmentType: { findMany: mock() },
  profile: { findMany: mock() },
  pasteAlert: { findMany: mock() },
  submission: { findMany: mock() },
  document: { findMany: mock() },
  assignment: {
    create: mock(),
    findFirst: mock(),
    findMany: mock(),
    update: mock(),
  },
};

const requireUserId = mock();
const requireProfile = mock();
const getSubmittedPapersFilter = mock();
const isDocumentSubmissionEnabledForSchool = mock();
const isAssignmentsEnabledForOrganization = mock();
const isReleasedGradesOrganizationEnabledForOrganization = mock();

mock.module('~/utils/db.server.js', () => ({ prisma }));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server.js', () => ({
  requireUserId,
  requireProfile,
}));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireProfile,
}));
mock.module('~/utils/cookies.server', () => ({
  getSubmittedPapersFilter,
}));
mock.module('~/utils/feature-flags.server', () => ({
  isDocumentSubmissionEnabledForSchool,
  isAssignmentsEnabledForOrganization,
  isReleasedGradesOrganizationEnabledForOrganization,
}));

const {
  action: routeAction,
  getDraftDisplayTitle,
  loader: routeLoader,
} = await import('./route');
const action = routeAction as any;
const loader = routeLoader as any;

describe('class detail loader document visibility', () => {
  beforeEach(() => {
    for (const model of Object.values(prisma)) {
      for (const fn of Object.values(model)) {
        fn.mockReset();
      }
    }
    requireUserId.mockReset();
    requireProfile.mockReset();
    getSubmittedPapersFilter.mockReset();
    isDocumentSubmissionEnabledForSchool.mockReset();
    isAssignmentsEnabledForOrganization.mockReset();
    isReleasedGradesOrganizationEnabledForOrganization.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireProfile.mockResolvedValue({
      id: 'profile-1',
      organization: { id: 'org-1' },
      teacherProfile: { id: 'teacher-1' },
    });
    prisma.class.findFirst.mockResolvedValue({
      id: 'class-1',
      grade: '9',
      period: '2',
      title: 'World History',
      school: { id: 'school-1', name: 'Tallassee High School', organizationId: 'org-1' },
      students: [],
    });
    prisma.documentClassForensic.findMany.mockResolvedValue([
      { documentId: 'legacy-doc-1' },
      { documentId: 'legacy-doc-2' },
    ]);
    prisma.assignmentType.findMany.mockResolvedValue([]);
    prisma.profile.findMany.mockResolvedValue([]);
    prisma.pasteAlert.findMany.mockResolvedValue([]);
    prisma.submission.findMany.mockResolvedValue([]);
    prisma.document.findMany.mockResolvedValue([]);
    prisma.assignment.findMany.mockResolvedValue([]);
    prisma.assignment.findFirst.mockResolvedValue(null);
    prisma.assignment.create.mockResolvedValue({});
    prisma.assignment.update.mockResolvedValue({});
    getSubmittedPapersFilter.mockResolvedValue('all');
    isDocumentSubmissionEnabledForSchool.mockResolvedValue(true);
    isAssignmentsEnabledForOrganization.mockResolvedValue(true);
    isReleasedGradesOrganizationEnabledForOrganization.mockResolvedValue(false);
  });

  test('includes legacy class documents preserved during assignment migration', async () => {
    await loader({
      request: new Request('https://example.test/app/my-classes/class-1'),
      params: { classId: 'class-1' },
      context: {} as never,
    });

    const expectedScope = {
      OR: [
        { assignment: { classId: 'class-1' } },
        {
          assignmentId: null,
          studentProfile: { classes: { some: { id: 'class-1' } } },
        },
        { id: { in: ['legacy-doc-1', 'legacy-doc-2'] } },
      ],
    };

    expect(prisma.documentClassForensic.findMany).toHaveBeenCalledWith({
      where: { oldClassId: 'class-1' },
      select: { documentId: true },
    });
    expect(prisma.assignmentType.findMany).toHaveBeenCalledWith({
      where: {
        archivedAt: null,
        organizationAssignments: {
          some: { organizationId: 'org-1' },
        },
      },
      select: { id: true, title: true },
      orderBy: { position: 'asc' },
    });
    expect(prisma.profile.findMany.mock.calls[0][0].select.documents.where).toEqual(
      expectedScope
    );
    expect(prisma.pasteAlert.findMany.mock.calls[0][0].where.document).toEqual(
      expectedScope
    );
    expect(prisma.submission.findMany.mock.calls[0][0].where.document).toEqual(
      {
        is: {
          ...expectedScope,
          deletedAt: null,
        },
      }
    );
    expect(prisma.document.findMany.mock.calls[0][0].where).toEqual({
      ...expectedScope,
      deletedAt: null,
      archivedAt: null,
      submissions: { none: {} },
    });
  });

  test('allows editing an assignment that keeps its archived assignment type', async () => {
    prisma.assignment.findFirst.mockResolvedValue({
      id: 'assignment-1',
      assignmentTypeId: 'archived-type-1',
    });

    const form = new FormData();
    form.set('intent', 'update-assignment');
    form.set('assignmentId', 'assignment-1');
    form.set('assignmentTypeId', 'archived-type-1');
    form.set('prompt', 'Updated prompt');

    const response = await action({
      request: new Request('https://example.test/app/my-classes/class-1', {
        method: 'POST',
        body: form,
      }),
      params: { classId: 'class-1' },
      context: {} as never,
    });

    expect(response.data).toMatchObject({ success: true });
    expect(prisma.assignment.update).toHaveBeenCalledWith({
      where: { id: 'assignment-1' },
      data: {
        assignmentTypeId: 'archived-type-1',
        title: null,
        prompt: 'Updated prompt',
        tutorContext: null,
        dueDate: null,
      },
    });
  });

  test('rejects creating an assignment from an archived assignment type', async () => {
    const form = new FormData();
    form.set('intent', 'create-assignment');
    form.set('assignmentTypeId', 'archived-type-1');
    form.set('prompt', 'Prompt');

    const response = await action({
      request: new Request('https://example.test/app/my-classes/class-1', {
        method: 'POST',
        body: form,
      }),
      params: { classId: 'class-1' },
      context: {} as never,
    });

    expect(response.data).toMatchObject({
      success: false,
      message: 'Selected assignment type is not available.',
    });
    expect(response.init).toMatchObject({ status: 400 });
    expect(prisma.assignment.create).not.toHaveBeenCalled();
  });

  test('shows a visible draft title when the document title is blank', () => {
    expect(
      getDraftDisplayTitle({
        title: '   ',
        assignment: { title: 'Welcome Exercise' },
      })
    ).toBe('Welcome Exercise');

    expect(
      getDraftDisplayTitle({
        title: '',
        assignment: null,
      })
    ).toBe('Untitled draft');
  });
});
