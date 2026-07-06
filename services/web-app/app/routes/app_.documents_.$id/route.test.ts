import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ApHistorySnapshot } from '~/domain/ap-history/schema';

const apHistorySnapshot: ApHistorySnapshot = {
  schemaVersion: 1,
  libraryEntryId: 'apush-dbq-period-3',
  course: 'apush',
  essayType: 'dbq',
  prompt:
    'Evaluate the extent to which revolutionary ideals changed American society.',
  period: 'Period 3: 1754-1800',
  periodNumber: 3,
  reasoningSkill: 'causation',
  sources: [
    {
      externalKey: 'source-1',
      position: 1,
      title: 'Source 1',
      attribution: 'Continental Congress',
      body: 'Resolved, that these United Colonies are, and of right ought to be, free and independent States.',
      mediaType: 'text',
    },
  ],
  rubric: {
    rubricId: 'ap-history-dbq-2026',
    totalPoints: 7,
  },
  timing: {
    mode: 'untimed',
    durationMinutes: 60,
  },
};

const prisma = {
  user: {
    findUnique: mock(),
  },
  document: {
    findFirst: mock(),
  },
  documentRevision: {
    create: mock(),
  },
};

const requireUserId = mock();
const requireMembership = mock();
const requireMutableRequest = mock();
const redirectWithToast = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
  requireMutableRequest,
}));
mock.module('~/utils/toast.server', () => ({
  redirectWithToast,
}));

mock.module('./comments', () => ({ Comments: () => null }));
mock.module('./comments/selection-context', () => ({
  CommentsSelectionProvider: ({ children }: { children: unknown }) => children,
}));
mock.module('./document-editor/document-editor', () => ({
  DocumentEditor: () => null,
}));
mock.module('./tutor/tutor', () => ({ Tutor: () => null }));
mock.module('./document-history/document-history', () => ({
  DocumentHistory: () => null,
}));
mock.module('./hooks/use-auth-heartbeat', () => ({
  useAuthHeartbeat: () => ({
    isLocked: false,
    isInitialCheckComplete: true,
    checkAuthSession: mock(),
  }),
}));
mock.module('./hooks/use-comments-state', () => ({
  useCommentsState: () => ({ comments: [] }),
}));
mock.module('./hooks/use-tutor-state', () => ({
  useTutorState: () => ({ cms: null }),
}));
mock.module('./hooks/use-document-submit', () => ({
  useDocumentSubmit: () => ({ isSubmitting: false }),
}));

const {
  getGenericAssignmentPromptForEditor,
  getRenderableApHistorySnapshot,
  loader,
  shouldRenderDbqWorkspace,
  shouldShowGenericAssignmentPrompt,
} = await import('./route');
const { ApHistoryAssignmentPanel } =
  await import('./ap-history-assignment-panel');
const { DbqLayout } = await import('./_components/dbq-layout');

const assignmentModules = [
  { id: 'module-prewriting', position: 1 },
  { id: 'module-drafting', position: 2 },
  { id: 'module-revising', position: 3 },
];

function makeModuleSession({
  id,
  moduleId,
  position,
  instructionsCompleted,
  instructionCount = 1,
  isSelfGuided = false,
}: {
  id: string;
  moduleId: string;
  position: number;
  instructionsCompleted: number;
  instructionCount?: number;
  isSelfGuided?: boolean;
}) {
  return {
    id,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    assignmentModuleId: moduleId,
    instructionsCompleted,
    assignmentModule: {
      id: moduleId,
      position,
      title: `Module ${position}`,
      isSelfGuided,
      instructions: Array.from({ length: instructionCount }, (_, index) => ({
        id: `instruction-${moduleId}-${index + 1}`,
        title: `Instruction ${position}.${index + 1}`,
        prompt: `Prompt ${position}.${index + 1}`,
        position: index + 1,
        showChatButton: true,
        showNextButton: true,
        buttons: [],
      })),
      assignmentType: {
        assignmentModules,
      },
    },
    messages: [],
  };
}

function makeDocument({
  includeSnapshot,
  assignmentModuleSessions,
}: {
  includeSnapshot: boolean;
  assignmentModuleSessions?: ReturnType<typeof makeModuleSession>[];
}) {
  return {
    id: 'doc-1',
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    revision: 1,
    title: 'APUSH DBQ',
    html: '<p>Draft</p>',
    text: 'Draft',
    assignmentType: { id: 'type-1', title: 'AP History Essay' },
    assignment: {
      id: 'assignment-1',
      title: 'Revolutionary Ideals DBQ',
      prompt: apHistorySnapshot.prompt,
      ...(includeSnapshot ? { apHistorySnapshot } : {}),
    },
    classAssignment: {
      class: {
        id: 'class-1',
        schoolId: 'school-1',
        teachers: [{ id: 'teacher-1' }],
        school: { organizationId: 'org-1' },
      },
    },
    studentProfile: {
      classes: [
        {
          id: 'class-1',
          schoolId: 'school-1',
          teachers: [{ id: 'teacher-1' }],
        },
      ],
    },
    submissions: [],
    revisions: [],
    profile: {
      id: 'profile-1',
      userId: 'user-1',
      user: { name: 'Student One' },
    },
    membership: {
      id: 'profile-1',
      userId: 'user-1',
      user: { name: 'Student One' },
    },
    assignmentModuleSessions: assignmentModuleSessions ?? [
      makeModuleSession({
        id: 'cms-1',
        moduleId: 'module-1',
        position: 1,
        instructionsCompleted: 0,
      }),
    ],
    comments: [],
  };
}

describe('app_.documents_.$id loader', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    prisma.document.findFirst.mockReset();
    prisma.documentRevision.create.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();
    requireMutableRequest.mockReset();
    redirectWithToast.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMutableRequest.mockResolvedValue(undefined);
    requireMembership.mockResolvedValue({
      id: 'profile-1',
      teacherProfile: null,
    });
    prisma.user.findUnique.mockResolvedValue({ isAdmin: false });
    prisma.document.findFirst.mockImplementation((args) =>
      Promise.resolve(
        makeDocument({
          includeSnapshot:
            args?.select?.assignment?.select?.apHistorySnapshot === true,
        })
      )
    );
    prisma.documentRevision.create.mockResolvedValue({});
    redirectWithToast.mockImplementation((url, toast) => ({
      redirectedTo: url,
      toast,
    }));
  });

  test('selects and returns immutable AP History assignment snapshots', async () => {
    const response = (await loader({
      request: new Request('https://example.test/app/documents/doc-1'),
      params: { id: 'doc-1' },
    } as never)) as any;

    expect(prisma.document.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          assignment: expect.objectContaining({
            select: expect.objectContaining({
              apHistorySnapshot: true,
            }),
          }),
        }),
      })
    );
    expect(response.data.doc.assignment.apHistorySnapshot).toEqual(
      apHistorySnapshot
    );
  });

  test('resumes the first incomplete tutor module when reopening without cmsIdx', async () => {
    prisma.document.findFirst.mockResolvedValueOnce(
      makeDocument({
        includeSnapshot: true,
        assignmentModuleSessions: [
          makeModuleSession({
            id: 'cms-prewriting',
            moduleId: 'module-prewriting',
            position: 1,
            instructionsCompleted: 1,
          }),
          makeModuleSession({
            id: 'cms-drafting',
            moduleId: 'module-drafting',
            position: 2,
            instructionsCompleted: 0,
          }),
          makeModuleSession({
            id: 'cms-revising',
            moduleId: 'module-revising',
            position: 3,
            instructionsCompleted: 0,
          }),
        ],
      })
    );

    const response = (await loader({
      request: new Request('https://example.test/app/documents/doc-1'),
      params: { id: 'doc-1' },
    } as never)) as any;

    expect(response.data.currentCms.id).toBe('cms-drafting');
    expect(response.data.currentCmsIdx).toBe(1);
    expect(response.data.hasPreviousCms).toBe(true);
  });

  test('keeps an untouched empty first module selected when reopening without cmsIdx', async () => {
    prisma.document.findFirst.mockResolvedValueOnce(
      makeDocument({
        includeSnapshot: true,
        assignmentModuleSessions: [
          makeModuleSession({
            id: 'cms-prewriting',
            moduleId: 'module-prewriting',
            position: 1,
            instructionsCompleted: 0,
            instructionCount: 0,
            isSelfGuided: true,
          }),
          makeModuleSession({
            id: 'cms-drafting',
            moduleId: 'module-drafting',
            position: 2,
            instructionsCompleted: 0,
          }),
        ],
      })
    );

    const response = (await loader({
      request: new Request('https://example.test/app/documents/doc-1'),
      params: { id: 'doc-1' },
    } as never)) as any;

    expect(response.data.currentCms.id).toBe('cms-prewriting');
    expect(response.data.currentCmsIdx).toBe(0);
    expect(response.data.hasPreviousCms).toBe(false);
  });
});

describe('app_.documents_.$id AP History assignment rendering', () => {
  test('uses the AP History snapshot instead of the generic assignment prompt when snapshot is valid', () => {
    const assignment = {
      title: 'Revolutionary Ideals DBQ',
      prompt: 'Generic assignment prompt',
      apHistorySnapshot,
    };

    const renderableSnapshot = getRenderableApHistorySnapshot(assignment);

    expect(renderableSnapshot).toEqual(apHistorySnapshot);
    expect(
      shouldShowGenericAssignmentPrompt(assignment, renderableSnapshot)
    ).toBe(false);
    expect(
      getGenericAssignmentPromptForEditor(assignment, renderableSnapshot)
    ).toBeNull();
  });

  test('falls back to the generic assignment prompt when AP History snapshot is invalid', () => {
    const assignment = {
      title: 'Revolutionary Ideals DBQ',
      prompt: 'Generic assignment prompt',
      apHistorySnapshot: {
        ...apHistorySnapshot,
        schemaVersion: 999,
      },
    };

    const renderableSnapshot = getRenderableApHistorySnapshot(assignment);

    expect(renderableSnapshot).toBeNull();
    expect(
      shouldShowGenericAssignmentPrompt(assignment, renderableSnapshot)
    ).toBe(true);
    expect(
      getGenericAssignmentPromptForEditor(assignment, renderableSnapshot)
    ).toBe(assignment);
  });

  test('keeps ordinary non-AP assignments on the generic assignment prompt', () => {
    const assignment = {
      title: 'Literary Analysis',
      prompt: 'Analyze the passage.',
      apHistorySnapshot: null,
    };

    const renderableSnapshot = getRenderableApHistorySnapshot(assignment);

    expect(renderableSnapshot).toBeNull();
    expect(
      shouldShowGenericAssignmentPrompt(assignment, renderableSnapshot)
    ).toBe(true);
    expect(
      getGenericAssignmentPromptForEditor(assignment, renderableSnapshot)
    ).toBe(assignment);
  });

  test('uses the DBQ workspace only for DBQ snapshots with source documents', () => {
    const leqSnapshot: ApHistorySnapshot = {
      ...apHistorySnapshot,
      essayType: 'leq',
      sources: [],
      rubric: {
        rubricId: 'ap-history-leq-2026',
        totalPoints: 6,
      },
    };

    expect(shouldRenderDbqWorkspace(apHistorySnapshot)).toBe(true);
    expect(
      shouldRenderDbqWorkspace({ ...apHistorySnapshot, sources: [] })
    ).toBe(false);
    expect(shouldRenderDbqWorkspace(leqSnapshot)).toBe(false);
    expect(shouldRenderDbqWorkspace(null)).toBe(false);
  });

  test('maps DBQ snapshots into the student workspace with the production editor slot', () => {
    const html = renderToStaticMarkup(
      createElement(DbqLayout, {
        snapshot: apHistorySnapshot,
        tutor: createElement('div', {}, 'Production tutor'),
        editor: createElement('div', {}, 'Production document editor'),
        comments: createElement('div', {}, 'Production comments'),
      })
    );

    expect(html).toContain('DBQ · APUSH');
    expect(html).toContain('Evaluate the extent');
    expect(html).toContain('Source 1');
    expect(html).toContain('Resolved, that');
    expect(html).toContain('Production tutor');
    expect(html).toContain('Production document editor');
    expect(html).toContain('Document resources');
    expect(html).toContain('Resize document sidebar');
    expect(html).toContain('Documents');
    expect(html).toContain('Comments');
    expect(html).not.toContain('Production comments');
    expect(html).not.toContain('Your essay');
    expect(html).not.toContain('Cite [Doc');
    expect(html).not.toContain('Planning');
    expect(html).not.toContain('prototype');
    expect(html).not.toContain('No persistence');
  });

  test('renders AP History source content inside a bounded scroll area', () => {
    const html = renderToStaticMarkup(
      createElement(ApHistoryAssignmentPanel, { snapshot: apHistorySnapshot })
    );

    expect(html).toContain('Evaluate the extent');
    expect(html).toContain('Source 1');
    expect(html).toContain('max-h-');
    expect(html).toContain('overflow-y-auto');
  });
});
