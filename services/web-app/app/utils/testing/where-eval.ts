/**
 * A deliberately tiny evaluator for the subset of Prisma `where` clauses the
 * document-authorization tests care about.
 *
 * Authorization tests that only assert "the route passed the right where object" pass
 * just as happily against a route that never filters at all — the assertion is written
 * after the fix and never sees the vulnerable behaviour. Feeding the where clause
 * through this evaluator against a fixture row instead means a route with no ownership
 * predicate really does return another student's row, which is what the failing test is
 * supposed to demonstrate before the fix lands.
 *
 * Unrecognized keys (deletedAt, status, createdAt cursors, ...) are ignored: they are
 * not access controls, and ignoring them keeps a fixture row matching regardless of
 * pagination filters.
 */

export type ScopedDocument = {
  id: string;
  /** Membership id of the student who owns the document. */
  membershipId: string;
  /** Membership ids of teachers who teach a class this student is enrolled in. */
  teacherProfileIds: string[];
  /**
   * The ClassAssignment this document was started from, or null for a practice /
   * assignment-type-only document. A document with no class assignment can never satisfy
   * the collaborator arm, which is what makes practice work structurally unshareable.
   */
  classAssignmentId: string | null;
  /**
   * Membership ids holding a LIVE (revokedAt: null) DocumentCollaborator row on this
   * document. A revoked collaborator is simply absent from this list.
   */
  collaboratorMembershipIds: string[];
  /**
   * Membership ids currently enrolled as students in the class this document's
   * ClassAssignment belongs to. Empty when classAssignmentId is null.
   *
   * These three fields are REQUIRED, not optional, on purpose. `matchesDocumentWhere`
   * ignores keys it does not recognize (see the `default: break` below), so a fixture
   * that omitted the collaborator shape would make an unguarded route evaluate TRUE and
   * every sharing authorization test would pass against completely vulnerable code —
   * the exact failure this evaluator exists to prevent. Making the fields required turns
   * that into a compile error in every fixture instead.
   */
  enrolledStudentIds: string[];
};

export function matchesDocumentWhere(
  where: unknown,
  doc: ScopedDocument
): boolean {
  if (!where || typeof where !== 'object') return true;

  for (const [key, value] of Object.entries(where as Record<string, unknown>)) {
    switch (key) {
      case 'id':
        if (value !== doc.id) return false;
        break;
      case 'membershipId':
        if (value !== doc.membershipId) return false;
        break;
      case 'OR':
        if (
          !Array.isArray(value) ||
          !value.some((clause) => matchesDocumentWhere(clause, doc))
        ) {
          return false;
        }
        break;
      case 'AND':
        if (
          !Array.isArray(value) ||
          !value.every((clause) => matchesDocumentWhere(clause, doc))
        ) {
          return false;
        }
        break;
      case 'membership': {
        const teacherId = (value as any)?.classesAsStudent?.some?.teachers?.some
          ?.id;
        if (typeof teacherId !== 'string') return false;
        if (!doc.teacherProfileIds.includes(teacherId)) return false;
        break;
      }
      case 'classAssignmentId':
        if (value !== doc.classAssignmentId) return false;
        break;
      case 'collaborators': {
        // The only shapes this rule is allowed to take are
        //   { some: { membershipId, revokedAt: null } }  — the collaborator arm
        //   { none: { revokedAt: null } }                — "this document is not shared"
        // Anything else is refused rather than ignored: a clause this evaluator does not
        // understand must never silently pass.
        const some = (value as any)?.some;
        const none = (value as any)?.none;

        if (none) {
          if (none.revokedAt !== null) return false;
          if (doc.collaboratorMembershipIds.length > 0) return false;
          break;
        }

        if (!some || typeof some.membershipId !== 'string') return false;
        // An arm that forgot `revokedAt: null` would keep granting access to a
        // collaborator whose invite was withdrawn. Fail it here rather than in production.
        if (some.revokedAt !== null) return false;
        if (!doc.collaboratorMembershipIds.includes(some.membershipId)) {
          return false;
        }
        break;
      }
      case 'classAssignment': {
        // `{ is: { class: { is: { students: { some: { id } } } } } }` — the live
        // enrollment re-check that rides alongside every collaborator row.
        const studentId = (value as any)?.is?.class?.is?.students?.some?.id;
        if (typeof studentId !== 'string') return false;
        // A relation filter against a NULL relation never matches in Prisma.
        if (doc.classAssignmentId === null) return false;
        if (!doc.enrolledStudentIds.includes(studentId)) return false;
        break;
      }
      default:
        break;
    }
  }

  return true;
}

export type ScopedSubmission = {
  id: string;
  /**
   * Who pressed Submit. NULL on every row written before collaborators existed, and it
   * means "the document's owner". A predicate that forgets the NULL case silently
   * detaches every historical submission from its student, so the evaluator models it
   * rather than letting fixtures pretend the column is always set.
   */
  submittedByMembershipId: string | null;
  unsubmittedAt: Date | null;
  document: ScopedDocument;
};

/**
 * Evaluates the `where` clause the submission-ownership routes (unsubmit, release) hand
 * to Prisma against a fixture submission.
 *
 * Same reasoning as `matchesDocumentWhere`: asserting the clause's SHAPE passes just as
 * happily against a predicate keyed on the document owner, which on a shared document
 * would let one group member withdraw a teammate's submission.
 */
export function matchesSubmissionWhere(
  where: unknown,
  submission: ScopedSubmission
): boolean {
  if (!where || typeof where !== 'object') return true;

  for (const [key, value] of Object.entries(where as Record<string, unknown>)) {
    switch (key) {
      case 'id':
        if (value !== submission.id) return false;
        break;
      case 'submittedByMembershipId':
        if (value !== submission.submittedByMembershipId) return false;
        break;
      case 'unsubmittedAt':
        if (value === null && submission.unsubmittedAt !== null) return false;
        break;
      case 'document': {
        const nested = (value as any)?.is ?? value;
        if (!matchesDocumentWhere(nested, submission.document)) return false;
        break;
      }
      case 'NOT':
        if (matchesSubmissionWhere(value, submission)) return false;
        break;
      case 'OR':
        if (
          !Array.isArray(value) ||
          !value.some((clause) => matchesSubmissionWhere(clause, submission))
        ) {
          return false;
        }
        break;
      case 'AND':
        if (
          !Array.isArray(value) ||
          !value.every((clause) => matchesSubmissionWhere(clause, submission))
        ) {
          return false;
        }
        break;
      default:
        break;
    }
  }

  return true;
}

export type ScopedMembership = {
  id: string;
  organizationId: string;
  isOrgOwner: boolean;
};

export type ScopedUser = {
  id: string;
  memberships: ScopedMembership[];
};

/**
 * Evaluates the `where` clause `requireOwner` hands to `prisma.user.findFirst`
 * against a fixture user.
 *
 * Same reasoning as `matchesDocumentWhere`: asserting on the shape of the clause would
 * pass against the pre-fix `{ memberships: { some: { isOrgOwner: true } } }` just as
 * happily as against a clause that pins the owner membership to the active one. Running
 * the clause against a user who owns one organization and merely belongs to another is
 * what makes the cross-organization escalation observable.
 */
export function matchesOwnerWhere(where: unknown, user: ScopedUser): boolean {
  if (!where || typeof where !== 'object') return true;

  for (const [key, value] of Object.entries(where as Record<string, unknown>)) {
    switch (key) {
      case 'id':
        if (value !== user.id) return false;
        break;
      case 'memberships': {
        const some = (value as any)?.some;
        if (!some || typeof some !== 'object') return false;
        const matched = user.memberships.some((membership) =>
          Object.entries(some as Record<string, unknown>).every(
            ([field, expected]) =>
              (membership as Record<string, unknown>)[field] === expected
          )
        );
        if (!matched) return false;
        break;
      }
      default:
        break;
    }
  }

  return true;
}

export type ScopedSession = {
  id: string;
  document: ScopedDocument;
};

export function matchesSessionWhere(
  where: unknown,
  session: ScopedSession
): boolean {
  if (!where || typeof where !== 'object') return true;

  for (const [key, value] of Object.entries(where as Record<string, unknown>)) {
    switch (key) {
      case 'id':
        if (value !== session.id) return false;
        break;
      case 'documentId':
        if (value !== session.document.id) return false;
        break;
      case 'document': {
        const nested = (value as any)?.is ?? value;
        if (!matchesDocumentWhere(nested, session.document)) return false;
        break;
      }
      case 'OR':
        if (
          !Array.isArray(value) ||
          !value.some((clause) => matchesSessionWhere(clause, session))
        ) {
          return false;
        }
        break;
      case 'AND':
        if (
          !Array.isArray(value) ||
          !value.every((clause) => matchesSessionWhere(clause, session))
        ) {
          return false;
        }
        break;
      default:
        break;
    }
  }

  return true;
}

export type ScopedClass = {
  id: string;
  /** The enrollment code a student types in. Unique per school, not globally. */
  code: string;
  isArchived: boolean;
  /** Organization that owns the class's school. */
  organizationId: string;
};

/**
 * Evaluates the `where` clause the `/enter-code` route hands to `prisma.class.findMany`
 * and `prisma.class.findFirst` against a fixture class row.
 *
 * Same reasoning as the evaluators above. Asserting on the clause's shape would pass
 * against the pre-fix `{ id, isArchived: false }` just as happily as against a clause
 * that also re-checks the submitted code and the caller's organization. Running the
 * clause against a fixture set that holds a same-code class in another organization is
 * what makes the enrollment bypass and the cross-tenant collision observable.
 */
export function matchesClassWhere(where: unknown, klass: ScopedClass): boolean {
  if (!where || typeof where !== 'object') return true;

  for (const [key, value] of Object.entries(where as Record<string, unknown>)) {
    switch (key) {
      case 'id':
        if (value !== klass.id) return false;
        break;
      case 'isArchived':
        if (value !== klass.isArchived) return false;
        break;
      case 'code': {
        if (typeof value === 'string') {
          if (value !== klass.code) return false;
          break;
        }
        const equals = (value as any)?.equals;
        if (typeof equals !== 'string') return false;
        const matched =
          (value as any)?.mode === 'insensitive'
            ? equals.toLowerCase() === klass.code.toLowerCase()
            : equals === klass.code;
        if (!matched) return false;
        break;
      }
      case 'school': {
        const nested = ((value as any)?.is ?? value) as Record<string, unknown>;
        if (!nested || typeof nested !== 'object') return false;
        if (
          'organizationId' in nested &&
          nested.organizationId !== klass.organizationId
        ) {
          return false;
        }
        if ('organization' in nested) {
          const org = ((nested.organization as any)?.is ??
            nested.organization) as Record<string, unknown>;
          if (org?.id !== undefined && org.id !== klass.organizationId) {
            return false;
          }
        }
        break;
      }
      case 'OR':
        if (
          !Array.isArray(value) ||
          !value.some((clause) => matchesClassWhere(clause, klass))
        ) {
          return false;
        }
        break;
      case 'AND':
        if (
          !Array.isArray(value) ||
          !value.every((clause) => matchesClassWhere(clause, klass))
        ) {
          return false;
        }
        break;
      default:
        break;
    }
  }

  return true;
}
