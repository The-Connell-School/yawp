import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  class: { findFirst: mock(), findMany: mock() },
  documentClassForensic: { findMany: mock() },
  assignmentType: { findMany: mock() },
  orgMembership: { findUnique: mock(), findMany: mock() },
  pasteAlert: { findMany: mock() },
  submission: { findMany: mock() },
  document: { findMany: mock() },
  assignment: {
    findFirst: mock(),
    findMany: mock(),
    update: mock(),
    deleteMany: mock(),
  },
  classAssignment: { findMany: mock() },
  classAssignmentInsight: { findMany: mock() },
  reporterGrowthPlan: { findMany: mock() },
};

const requireUserId = mock();
const requireMembership = mock();
const getSubmittedPapersFilter = mock();
const createAssignmentDeployedToClasses = mock();
const deleteClassAssignmentDeployment = mock();
const getAvailableAssignmentTypesForScopes = mock();
const isAssignmentTypeAvailableForEveryScope = mock();
const uploadAssignmentPromptAttachment = mock();
const deleteAssignmentPromptAttachment = mock();
class AssignmentPromptAttachmentError extends Error {}
const actualAssignmentPromptAttachment = await import(
  '~/domain/assignments/assignment-prompt-attachment.server'
);

mock.module('~/utils/db.server.js', () => ({ prisma }));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server.js', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/cookies.server', () => ({
  getSubmittedPapersFilter,
}));
mock.module('~/utils/assignment-type-access.server', () => ({
  getAvailableAssignmentTypesForScopes,
  isAssignmentTypeAvailableForEveryScope,
}));
mock.module('~/utils/assignment-deployment.server', () => ({
  createAssignmentDeployedToClasses,
  deleteClassAssignmentDeployment,
}));
mock.module(
  '~/domain/assignments/assignment-prompt-attachment.server',
  () => ({
    ...actualAssignmentPromptAttachment,
    AssignmentPromptAttachmentError,
    assignmentPromptAttachmentRequestTooLarge: () => false,
    deleteAssignmentPromptAttachment,
    uploadAssignmentPromptAttachment,
  })
);

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
    requireMembership.mockReset();
    getSubmittedPapersFilter.mockReset();
    createAssignmentDeployedToClasses.mockReset();
    deleteClassAssignmentDeployment.mockReset();
    getAvailableAssignmentTypesForScopes.mockReset();
    isAssignmentTypeAvailableForEveryScope.mockReset();
    uploadAssignmentPromptAttachment.mockReset();
    deleteAssignmentPromptAttachment.mockReset().mockResolvedValue(undefined);

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1', name: 'Org' },
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
        organization: { classInsightsEnabled: false, reporterEnabled: false },
      },
      students: [],
    });
    prisma.class.findMany.mockResolvedValue([]);
    prisma.reporterGrowthPlan.findMany.mockResolvedValue([]);
    prisma.documentClassForensic.findMany.mockResolvedValue([
      { documentId: 'legacy-doc-1' },
      { documentId: 'legacy-doc-2' },
    ]);
    prisma.assignmentType.findMany.mockResolvedValue([]);
    prisma.orgMembership.findUnique.mockResolvedValue({ schools: [] });
    prisma.orgMembership.findMany.mockResolvedValue([]);
    prisma.pasteAlert.findMany.mockResolvedValue([]);
    prisma.submission.findMany.mockResolvedValue([]);
    prisma.document.findMany.mockResolvedValue([]);
    prisma.classAssignment.findMany.mockResolvedValue([]);
    prisma.classAssignmentInsight.findMany.mockResolvedValue([]);
    prisma.assignment.findMany.mockResolvedValue([]);
    prisma.assignment.findFirst.mockResolvedValue(null);
    prisma.assignment.update.mockResolvedValue({});
    createAssignmentDeployedToClasses.mockResolvedValue({ id: 'assignment-1' });
    deleteClassAssignmentDeployment.mockResolvedValue('ca-1');
    getSubmittedPapersFilter.mockResolvedValue('all');
    getAvailableAssignmentTypesForScopes.mockResolvedValue([]);
    uploadAssignmentPromptAttachment.mockResolvedValue({
      promptAttachmentKey: 'assignment-prompts/file-id/assignment.pdf',
      promptAttachmentName: 'assignment.pdf',
      promptAttachmentSize: 4,
    });
  });

  test('includes legacy class documents preserved during assignment migration', async () => {
    await loader({
      request: new Request('https://example.test/app/my-classes/class-1'),
      params: { classId: 'class-1' },
      context: {} as never,
    });

    const expectedScope = {
      OR: [
        { classAssignment: { classId: 'class-1' } },
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
    expect(prisma.submission.findMany.mock.calls[0][0].where.unsubmittedAt).toBe(
      null
    );
    expect(prisma.document.findMany.mock.calls[0][0].where).toEqual({
      ...expectedScope,
      deletedAt: null,
      archivedAt: null,
      submissions: { none: {} },
    });
  });

  test('keeps existing submissions visible for teachers', async () => {
    prisma.submission.findMany.mockResolvedValue([
      { id: 'submission-1', title: 'Submitted essay' },
    ]);

    const response = await loader({
      request: new Request('https://example.test/app/my-classes/class-1'),
      params: { classId: 'class-1' },
      context: {} as never,
    });
    const data = (response as { data: any }).data;

    expect(data.submissions).toEqual([
      { id: 'submission-1', title: 'Submitted essay' },
    ]);
    expect(prisma.submission.findMany).toHaveBeenCalledTimes(1);
  });

  test('skips the growth plans query and gates the summary tab when the organization has not enabled it', async () => {
    const response = await loader({
      request: new Request('https://example.test/app/my-classes/class-1'),
      params: { classId: 'class-1' },
      context: {} as never,
    });
    const data = (response as { data: any }).data;

    expect(data.classInsightsEnabled).toBe(false);
    expect(data.reporterEnabled).toBe(false);
    expect(data.growthPlansByStudentId).toEqual({});
    expect(prisma.reporterGrowthPlan.findMany).not.toHaveBeenCalled();
  });

  test('groups growth plans by student when reporter is enabled for the organization', async () => {
    prisma.class.findFirst.mockResolvedValue({
      id: 'class-1',
      grade: '9',
      period: '2',
      title: 'World History',
      school: {
        id: 'school-1',
        name: 'Tallassee High School',
        organizationId: 'org-1',
        organization: { classInsightsEnabled: true, reporterEnabled: true },
      },
      students: [
        { id: 'student-1', user: { name: 'Ada Lovelace', email: 'ada@x.test' } },
      ],
    });
    prisma.reporterGrowthPlan.findMany.mockResolvedValue([
      {
        id: 'plan-1',
        focus: 'Thesis clarity',
        targetSkills: ['thesis_and_content'],
        body: 'Body',
        checkInAt: null,
        status: 'active',
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        studentMembershipId: 'student-1',
      },
    ]);

    const response = await loader({
      request: new Request('https://example.test/app/my-classes/class-1'),
      params: { classId: 'class-1' },
      context: {} as never,
    });
    const data = (response as { data: any }).data;

    expect(data.classInsightsEnabled).toBe(true);
    expect(prisma.reporterGrowthPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-1',
          studentMembershipId: { in: ['student-1'] },
        },
      })
    );
    expect(Object.keys(data.growthPlansByStudentId)).toEqual(['student-1']);
    expect(data.growthPlansByStudentId['student-1']).toHaveLength(1);
  });

  test('redirects the legacy summary tab to assignments and preserves other search params', async () => {
    const response = await loader({
      request: new Request(
        'https://example.test/app/my-classes/class-1?tab=summary&q=rhetoric'
      ),
      params: { classId: 'class-1' },
      context: {} as never,
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(
      '/app/my-classes/class-1?tab=assignments&q=rhetoric'
    );
  });

  test('loads generic assignment types for the current class scope', async () => {
    getAvailableAssignmentTypesForScopes.mockResolvedValue([
      { id: 'generic-type', title: 'Generic Essay', systemKey: null },
      {
        id: 'ap-history-type',
        title: 'AP History Essay',
        systemKey: 'ap_history_essay',
      },
    ]);

    const response = await loader({
      request: new Request(
        'https://example.test/app/my-classes/class-1?tab=assignments'
      ),
      params: { classId: 'class-1' },
      context: {} as never,
    });
    const data = (response as { data: any }).data;

    expect(getAvailableAssignmentTypesForScopes).toHaveBeenCalledWith({
      scopes: [
        {
          organizationId: 'org-1',
          schoolId: 'school-1',
          teacherProfileId: 'teacher-1',
        },
      ],
      select: { id: true, title: true, systemKey: true },
      orderBy: { position: 'asc' },
    });
    expect(data.assignmentTypes).toEqual([
      { id: 'generic-type', title: 'Generic Essay' },
    ]);
  });

  test('loads compact cross-class deployment details for assignments', async () => {
    prisma.classAssignment.findMany.mockResolvedValue([
      {
        id: 'class-assignment-1',
        assignment: {
          id: 'assignment-1',
          title: 'Shared DBQ',
          prompt: 'Prompt',
          submitForGrade: true,
          pointValue: 100,
          assignmentTypeId: 'at-1',
          assignmentType: {
            id: 'at-1',
            title: 'DBQ',
            systemKey: null,
          },
          _count: { classAssignments: 2 },
        },
        _count: { documents: 2 },
      },
    ]);

    const response = await loader({
      request: new Request(
        'https://example.test/app/my-classes/class-1?tab=assignments'
      ),
      params: { classId: 'class-1' },
      context: {} as never,
    });
    const data = (response as { data: any }).data;

    expect(data.assignments[0].otherClassCount).toBe(1);
    expect(prisma.classAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          assignment: {
            select: expect.objectContaining({
              _count: { select: { classAssignments: true } },
            }),
          },
        }),
      })
    );
  });

  test('bulk deletes only assignments deployed to the current class', async () => {
    prisma.assignment.findMany.mockResolvedValue([
      { id: 'assignment-1' },
      { id: 'assignment-2' },
    ]);
    prisma.assignment.deleteMany.mockResolvedValue({ count: 2 });
    const form = new FormData();
    form.append('intent', 'delete-assignments');
    form.append('assignmentIds', 'assignment-1');
    form.append('assignmentIds', 'assignment-2');

    const response = await action({
      request: new Request('https://example.test/app/my-classes/class-1', {
        method: 'POST',
        body: form,
      }),
      params: { classId: 'class-1' },
      context: {} as never,
    });

    expect(response.data).toMatchObject({
      success: true,
      message: 'Deleted 2 assignment(s).',
    });
    expect(prisma.assignment.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['assignment-1', 'assignment-2'] },
        classAssignments: { some: { classId: 'class-1' } },
      },
      select: { id: true },
    });
    expect(prisma.assignment.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['assignment-1', 'assignment-2'] } },
    });
  });

  test('rejects bulk deletion when any assignment is outside the current class', async () => {
    prisma.assignment.findMany.mockResolvedValue([{ id: 'assignment-1' }]);
    const form = new FormData();
    form.append('intent', 'delete-assignments');
    form.append('assignmentIds', 'assignment-1');
    form.append('assignmentIds', 'assignment-outside-class');

    const response = await action({
      request: new Request('https://example.test/app/my-classes/class-1', {
        method: 'POST',
        body: form,
      }),
      params: { classId: 'class-1' },
      context: {} as never,
    });

    expect(response.init).toMatchObject({ status: 400 });
    expect(response.data).toMatchObject({
      success: false,
      message: 'Some assignments were not found.',
    });
    expect(prisma.assignment.deleteMany).not.toHaveBeenCalled();
  });

  test('deletes one class deployment without directly changing student documents', async () => {
    prisma.assignment.findFirst.mockResolvedValue({ id: 'assignment-1' });
    const form = new FormData();
    form.append('intent', 'delete-assignment');
    form.append('assignmentId', 'assignment-1');

    const response = await action({
      request: new Request('https://example.test/app/my-classes/class-1', {
        method: 'POST',
        body: form,
      }),
      params: { classId: 'class-1' },
      context: {} as never,
    });

    expect(response.data).toMatchObject({
      success: true,
      message: 'Assignment deleted successfully.',
    });
    expect(deleteClassAssignmentDeployment).toHaveBeenCalledWith({
      assignmentId: 'assignment-1',
      classId: 'class-1',
    });
  });

  test('rejects generic class-page AP History assignment creation', async () => {
    getAvailableAssignmentTypesForScopes.mockResolvedValue([
      {
        id: 'ap-history-type',
        systemKey: 'ap_history_essay',
      },
    ]);
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
    expect(createAssignmentDeployedToClasses).not.toHaveBeenCalled();
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
        submitForGrade: true,
        pointValue: 100,
      },
    });
  });

  test('creates a standardized class assignment with grading intent', async () => {
    getAvailableAssignmentTypesForScopes.mockResolvedValue([
      { id: 'at-1', systemKey: null },
    ]);
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
    form.set('pointValue', '25');
    form.set('gradingAssistantStrictnessLevel', 'advanced');

    const response = await action({
      request: new Request('https://example.test/app/my-classes/class-1', {
        method: 'POST',
        body: form,
      }),
      params: { classId: 'class-1' },
      context: {} as never,
    });

    expect(response.data).toMatchObject({ success: true });
    expect(createAssignmentDeployedToClasses).toHaveBeenCalledWith({
      data: {
        assignmentTypeId: 'at-1',
        title: null,
        prompt: 'Prompt',
        submitForGrade: true,
        pointValue: 25,
        gradingAssistantStrictnessLevel: 'advanced',
      },
      classIds: ['class-1'],
    });
  });

  test('stores an attached assignment PDF without extracting it', async () => {
    getAvailableAssignmentTypesForScopes.mockResolvedValue([
      { id: 'at-1', systemKey: null },
    ]);
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
    form.set('prompt', 'Reference the attached assignment.');
    form.set('gradingAssistantStrictnessLevel', 'intermediate');
    form.set(
      'promptAttachment',
      new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'assignment.pdf', {
        type: 'application/pdf',
      })
    );

    const response = await action({
      request: new Request('https://example.test/app/my-classes/class-1', {
        method: 'POST',
        body: form,
      }),
      params: { classId: 'class-1' },
      context: {} as never,
    });

    expect(response.data).toMatchObject({ success: true });
    expect(uploadAssignmentPromptAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'assignment.pdf' })
    );
    expect(createAssignmentDeployedToClasses).toHaveBeenCalledWith({
      data: expect.objectContaining({
        prompt: 'Reference the attached assignment.',
        promptAttachmentKey: 'assignment-prompts/file-id/assignment.pdf',
        promptAttachmentName: 'assignment.pdf',
        promptAttachmentSize: 4,
      }),
      classIds: ['class-1'],
    });
  });

  test('rejects invalid class assignment grading strictness', async () => {
    getAvailableAssignmentTypesForScopes.mockResolvedValue([
      { id: 'at-1', systemKey: null },
    ]);
    const form = new FormData();
    form.set('intent', 'create-assignment');
    form.set('assignmentTypeId', 'at-1');
    form.set('prompt', 'Prompt');
    form.set('gradingAssistantStrictnessLevel', 'punitive');

    const response = await action({
      request: new Request('https://example.test/app/my-classes/class-1', {
        method: 'POST',
        body: form,
      }),
      params: { classId: 'class-1' },
      context: {} as never,
    });

    expect(response.init).toMatchObject({ status: 400 });
    expect(response.data).toMatchObject({
      success: false,
      message: 'Grading assistant strictness level is invalid.',
    });
    expect(createAssignmentDeployedToClasses).not.toHaveBeenCalled();
  });

  test('rejects invalid class assignment point values', async () => {
    getAvailableAssignmentTypesForScopes.mockResolvedValue([
      { id: 'at-1', systemKey: null },
    ]);
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
    expect(createAssignmentDeployedToClasses).not.toHaveBeenCalled();
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
    expect(createAssignmentDeployedToClasses).not.toHaveBeenCalled();
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
