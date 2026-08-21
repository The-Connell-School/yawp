import { describe, expect, mock, test } from 'bun:test';
const prisma = { classAssignment: { findFirst: mock() } };
const requireUserId = mock();
const requireMembership = mock();
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
mock.module('~/domain/documents.server', () => ({
  createDocumentForAssignmentType: mock(),
  DocumentCreationError: class DocumentCreationError extends Error {},
}));

describe('GET /app/assignments/:assignmentId/start is a handled route', () => {
  test('route module exports a loader to handle GET (resource/data) requests', async () => {
    const mod = await import('./route');
    expect('loader' in mod).toBe(true);
  });
});

