import { describe, expect, mock, test } from 'bun:test';
import {
  matchesDocumentWhere,
  matchesSessionWhere,
  matchesSubmissionWhere,
  type ScopedDocument,
  type ScopedSubmission,
} from './testing/where-eval';

mock.module('~/utils/db.server', () => ({ prisma: {} }));
mock.module('./db.server', () => ({ prisma: {} }));

const {
  documentReadWhere,
  documentOwnerWhere,
  documentOwnerAndTeacherWhere,
  documentOwnerSessionWhere,
  documentGroupWhere,
  documentGroupSessionWhere,
  documentCommentReadWhere,
  effectiveSubmitterWhere,
  effectiveSubmitterId,
  submissionsVisibleToViewerWhere,
  unsharedDocumentWhere,
} = await import('./document-access.server');

/**
 * Both directions, every rule.
 *
 * Every assertion here runs the helper's OWN clause through where-eval against a fixture
 * row. Asserting the clause's shape instead would pass against code with no predicate at
 * all — the failure mode where-eval.ts exists to prevent — and would pass identically
 * against the pre-change code, proving nothing about the feature.
 */

const OWNER = 'profile-owner';
const TEACHER = 'profile-teacher';
const STRANGER = 'profile-stranger';
const COLLABORATOR = 'profile-collaborator';
const COLLABORATORS_OWN_TEACHER = 'profile-collab-teacher';

/** An unshared document, for the "nothing changed" half of the contract. */
const PLAIN_DOC: ScopedDocument = {
  id: 'doc-plain',
  membershipId: OWNER,
  teacherProfileIds: [TEACHER],
  classAssignmentId: 'class-assignment-1',
  collaboratorMembershipIds: [],
  enrolledStudentIds: [OWNER],
};

/**
 * GBA 300 group work: OWNER invited COLLABORATOR, both are enrolled in the class the
 * document is assigned to, and TEACHER teaches that class.
 */
const SHARED_DOC: ScopedDocument = {
  id: 'doc-shared',
  membershipId: OWNER,
  teacherProfileIds: [TEACHER],
  classAssignmentId: 'class-assignment-1',
  collaboratorMembershipIds: [COLLABORATOR],
  enrolledStudentIds: [OWNER, COLLABORATOR],
};

/** The invite was withdrawn, so no live collaborator row survives. */
const REVOKED_DOC: ScopedDocument = {
  ...SHARED_DOC,
  id: 'doc-revoked',
  collaboratorMembershipIds: [],
};

/** The collaborator row is live, but the collaborator has left the class. */
const UNENROLLED_DOC: ScopedDocument = {
  ...SHARED_DOC,
  id: 'doc-unenrolled',
  enrolledStudentIds: [OWNER],
};

/**
 * Practice work, or a document whose ClassAssignment was deleted (that FK is SetNull).
 * There is no class to check enrollment against, so the arm can never be satisfied.
 */
const PRACTICE_DOC: ScopedDocument = {
  ...SHARED_DOC,
  id: 'doc-practice',
  classAssignmentId: null,
  enrolledStudentIds: [],
};

const bodyRules = {
  'documentReadWhere (editor loader, save, PUT, revision history)':
    documentReadWhere,
  'documentGroupWhere (tutor, module progress, paste alerts)': documentGroupWhere,
};

for (const [label, rule] of Object.entries(bodyRules)) {
  describe(`the collaborator arm — ${label}`, () => {
    test('ALLOWS a live, still-enrolled collaborator', () => {
      expect(
        matchesDocumentWhere(rule({ profileId: COLLABORATOR }), SHARED_DOC)
      ).toBe(true);
    });

    test('ALLOWS the owner, unchanged', () => {
      expect(matchesDocumentWhere(rule({ profileId: OWNER }), SHARED_DOC)).toBe(
        true
      );
    });

    test('REFUSES a student who holds no collaborator row', () => {
      expect(
        matchesDocumentWhere(rule({ profileId: STRANGER }), SHARED_DOC)
      ).toBe(false);
    });

    test('REFUSES a collaborator whose invite was revoked', () => {
      expect(
        matchesDocumentWhere(rule({ profileId: COLLABORATOR }), REVOKED_DOC)
      ).toBe(false);
    });

    test('REFUSES a collaborator who has left the class', () => {
      // Enrollment is re-derived on every query rather than trusted from the invite
      // row, so a transfer or a drop takes effect on the collaborator's very next
      // request — no roster hook, no cleanup job, no stale-row sweep.
      expect(
        matchesDocumentWhere(rule({ profileId: COLLABORATOR }), UNENROLLED_DOC)
      ).toBe(false);
    });

    test('REFUSES on a document with no class assignment', () => {
      expect(
        matchesDocumentWhere(rule({ profileId: COLLABORATOR }), PRACTICE_DOC)
      ).toBe(false);
    });

    test('REFUSES a collaborator of some OTHER document', () => {
      // The arm must not leak sideways: a document that HAS collaborators must not
      // thereby be readable by anyone who collaborates on anything.
      expect(
        matchesDocumentWhere(
          rule({ profileId: 'profile-other-collaborator' }),
          SHARED_DOC
        )
      ).toBe(false);
    });

    test('behaves identically on an UNSHARED document', () => {
      expect(matchesDocumentWhere(rule({ profileId: OWNER }), PLAIN_DOC)).toBe(
        true
      );
      expect(
        matchesDocumentWhere(rule({ profileId: STRANGER }), PLAIN_DOC)
      ).toBe(false);
      expect(
        matchesDocumentWhere(rule({ profileId: COLLABORATOR }), PLAIN_DOC)
      ).toBe(false);
    });
  });
}

describe('teacher reach is unchanged', () => {
  test("a collaborator's own teacher gains nothing", () => {
    // The teacher arm keys on Document.membership — the OWNER's enrollments — and
    // collaborators never appear in it. Sharing across two sections therefore grants
    // the other section's teacher exactly zero new access.
    expect(
      matchesDocumentWhere(
        documentReadWhere({ profileId: COLLABORATORS_OWN_TEACHER }),
        SHARED_DOC
      )
    ).toBe(false);
  });

  test("the owner's teacher still reads the document", () => {
    expect(
      matchesDocumentWhere(documentReadWhere({ profileId: TEACHER }), SHARED_DOC)
    ).toBe(true);
  });

  test('documentGroupWhere still excludes teachers', () => {
    // Teachers must never drive a tutor session or file a paste alert; that is why
    // those gates were owner-only. Widening them to the group must not widen them to
    // teachers as a side effect.
    expect(
      matchesDocumentWhere(documentGroupWhere({ profileId: TEACHER }), SHARED_DOC)
    ).toBe(false);
  });
});

describe('destructive capabilities are NOT shared', () => {
  test('documentOwnerWhere refuses a collaborator — archive and soft delete', () => {
    expect(
      matchesDocumentWhere(
        documentOwnerWhere({ profileId: COLLABORATOR }),
        SHARED_DOC
      )
    ).toBe(false);
    expect(
      matchesDocumentWhere(documentOwnerWhere({ profileId: OWNER }), SHARED_DOC)
    ).toBe(true);
  });

  test('documentOwnerSessionWhere is NOT widened; documentGroupSessionWhere is', () => {
    const session = { id: 'cms-1', document: SHARED_DOC };
    expect(
      matchesSessionWhere(
        documentOwnerSessionWhere({ profileId: COLLABORATOR }),
        session
      )
    ).toBe(false);
    expect(
      matchesSessionWhere(
        documentGroupSessionWhere({ profileId: COLLABORATOR }),
        session
      )
    ).toBe(true);
    expect(
      matchesSessionWhere(
        documentGroupSessionWhere({ profileId: TEACHER }),
        session
      )
    ).toBe(false);
  });
});

describe('teacher feedback comments do NOT become group-visible', () => {
  const clauseFor = (profileId: string) =>
    (documentCommentReadWhere({ profileId }) as any)?.document?.is;

  test('the owner and the teacher may read the thread', () => {
    expect(matchesDocumentWhere(clauseFor(OWNER), SHARED_DOC)).toBe(true);
    expect(matchesDocumentWhere(clauseFor(TEACHER), SHARED_DOC)).toBe(true);
  });

  test('a collaborator may not', () => {
    // documentCommentReadWhere used to be literally
    // `{ document: { is: documentReadWhere(...) } }`, so widening the read rule would
    // have handed the whole group every teacher remark about the owner — a
    // teacher-to-student grading conversation going group-visible with no line in the
    // diff that says so. It is pinned to documentOwnerAndTeacherWhere for that reason.
    expect(matchesDocumentWhere(clauseFor(COLLABORATOR), SHARED_DOC)).toBe(false);
  });

  test('documentOwnerAndTeacherWhere reproduces the pre-collaborator rule exactly', () => {
    expect(
      matchesDocumentWhere(
        documentOwnerAndTeacherWhere({ profileId: COLLABORATOR }),
        SHARED_DOC
      )
    ).toBe(false);
    expect(
      matchesDocumentWhere(
        documentOwnerAndTeacherWhere({ profileId: OWNER }),
        SHARED_DOC
      )
    ).toBe(true);
    expect(
      matchesDocumentWhere(
        documentOwnerAndTeacherWhere({ profileId: TEACHER }),
        SHARED_DOC
      )
    ).toBe(true);
  });
});

describe('unsharedDocumentWhere', () => {
  test('separates solo work from group work', () => {
    expect(matchesDocumentWhere(unsharedDocumentWhere(), PLAIN_DOC)).toBe(true);
    expect(matchesDocumentWhere(unsharedDocumentWhere(), SHARED_DOC)).toBe(false);
  });
});

describe('the undefined-profileId hole stays closed on the new helpers', () => {
  test('every collaborator-aware helper throws on an empty profileId', () => {
    for (const fn of [
      documentGroupWhere,
      documentGroupSessionWhere,
      documentOwnerAndTeacherWhere,
    ]) {
      expect(() => fn({ profileId: undefined as any })).toThrow(
        /requires a non-empty profileId/
      );
      expect(() => fn({ profileId: '' })).toThrow(
        /requires a non-empty profileId/
      );
    }
    expect(() => effectiveSubmitterWhere('')).toThrow(
      /requires a non-empty profileId/
    );
  });
});

// ---------------------------------------------------------------------------
// The submission stays per-student even though the document is shared
// ---------------------------------------------------------------------------

const OWNERS_SUBMISSION: ScopedSubmission = {
  id: 'sub-owner',
  submittedByMembershipId: OWNER,
  unsubmittedAt: null,
  document: SHARED_DOC,
};

const COLLABORATORS_SUBMISSION: ScopedSubmission = {
  id: 'sub-collab',
  submittedByMembershipId: COLLABORATOR,
  unsubmittedAt: null,
  document: SHARED_DOC,
};

/** Written before the column existed. NULL means the document's owner. */
const LEGACY_SUBMISSION: ScopedSubmission = {
  id: 'sub-legacy',
  submittedByMembershipId: null,
  unsubmittedAt: null,
  document: SHARED_DOC,
};

describe('effectiveSubmitterWhere', () => {
  test('matches my own submission', () => {
    expect(
      matchesSubmissionWhere(effectiveSubmitterWhere(OWNER), OWNERS_SUBMISSION)
    ).toBe(true);
  });

  test('matches a legacy NULL row for the document owner — no backfill needed', () => {
    expect(
      matchesSubmissionWhere(effectiveSubmitterWhere(OWNER), LEGACY_SUBMISSION)
    ).toBe(true);
  });

  test("refuses a teammate's submission on a document I own", () => {
    // Unsubmit runs on this clause. Owning the document is not owning the submission:
    // a share must not let one member withdraw another member's work.
    expect(
      matchesSubmissionWhere(
        effectiveSubmitterWhere(OWNER),
        COLLABORATORS_SUBMISSION
      )
    ).toBe(false);
  });

  test("refuses the owner's submission when the caller is the collaborator", () => {
    expect(
      matchesSubmissionWhere(
        effectiveSubmitterWhere(COLLABORATOR),
        OWNERS_SUBMISSION
      )
    ).toBe(false);
  });

  test('refuses a legacy NULL row for a collaborator — NULL means the OWNER', () => {
    expect(
      matchesSubmissionWhere(
        effectiveSubmitterWhere(COLLABORATOR),
        LEGACY_SUBMISSION
      )
    ).toBe(false);
  });
});

describe('effectiveSubmitterId', () => {
  test('reads the stamped submitter', () => {
    expect(effectiveSubmitterId(COLLABORATORS_SUBMISSION)).toBe(COLLABORATOR);
  });

  test('falls back to the document owner on a legacy row', () => {
    expect(effectiveSubmitterId(LEGACY_SUBMISSION)).toBe(OWNER);
  });
});

describe('submissionsVisibleToViewerWhere', () => {
  test('a student sees only their own submissions on a shared document', () => {
    const where = submissionsVisibleToViewerWhere({
      profileId: COLLABORATOR,
      role: 'STUDENT',
    });
    expect(matchesSubmissionWhere(where, COLLABORATORS_SUBMISSION)).toBe(true);
    // The leak this closes: submissions hang off the document, so without this every
    // group member reads every teammate's submittedAt / gradedAt / releasedAt off
    // their own editor page.
    expect(matchesSubmissionWhere(where, OWNERS_SUBMISSION)).toBe(false);
    expect(matchesSubmissionWhere(where, LEGACY_SUBMISSION)).toBe(false);
  });

  test('a teacher sees the whole list — grading depends on it', () => {
    const where = submissionsVisibleToViewerWhere({
      profileId: TEACHER,
      role: 'TEACHER',
    });
    expect(where).toEqual({});
    expect(matchesSubmissionWhere(where, OWNERS_SUBMISSION)).toBe(true);
    expect(matchesSubmissionWhere(where, COLLABORATORS_SUBMISSION)).toBe(true);
  });

  test('a platform admin sees the whole list', () => {
    const where = submissionsVisibleToViewerWhere({
      profileId: STRANGER,
      role: 'STUDENT',
      isAdmin: true,
    });
    expect(where).toEqual({});
  });
});
