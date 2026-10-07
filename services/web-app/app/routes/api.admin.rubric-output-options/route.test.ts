import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {} as never;
const requireAdmin = mock();
const requireSuperAdmin = mock();
const resolveRubricOutputOptionsForAssignmentType = mock();
const setRubricTeacherNotesEnabled = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireAdmin,
  requireSuperAdmin,
}));

mock.module('~/domain/rubrics/rubric-output-options.server', () => ({
  readOutputSchemaTeacherNotes: (content: unknown) =>
    Boolean(
      content &&
        typeof content === 'object' &&
        (content as { outputSchema?: { teacherNotesEnabled?: boolean } })
          .outputSchema?.teacherNotesEnabled
    ),
  resolveRubricOutputOptionsForAssignmentType,
  setRubricTeacherNotesEnabled,
}));

const catalogGet = mock();
mock.module('~/domain/rubrics/rubric-catalog.server', () => ({
  RubricCatalog: class {
    get = catalogGet;
  },
}));

const { action, loader } = await import('./route');

describe('api.admin.rubric-output-options', () => {
  beforeEach(() => {
    requireAdmin.mockReset();
    requireSuperAdmin.mockReset();
    resolveRubricOutputOptionsForAssignmentType.mockReset();
    setRubricTeacherNotesEnabled.mockReset();
    catalogGet.mockReset();
    requireAdmin.mockResolvedValue(undefined);
    requireSuperAdmin.mockResolvedValue({ id: 'super-1', email: 'super@test' });
  });

  test('rejects toggles from non-superadmins', async () => {
    const { data } = await import('react-router');
    requireSuperAdmin.mockRejectedValue(
      data({ error: 'Unauthorized' }, { status: 403 })
    );
    await expect(
      action({
        request: new Request('https://example.test/api/admin/rubric-output-options', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            catalogKey: 'daily-pages-engagement',
            enabled: true,
            expectedFingerprint: 'a'.repeat(64),
            requestId: '00000000-0000-4000-8000-000000000001',
          }),
        }),
        params: {},
        context: {} as never,
      } as never)
    ).rejects.toMatchObject({ init: { status: 403 } });
    expect(setRubricTeacherNotesEnabled).not.toHaveBeenCalled();
  });

  test('persists a superadmin toggle through the catalog save path', async () => {
    setRubricTeacherNotesEnabled.mockResolvedValue({
      teacherNotesEnabled: true,
      fingerprint: 'b'.repeat(64),
      revision: { version: 3 },
      replayed: false,
    });
    const response = await action({
      request: new Request('https://example.test/api/admin/rubric-output-options', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          catalogKey: 'daily-pages-engagement',
          enabled: true,
          expectedFingerprint: 'a'.repeat(64),
          requestId: '00000000-0000-4000-8000-000000000002',
        }),
      }),
      params: {},
      context: {} as never,
    } as never);
    const body = (response as { data: unknown }).data;
    expect(body).toMatchObject({
      status: 'success',
      teacherNotesEnabled: true,
      fingerprint: 'b'.repeat(64),
    });
    expect(setRubricTeacherNotesEnabled).toHaveBeenCalled();
  });

  test('loader resolves assignment-type output options for admins', async () => {
    resolveRubricOutputOptionsForAssignmentType.mockResolvedValue({
      catalogKey: 'daily-pages-engagement',
      teacherNotesEnabled: false,
      fingerprint: 'c'.repeat(64),
    });
    const response = await loader({
      request: new Request(
        'https://example.test/api/admin/rubric-output-options?assignmentTypeId=at-1'
      ),
      params: {},
      context: {} as never,
    } as never);
    const body = (response as { data: unknown }).data;
    expect(body).toEqual({
      state: {
        catalogKey: 'daily-pages-engagement',
        teacherNotesEnabled: false,
        fingerprint: 'c'.repeat(64),
      },
    });
  });
});
