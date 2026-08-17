import { describe, expect, test } from 'bun:test';
import {
  documentAuthorWhere,
  documentOwnerWhere,
  documentReadWhere,
} from './document-access.server';
import { matchesDocumentWhere, type ScopedDocument } from './testing/where-eval';

const OWNER = 'membership-owner';
const CO_AUTHOR = 'membership-co-author';
const MOVED_AWAY = 'membership-moved-away';
const CLASSMATE = 'membership-classmate';
const TEACHER = 'membership-teacher';

/** A document with no collaboration group — the shape every existing row has. */
const soloDocument: ScopedDocument = {
  id: 'doc-solo',
  membershipId: OWNER,
  teacherProfileIds: [TEACHER],
};

/**
 * A document owned by OWNER and co-authored by CO_AUTHOR. MOVED_AWAY was in the
 * group and has been removed; CLASSMATE is in the same class but never joined.
 */
const groupDocument: ScopedDocument = {
  id: 'doc-group',
  membershipId: OWNER,
  teacherProfileIds: [TEACHER],
  activeGroupMemberIds: [OWNER, CO_AUTHOR],
  removedGroupMemberIds: [MOVED_AWAY],
};

const matches = (where: unknown, doc: ScopedDocument) =>
  matchesDocumentWhere(where, doc);

describe('documentAuthorWhere', () => {
  test('the owner may write to their own solo document', () => {
    expect(
      matches(documentAuthorWhere({ profileId: OWNER }), soloDocument)
    ).toBe(true);
  });

  test('a solo document is writable by nobody but its owner', () => {
    for (const other of [CO_AUTHOR, CLASSMATE, MOVED_AWAY]) {
      expect(
        matches(documentAuthorWhere({ profileId: other }), soloDocument)
      ).toBe(false);
    }
  });

  test('an active co-author may write to the group document', () => {
    expect(
      matches(documentAuthorWhere({ profileId: CO_AUTHOR }), groupDocument)
    ).toBe(true);
  });

  test('the owner may still write to the group document', () => {
    expect(
      matches(documentAuthorWhere({ profileId: OWNER }), groupDocument)
    ).toBe(true);
  });

  test('a classmate who is not in the group may not write', () => {
    expect(
      matches(documentAuthorWhere({ profileId: CLASSMATE }), groupDocument)
    ).toBe(false);
  });

  test('a student removed from the group loses write access', () => {
    expect(
      matches(documentAuthorWhere({ profileId: MOVED_AWAY }), groupDocument)
    ).toBe(false);
  });

  test('a teacher of the class may not write, even to a group document', () => {
    // Deliberate, and the same rule documentOwnerWhere encodes: a teacher
    // writing into student work would fabricate it. Teachers read via
    // documentReadWhere instead.
    expect(
      matches(documentAuthorWhere({ profileId: TEACHER }), groupDocument)
    ).toBe(false);
    expect(
      matches(documentAuthorWhere({ profileId: TEACHER }), soloDocument)
    ).toBe(false);
  });

  test('a platform admin is unscoped, matching the other predicates', () => {
    const where = documentAuthorWhere({ profileId: 'nobody', isAdmin: true });
    expect(where).toEqual({});
    expect(matches(where, groupDocument)).toBe(true);
  });
});

describe('documentOwnerWhere is unchanged by collaboration', () => {
  test('a co-author does not gain owner-scoped access', () => {
    // Owner scope guards the student's own record — tutor conversations and
    // module progress. Widening it to co-authors would let one student write
    // dialogue attributed to their partner.
    expect(
      matches(documentOwnerWhere({ profileId: CO_AUTHOR }), groupDocument)
    ).toBe(false);
    expect(
      matches(documentOwnerWhere({ profileId: OWNER }), groupDocument)
    ).toBe(true);
  });
});

describe('documentReadWhere', () => {
  test('the owner and their teacher may read', () => {
    expect(matches(documentReadWhere({ profileId: OWNER }), soloDocument)).toBe(
      true
    );
    expect(
      matches(documentReadWhere({ profileId: TEACHER }), soloDocument)
    ).toBe(true);
  });

  test('an unrelated student may not read', () => {
    expect(
      matches(documentReadWhere({ profileId: CLASSMATE }), soloDocument)
    ).toBe(false);
  });

  test('a co-author may read the group document', () => {
    expect(
      matches(documentReadWhere({ profileId: CO_AUTHOR }), groupDocument)
    ).toBe(true);
  });

  test('a classmate outside the group may not read it', () => {
    expect(
      matches(documentReadWhere({ profileId: CLASSMATE }), groupDocument)
    ).toBe(false);
  });
});
