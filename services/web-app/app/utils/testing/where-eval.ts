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
  artifactKind?: 'STUDENT' | 'ASSIGNMENT_GROUP';
  /** Membership id of the student who owns the document. */
  membershipId: string | null;
  /** Membership ids of teachers who teach a class this student is enrolled in. */
  teacherProfileIds: string[];
  /** Teachers attached to the document's own ClassAssignment. */
  classAssignmentTeacherProfileIds?: string[];
  /** Scheduled visibility for the document's deployment. */
  classAssignmentPostAt?: Date | null;
  /**
   * Membership ids of students who co-author this document through its
   * collaboration group and have NOT been removed from it. Absent on a
   * single-author document, which is the shape every existing document has.
   */
  activeGroupMemberIds?: string[];
  /**
   * Membership ids that were once in the group and have since been removed.
   * Kept separate so a predicate that forgets `removedAt: null` fails the
   * test rather than silently keeping a moved student's write access.
   */
  removedGroupMemberIds?: string[];
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
      case 'artifactKind':
        if (value !== (doc.artifactKind ?? 'STUDENT')) return false;
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
      case 'classAssignment': {
        const nested = ((value as any)?.is ?? value) as Record<string, unknown>;
        const teacherId = (nested as any)?.class?.teachers?.some?.id;
        if (typeof teacherId === 'string') {
          if (
            !(doc.classAssignmentTeacherProfileIds ?? []).includes(teacherId)
          ) {
            return false;
          }
          break;
        }
        const visibility = (nested as any)?.OR;
        if (!Array.isArray(visibility)) return false;
        const postAt = doc.classAssignmentPostAt ?? null;
        const visible = visibility.some((branch: any) => {
          if (branch.postAt === null) return postAt === null;
          const cutoff = branch.postAt?.lte;
          return cutoff instanceof Date && postAt !== null && postAt <= cutoff;
        });
        if (!visible) return false;
        break;
      }
      case 'group': {
        // Co-authorship through the document's collaboration group. `removedAt`
        // is checked rather than ignored: a predicate that omits it would keep
        // write access for a student the teacher moved to another group, so the
        // omission has to be observable as a failing test.
        const nested = ((value as any)?.is ?? value) as Record<string, unknown>;
        const some = (nested?.members as any)?.some as
          Record<string, unknown> | undefined;
        if (!some || typeof some !== 'object') return false;
        if (!('removedAt' in some) || some.removedAt !== null) return false;
        const memberId = some.membershipId;
        if (typeof memberId !== 'string') return false;
        if (!(doc.activeGroupMemberIds ?? []).includes(memberId)) return false;
        break;
      }
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
