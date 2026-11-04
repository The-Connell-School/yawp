import { afterEach, describe, expect, mock, test } from 'bun:test';
import { data as dataResponse } from 'react-router';

const requireUserId = mock(async () => 'user-1');
const requireMembership = mock(async () => ({
  id: 'membership-1',
  role: 'TEACHER' as const,
  organization: { id: 'org-1', plan: 'FREE_CLASSROOM' as const },
}));
const isFreeTierEnabled = mock(async () => true);
const guardTeachingFormAction = mock<
  () => Promise<Awaited<ReturnType<typeof import('~/domain/free-tier/teaching-approval-required.server').guardTeachingFormAction>>>
>(async () => null);
const getAvailableAssignmentTypesForScopes = mock(async () => [
  {
    id: 'type-class-starter',
    title: 'Class Starter',
    kind: 'class_starter',
    image: null,
    rubric: { name: 'Class Starter rubric' },
  },
  {
    id: 'type-1',
    title: 'Prewriting',
    kind: 'prewriting',
    image: null,
    rubric: { name: 'Prewriting rubric' },
  },
]);
const loadSiteLicenseLockedAssignmentTiles = mock(async () => [
  { key: 'thesis-essay', label: 'Thesis-Driven Essay', imageId: null },
]);
const readFreeAccountUsage = mock(async () => ({
  classId: 'class-1',
  unlimitedFreeAssignmentTiles: true,
  assignments: [
    {
      kind: 'class_starter',
      label: 'Class Starter',
      remaining: 1,
      total: 1,
    },
    {
      kind: 'prewriting',
      label: 'Prewriting',
      remaining: 1,
      total: 1,
    },
  ],
  checklist: {
    classReady: true,
    assignmentCreated: false,
    writingSubmitted: false,
    graded: false,
  },
}));
const createAssignmentDeployedToClasses = mock(async () => ({
  id: 'assignment-new',
}));
const classAssignmentCount = mock(async () => 1);
const isAssignmentTypeAvailableForEveryScope = mock(async () => true);

mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFreeTierEnabled,
}));
mock.module('~/domain/free-tier/teaching-approval-required.server', () => ({
  guardTeachingFormAction,
}));
mock.module('~/utils/assignment-type-access.server', () => ({
  getAvailableAssignmentTypesForScopes,
  isAssignmentTypeAvailableForEveryScope,
}));
mock.module('~/domain/free-tier/site-license-locked-assignment-tiles.server', () => ({
  loadSiteLicenseLockedAssignmentTiles,
}));
mock.module('~/domain/free-tier/inapp-usage.server', () => ({
  readFreeAccountUsage,
}));
mock.module('~/utils/assignment-deployment.server', () => ({
  createAssignmentDeployedToClasses,
}));
mock.module('~/utils/db.server', () => ({
  prisma: {
    class: {
      findMany: mock(async () => [
        {
          id: 'class-1',
          schoolId: 'school-1',
          grade: '11',
          period: '1',
          title: null,
          school: { name: 'Lincoln High', organizationId: 'org-1' },
        },
      ]),
      findFirst: mock(async () => ({
        id: 'class-1',
        school: { id: 'school-1', organizationId: 'org-1' },
      })),
    },
    assignmentType: {
      findFirst: mock(async () => ({
        id: 'type-class-starter',
        kind: 'class_starter',
        rubric: { name: 'Class Starter rubric' },
      })),
    },
    classAssignment: {
      count: classAssignmentCount,
    },
  },
}));

const { loader, action, FIRST_ASSIGNMENT_DEFAULT_POINT_VALUE, FIRST_ASSIGNMENT_DEFAULT_PROMPT, FIRST_ASSIGNMENT_DEFAULT_TITLE } =
  await import('./route');

describe('app.assignments.new route gate', () => {
  afterEach(() => {
    requireUserId.mockClear();
    requireMembership.mockClear();
    isFreeTierEnabled.mockClear();
    guardTeachingFormAction.mockClear();
    getAvailableAssignmentTypesForScopes.mockClear();
    loadSiteLicenseLockedAssignmentTiles.mockClear();
    readFreeAccountUsage.mockClear();
    createAssignmentDeployedToClasses.mockClear();
    classAssignmentCount.mockClear();
    isAssignmentTypeAvailableForEveryScope.mockClear();
    isFreeTierEnabled.mockResolvedValue(true);
    guardTeachingFormAction.mockResolvedValue(null);
    isAssignmentTypeAvailableForEveryScope.mockResolvedValue(true);
    classAssignmentCount.mockResolvedValue(1);
  });

  test('loader returns 404 when free-tier is off', async () => {
    isFreeTierEnabled.mockResolvedValue(false);
    await expect(
      loader({
        request: new Request('http://localhost/app/assignments/new'),
        params: {},
        context: {} as never,
      } as never)
    ).rejects.toMatchObject({ status: 404 });
  });

  test('loader succeeds for an approved free-tier teacher', async () => {
    const result = await loader({
      request: new Request('http://localhost/app/assignments/new'),
      params: {},
      context: {} as never,
    } as never);
    expect(result.selectableTypes.length).toBeGreaterThan(0);
    expect(result.siteLicenseLockedAssignmentTiles).toHaveLength(1);
  });

  test('first-assignment query preselects Class Starter defaults', async () => {
    const result = await loader({
      request: new Request(
        'http://localhost/app/assignments/new?first=1&assignmentTypeId=type-class-starter&classId=class-1'
      ),
      params: {},
      context: {} as never,
    } as never);
    expect(result.isFirstAssignment).toBe(true);
    expect(result.defaults.assignmentTypeId).toBe('type-class-starter');
    expect(result.defaults.classId).toBe('class-1');
    expect(result.defaults.title).toBe(FIRST_ASSIGNMENT_DEFAULT_TITLE);
    expect(result.defaults.prompt).toBe(FIRST_ASSIGNMENT_DEFAULT_PROMPT);
    expect(result.defaults.pointValue).toBe(String(FIRST_ASSIGNMENT_DEFAULT_POINT_VALUE));
  });

  test('prompt query pre-fills the assignment prompt when not first assignment', async () => {
    const result = await loader({
      request: new Request(
        'http://localhost/app/assignments/new?assignmentTypeId=type-1&prompt=Argue%20for%20mercy'
      ),
      params: {},
      context: {} as never,
    } as never);
    expect(result.isFirstAssignment).toBe(false);
    expect(result.defaults.prompt).toBe('Argue for mercy');
    expect(result.defaults.title).toBe('');
  });

  test('action returns 404 when free-tier is off', async () => {
    isFreeTierEnabled.mockResolvedValue(false);
    const form = new FormData();
    form.set('intent', 'create-assignment');
    form.set('title', 'Draft');
    await expect(
      action({
        request: new Request('http://localhost/app/assignments/new', {
          method: 'POST',
          body: form,
        }),
        params: {},
        context: {} as never,
      } as never)
    ).rejects.toMatchObject({ status: 404 });
    expect(guardTeachingFormAction).not.toHaveBeenCalled();
  });

  test('action creates assignment for approved teacher', async () => {
    const form = new FormData();
    form.set('intent', 'create-assignment');
    form.set('assignmentTypeId', 'type-class-starter');
    form.set('classId', 'class-1');
    form.set('title', FIRST_ASSIGNMENT_DEFAULT_TITLE);
    form.set('prompt', FIRST_ASSIGNMENT_DEFAULT_PROMPT);
    form.set('pointValue', String(FIRST_ASSIGNMENT_DEFAULT_POINT_VALUE));
    form.set('submitForGrade', 'true');
    form.set('gradingAssistantStrictnessLevel', 'beginner');
    form.set('tutorEnabled', 'true');

    const result = await action({
      request: new Request('http://localhost/app/assignments/new', {
        method: 'POST',
        body: form,
      }),
      params: {},
      context: {} as never,
    } as never);

    expect(result).toMatchObject({
      status: 302,
      headers: expect.objectContaining({
        get: expect.any(Function),
      }),
    });
    expect(createAssignmentDeployedToClasses).toHaveBeenCalledWith(
      expect.objectContaining({
        classIds: ['class-1'],
        data: expect.objectContaining({
          assignmentTypeId: 'type-class-starter',
          prompt: FIRST_ASSIGNMENT_DEFAULT_PROMPT,
          pointValue: FIRST_ASSIGNMENT_DEFAULT_POINT_VALUE,
        }),
      })
    );
  });

  test('first teacher assignment redirects to dashboard celebration', async () => {
    classAssignmentCount.mockResolvedValue(0);
    const form = new FormData();
    form.set('intent', 'create-assignment');
    form.set('assignmentTypeId', 'type-class-starter');
    form.set('classId', 'class-1');
    form.set('title', FIRST_ASSIGNMENT_DEFAULT_TITLE);
    form.set('prompt', FIRST_ASSIGNMENT_DEFAULT_PROMPT);
    form.set('pointValue', String(FIRST_ASSIGNMENT_DEFAULT_POINT_VALUE));
    form.set('submitForGrade', 'true');
    form.set('gradingAssistantStrictnessLevel', 'beginner');
    form.set('tutorEnabled', 'true');

    const result = await action({
      request: new Request('http://localhost/app/assignments/new', {
        method: 'POST',
        body: form,
      }),
      params: {},
      context: {} as never,
    } as never);

    expect((result as Response).headers.get('Location')).toBe(
      '/app?firstAssignment=assignment-new&firstAssignmentClassId=class-1'
    );
  });

  test('action returns inline approval_required for a pending teacher', async () => {
    guardTeachingFormAction.mockResolvedValue(
      dataResponse(
        {
          error: 'approval_required',
          approvalRequired: true as const,
          fields: { title: 'Community Gardens' },
        },
        { status: 403 }
      )
    );
    const form = new FormData();
    form.set('intent', 'create-assignment');
    form.set('title', 'Community Gardens');
    const result = await action({
      request: new Request('http://localhost/app/assignments/new', {
        method: 'POST',
        body: form,
      }),
      params: {},
      context: {} as never,
    } as never);
    expect(result).toMatchObject({
      type: 'DataWithResponseInit',
      init: { status: 403 },
      data: {
        approvalRequired: true,
        fields: { title: 'Community Gardens' },
      },
    });
    expect(guardTeachingFormAction).toHaveBeenCalled();
    expect(createAssignmentDeployedToClasses).not.toHaveBeenCalled();
  });
});
