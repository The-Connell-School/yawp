import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  document: { findFirst: mock(), update: mock() },
  documentWriteJournal: { create: mock(), update: mock() },
  documentRevision: { findFirst: mock(), create: mock() },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { applyCollabSnapshot } = await import('./dual-write.server');

afterAll(() => {
  mock.restore();
});

const SNAPSHOT = { html: '<p>New text.</p>', text: 'New text.' };

const collabDocument = (overrides: Record<string, unknown> = {}) => ({
  id: 'doc-1',
  html: '<p>Old text.</p>',
  text: 'Old text.',
  revision: 4,
  ...overrides,
});

describe('applyCollabSnapshot', () => {
  beforeEach(() => {
    prisma.document.findFirst.mockReset().mockResolvedValue(collabDocument());
    prisma.document.update.mockReset().mockResolvedValue({ revision: 5 });
    prisma.documentWriteJournal.create
      .mockReset()
      .mockResolvedValue({ id: 'j-1' });
    prisma.documentWriteJournal.update.mockReset().mockResolvedValue({});
    prisma.documentRevision.findFirst.mockReset().mockResolvedValue(null);
    prisma.documentRevision.create.mockReset().mockResolvedValue({});
  });

  test('writes html and text and bumps the revision', async () => {
    const result = await applyCollabSnapshot({
      documentId: 'doc-1',
      snapshot: SNAPSHOT,
    });

    expect(result).toEqual({ status: 'written', revision: 5 });
    expect(prisma.document.update.mock.calls[0][0].data).toMatchObject({
      html: '<p>New text.</p>',
      text: 'New text.',
      revision: { increment: 1 },
    });
  });

  test('only ever writes to an opened collaborative document', async () => {
    // A webhook naming a solo document must not be able to overwrite a
    // student's individual work. The gate is the shared room predicate, so this
    // and the token endpoint cannot drift apart.
    await applyCollabSnapshot({ documentId: 'doc-1', snapshot: SNAPSHOT });

    const where = prisma.document.findFirst.mock.calls[0][0].where;
    expect(where.id).toBe('doc-1');
    expect(where.artifactKind).toBe('ASSIGNMENT_GROUP');
    expect(where.group).toEqual({ is: { openedAt: { not: null } } });
    expect(where.assignment).toEqual({ is: { collaborationEnabled: true } });
  });

  test('skips a document that is not a collaborative draft', async () => {
    prisma.document.findFirst.mockResolvedValue(null);

    const result = await applyCollabSnapshot({
      documentId: 'doc-1',
      snapshot: SNAPSHOT,
    });

    expect(result).toEqual({
      status: 'skipped',
      reason: 'not-a-collaborative-document',
    });
    expect(prisma.document.update).not.toHaveBeenCalled();
    expect(prisma.documentWriteJournal.create).not.toHaveBeenCalled();
  });

  test('does not write when the content is unchanged', async () => {
    // A redelivered webhook, or presence-only activity. Must not bump the
    // revision or cut a history entry.
    prisma.document.findFirst.mockResolvedValue(
      collabDocument({ html: SNAPSHOT.html, text: SNAPSHOT.text })
    );

    const result = await applyCollabSnapshot({
      documentId: 'doc-1',
      snapshot: SNAPSHOT,
    });

    expect(result).toEqual({ status: 'unchanged', revision: 4 });
    expect(prisma.document.update).not.toHaveBeenCalled();
    expect(prisma.documentRevision.create).not.toHaveBeenCalled();
  });

  test('records an unchanged write as accepted, not rejected', async () => {
    prisma.document.findFirst.mockResolvedValue(
      collabDocument({ html: SNAPSHOT.html, text: SNAPSHOT.text })
    );

    await applyCollabSnapshot({ documentId: 'doc-1', snapshot: SNAPSHOT });

    const update = prisma.documentWriteJournal.update.mock.calls[0][0].data;
    expect(update.status).toBe('accepted');
    expect(update.metadata).toMatchObject({ noChange: true });
  });

  test('journals every write with attribution and the base revision', async () => {
    await applyCollabSnapshot({
      documentId: 'doc-1',
      snapshot: SNAPSHOT,
      membershipId: 'member-7',
      requestId: 'req-9',
    });

    const data = prisma.documentWriteJournal.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      eventType: 'document.collab-snapshot',
      source: 'collab-webhook',
      documentId: 'doc-1',
      membershipId: 'member-7',
      requestId: 'req-9',
      baseRevision: 4,
    });
    // Attribution is what a contribution breakdown will read later.
    expect(data.htmlHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('marks the journal accepted with the resulting revision', async () => {
    await applyCollabSnapshot({ documentId: 'doc-1', snapshot: SNAPSHOT });

    expect(prisma.documentWriteJournal.update).toHaveBeenCalledWith({
      where: { id: 'j-1' },
      data: { status: 'accepted', resultingRevision: 5 },
    });
  });

  test('always cuts the first revision', async () => {
    prisma.documentRevision.findFirst.mockResolvedValue(null);

    await applyCollabSnapshot({ documentId: 'doc-1', snapshot: SNAPSHOT });

    expect(prisma.documentRevision.create).toHaveBeenCalledWith({
      data: {
        documentId: 'doc-1',
        html: SNAPSHOT.html,
        text: SNAPSHOT.text,
        trigger: 'auto',
      },
    });
  });

  test('throttles automatic revisions to the solo path’s interval', async () => {
    prisma.documentRevision.findFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - 60_000),
      html: '<p>Older.</p>',
      text: 'Older.',
    });

    await applyCollabSnapshot({ documentId: 'doc-1', snapshot: SNAPSHOT });

    // A minute since the last one is well inside the 30-minute window.
    expect(prisma.documentRevision.create).not.toHaveBeenCalled();
    // The document itself is still updated — only history is throttled.
    expect(prisma.document.update).toHaveBeenCalled();
  });

  test('cuts a revision once the interval has passed', async () => {
    prisma.documentRevision.findFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - 31 * 60 * 1000),
      html: '<p>Older.</p>',
      text: 'Older.',
    });

    await applyCollabSnapshot({ documentId: 'doc-1', snapshot: SNAPSHOT });

    expect(prisma.documentRevision.create).toHaveBeenCalled();
  });

  test('an explicit trigger cuts a revision regardless of the interval', async () => {
    prisma.documentRevision.findFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - 1_000),
      html: '<p>Older.</p>',
      text: 'Older.',
    });

    await applyCollabSnapshot({
      documentId: 'doc-1',
      snapshot: SNAPSHOT,
      trigger: 'submit',
    });

    expect(prisma.documentRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ trigger: 'submit' }),
      })
    );
  });

  test('an explicit trigger still dedupes identical history', async () => {
    prisma.documentRevision.findFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - 1_000),
      html: SNAPSHOT.html,
      text: SNAPSHOT.text,
    });

    await applyCollabSnapshot({
      documentId: 'doc-1',
      snapshot: SNAPSHOT,
      trigger: 'submit',
    });

    expect(prisma.documentRevision.create).not.toHaveBeenCalled();
  });

  test('does not perform an optimistic-concurrency check', async () => {
    // The CRDT already merged every concurrent edit, and this is the only writer
    // for a collaborative document. A baseRevision check here would reject valid
    // state, which is why the solo save route is not reused.
    await applyCollabSnapshot({ documentId: 'doc-1', snapshot: SNAPSHOT });

    expect(prisma.document.update.mock.calls[0][0].where).toEqual({
      id: 'doc-1',
    });
  });
});
