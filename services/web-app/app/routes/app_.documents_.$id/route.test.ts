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
  assignmentModuleSession: {
    findMany: mock(),
  },
};

const requireUserId = mock();
const requireMembership = mock();
const requireMutableRequest = mock();
const redirectWithToast = mock();
const ensureAssignmentModuleSessionsForDocument = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
  requireMutableRequest,
}));
mock.module('~/utils/toast.server', () => ({
  redirectWithToast,
}));
mock.module('~/domain/documents.server', () => ({
  ensureAssignmentModuleSessionsForDocument,
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
  isTutorEnabledForAssignment,
  loader,
  shouldShowGenericAssignmentPrompt,
} = await import('./route');
const { ApHistoryAssignmentPanel } =
  await import('./ap-history-assignment-panel');

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

/**
 * The loader's first query asks whether the document is a collaboration room, so
 * a plain `mockResolvedValueOnce` would be answered to the probe rather than to
 * the document select. This serves the probe "not a room" and hands the fixture
 * to the query that actually wanted it.
 */
function documentOnce(doc: unknown) {
  let served = false;
  prisma.document.findFirst.mockImplementation((args: any) => {
    if (args?.where?.assignmentType) return Promise.resolve(null);
    if (!served) {
      served = true;
      return Promise.resolve(doc);
    }
    return Promise.resolve(makeDocument({ includeSnapshot: false }));
  });
}

describe('app_.documents_.$id loader', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    prisma.document.findFirst.mockReset();
    prisma.documentRevision.create.mockReset();
    prisma.assignmentModuleSession.findMany.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();
    requireMutableRequest.mockReset();
    redirectWithToast.mockReset();
    ensureAssignmentModuleSessionsForDocument.mockReset();

    ensureAssignmentModuleSessionsForDocument.mockResolvedValue(false);
    requireUserId.mockResolvedValue('user-1');
    requireMutableRequest.mockResolvedValue(undefined);
    requireMembership.mockResolvedValue({
      id: 'profile-1',
      teacherProfile: null,
    });
    prisma.user.findUnique.mockResolvedValue({ isAdmin: false });
    prisma.document.findFirst.mockImplementation((args) =>
      Promise.resolve(
        // The loader asks first whether this document is a collaboration room,
        // told apart by the assignment-type gate no authorization clause
        // carries. These fixtures are ordinary documents, so it finds nothing.
        args?.where?.assignmentType
          ? null
          : makeDocument({
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
              promptAttachmentName: true,
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
    documentOnce(
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
    documentOnce(
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

  test('backfills missing module sessions instead of dead-ending when a document has none', async () => {
    documentOnce(
      makeDocument({ includeSnapshot: true, assignmentModuleSessions: [] })
    );
    ensureAssignmentModuleSessionsForDocument.mockResolvedValueOnce(true);
    prisma.assignmentModuleSession.findMany.mockResolvedValueOnce([
      makeModuleSession({
        id: 'cms-backfilled',
        moduleId: 'module-prewriting',
        position: 1,
        instructionsCompleted: 0,
      }),
    ]);

    const response = (await loader({
      request: new Request('https://example.test/app/documents/doc-1'),
      params: { id: 'doc-1' },
    } as never)) as any;

    expect(ensureAssignmentModuleSessionsForDocument).toHaveBeenCalledWith(
      'doc-1',
      'type-1',
      []
    );
    expect(prisma.assignmentModuleSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { documentId: 'doc-1', deletedAt: null },
      })
    );
    expect(redirectWithToast).not.toHaveBeenCalled();
    expect(response.data.currentCms.id).toBe('cms-backfilled');
  });

  test('redirects with an actionable message when the assignment type has no modules to backfill', async () => {
    documentOnce(
      makeDocument({ includeSnapshot: true, assignmentModuleSessions: [] })
    );
    ensureAssignmentModuleSessionsForDocument.mockResolvedValueOnce(false);

    const response = (await loader({
      request: new Request('https://example.test/app/documents/doc-1'),
      params: { id: 'doc-1' },
    } as never)) as any;

    expect(redirectWithToast).toHaveBeenCalledWith(
      '/app',
      expect.objectContaining({
        type: 'error',
        description: expect.stringContaining('Contact support'),
      })
    );
    expect(response.redirectedTo).toBe('/app');
  });
});

/**
 * A group's shared draft must never open in the solo editor. Every list of
 * documents a student or teacher has — my-documents, the dashboard, a class page
 * — links at `/app/documents/:id`, so without this the ordinary way of finding
 * your own work puts a collaborative draft on the page whose save path competes
 * with the room's dual-write.
 */
describe('app_.documents_.$id loader, on a collaboration room', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockReset().mockResolvedValue({ isAdmin: false });
    prisma.document.findFirst.mockReset();
    prisma.documentRevision.create.mockReset().mockResolvedValue({});
    prisma.assignmentModuleSession.findMany.mockReset();
    requireUserId.mockReset().mockResolvedValue('user-1');
    requireMutableRequest.mockReset().mockResolvedValue(undefined);
    requireMembership
      .mockReset()
      .mockResolvedValue({ id: 'profile-1', teacherProfile: null });
    ensureAssignmentModuleSessionsForDocument
      .mockReset()
      .mockResolvedValue(false);
  });

  /** The room probe is the only query that carries the assignment-type gate. */
  const isRoomProbe = (args: any) => Boolean(args?.where?.assignmentType);

  test('sends a group draft to the collaborative page', async () => {
    prisma.document.findFirst.mockImplementation((args: any) =>
      Promise.resolve(
        isRoomProbe(args)
          ? { id: 'doc-1' }
          : makeDocument({ includeSnapshot: false })
      )
    );

    const response = (await loader({
      request: new Request('https://example.test/app/documents/doc-1'),
      params: { id: 'doc-1' },
    } as never).catch((thrown: unknown) => thrown)) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      '/app/collab-documents/doc-1'
    );
  });

  test('carries the query string across, so exitTo survives', async () => {
    prisma.document.findFirst.mockImplementation((args: any) =>
      Promise.resolve(
        isRoomProbe(args)
          ? { id: 'doc-1' }
          : makeDocument({ includeSnapshot: false })
      )
    );

    const response = (await loader({
      request: new Request(
        'https://example.test/app/documents/doc-1?exitTo=%2Fapp%2Fmy-documents'
      ),
      params: { id: 'doc-1' },
    } as never).catch((thrown: unknown) => thrown)) as Response;

    expect(response.headers.get('location')).toBe(
      '/app/collab-documents/doc-1?exitTo=%2Fapp%2Fmy-documents'
    );
  });

  test('scopes the check to documents this person may read', async () => {
    // Redirecting on a document they cannot see would answer "is this id a
    // shared draft?" for anyone who guesses an id; the loader below already
    // returns not-found for it.
    const calls: any[] = [];
    prisma.document.findFirst.mockImplementation((args: any) => {
      calls.push(args);
      return Promise.resolve(
        isRoomProbe(args) ? null : makeDocument({ includeSnapshot: false })
      );
    });

    await loader({
      request: new Request('https://example.test/app/documents/doc-1'),
      params: { id: 'doc-1' },
    } as never);

    const probe = calls.find(isRoomProbe);
    expect(probe.where.id).toBe('doc-1');
    expect(probe.where.AND).toBeDefined();
  });

  test('leaves an ordinary document alone', async () => {
    // Every document that exists outside this feature has no group, so the probe
    // finds nothing and the solo editor loads exactly as it did.
    prisma.document.findFirst.mockImplementation((args: any) =>
      Promise.resolve(
        isRoomProbe(args) ? null : makeDocument({ includeSnapshot: false })
      )
    );

    const response = (await loader({
      request: new Request('https://example.test/app/documents/doc-1'),
      params: { id: 'doc-1' },
    } as never)) as any;

    expect(response.data.doc.id).toBe('doc-1');
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

describe('isTutorEnabledForAssignment', () => {
  test('is enabled when the assignment has no explicit flag (preserves current behavior)', () => {
    expect(isTutorEnabledForAssignment({})).toBe(true);
  });

  test('is enabled when there is no linked assignment (e.g. free writing)', () => {
    expect(isTutorEnabledForAssignment(null)).toBe(true);
    expect(isTutorEnabledForAssignment(undefined)).toBe(true);
  });

  test('is enabled when tutorEnabled is explicitly true', () => {
    expect(isTutorEnabledForAssignment({ tutorEnabled: true })).toBe(true);
  });

  test('is disabled only when tutorEnabled is explicitly false', () => {
    expect(isTutorEnabledForAssignment({ tutorEnabled: false })).toBe(false);
  });
});
