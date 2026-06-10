import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  class: { findFirst: mock(), findMany: mock() },
  documentClassForensic: { findMany: mock() },
  assignmentType: { findMany: mock() },
  featureAccessTarget: { findMany: mock() },
  teacherProfile: { findUnique: mock() },
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
const isDocumentSubmissionEnabledForScope = mock();
const isAssignmentsEnabledForContext = mock();
const isAssignmentCreationStandardizationEnabledForContext = mock();
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
  isDocumentSubmissionEnabledForScope,
  isAssignmentsEnabledForContext,
  isAssignmentCreationStandardizationEnabledForContext,
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
    isDocumentSubmissionEnabledForScope.mockReset();
    isAssignmentsEnabledForContext.mockReset();
    isAssignmentCreationStandardizationEnabledForContext.mockReset();
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
      school: {
        id: 'school-1',
        name: 'Tallassee High School',
        organizationId: 'org-1',
      },
      students: [],
    });
    prisma.class.findMany.mockResolvedValue([]);
    prisma.documentClassForensic.findMany.mockResolvedValue([
      { documentId: 'legacy-doc-1' },
      { documentId: 'legacy-doc-2' },
    ]);
    prisma.assignmentType.findMany.mockResolvedValue([]);
    prisma.featureAccessTarget.findMany.mockResolvedValue([]);
    prisma.teacherProfile.findUnique.mockResolvedValue({ schools: [] });
    prisma.profile.findMany.mockResolvedValue([]);
    prisma.pasteAlert.findMany.mockResolvedValue([]);
    prisma.submission.findMany.mockResolvedValue([]);
    prisma.document.findMany.mockResolvedValue([]);
    prisma.assignment.findMany.mockResolvedValue([]);
    prisma.assignment.findFirst.mockResolvedValue(null);
    prisma.assignment.create.mockResolvedValue({});
    prisma.assignment.update.mockResolvedValue({});
    getSubmittedPapersFilter.mockResolvedValue('all');
    isDocumentSubmissionEnabledForScope.mockResolvedValue(true);
    isAssignmentsEnabledForContext.mockResolvedValue(true);
    isAssignmentCreationStandardizationEnabledForContext.mockResolvedValue(true);
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
    expect(prisma.submission.findMany.mock.calls[0][0].where.document).toEqual({
      is: {
        ...expectedScope,
        deletedAt: null,
      },
    });
    expect(prisma.document.findMany.mock.calls[0][0].where).toEqual({
      ...expectedScope,
      deletedAt: null,
      archivedAt: null,
      submissions: { none: {} },
    });
  });

  test('keeps existing submissions visible when document submission grading is disabled', async () => {
    isDocumentSubmissionEnabledForScope.mockResolvedValue(false);
    prisma.submission.findMany.mockResolvedValue([
      { id: 'submission-1', title: 'Submitted essay' },
    ]);

    const response = await loader({
      request: new Request('https://example.test/app/my-classes/class-1'),
      params: { classId: 'class-1' },
      context: {} as never,
    });
    const data = (response as { data: any }).data;

    expect(data.isDocumentSubmissionEnabled).toBe(false);
    expect(data.submissions).toEqual([
      { id: 'submission-1', title: 'Submitted essay' },
    ]);
    expect(prisma.submission.findMany).toHaveBeenCalledTimes(1);
  });

  test('redirects the retired assignments tab to the teacher Assignments page', async () => {
    const response = await loader({
      request: new Request(
        'https://example.test/app/my-classes/class-1?tab=assignments'
      ),
      params: { classId: 'class-1' },
      context: {} as never,
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/app/assignments');
  });

  test('rejects generic class-page AP History assignment creation', async () => {
    prisma.assignmentType.findMany.mockResolvedValue([
      {
        id: 'ap-history-type',
        title: 'AP History Essay',
        systemKey: 'ap_history_essay',
        organizationAssignments: [{ organizationId: 'org-1' }],
      },
    ]);

    const form = new FormData();
    form.set('intent', 'create-assignment');
    form.set('assignmentTypeId', 'ap-history-type');
    form.set('prompt', 'Teacher-authored AP prompt');

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
      message: 'Choose an APUSH prompt from the library first.',
    });
    expect(response.init).toMatchObject({ status: 400 });
    expect(prisma.assignment.create).not.toHaveBeenCalled();
  });

  test('rejects generic edits to AP History assignment snapshots', async () => {
    prisma.assignmentType.findMany.mockResolvedValue([
      {
        id: 'ap-history-type',
        title: 'AP History Essay',
        systemKey: 'ap_history_essay',
        organizationAssignments: [{ organizationId: 'org-1' }],
      },
    ]);
    prisma.assignment.findFirst.mockResolvedValue({
      id: 'assignment-1',
      assignmentTypeId: 'ap-history-type',
      assignmentType: { systemKey: 'ap_history_essay' },
    });

    const form = new FormData();
    form.set('intent', 'update-assignment');
    form.set('assignmentId', 'assignment-1');
    form.set('assignmentTypeId', 'ap-history-type');
    form.set('prompt', 'Changed AP prompt');

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
      message: 'Choose an APUSH prompt from the library first.',
    });
    expect(response.init).toMatchObject({ status: 400 });
    expect(prisma.assignment.update).not.toHaveBeenCalled();
  });

  test('allows editing an assignment that keeps its archived assignment type', async () => {
    prisma.assignment.findFirst.mockResolvedValue({
      id: 'assignment-1',
      assignmentTypeId: 'archived-type-1',
      assignmentType: { systemKey: null },
      tutorContext: 'Legacy tutor guidance',
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
        tutorContext: 'Legacy tutor guidance',
        dueDate: null,
        submitForGrade: true,
        pointValue: 100,
      },
    });
  });

  test('creates a standardized class assignment with grading intent and no tutor context', async () => {
    prisma.assignmentType.findMany.mockResolvedValue([
      {
        id: 'at-1',
        systemKey: null,
        organizationAssignments: [{ organizationId: 'org-1' }],
      },
    ]);

    const form = new FormData();
    form.set('intent', 'create-assignment');
    form.set('assignmentTypeId', 'at-1');
    form.set('prompt', 'Prompt');
    form.set('tutorContext', 'Do not persist this teacher-authored prompt.');
    form.set('submitForGrade', 'true');
    form.set('pointValue', '25');

    const response = await action({
      request: new Request('https://example.test/app/my-classes/class-1', {
        method: 'POST',
        body: form,
      }),
      params: { classId: 'class-1' },
      context: {} as never,
    });

    expect(response.data).toMatchObject({ success: true });
    expect(prisma.assignment.create).toHaveBeenCalledWith({
      data: {
        classId: 'class-1',
        assignmentTypeId: 'at-1',
        title: null,
        prompt: 'Prompt',
        tutorContext: null,
        dueDate: null,
        submitForGrade: true,
        pointValue: 25,
      },
    });
  });

  test('keeps legacy class assignment tutor context when standardization is disabled', async () => {
    isAssignmentCreationStandardizationEnabledForContext.mockResolvedValue(false);
    prisma.assignmentType.findMany.mockResolvedValue([
      {
        id: 'at-1',
        systemKey: null,
        organizationAssignments: [{ organizationId: 'org-1' }],
      },
    ]);

    const form = new FormData();
    form.set('intent', 'create-assignment');
    form.set('assignmentTypeId', 'at-1');
    form.set('prompt', 'Prompt');
    form.set('tutorContext', 'Legacy tutor context.');

    const response = await action({
      request: new Request('https://example.test/app/my-classes/class-1', {
        method: 'POST',
        body: form,
      }),
      params: { classId: 'class-1' },
      context: {} as never,
    });

    expect(response.data).toMatchObject({ success: true });
    expect(prisma.assignment.create).toHaveBeenCalledWith({
      data: {
        classId: 'class-1',
        assignmentTypeId: 'at-1',
        title: null,
        prompt: 'Prompt',
        tutorContext: 'Legacy tutor context.',
        dueDate: null,
      },
    });
  });

  test('rejects invalid class assignment point values', async () => {
    prisma.assignmentType.findMany.mockResolvedValue([
      {
        id: 'at-1',
        systemKey: null,
        organizationAssignments: [{ organizationId: 'org-1' }],
      },
    ]);

    const form = new FormData();
    form.set('intent', 'create-assignment');
    form.set('assignmentTypeId', 'at-1');
    form.set('prompt', 'Prompt');
    form.set('submitForGrade', 'true');
    form.set('pointValue', '0');

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
      message: 'Point value must be a positive whole number no greater than 1000.',
    });
    expect(response.init).toMatchObject({ status: 400 });
    expect(prisma.assignment.create).not.toHaveBeenCalled();
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
