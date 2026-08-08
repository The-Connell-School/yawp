import { describe, expect, mock, test } from 'bun:test';
import { matchesDocumentWhere, type ScopedDocument } from './testing/where-eval';

mock.module('~/utils/db.server', () => ({ prisma: {} }));
mock.module('./db.server', () => ({ prisma: {} }));

const {
  documentReadWhere,
  documentOwnerWhere,
  documentOwnerSessionWhere,
  documentCommentReadWhere,
} = await import('./document-access.server');

/**
 * The behaviour lock for the four pre-existing helpers.
 *
 * Requirement: after collaborators exist, every existing caller of `documentReadWhere`
 * must behave IDENTICALLY for a document that has no collaborators. This file is that
 * proof. It evaluates each helper's clause against fixture rows carrying no collaborator
 * relation at all, and asserts the full allow/deny matrix. If a later change to the
 * collaborator arm accidentally widens the no-collaborator case, these fail.
 */

const OWNER = 'profile-owner';
const TEACHER = 'profile-teacher';
const STRANGER = 'profile-stranger';
const OTHER_TEACHER = 'profile-other-teacher';

/** A plain, unshared document: owned by OWNER, whose class is taught by TEACHER. */
const PLAIN_DOC: ScopedDocument = {
  id: 'doc-plain',
  membershipId: OWNER,
  teacherProfileIds: [TEACHER],
};

describe('documentReadWhere — unshared documents behave exactly as before', () => {
  test('the owner is allowed', () => {
    expect(
      matchesDocumentWhere(documentReadWhere({ profileId: OWNER }), PLAIN_DOC)
    ).toBe(true);
  });

  test("a teacher of the owner's class is allowed", () => {
    expect(
      matchesDocumentWhere(documentReadWhere({ profileId: TEACHER }), PLAIN_DOC)
    ).toBe(true);
  });

  test('an unrelated student is refused', () => {
    expect(
      matchesDocumentWhere(
        documentReadWhere({ profileId: STRANGER }),
        PLAIN_DOC
      )
    ).toBe(false);
  });

  test("a teacher who does not teach the owner's class is refused", () => {
    expect(
      matchesDocumentWhere(
        documentReadWhere({ profileId: OTHER_TEACHER }),
        PLAIN_DOC
      )
    ).toBe(false);
  });

  test('a platform admin is allowed, via an empty clause', () => {
    const where = documentReadWhere({ profileId: STRANGER, isAdmin: true });
    expect(where).toEqual({});
    expect(matchesDocumentWhere(where, PLAIN_DOC)).toBe(true);
  });
});

describe('documentOwnerWhere — never widened by collaborators', () => {
  test('the owner is allowed', () => {
    expect(
      matchesDocumentWhere(documentOwnerWhere({ profileId: OWNER }), PLAIN_DOC)
    ).toBe(true);
  });

  test("a teacher of the owner's class is refused", () => {
    expect(
      matchesDocumentWhere(documentOwnerWhere({ profileId: TEACHER }), PLAIN_DOC)
    ).toBe(false);
  });

  test('a stranger is refused', () => {
    expect(
      matchesDocumentWhere(
        documentOwnerWhere({ profileId: STRANGER }),
        PLAIN_DOC
      )
    ).toBe(false);
  });

});

describe('documentOwnerSessionWhere', () => {
  const session = { id: 'cms-1', document: PLAIN_DOC };

  test('the owner is allowed', async () => {
    const { matchesSessionWhere } = await import('./testing/where-eval');
    expect(
      matchesSessionWhere(documentOwnerSessionWhere({ profileId: OWNER }), session)
    ).toBe(true);
  });

  test('a teacher is refused — teachers never write tutor dialogue', async () => {
    const { matchesSessionWhere } = await import('./testing/where-eval');
    expect(
      matchesSessionWhere(
        documentOwnerSessionWhere({ profileId: TEACHER }),
        session
      )
    ).toBe(false);
  });
});

describe('documentCommentReadWhere', () => {
  function documentClauseOf(where: any) {
    return where?.document?.is;
  }

  test('the owner may read comments', () => {
    expect(
      matchesDocumentWhere(
        documentClauseOf(documentCommentReadWhere({ profileId: OWNER })),
        PLAIN_DOC
      )
    ).toBe(true);
  });

  test('a teacher may read comments', () => {
    expect(
      matchesDocumentWhere(
        documentClauseOf(documentCommentReadWhere({ profileId: TEACHER })),
        PLAIN_DOC
      )
    ).toBe(true);
  });

  test('a stranger may not', () => {
    expect(
      matchesDocumentWhere(
        documentClauseOf(documentCommentReadWhere({ profileId: STRANGER })),
        PLAIN_DOC
      )
    ).toBe(false);
  });
});

describe('the undefined-profileId hole is closed', () => {
  // Prisma drops undefined filter values, so `{ membershipId: undefined }` degrades to
  // `{}` and matches every document in the table.
  for (const [name, fn] of Object.entries({
    documentReadWhere,
    documentOwnerWhere,
    documentOwnerSessionWhere,
    documentCommentReadWhere,
  })) {
    test(`${name} throws rather than returning a global read`, () => {
      expect(() => fn({ profileId: undefined as any })).toThrow(
        /requires a non-empty profileId/
      );
      expect(() => fn({ profileId: '' })).toThrow(
        /requires a non-empty profileId/
      );
    });
  }
});
