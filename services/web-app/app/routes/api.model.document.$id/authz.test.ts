import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  matchesDocumentWhere,
  type ScopedDocument,
} from '~/utils/testing/where-eval';

const prisma = {
  user: { findUniqueOrThrow: mock() },
  document: {
    findUniqueOrThrow: mock(),
    findFirst: mock(),
    update: mock(),
  },
  documentWriteJournal: {
    create: mock(),
    findFirst: mock(),
    update: mock(),
  },
  documentRevision: { findFirst: mock(), create: mock() },
  submission: { findFirst: mock(), update: mock() },
  // No documentSnapshot mock on purpose: the model is gone from the schema and
  // `snapshot-guardrails.test.ts` fails any route file that names it. The route
  // reaches it through optional chaining inside a try/catch, so leaving it
  // undefined exercises the same non-fatal path.
};

const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/db.server.js', () => ({ prisma }));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server.js', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));

const { action } = await import('./route');

// Student B owns the document. Teacher T teaches a class B is enrolled in.
// Student A ('profile-a') is unrelated.
const DOC_B: ScopedDocument = {
  id: 'doc-b',
  membershipId: 'profile-b',
  teacherProfileIds: ['profile-teacher'],
};

const VICTIM_HTML = "<p>Student B's essay, mid-draft</p>";
const VICTIM_TEXT = "Student B's essay, mid-draft";

const documentRow = {
  id: DOC_B.id,
  membershipId: DOC_B.membershipId,
  title: 'B essay',
  html: VICTIM_HTML,
  text: VICTIM_TEXT,
  revision: 4,
};

function callAction(fields: Record<string, string>) {
  const body = new URLSearchParams(fields);
  return action({
    request: new Request(
      `https://example.com/api/model/document/${DOC_B.id}?from=test`,
      {
        method: 'PUT',
        body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    ),
    params: { id: DOC_B.id },
    context: {} as any,
  } as any) as Promise<any>;
}

describe('api.model.document.$id authorization ordering', () => {
  beforeEach(() => {
    for (const model of Object.values(prisma)) {
      for (const fn of Object.values(model)) {
        (fn as ReturnType<typeof mock>).mockReset();
      }
    }
    requireUserId.mockReset();
    requireMembership.mockReset();

    requireUserId.mockResolvedValue('user-a');
    prisma.user.findUniqueOrThrow.mockResolvedValue({ isAdmin: false });

    // Unscoped lookup: the database happily returns any row by primary key.
    prisma.document.findUniqueOrThrow.mockResolvedValue(documentRow);
    // Scoped lookup: the row comes back only when the query's own where clause
    // actually selects it.
    prisma.document.findFirst.mockImplementation(async ({ where }: any) =>
      matchesDocumentWhere(where, DOC_B) ? documentRow : null
    );

    prisma.documentWriteJournal.create.mockImplementation(
      async ({ data }: any) => ({ id: 'journal-1', ...data })
    );
    prisma.documentWriteJournal.findFirst.mockResolvedValue(null);
    prisma.documentWriteJournal.update.mockResolvedValue({ id: 'journal-1' });
    prisma.documentRevision.findFirst.mockResolvedValue(null);
    prisma.documentRevision.create.mockResolvedValue({ id: 'rev-1' });

    // Mirrors Prisma: an update whose where clause selects nothing throws P2025.
    prisma.document.update.mockImplementation(async ({ where, data }: any) => {
      if (!matchesDocumentWhere(where, DOC_B)) {
        throw Object.assign(new Error('Record to update not found.'), {
          code: 'P2025',
        });
      }
      return { ...documentRow, ...data, revision: documentRow.revision + 1 };
    });
  });

  test("writes nothing at all against another student's document", async () => {
    requireMembership.mockResolvedValue({ id: 'profile-a', role: 'STUDENT' });

    const response = await callAction({ title: 'renamed by A' });

    expect(response?.status).toBe(404);

    // The two writes that used to land before the predicate was ever consulted.
    // The journal row is the worse of the pair: with no html/text in the body it
    // is stamped with the caller's ids and carries the victim's current HTML.
    expect(prisma.documentWriteJournal.create).not.toHaveBeenCalled();
    expect(prisma.documentRevision.create).not.toHaveBeenCalled();
    expect(prisma.document.update).not.toHaveBeenCalled();
  });

  test("does not copy the victim's html into a journal row owned by the caller", async () => {
    requireMembership.mockResolvedValue({ id: 'profile-a', role: 'STUDENT' });

    await callAction({ title: 'renamed by A' });

    const journalWrites = prisma.documentWriteJournal.create.mock.calls.map(
      (call: any[]) => call[0]?.data
    );
    expect(
      journalWrites.some(
        (data: any) =>
          data?.membershipId === 'profile-a' && data?.html === VICTIM_HTML
      )
    ).toBe(false);
  });

  test('the owning student can still save', async () => {
    requireMembership.mockResolvedValue({ id: 'profile-b', role: 'STUDENT' });

    const response = await callAction({
      title: 'B renames it',
      html: '<p>new</p>',
      text: 'new',
    });

    expect(response?.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, revision: 5 });
    expect(prisma.documentWriteJournal.create).toHaveBeenCalledTimes(1);
    expect(prisma.document.update).toHaveBeenCalledTimes(1);
  });

  test("a teacher of the student's class can still save", async () => {
    requireMembership.mockResolvedValue({
      id: 'profile-teacher',
      role: 'TEACHER',
    });

    const response = await callAction({ html: '<p>teacher edit</p>' });

    expect(response?.status).toBe(200);
    expect(prisma.document.update).toHaveBeenCalledTimes(1);
  });

  test('a platform admin can still save', async () => {
    requireMembership.mockResolvedValue({ id: 'profile-admin', role: 'ADMIN' });
    prisma.user.findUniqueOrThrow.mockResolvedValue({ isAdmin: true });

    const response = await callAction({ title: 'admin fix' });

    expect(response?.status).toBe(200);
    expect(prisma.document.update).toHaveBeenCalledTimes(1);
  });
});
