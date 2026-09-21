import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  matchesDocumentWhere,
  type ScopedDocument,
} from '~/utils/testing/where-eval';

const existingCms = {
  id: 'cms-existing',
  instructionsCompleted: 0,
  messages: [{ id: 'msg-1', agent: 'assistant', content: 'Existing feedback' }],
  assignmentModule: {
    instructions: [{ id: 'instruction-1', prompt: 'Prompt', buttons: [] }],
    assignmentType: { assignmentModules: [{ id: 'module-1', position: 1 }] },
  },
};

const prisma = {
  user: {
    findUnique: mock(),
  },
  document: {
    findFirst: mock(),
    findUnique: mock(),
  },
  assignmentModule: {
    findUnique: mock(),
  },
  assignmentModuleSession: {
    findFirst: mock(),
    create: mock(),
    update: mock(),
    findUnique: mock(),
  },
};

const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server.js', () => ({
  requireUserId,
  requireMembership,
}));

// Student B owns document-1. Teacher T teaches a class B is enrolled in.
const DOC_B: ScopedDocument = {
  id: 'document-1',
  membershipId: 'student-profile-1',
  teacherProfileIds: ['profile-teacher'],
};

const { action } = await import('./route');

function requestFor(body: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(body)) {
    form.append(key, value);
  }
  return new Request(
    'https://example.com/api/model/assignment-module-session',
    {
      method: 'POST',
      body: form,
    }
  );
}

async function readBody(response: any) {
  return typeof response.json === 'function' ? response.json() : response.data;
}

describe('api.model.assignment-module-session', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    prisma.document.findFirst.mockReset();
    prisma.document.findUnique.mockReset();
    prisma.assignmentModule.findUnique.mockReset();
    prisma.assignmentModuleSession.findFirst.mockReset();
    prisma.assignmentModuleSession.create.mockReset();
    prisma.assignmentModuleSession.update.mockReset();
    prisma.assignmentModuleSession.findUnique.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'student-profile-1',
      role: 'STUDENT',
    });
    prisma.user.findUnique.mockResolvedValue({ isAdmin: false });
    // Stands in for the database: the row comes back only when the query's own where
    // clause selects it.
    const findDocument = async ({ where }: any) =>
      matchesDocumentWhere(where, DOC_B)
        ? { id: DOC_B.id, membershipId: DOC_B.membershipId }
        : null;
    prisma.document.findFirst.mockImplementation(findDocument);
    prisma.document.findUnique.mockImplementation(findDocument);
    prisma.assignmentModule.findUnique.mockResolvedValue({
      id: 'module-1',
      instructions: [{ id: 'instruction-1', prompt: 'Prompt' }],
    });
  });

  test('returns an existing document/module session instead of creating a duplicate', async () => {
    prisma.assignmentModuleSession.findFirst.mockResolvedValue({
      id: 'cms-existing',
    });
    prisma.assignmentModuleSession.update.mockResolvedValue({
      id: 'cms-existing',
    });
    prisma.assignmentModuleSession.findUnique.mockResolvedValue(existingCms);

    const response = await action({
      request: requestFor({
        documentId: 'document-1',
        assignmentModuleId: 'module-1',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.cms.id).toBe('cms-existing');
    expect(body.created.id).toBe('cms-existing');
    expect(prisma.assignmentModuleSession.create).not.toHaveBeenCalled();
    expect(prisma.assignmentModuleSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          documentId: 'document-1',
          assignmentModuleId: 'module-1',
          deletedAt: null,
          // "The document's owner". Every session on a solo document has a null
          // membershipId, so this selects exactly what the unscoped query did —
          // it just says out loud which rows those are.
          membershipId: null,
        },
      })
    );
  });

  test('touches an existing document module session when it becomes active', async () => {
    prisma.assignmentModuleSession.findFirst.mockResolvedValue({
      id: 'cms-existing',
    });
    prisma.assignmentModuleSession.update.mockResolvedValue({
      id: 'cms-existing',
    });
    prisma.assignmentModuleSession.findUnique.mockResolvedValue(existingCms);

    const response = await action({
      request: requestFor({
        documentId: 'document-1',
        assignmentModuleId: 'module-1',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.cms.id).toBe('cms-existing');
    expect(prisma.assignmentModuleSession.update).toHaveBeenCalledWith({
      where: { id: 'cms-existing' },
      data: { updatedAt: expect.any(Date) },
    });
    expect(prisma.assignmentModuleSession.create).not.toHaveBeenCalled();
  });

  test('creates the session when no document/module session exists', async () => {
    prisma.assignmentModuleSession.findFirst.mockResolvedValue(null);
    prisma.assignmentModuleSession.create.mockResolvedValue({
      id: 'cms-created',
    });
    prisma.assignmentModuleSession.findUnique.mockResolvedValue({
      ...existingCms,
      id: 'cms-created',
    });

    const response = await action({
      request: requestFor({
        documentId: 'document-1',
        assignmentModuleId: 'module-1',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.cms.id).toBe('cms-created');
    expect(prisma.assignmentModuleSession.create).toHaveBeenCalledTimes(1);
  });

  test('touches a newly created document module session when it becomes active', async () => {
    prisma.assignmentModuleSession.findFirst.mockResolvedValue(null);
    prisma.assignmentModuleSession.create.mockResolvedValue({
      id: 'cms-created',
    });
    prisma.assignmentModuleSession.findUnique.mockResolvedValue({
      ...existingCms,
      id: 'cms-created',
    });

    const response = await action({
      request: requestFor({
        documentId: 'document-1',
        assignmentModuleId: 'module-1',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.cms.id).toBe('cms-created');
    expect(prisma.assignmentModuleSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentId: 'document-1',
        assignmentModuleId: 'module-1',
        instructionsCompleted: 0,
        updatedAt: expect.any(Date),
      }),
    });
  });

  describe('authorization', () => {
    test("refuses to hand back a session on another student's document", async () => {
      requireUserId.mockResolvedValue('user-a');
      requireMembership.mockResolvedValue({
        id: 'profile-a',
        role: 'STUDENT',
      });
      prisma.assignmentModuleSession.findFirst.mockResolvedValue({
        id: 'cms-existing',
      });
      prisma.assignmentModuleSession.findUnique.mockResolvedValue(existingCms);

      const response = await action({
        request: requestFor({
          documentId: 'document-1',
          assignmentModuleId: 'module-1',
        }),
        params: {},
      } as any);

      const body = await readBody(response);
      expect(response.init?.status).toBe(404);
      // The cms id is the cmsId the tutor endpoint keys on -- leaking it is the
      // pivot from this endpoint into someone else's tutor session.
      expect(JSON.stringify(body)).not.toContain('cms-existing');
      expect(JSON.stringify(body)).not.toContain('Existing feedback');
      expect(prisma.assignmentModuleSession.create).not.toHaveBeenCalled();
    });

    test("refuses to seed a new session onto another student's document", async () => {
      requireUserId.mockResolvedValue('user-a');
      requireMembership.mockResolvedValue({
        id: 'profile-a',
        role: 'STUDENT',
      });
      prisma.assignmentModuleSession.findFirst.mockResolvedValue(null);

      const response = await action({
        request: requestFor({
          documentId: 'document-1',
          assignmentModuleId: 'module-1',
        }),
        params: {},
      } as any);

      expect(response.init?.status).toBe(404);
      expect(prisma.assignmentModuleSession.create).not.toHaveBeenCalled();
    });

    test('lets the student who owns the document get or create the session', async () => {
      prisma.assignmentModuleSession.findFirst.mockResolvedValue(null);
      prisma.assignmentModuleSession.create.mockResolvedValue({
        id: 'cms-created',
      });
      prisma.assignmentModuleSession.findUnique.mockResolvedValue({
        ...existingCms,
        id: 'cms-created',
      });

      const response = await action({
        request: requestFor({
          documentId: 'document-1',
          assignmentModuleId: 'module-1',
        }),
        params: {},
      } as any);

      const body = await readBody(response);
      expect(body.cms.id).toBe('cms-created');
      expect(prisma.assignmentModuleSession.create).toHaveBeenCalledTimes(1);
    });

    test("lets a teacher read the student's existing session", async () => {
      requireUserId.mockResolvedValue('user-teacher');
      requireMembership.mockResolvedValue({
        id: 'profile-teacher',
        role: 'TEACHER',
      });
      prisma.assignmentModuleSession.findFirst.mockResolvedValue({
        id: 'cms-existing',
      });
      prisma.assignmentModuleSession.findUnique.mockResolvedValue(existingCms);

      const response = await action({
        request: requestFor({
          documentId: 'document-1',
          assignmentModuleId: 'module-1',
        }),
        params: {},
      } as any);

      const body = await readBody(response);
      expect(body.cms.id).toBe('cms-existing');
      expect(prisma.assignmentModuleSession.create).not.toHaveBeenCalled();
    });

    test("refuses to let a teacher seed a session onto a student's document", async () => {
      // Reading student work is grading. Creating a tutor session with a seeded
      // assistant message puts dialogue in the student's editor they never started.
      requireUserId.mockResolvedValue('user-teacher');
      requireMembership.mockResolvedValue({
        id: 'profile-teacher',
        role: 'TEACHER',
      });
      prisma.assignmentModuleSession.findFirst.mockResolvedValue(null);

      const response = await action({
        request: requestFor({
          documentId: 'document-1',
          assignmentModuleId: 'module-1',
        }),
        params: {},
      } as any);

      expect(response.init?.status).toBe(403);
      expect(prisma.assignmentModuleSession.create).not.toHaveBeenCalled();
    });
  });
});

/**
 * A shared draft has several authors, and each of them has their own tutor
 * conversation. That makes the previously harmless "most recent session for this
 * module" lookup a way to read a classmate's transcript.
 */
describe('api.model.assignment-module-session on a shared draft', () => {
  const DOC_SHARED: ScopedDocument = {
    id: 'document-shared',
    artifactKind: 'ASSIGNMENT_GROUP',
    membershipId: null,
    teacherProfileIds: [],
    classAssignmentTeacherProfileIds: ['profile-teacher'],
    activeGroupMemberIds: ['student-profile-1', 'student-profile-2'],
    classAssignmentStudentProfileIds: ['student-profile-1', 'student-profile-2'],
    classAssignmentPostAt: null,
  };

  beforeEach(() => {
    DOC_SHARED.classAssignmentStudentProfileIds = ['student-profile-1', 'student-profile-2'];
    DOC_SHARED.classAssignmentPostAt = null;
    prisma.user.findUnique.mockReset().mockResolvedValue({ isAdmin: false });
    prisma.document.findFirst.mockReset();
    prisma.document.findUnique.mockReset();
    prisma.assignmentModule.findUnique.mockReset();
    prisma.assignmentModuleSession.findFirst.mockReset();
    prisma.assignmentModuleSession.create.mockReset();
    prisma.assignmentModuleSession.update.mockReset();
    prisma.assignmentModuleSession.findUnique.mockReset();
    requireUserId.mockReset().mockResolvedValue('user-2');
    requireMembership
      .mockReset()
      .mockResolvedValue({ id: 'student-profile-2', role: 'STUDENT' });

    prisma.document.findFirst.mockImplementation(async ({ where }: any) => {
      // The opened assignment-group room check is distinct from caller access.
      if (where.artifactKind === 'ASSIGNMENT_GROUP' && where.assignment?.is?.collaborationEnabled === true) return { id: DOC_SHARED.id };
      return matchesDocumentWhere(where, DOC_SHARED)
        ? {
            id: DOC_SHARED.id,
            membershipId: DOC_SHARED.membershipId,
            group: { id: 'group-1' },
          }
        : null;
    });
    prisma.assignmentModule.findUnique.mockResolvedValue({
      id: 'module-1',
      instructions: [{ id: 'instruction-1', prompt: 'Prompt' }],
    });
  });

  const post = () =>
    action({
      request: requestFor({
        documentId: 'document-shared',
        assignmentModuleId: 'module-1',
      }),
      params: {},
    } as any);

  test('never hands a member the session belonging to someone else', async () => {
    // Without the member scope this returns the group's most recent session for
    // the module — whoever wrote it — and its id is the key the tutor endpoint
    // posts to. One click on "next" and a student is typing into a classmate's
    // conversation.
    prisma.assignmentModuleSession.findFirst.mockResolvedValue(null);
    prisma.assignmentModuleSession.create.mockResolvedValue({ id: 'cms-mine' });
    prisma.assignmentModuleSession.findUnique.mockResolvedValue({
      ...existingCms,
      id: 'cms-mine',
    });

    await post();

    expect(prisma.assignmentModuleSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          documentId: 'document-shared',
          membershipId: 'student-profile-2',
        }),
      })
    );
  });

  test('stamps a session it creates with the member who asked for it', async () => {
    prisma.assignmentModuleSession.findFirst.mockResolvedValue(null);
    prisma.assignmentModuleSession.create.mockResolvedValue({ id: 'cms-mine' });
    prisma.assignmentModuleSession.findUnique.mockResolvedValue({
      ...existingCms,
      id: 'cms-mine',
    });

    await post();

    expect(prisma.assignmentModuleSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ membershipId: 'student-profile-2' }),
    });
  });

  test('lets a co-author who does not own the document start their own session', async () => {
    // The assignment owns the artifact; active group membership is what gives
    // student 2 access to their own tutor conversation.
    prisma.assignmentModuleSession.findFirst.mockResolvedValue(null);
    prisma.assignmentModuleSession.create.mockResolvedValue({ id: 'cms-mine' });
    prisma.assignmentModuleSession.findUnique.mockResolvedValue({
      ...existingCms,
      id: 'cms-mine',
    });

    const response = await post();

    const body = await readBody(response);
    expect(body.cms.id).toBe('cms-mine');
  });

  test('a group member no longer enrolled in the deployment class gets no tutor session', async () => {
    DOC_SHARED.classAssignmentStudentProfileIds = ['student-profile-1'];
    const response = await post();
    expect(response.init?.status).toBe(404);
    expect(prisma.assignmentModuleSession.findFirst).not.toHaveBeenCalled();
    expect(prisma.assignmentModuleSession.create).not.toHaveBeenCalled();
  });

  test('a group member cannot open a tutor session before the scheduled assignment is visible', async () => {
    DOC_SHARED.classAssignmentPostAt = new Date(Date.now() + 86400000);
    const response = await post();
    expect(response.init?.status).toBe(404);
    expect(prisma.assignmentModuleSession.findFirst).not.toHaveBeenCalled();
    expect(prisma.assignmentModuleSession.create).not.toHaveBeenCalled();
  });

  test('a student outside the group gets nothing', async () => {
    requireMembership.mockResolvedValue({
      id: 'student-profile-9',
      role: 'STUDENT',
    });

    const response = await post();

    expect(response.init?.status).toBe(404);
    expect(prisma.assignmentModuleSession.create).not.toHaveBeenCalled();
  });
});
