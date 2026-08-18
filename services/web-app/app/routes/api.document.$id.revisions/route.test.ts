import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  matchesDocumentWhere,
  type ScopedDocument,
} from '~/utils/testing/where-eval';

const prisma = {
  user: { findUnique: mock() },
  document: { findFirst: mock() },
  documentRevision: { findMany: mock() },
  documentWriteJournal: { findMany: mock() },
};

const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));

const { loader } = await import('./route');

// Student B owns the document. Teacher T teaches a class B is enrolled in.
// Student A is an unrelated student in a different class.
const DOC_B: ScopedDocument = {
  id: 'doc-b',
  membershipId: 'profile-b',
  teacherProfileIds: ['profile-teacher'],
};

function makeRequest(docId: string) {
  return new Request(
    `https://example.com/api/document/${docId}/revisions?limit=50`
  );
}

function callLoader(docId: string) {
  return loader({
    request: makeRequest(docId),
    params: { id: docId },
    context: {} as any,
  } as any) as Promise<any>;
}

async function readBody(response: any) {
  return typeof response?.json === 'function' ? response.json() : response?.data;
}

function statusOf(response: any) {
  return response?.status ?? response?.init?.status ?? 200;
}

describe('api.document.$id.revisions authorization', () => {
  beforeEach(() => {
    for (const model of Object.values(prisma)) {
      for (const fn of Object.values(model)) {
        (fn as ReturnType<typeof mock>).mockReset();
      }
    }
    requireUserId.mockReset();
    requireMembership.mockReset();

    requireUserId.mockResolvedValue('user-1');
    prisma.user.findUnique.mockResolvedValue({ isAdmin: false });

    // Stands in for the database: the row comes back only when the query's own
    // where clause actually selects it.
    prisma.document.findFirst.mockImplementation(async ({ where }: any) =>
      matchesDocumentWhere(where, DOC_B) ? { id: DOC_B.id } : null
    );
    prisma.documentRevision.findMany.mockImplementation(async ({ where }: any) =>
      where?.documentId === DOC_B.id
        ? [
            {
              id: 'rev-1',
              createdAt: new Date('2026-01-01T00:00:00Z'),
              trigger: 'submit',
              html: "<p>Student B's essay</p>",
              text: "Student B's essay",
            },
          ]
        : []
    );
    prisma.documentWriteJournal.findMany.mockImplementation(
      async ({ where }: any) =>
        where?.documentId === DOC_B.id
          ? [
              {
                id: 'j-1',
                createdAt: new Date('2026-01-02T00:00:00Z'),
                eventType: 'document.autosave',
                source: 'tutor-pre-respond',
                html: '<p>pre-tutor snapshot</p>',
                text: 'pre-tutor snapshot',
                htmlHash: 'hash-1',
              },
            ]
          : []
    );
  });

  test("refuses another student's revision history", async () => {
    requireMembership.mockResolvedValue({ id: 'profile-a', role: 'STUDENT' });

    const response = await callLoader('doc-b');
    const body = await readBody(response);

    expect(statusOf(response)).toBe(404);
    expect(body?.entries).toBeUndefined();
    expect(prisma.documentRevision.findMany).not.toHaveBeenCalled();
    expect(prisma.documentWriteJournal.findMany).not.toHaveBeenCalled();
  });

  test('returns the history to the student who owns the document', async () => {
    requireMembership.mockResolvedValue({ id: 'profile-b', role: 'STUDENT' });

    const response = await callLoader('doc-b');
    const body = await readBody(response);

    expect(statusOf(response)).toBe(200);
    expect(body.entries).toHaveLength(2);
    expect(body.entries.map((entry: any) => entry.id)).toContain('rev-1');
  });

  test('returns the history to a teacher of the class the student is in', async () => {
    requireMembership.mockResolvedValue({
      id: 'profile-teacher',
      role: 'TEACHER',
    });

    const response = await callLoader('doc-b');
    const body = await readBody(response);

    expect(statusOf(response)).toBe(200);
    expect(body.entries.length).toBeGreaterThan(0);
  });
});
