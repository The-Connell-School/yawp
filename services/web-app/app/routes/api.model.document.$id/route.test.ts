import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  $transaction: mock(),
  user: {
    findUnique: mock(),
    findUniqueOrThrow: mock(),
  },
  document: {
    findUniqueOrThrow: mock(),
    findUnique: mock(),
    findFirst: mock(),
    update: mock(),
  },
  documentRevision: {
    findFirst: mock(),
    create: mock(),
  },
  submission: {
    findFirst: mock(),
    create: mock(),
    update: mock(),
    updateMany: mock(),
  },
  documentWriteJournal: {
    findFirst: mock(),
    create: mock(),
    update: mock(),
  },
  submissionActivity: { create: mock() },
};

const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));

const { action } = await import('./route');

describe('api.model.document.$id', () => {
  beforeEach(() => {
    prisma.user.findUniqueOrThrow.mockReset();
    prisma.user.findUnique.mockReset();
    prisma.document.findUniqueOrThrow.mockReset();
    prisma.document.findUnique.mockReset();
    prisma.document.findFirst.mockReset();
    prisma.document.update.mockReset();
    prisma.documentRevision.findFirst.mockReset();
    prisma.documentRevision.create.mockReset();
    prisma.submission.findFirst.mockReset();
    prisma.submission.create.mockReset();
    prisma.submission.update.mockReset();
    prisma.submission.updateMany.mockReset();
    prisma.documentWriteJournal.findFirst.mockReset();
    prisma.documentWriteJournal.create.mockReset();
    prisma.documentWriteJournal.update.mockReset();
    prisma.submissionActivity.create.mockReset();
    prisma.$transaction.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'profile-1',
      organization: { id: 'org-1' },
    });
    prisma.user.findUniqueOrThrow.mockResolvedValue({ isAdmin: false });
    prisma.user.findUnique.mockResolvedValue({
      name: 'Student One',
      email: 'student@example.test',
    });
    // The route resolves the document through the access predicate
    // (`document.findFirst` + `documentReadWhere`) before it writes anything.
    // These tests are about save ordering, not authorization: profile-1 owns
    // doc-1, so the scoped lookup succeeds. The predicate itself is exercised in
    // `authz.test.ts`, which runs the route's own where clause against a fixture.
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-1',
      membershipId: 'profile-1',
      text: 'Old text',
      html: '<p>Old text</p>',
      revision: 4,
    });
    prisma.document.findUnique.mockResolvedValue({
      id: 'doc-1',
      text: 'New text',
      html: '<p>New text</p>',
      revision: 5,
    });
    prisma.documentRevision.findFirst.mockResolvedValue(null);
    prisma.document.update.mockResolvedValue({
      id: 'doc-1',
      revision: 5,
    });
    prisma.documentWriteJournal.create.mockResolvedValue({
      id: 'journal-1',
    });
    prisma.documentWriteJournal.update.mockResolvedValue({
      id: 'journal-1',
      status: 'accepted',
    });
    prisma.submission.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(prisma)
    );
  });

  test('audits snapshot body changes with hashes and lengths only', async () => {
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      text: 'Old frozen body',
      html: '<p>Old frozen body</p>',
      updatedAt: new Date('2026-08-20T08:00:00.000Z'),
      releasedAt: new Date('2026-08-20T09:00:00.000Z'),
      document: { membership: { organizationId: 'org-1' } },
    });

    const form = new FormData();
    form.append('html', '<p>New frozen body</p>');
    form.append('text', 'New frozen body');

    const response = (await action({
      request: new Request(
        'https://example.com/api/model/document/doc-1?snapshotId=sub-1',
        { method: 'PUT', body: form }
      ),
      params: { id: 'doc-1' },
    } as any)) as Response;

    expect(response.status).toBe(200);
    expect(prisma.submission.updateMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({
        documentId: 'doc-1',
        document: { is: expect.any(Object) },
      })
    );
    expect(
      prisma.submission.updateMany.mock.calls[0][0].where.document.is
    ).toEqual(prisma.submission.findFirst.mock.calls[0][0].where.document.is);
    expect(prisma.submissionActivity.create).toHaveBeenCalledTimes(1);
    const activity = prisma.submissionActivity.create.mock.calls[0][0].data;
    expect(activity.eventType).toBe('submission.body_updated');
    expect(activity.occurredAfterRelease).toBe(true);
    expect(JSON.stringify(activity)).not.toContain('frozen body');
    expect(activity.changes.body.before.text.sha256).toHaveLength(64);
    expect(activity.changes.body.after.html.length).toBe(22);
  });

  test('rolls back the protected snapshot mutation when journal acceptance fails', async () => {
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      text: 'Old frozen body',
      html: '<p>Old frozen body</p>',
      updatedAt: new Date('2026-08-20T08:00:00.000Z'),
      releasedAt: null,
      document: { membership: { organizationId: 'org-1' } },
    });
    prisma.documentWriteJournal.update
      .mockRejectedValueOnce(new Error('journal acceptance unavailable'))
      .mockResolvedValueOnce({ id: 'journal-1', status: 'rejected' });
    const form = new FormData();
    form.append('text', 'New frozen body');

    await expect(
      action({
        request: new Request(
          'https://example.com/api/model/document/doc-1?snapshotId=sub-1',
          { method: 'PUT', body: form }
        ),
        params: { id: 'doc-1' },
      } as any)
    ).rejects.toThrow('journal acceptance unavailable');

    expect(prisma.documentWriteJournal.update).toHaveBeenCalledTimes(2);
    expect(prisma.documentWriteJournal.update.mock.calls[0]?.[0]).toMatchObject(
      { data: { status: 'accepted' } }
    );
    expect(prisma.documentWriteJournal.update.mock.calls[1]?.[0]).toMatchObject(
      {
        data: {
          status: 'rejected',
          failureReason: 'journal acceptance unavailable',
        },
      }
    );
  });

  test('rejects stale snapshot preimages and records no activity', async () => {
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      text: 'Old frozen body',
      html: '<p>Old frozen body</p>',
      updatedAt: new Date('2026-08-20T08:00:00.000Z'),
      releasedAt: null,
      document: { membership: { organizationId: 'org-1' } },
    });
    prisma.submission.updateMany.mockResolvedValue({ count: 0 });
    const form = new FormData();
    form.append('html', '<p>Concurrent frozen body</p>');
    form.append('text', 'Concurrent frozen body');

    const response = (await action({
      request: new Request(
        'https://example.com/api/model/document/doc-1?snapshotId=sub-1',
        { method: 'PUT', body: form }
      ),
      params: { id: 'doc-1' },
    } as any)) as Response;

    expect(response.status).toBe(409);
    expect(prisma.submissionActivity.create).not.toHaveBeenCalled();
    expect(
      prisma.documentWriteJournal.update.mock.calls.at(-1)?.[0]
    ).toMatchObject({
      where: { id: 'journal-1' },
      data: {
        status: 'rejected',
        failureReason: 'stale_submission_snapshot',
      },
    });
  });

  test('reuses assignment-specific teacher access at the snapshot write', async () => {
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      text: 'Old body',
      html: '<p>Old body</p>',
      updatedAt: new Date('2026-08-20T08:00:00.000Z'),
      releasedAt: null,
      document: { membership: { organizationId: 'org-1' } },
    });
    prisma.submission.updateMany.mockResolvedValue({ count: 0 });
    const form = new FormData();
    form.append('text', 'New body');

    const response = (await action({
      request: new Request(
        'https://example.com/api/model/document/doc-1?snapshotId=sub-1',
        { method: 'PUT', body: form }
      ),
      params: { id: 'doc-1' },
    } as any)) as Response;

    expect(response.status).toBe(409);
    expect(
      prisma.submission.updateMany.mock.calls[0][0].where.document.is
    ).toEqual(prisma.submission.findFirst.mock.calls[0][0].where.document.is);
    expect(prisma.submissionActivity.create).not.toHaveBeenCalled();
  });

  test('rejects a teacher snapshot write to their own document across memberships', async () => {
    prisma.submission.findFirst.mockResolvedValue(null);
    const form = new FormData();
    form.append('text', 'Forbidden own-document body');

    const response = (await action({
      request: new Request(
        'https://example.com/api/model/document/doc-1?snapshotId=sub-own',
        { method: 'PUT', body: form }
      ),
      params: { id: 'doc-1' },
    } as any)) as Response;

    expect(response.status).toBe(404);
    expect(
      prisma.submission.findFirst.mock.calls[0][0].where.document.is.AND
    ).toContainEqual({
      membership: { is: { userId: { not: 'user-1' } } },
    });
    expect(prisma.submission.updateMany).not.toHaveBeenCalled();
    expect(prisma.submissionActivity.create).not.toHaveBeenCalled();
  });

  test('rejects an admin snapshot write to their own document', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({ isAdmin: true });
    prisma.submission.findFirst.mockResolvedValue(null);
    const form = new FormData();
    form.append('text', 'Forbidden admin own-document body');

    const response = (await action({
      request: new Request(
        'https://example.com/api/model/document/doc-1?snapshotId=sub-own',
        { method: 'PUT', body: form }
      ),
      params: { id: 'doc-1' },
    } as any)) as Response;

    expect(response.status).toBe(404);
    expect(
      prisma.submission.findFirst.mock.calls[0][0].where.document.is
    ).toEqual({
      deletedAt: null,
      AND: [{ membership: { is: { userId: { not: 'user-1' } } } }],
    });
    expect(prisma.submission.updateMany).not.toHaveBeenCalled();
    expect(prisma.submissionActivity.create).not.toHaveBeenCalled();
  });

  test('rejects stale editor saves and records a rejected journal entry', async () => {
    prisma.documentWriteJournal.findFirst.mockResolvedValue({
      id: 'journal-old',
      editorSessionId: 'editor-1',
      clientSeq: 7,
      status: 'accepted',
    });

    const form = new FormData();
    form.append('html', '<p>Older content</p>');
    form.append('text', 'Older content');
    form.append('editorSessionId', 'editor-1');
    form.append('clientSeq', '6');
    form.append('baseRevision', '4');

    const response = (await action({
      request: new Request(
        'https://example.com/api/model/document/doc-1?from=editor',
        {
          method: 'PUT',
          body: form,
        }
      ),
      params: { id: 'doc-1' },
    } as any)) as Response;

    expect(response.status).toBe(409);
    expect(prisma.document.update).not.toHaveBeenCalled();
    expect(prisma.documentWriteJournal.create).toHaveBeenCalledTimes(1);
    expect(prisma.documentWriteJournal.update).toHaveBeenCalledTimes(1);
    expect(prisma.documentWriteJournal.update.mock.calls[0]?.[0]).toMatchObject(
      {
        where: { id: 'journal-1' },
        data: {
          status: 'rejected',
          failureReason: 'stale_client_sequence',
        },
      }
    );
  });

  test('accepts ordered editor saves, increments revision, and returns the new revision', async () => {
    prisma.documentWriteJournal.findFirst.mockResolvedValue({
      id: 'journal-old',
      editorSessionId: 'editor-1',
      clientSeq: 3,
      status: 'accepted',
    });
    prisma.document.update.mockResolvedValue({
      id: 'doc-1',
      revision: 5,
    });

    const form = new FormData();
    form.append('html', '<p>Newest content</p>');
    form.append('text', 'Newest content');
    form.append('editorSessionId', 'editor-1');
    form.append('clientSeq', '4');
    form.append('baseRevision', '4');

    const response = (await action({
      request: new Request(
        'https://example.com/api/model/document/doc-1?from=editor',
        {
          method: 'PUT',
          body: form,
        }
      ),
      params: { id: 'doc-1' },
    } as any)) as Response;

    expect(response.status).toBe(200);
    expect(prisma.document.update).toHaveBeenCalledTimes(1);
    expect(prisma.document.update.mock.calls[0]?.[0]).toMatchObject({
      where: {
        revision: 4,
        id: 'doc-1',
      },
      data: {
        html: '<p>Newest content</p>',
        text: 'Newest content',
        revision: {
          increment: 1,
        },
      },
    });

    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      revision: 5,
    });
    expect(prisma.documentWriteJournal.update.mock.calls[0]?.[0]).toMatchObject(
      {
        where: { id: 'journal-1' },
        data: {
          status: 'accepted',
          resultingRevision: 5,
        },
      }
    );
  });

  test('returns a stale revision conflict when the guarded update loses the race', async () => {
    prisma.documentWriteJournal.findFirst.mockResolvedValue({
      id: 'journal-old',
      editorSessionId: 'editor-1',
      clientSeq: 3,
      status: 'accepted',
    });
    prisma.document.update.mockRejectedValue(
      Object.assign(new Error('No record was found for an update.'), {
        code: 'P2025',
      })
    );

    const form = new FormData();
    form.append('html', '<p>Newest content</p>');
    form.append('text', 'Newest content');
    form.append('editorSessionId', 'editor-1');
    form.append('clientSeq', '4');
    form.append('baseRevision', '4');

    const response = (await action({
      request: new Request(
        'https://example.com/api/model/document/doc-1?from=editor',
        {
          method: 'PUT',
          body: form,
        }
      ),
      params: { id: 'doc-1' },
    } as any)) as Response;

    expect(response.status).toBe(409);
    expect(
      prisma.documentWriteJournal.update.mock.calls.at(-1)?.[0]
    ).toMatchObject({
      where: { id: 'journal-1' },
      data: {
        status: 'rejected',
        failureReason: 'stale_base_revision',
      },
    });
  });
});
