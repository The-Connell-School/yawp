import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@app/prisma';
import { z } from 'zod';
import { normalizeClassCode } from './class';
import { groupDuplicateClassCodes } from './class-code-write.server';
import { prisma } from './db.server';
import { authorizeInternalApiRequest, INTERNAL_API_HEADER_SIGNATURE } from './internal-platform-auth.server';

const response = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' },
});
const querySchema = z.object({
  q: z.string().trim().max(200).default('').transform(normalizeClassCode),
  cursor: z.string().min(1).max(10000).optional(),
  limit: z.string().regex(/^\d{1,3}$/).transform(Number)
    .pipe(z.number().int().min(1).max(200)).default('50'),
}).strict();
const cursorSchema = z.object({
  v: z.literal(1), binding: z.string(),
  code: z.string().refine(code => normalizeClassCode(code) === code),
}).strict();

/** Same grouping contract as readDuplicateClassCodes, enriched in one snapshot. */
export async function readDuplicateClassCodePage(
  db: PrismaClient,
  input: { q: string; limit: number; after?: string }
) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    // Exact ECMAScript Unicode normalization requires scanning all stored codes.
    // Only IDs/code/tenant keys are scanned; metadata is loaded for this page only.
    const groups = groupDuplicateClassCodes(await tx.class.findMany({
      select: { id: true, code: true, schoolId: true, school: { select: { organizationId: true } } },
    })).filter(group => group.code.startsWith(input.q));
    const remaining = groups.filter(group => input.after === undefined || group.code > input.after);
    const page = remaining.slice(0, input.limit);
    const ids = page.flatMap(group => group.classes.map(row => row.classId));
    if (!ids.length) return { items: [], totalCodes: groups.length, nextCode: null };
    const rows = await tx.class.findMany({
      where: { id: { in: ids } },
      select: { id: true, code: true, title: true, createdAt: true, schoolId: true,
        school: { select: { name: true, organizationId: true, organization: { select: { name: true } } } },
        teachers: { select: { user: { select: { email: true } } } },
        _count: { select: { students: true } },
      },
    });
    // Document.updatedAt is the existing persisted document activity timestamp.
    // Include archived/deleted documents, just as the report includes archived classes.
    // Aggregate in PostgreSQL, rather than retrieving documents or querying each class.
    const activity = await tx.$queryRaw<{ classId: string; lastActivityAt: Date }[]>`
      SELECT ca."classId", MAX(d."updatedAt") AS "lastActivityAt"
      FROM "ClassAssignment" ca JOIN "Document" d ON d."classAssignmentId" = ca.id
      WHERE ca."classId" IN (${Prisma.join(ids)}) GROUP BY ca."classId"`;
    const byId = new Map(rows.map(row => [row.id, row]));
    const lastActivity = new Map(activity.map(row => [row.classId, row.lastActivityAt.toISOString()]));
    return {
      items: page.map(group => ({ code: group.code, count: group.count,
        classes: group.classes.map(({ classId }) => {
          const row = byId.get(classId)!;
          return { classId, className: row.title ?? row.code,
            organizationId: row.school.organizationId, organizationName: row.school.organization.name,
            schoolId: row.schoolId, schoolName: row.school.name,
            teacherEmails: [...new Set(row.teachers.map(teacher => teacher.user.email))].sort(),
            studentCount: row._count.students, createdAt: row.createdAt.toISOString(),
            lastActivityAt: lastActivity.get(classId) ?? null };
        }),
      })),
      totalCodes: groups.length,
      nextCode: remaining.length > input.limit ? page[page.length - 1]!.code : null,
    };
  }, { isolationLevel: 'RepeatableRead' });
}

export async function duplicateClassCodes(request: Request): Promise<Response> {
  // Class reporting uses the management directory's access model: no free-tier,
  // onboarding or uniqueness feature gate applies to this cross-organization read.
  // Require signed staff attribution; the shared verifier enforces scopes/replay.
  if (!request.headers.get(INTERNAL_API_HEADER_SIGNATURE)) return response({ error: 'Unauthorized' }, 401);
  const auth = await authorizeInternalApiRequest(request, { requiredScope: 'management:read' });
  if (auth instanceof Response) return auth;
  if (request.method !== 'GET') return response({ error: 'Method not allowed' }, 405);
  let input: z.infer<typeof querySchema>;
  try {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => params.getAll(key).length !== 1)) throw new Error();
    input = querySchema.parse(Object.fromEntries(params));
  } catch { return response({ error: 'Invalid query' }, 400); }
  const binding = createHash('sha256').update(JSON.stringify([input.q])).digest('base64url');
  let after: string | undefined;
  if (input.cursor) {
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(input.cursor)) throw new Error();
      const bytes = Buffer.from(input.cursor, 'base64url');
      if (bytes.toString('base64url') !== input.cursor) throw new Error();
      const cursor = cursorSchema.parse(JSON.parse(bytes.toString('utf8')));
      if (cursor.binding !== binding || !cursor.code.startsWith(input.q)) throw new Error();
      after = cursor.code;
    } catch { return response({ error: 'Invalid cursor' }, 400); }
  }
  try {
    const { items, totalCodes, nextCode } = await readDuplicateClassCodePage(prisma, { ...input, after });
    const nextCursor = nextCode === null ? null
      : Buffer.from(JSON.stringify({ v: 1, binding, code: nextCode })).toString('base64url');
    return response({ items, nextCursor, totalCodes });
  } catch { return response({ error: 'Class code report unavailable' }, 503); }
}
