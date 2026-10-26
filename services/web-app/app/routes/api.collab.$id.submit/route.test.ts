import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  document: { findFirst: mock() },
};
const requireUserId = mock();
const requireMembership = mock();
const getIsPlatformAdmin = mock();
const submitGroupDraft = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/document-access.server', () => ({
  documentAuthorWhere: () => ({}),
  getIsPlatformAdmin,
}));
mock.module('~/domain/collaboration/submit.server', () => ({
  GroupSubmitError: class GroupSubmitError extends Error {},
  submitGroupDraft,
}));

const { action } = await import('./route');

describe('api.collab.$id.submit', () => {
  beforeEach(() => {
    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'member-1',
      organization: { plan: 'SCHOOL' },
    });
    getIsPlatformAdmin.mockResolvedValue(false);
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-1',
      title: 'Draft',
      revision: 1,
      html: '<p>Hi</p>',
      text: 'Hi',
      classAssignment: {
        class: {
          id: 'class-1',
          school: { organizationId: 'org-1', organization: { plan: 'SCHOOL' } },
        },
      },
    });
  });

  test('unexpected failures return stable copy without raw exception text', async () => {
    const sensitive =
      'Invalid `prisma.user.findMany()` token=SECRET-TOKEN teacher@school.edu';
    submitGroupDraft.mockRejectedValue(new Error(sensitive));

    const response = await action({
      request: new Request('https://yawp.school/api/collab/doc-1/submit', {
        method: 'POST',
      }),
      params: { id: 'doc-1' },
    } as any);

    const body =
      typeof response.json === 'function' ? await response.json() : response.data;
    const serialized = JSON.stringify(body);
    expect(response.status ?? response.init?.status).toBe(500);
    expect(serialized).not.toContain('SECRET-TOKEN');
    expect(body.message).toBe('Could not submit this draft. Please try again.');
  });
});
