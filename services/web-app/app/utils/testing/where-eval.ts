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
