/**
 * INDEPENDENT AUTHORIZATION PROBE — written by the merge verifier, not by the fix agents.
 *
 * Deliberately different in method from the fix agents' tests:
 *
 * 1. Nothing in `~/utils/auth.server` is mocked. `requireUserId` and `requireMembership`
 *    run for real, against real signed `en_session` / `membership-id` cookies produced by
 *    the app's own cookie session storage. An "unauthenticated" request here really is a
 *    Request with no cookie header, not a mocked helper that was told to throw.
 * 2. Only the Prisma client is faked, and the fake *evaluates* the route's own `where`
 *    clause against fixture rows with an evaluator written here from scratch — so a route
 *    with no ownership predicate genuinely returns the victim's row and the probe fails.
 * 3. The assertions are about observable side effects (which writes happened, what the
 *    Location header said), not about the shape of the arguments a route passed.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';

// ---------------------------------------------------------------------------
// A tiny, self-contained `where` evaluator. Only the operators these three
// routes use. Unknown keys are treated as non-matching when they are scoping
// keys and ignored when they are not access controls (isArchived, deletedAt).
// ---------------------------------------------------------------------------

type ClassRow = {
  id: string;
  code: string;
  isArchived: boolean;
  schoolOrganizationId: string;
};

type DocRow = {
  id: string;
  membershipId: string;
  /** membership ids of teachers who teach a class this doc's owner is enrolled in */
  teacherProfileIds: string[];
  html: string;
  text: string;
  title: string;
  revision: number;
};

function strMatch(value: unknown, actual: string): boolean {
  if (typeof value === 'string') return value === actual;
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (typeof v.equals === 'string') {
      return v.mode === 'insensitive'
        ? v.equals.toLowerCase() === actual.toLowerCase()
        : v.equals === actual;
    }
  }
  return false;
}

function classMatches(where: unknown, row: ClassRow): boolean {
  if (!where || typeof where !== 'object') return true;
  for (const [key, value] of Object.entries(where as Record<string, unknown>)) {
    switch (key) {
      case 'id':
        if (value !== row.id) return false;
        break;
      case 'code':
        if (!strMatch(value, row.code)) return false;
        break;
      case 'isArchived':
        if (value !== row.isArchived) return false;
        break;
      case 'school': {
        const orgId = (value as any)?.organizationId ?? (value as any)?.is?.organizationId;
        if (typeof orgId !== 'string') return false;
        if (orgId !== row.schoolOrganizationId) return false;
        break;
      }
      case 'AND':
        if (!Array.isArray(value) || !value.every((c) => classMatches(c, row)))
          return false;
        break;
      case 'OR':
        if (!Array.isArray(value) || !value.some((c) => classMatches(c, row)))
          return false;
        break;
      default:
        // An unrecognized key on a class lookup is a scoping key we do not model.
        // Fail closed so the probe cannot silently pass on an unmodelled filter.
        return false;
    }
  }
  return true;
}

function docMatches(where: unknown, row: DocRow): boolean {
  if (!where || typeof where !== 'object') return true;
  for (const [key, value] of Object.entries(where as Record<string, unknown>)) {
    switch (key) {
      case 'id':
        if (value !== row.id) return false;
        break;
      case 'membershipId':
        if (value !== row.membershipId) return false;
        break;
      case 'OR':
        if (!Array.isArray(value) || !value.some((c) => docMatches(c, row)))
          return false;
        break;
      case 'AND':
        if (!Array.isArray(value) || !value.every((c) => docMatches(c, row)))
          return false;
        break;
      case 'membership': {
        const inner = (value as any)?.is ?? value;
        const teacherId = inner?.classesAsStudent?.some?.teachers?.some?.id;
        if (typeof teacherId !== 'string') return false;
        if (!row.teacherProfileIds.includes(teacherId)) return false;
        break;
      }
      case 'deletedAt':
      case 'archivedAt':
        break;
      default:
        return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Fixtures. Two organizations, two students, one teacher.
// ---------------------------------------------------------------------------

const ORG_A = 'org-a';
const ORG_B = 'org-b';

const SESSION_A = 'session-attacker';
const USER_A = 'user-a';
const PROFILE_A = 'profile-a';

const VICTIM_DOC_ID = 'doc-victim';
const VICTIM_PROFILE = 'profile-victim';
const VICTIM_HTML = '<p>Victim essay, mid-draft</p>';
const VICTIM_TEXT = 'Victim essay, mid-draft';

const LEGACY_GRADE_ID = 'legacy-grade-1';

const CLASSES: ClassRow[] = [
  // Attacker's own org. Real code SHARED1 (two of them, so the ambiguous path exists).
  { id: 'class-a1', code: 'SHARED1', isArchived: false, schoolOrganizationId: ORG_A },
  { id: 'class-a2', code: 'SHARED1', isArchived: false, schoolOrganizationId: ORG_A },
  { id: 'class-a3', code: 'ONLYONE', isArchived: false, schoolOrganizationId: ORG_A },
  // A different tenant's class. Its code collides with the attacker's org on purpose.
  { id: 'class-b1', code: 'SHARED1', isArchived: false, schoolOrganizationId: ORG_B },
  { id: 'class-b2', code: 'SECRETB', isArchived: false, schoolOrganizationId: ORG_B },
];

const DOCS: DocRow[] = [
  {
    id: VICTIM_DOC_ID,
    membershipId: VICTIM_PROFILE,
    teacherProfileIds: ['profile-teacher'],
    html: VICTIM_HTML,
    text: VICTIM_TEXT,
    title: 'Victim essay',
    revision: 7,
  },
  {
    id: 'doc-attacker',
    membershipId: PROFILE_A,
    teacherProfileIds: ['profile-teacher'],
    html: '<p>Attacker essay</p>',
    text: 'Attacker essay',
    title: 'Attacker essay',
    revision: 1,
  },
];

// ---------------------------------------------------------------------------
// The Prisma fake.
// ---------------------------------------------------------------------------

const calls = {
  orgMembershipUpdate: [] as any[],
  documentWriteJournalCreate: [] as any[],
  documentRevisionCreate: [] as any[],
  legacyGradeRedirectFindUnique: [] as any[],
  submissionFindUnique: [] as any[],
  documentUpdate: [] as any[],
};

function resetCalls() {
  for (const key of Object.keys(calls) as (keyof typeof calls)[]) {
    calls[key] = [];
  }
}

const MEMBERSHIPS: Record<
  string,
  { id: string; userId: string; role: string; isOrgOwner: boolean; orgId: string }
> = {
  [PROFILE_A]: {
    id: PROFILE_A,
    userId: USER_A,
    role: 'STUDENT',
    isOrgOwner: false,
    orgId: ORG_A,
  },
};

function membershipPayload(id: string) {
  const m = MEMBERSHIPS[id];
  if (!m) return null;
  return {
    id: m.id,
    role: m.role,
    isOrgOwner: m.isOrgOwner,
    organization: {
      id: m.orgId,
      name: m.orgId,
      reporterEnabled: false,
      classInsightsEnabled: false,
      writingPracticeEnabled: false,
    },
  };
}

const prisma: any = {
  session: {
    findUnique: async ({ where }: any) =>
      where?.id === SESSION_A ? { user: { id: USER_A } } : null,
  },
  orgMembership: {
    findUnique: async ({ where }: any) => {
      const m = MEMBERSHIPS[where?.id];
      if (!m) return null;
      if (where?.userId && where.userId !== m.userId) return null;
      return membershipPayload(m.id);
    },
    findFirst: async ({ where }: any) => {
      const m = Object.values(MEMBERSHIPS).find((x) => x.userId === where?.userId);
      return m ? membershipPayload(m.id) : null;
    },
    update: async (args: any) => {
      calls.orgMembershipUpdate.push(args);
      return { id: args?.where?.id };
    },
  },
  user: {
    findUnique: async ({ where }: any) => ({ id: where?.id, isAdmin: false }),
    findUniqueOrThrow: async ({ where }: any) => ({ id: where?.id, isAdmin: false }),
    findFirst: async () => null,
  },
  class: {
    findMany: async ({ where, take }: any) => {
      const rows = CLASSES.filter((c) => classMatches(where, c)).map((c) => ({
        id: c.id,
        code: c.code,
        schoolYear: '2025-2026',
        period: null,
        grade: null,
        school: { name: 'School' },
        teachers: [{ user: { name: 'A Teacher' } }],
      }));
      return typeof take === 'number' ? rows.slice(0, take) : rows;
    },
    findFirst: async ({ where }: any) => {
      const row = CLASSES.find((c) => classMatches(where, c));
      return row ? { id: row.id } : null;
    },
  },
  document: {
    findFirst: async ({ where }: any) => {
      const row = DOCS.find((d) => docMatches(where, d));
      return row ? { ...row } : null;
    },
    findUnique: async ({ where }: any) => {
      const row = DOCS.find((d) => docMatches(where, d));
      return row ? { ...row } : null;
    },
    findUniqueOrThrow: async ({ where }: any) => {
      // The PRE-FIX code path. An unscoped findUniqueOrThrow keyed on id alone hands
      // back the victim's row, which is exactly what makes the early writes possible.
      const row = DOCS.find((d) => d.id === where?.id);
      if (!row) {
        const err: any = new Error('No Document found');
        err.code = 'P2025';
        throw err;
      }
      return { ...row };
    },
    update: async (args: any) => {
      calls.documentUpdate.push(args);
      const row = DOCS.find((d) => docMatches(args?.where, d));
      if (!row) {
        const err: any = new Error('Record to update not found');
        err.code = 'P2025';
        throw err;
      }
      return { ...row, revision: row.revision + 1 };
    },
  },
  documentWriteJournal: {
    create: async (args: any) => {
      calls.documentWriteJournalCreate.push(args);
      return { id: 'journal-1', ...args?.data };
    },
    findFirst: async () => null,
    update: async () => ({}),
  },
  documentRevision: {
    create: async (args: any) => {
      calls.documentRevisionCreate.push(args);
      return { id: 'rev-1' };
    },
    findFirst: async () => null,
  },
  submission: {
    findFirst: async () => null,
    findUnique: async (args: any) => {
      calls.submissionFindUnique.push(args);
      return { id: 'submission-victim', documentId: VICTIM_DOC_ID };
    },
    update: async () => ({}),
  },
  legacyGradeRedirect: {
    findUnique: async (args: any) => {
      calls.legacyGradeRedirectFindUnique.push(args);
      return { submissionId: 'submission-victim' };
    },
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/db.server.js', () => ({ prisma }));

// Imported AFTER the prisma mock so the routes and the real auth helpers bind to it.
const { authSessionStorage, sessionKey } = await (async () => {
  const storage = await import('~/cookie-session-storages/authentication.server');
  const auth = await import('~/utils/auth.server');
  return { authSessionStorage: storage.authSessionStorage, sessionKey: auth.sessionKey };
})();
const { membershipIdCookie } = await import('~/cookies/membership-id.server');

/** A real, signed cookie header for the attacker. No auth helper is mocked. */
async function attackerCookie(): Promise<string> {
  const session = await authSessionStorage.getSession();
  session.set(sessionKey, SESSION_A);
  const authCookie = await authSessionStorage.commitSession(session);
  const memCookie = await membershipIdCookie.serialize(PROFILE_A);
  return [authCookie.split(';')[0], memCookie.split(';')[0]].join('; ');
}

function locationOf(value: unknown): string {
  if (value instanceof Response) return value.headers.get('location') ?? '';
  const headers = (value as any)?.headers;
  if (headers instanceof Headers) return headers.get('location') ?? '';
  return headers?.location ?? headers?.Location ?? '';
}

async function statusOf(value: unknown): Promise<number | undefined> {
  if (value instanceof Response) return value.status;
  return (value as any)?.init?.status ?? (value as any)?.status;
}

const enterCode = await import('~/routes/enter-code/route');
const gradedRoute = await import('~/routes/app_.graded_.$gradeId/route');
const documentApi = await import('~/routes/api.model.document.$id/route');

// ===========================================================================

describe('PROBE 1 — enter-code assign-class cannot enroll without a valid code', () => {
  beforeEach(resetCalls);

  async function assignClass(fields: Record<string, string>) {
    const body = new URLSearchParams({ intent: 'assign-class', ...fields });
    const request = new Request('https://example.com/enter-code', {
      method: 'POST',
      headers: {
        cookie: await attackerCookie(),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    try {
      return { result: await enterCode.action({ request, params: {}, context: {} } as any) };
    } catch (error) {
      return { thrown: error };
    }
  }

  test('a class id with NO code enrolls nobody (own org)', async () => {
    await assignClass({ classId: 'class-a1' });
    expect(calls.orgMembershipUpdate).toEqual([]);
  });

  test('a class id with NO code enrolls nobody (foreign org)', async () => {
    await assignClass({ classId: 'class-b2' });
    expect(calls.orgMembershipUpdate).toEqual([]);
  });

  test('a class id with the WRONG code enrolls nobody', async () => {
    await assignClass({ classId: 'class-a1', code: 'NOPE' });
    expect(calls.orgMembershipUpdate).toEqual([]);
  });

  test("a foreign org's class with that class's REAL code enrolls nobody", async () => {
    await assignClass({ classId: 'class-b1', code: 'SHARED1' });
    expect(calls.orgMembershipUpdate).toEqual([]);
  });

  test('the legitimate two-step selection still enrolls', async () => {
    await assignClass({ classId: 'class-a2', code: 'SHARED1' });
    expect(calls.orgMembershipUpdate.length).toBe(1);
    expect(calls.orgMembershipUpdate[0].where.id).toBe(PROFILE_A);
    expect(
      calls.orgMembershipUpdate[0].data.classesAsStudent.connect.id
    ).toBe('class-a2');
  });

  test("validate-code never matches another organization's class", async () => {
    // SECRETB is org B's code and exists nowhere in org A.
    const body = new URLSearchParams({ intent: 'validate-code', code: 'SECRETB' });
    const request = new Request('https://example.com/enter-code', {
      method: 'POST',
      headers: {
        cookie: await attackerCookie(),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    await enterCode.action({ request, params: {}, context: {} } as any).catch(() => {});
    expect(calls.orgMembershipUpdate).toEqual([]);
  });
});

describe('PROBE 2 — legacy graded route leaks no document id without a session', () => {
  beforeEach(resetCalls);

  test('an unauthenticated GET produces no Location naming a document id', async () => {
    // A real Request with no cookie header at all.
    const request = new Request(
      `https://example.com/app/graded/${LEGACY_GRADE_ID}`
    );

    let returned: unknown;
    let thrown: unknown;
    try {
      returned = await gradedRoute.loader({
        request,
        params: { gradeId: LEGACY_GRADE_ID },
        context: {},
      } as any);
    } catch (error) {
      thrown = error;
    }

    expect(locationOf(returned)).not.toContain(VICTIM_DOC_ID);
    expect(locationOf(thrown)).not.toContain(VICTIM_DOC_ID);
    // The redirect the caller DOES get must be the login redirect.
    expect(locationOf(thrown)).toContain('/auth/login');
    // And the oracle lookups must never have run.
    expect(calls.legacyGradeRedirectFindUnique).toEqual([]);
    expect(calls.submissionFindUnique).toEqual([]);
  });

  test('an authenticated caller still follows the old bookmark', async () => {
    const request = new Request(
      `https://example.com/app/graded/${LEGACY_GRADE_ID}`,
      { headers: { cookie: await attackerCookie() } }
    );
    const result = await gradedRoute.loader({
      request,
      params: { gradeId: LEGACY_GRADE_ID },
      context: {},
    } as any);
    expect(locationOf(result)).toBe(`/app/documents/${VICTIM_DOC_ID}`);
  });
});

describe("PROBE 3 — document update writes nothing against another student's document", () => {
  beforeEach(resetCalls);

  async function putDocument(id: string, fields: Record<string, string>) {
    const request = new Request(
      `https://example.com/api/model/document/${id}?from=probe`,
      {
        method: 'PUT',
        headers: {
          cookie: await attackerCookie(),
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(fields).toString(),
      }
    );
    try {
      return {
        result: await documentApi.action({ request, params: { id }, context: {} } as any),
      };
    } catch (error) {
      return { thrown: error };
    }
  }

  test('a title-only PUT at the victim document creates NO journal row and NO revision', async () => {
    const outcome = await putDocument(VICTIM_DOC_ID, { title: 'pwned' });

    expect(calls.documentWriteJournalCreate).toEqual([]);
    expect(calls.documentRevisionCreate).toEqual([]);
    expect(calls.documentUpdate).toEqual([]);
    expect(outcome.thrown).toBeUndefined();
    expect(await statusOf(outcome.result)).toBe(404);
  });

  test('a body PUT at the victim document copies no victim HTML anywhere', async () => {
    await putDocument(VICTIM_DOC_ID, { html: '<p>x</p>', text: 'x' });

    const serialized = JSON.stringify([
      calls.documentWriteJournalCreate,
      calls.documentRevisionCreate,
    ]);
    expect(serialized).not.toContain(VICTIM_HTML);
    expect(serialized).not.toContain(VICTIM_TEXT);
    expect(calls.documentWriteJournalCreate).toEqual([]);
    expect(calls.documentRevisionCreate).toEqual([]);
  });

  test('the owner saving their own document still writes', async () => {
    const outcome = await putDocument('doc-attacker', {
      html: '<p>mine</p>',
      text: 'mine',
    });

    expect(outcome.thrown).toBeUndefined();
    expect(calls.documentWriteJournalCreate.length).toBe(1);
    expect(calls.documentWriteJournalCreate[0].data.membershipId).toBe(PROFILE_A);
    expect(await statusOf(outcome.result)).toBe(200);
  });
});
