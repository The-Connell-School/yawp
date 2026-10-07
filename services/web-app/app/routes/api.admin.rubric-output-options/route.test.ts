import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { CatalogError } from '~/domain/rubrics/rubric-catalog.server';

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

  test('maps catalog 403 errors from toggle saves', async () => {
    setRubricTeacherNotesEnabled.mockRejectedValue(
      new CatalogError('This rubric is read-only', 403)
    );
    const response = await action({
      request: new Request('https://example.test/api/admin/rubric-output-options', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          catalogKey: 'class-starter-engagement',
          enabled: true,
          expectedFingerprint: 'a'.repeat(64),
          requestId: '00000000-0000-4000-8000-000000000003',
        }),
      }),
      params: {},
      context: {} as never,
    } as never);
    expect((response as { init?: { status: number } }).init?.status).toBe(403);
    expect((response as { data: { error: string } }).data.error).toContain(
      'read-only'
    );
  });

  test('maps catalog 409 stale fingerprint errors', async () => {
    setRubricTeacherNotesEnabled.mockRejectedValue(
      new CatalogError(
        'This rubric changed since you opened it. Reload to see the latest version, then reapply your edit.',
        409
      )
    );
    const response = await action({
      request: new Request('https://example.test/api/admin/rubric-output-options', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          catalogKey: 'daily-pages-engagement',
          enabled: false,
          expectedFingerprint: 'a'.repeat(64),
          requestId: '00000000-0000-4000-8000-000000000004',
        }),
      }),
      params: {},
      context: {} as never,
    } as never);
    const body = (response as { data: { httpStatus?: number }; init?: { status: number } }).data;
    expect(body.httpStatus).toBe(409);
    expect((response as { init?: { status: number } }).init?.status).toBe(409);
  });

  test('maps catalog 422 validation errors', async () => {
    setRubricTeacherNotesEnabled.mockRejectedValue(
      new CatalogError('Rubric validation failed', 422, [
        { path: '/rubric', message: 'Add at least one category.' },
      ])
    );
    const response = await action({
      request: new Request('https://example.test/api/admin/rubric-output-options', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          catalogKey: 'broken-rubric',
          enabled: true,
          expectedFingerprint: 'a'.repeat(64),
          requestId: '00000000-0000-4000-8000-000000000005',
        }),
      }),
      params: {},
      context: {} as never,
    } as never);
    expect((response as { init?: { status: number } }).init?.status).toBe(422);
    expect((response as { data: { issues: unknown[] } }).data.issues).toHaveLength(
      1
    );
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
