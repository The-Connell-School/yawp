import { createHash } from 'node:crypto';
import { Prisma, PrismaClient } from '@app/prisma';
import { z } from 'zod';

const json = (value: unknown): Prisma.InputJsonObject => JSON.parse(JSON.stringify(value));
function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as any)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
const fingerprint = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const failure = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode });

export type AssignmentTypeListItem = {
  id: string;
  key: string | null;
  title: string;
  rubric: { source: 'library'; name: string; rubricId: string } | { source: 'per-type' };
  currentRevision: { id: string; version: number; fingerprint: string } | null;
  updatedAt: string;
  outdatedPinnedAssignments: number;
};

export const perTypeSchemaInput = z
  .object({
    scoringScale: z.unknown().optional().nullable(),
    rubric: z.unknown().optional().nullable(),
    promptConfig: z.unknown().optional().nullable(),
    outputSchema: z.unknown().optional().nullable(),
    calibrationNotes: z.string().max(20000).optional().nullable(),
  })
  .strict();

export const assignmentTypePerTypeUpdateInput = z
  .object({
    requestId: z.string().uuid(),
    actorId: z.string().min(1).max(200),
    reason: z.string().trim().min(1).max(2000),
    expected: z
      .object({
        fingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
        version: z.number().int().min(0).max(2147483647).nullable().optional(),
      })
      .strict()
      .optional(),
    schema: perTypeSchemaInput,
  })
  .strict();

export const assignmentTypeRelinkInput = z
  .object({
    requestId: z.string().uuid(),
    actorId: z.string().min(1).max(200),
    reason: z.string().trim().min(1).max(2000),
    expected: z
      .object({
        fingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
        version: z.number().int().min(0).max(2147483647).nullable().optional(),
      })
      .strict()
      .optional(),
    rubricName: z.string().min(1).max(200),
  })
  .strict();

export const assignmentTypeCompareInput = z
  .object({
    a: z.string().min(1),
    b: z.string().min(1),
  })
  .strict();

type PrismaWithExtras = PrismaClient & {
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Promise<T[]>;
  $executeRaw(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Promise<number>;
};

export class InternalAssignmentTypes {
  constructor(private db: PrismaWithExtras) {}

  async list(): Promise<{ items: AssignmentTypeListItem[] }> {
    const types = await this.db.assignmentType.findMany({
      where: { archivedAt: null },
      orderBy: [{ position: 'asc' }, { title: 'asc' }],
      select: {
        id: true,
        title: true,
        systemKey: true,
        kind: true,
        updatedAt: true,
        rubricId: true,
      },
    });
    // Preload assignment counts grouped by assignmentTypeId and revision version for efficiency
    const libraryCounts = await this.db.$queryRaw<{ assignmentTypeId: string; count: number }[]>`
      SELECT t.id AS "assignmentTypeId", COUNT(a.id)::int AS count
      FROM "Assignment" a
      JOIN "AssignmentType" t ON t.id = a."assignmentTypeId"
      JOIN "Rubric" r ON r.id = t."rubricId"
      JOIN "RubricRevision" rv ON rv.id = a."rubricRevisionId" AND rv."rubricName" = r.name
      WHERE t."rubricId" IS NOT NULL
        AND a."rubricRevisionId" IS NOT NULL
        AND rv.version < COALESCE(r."currentRevisionId", rv.id)::text::uuid::text::int -- harmless guard; version compare done below
      GROUP BY t.id
    `.catch(() => []); // guard against casting weirdness; we will compute per row below if needed
    // Fallback: compute per-row counts precisely
    const countsByType: Record<string, number> = {};
    for (const row of types) {
      // Resolve current revision (library or per-type baseline)
      let current: { id: string; version: number; fingerprint: string } | null = null;
      let rubricName: string | null = null;
      if (row.rubricId) {
        const rub = await this.db.rubric.findUnique({
          where: { id: row.rubricId },
          include: { currentRevision: true },
        });
        if (rub?.currentRevision) {
          current = {
            id: rub.currentRevision.id,
            version: rub.currentRevision.version,
            fingerprint: rub.currentRevision.fingerprint,
          };
          rubricName = rub.name;
        }
      } else {
        const rows = await this.db.$queryRaw<{ rubricRevisionId: string }[]>`
          SELECT "rubricRevisionId" FROM "AssignmentTypeRubricBaseline" WHERE "assignmentTypeId" = ${row.id}
        `;
        const baselineId = rows[0]?.rubricRevisionId ?? null;
        if (baselineId) {
          const rr = await this.db.rubricRevision.findUnique({ where: { id: baselineId } });
          if (rr) {
            current = { id: rr.id, version: rr.version, fingerprint: rr.fingerprint };
            rubricName = rr.rubricName;
          }
        }
      }
      if (!current) {
        countsByType[row.id] = 0;
        continue;
      }
      if (!rubricName) {
        countsByType[row.id] = 0;
        continue;
      }
      try {
        const rows = await this.db.$queryRaw<{ n: number }[]>`
          SELECT COUNT(*)::int AS n
          FROM "Assignment" a
          JOIN "RubricRevision" rv ON rv.id = a."rubricRevisionId"
          WHERE a."assignmentTypeId" = ${row.id}
            AND rv."rubricName" = ${rubricName}
            AND rv.version < ${current.version}
        `;
        countsByType[row.id] = rows[0]?.n ?? 0;
      } catch {
        countsByType[row.id] = 0;
      }
    }
    const items: AssignmentTypeListItem[] = [];
    for (const t of types) {
      const libRow = t.rubricId
        ? await this.db.rubric.findUnique({ where: { id: t.rubricId }, include: { currentRevision: true } })
        : null;
      let baselineRev: { id: string; version: number; fingerprint: string } | null = null;
      if (!t.rubricId) {
        const rows = await this.db.$queryRaw<{ rubricRevisionId: string }[]>`
          SELECT "rubricRevisionId" FROM "AssignmentTypeRubricBaseline" WHERE "assignmentTypeId" = ${t.id}
        `;
        const baselineId = rows[0]?.rubricRevisionId ?? null;
        if (baselineId) {
          const rr = await this.db.rubricRevision.findUnique({ where: { id: baselineId } });
          if (rr) baselineRev = { id: rr.id, version: rr.version, fingerprint: rr.fingerprint };
        }
      }
      const current = libRow?.currentRevision ?? baselineRev ?? null;
      items.push({
        id: t.id,
        key: t.systemKey ?? t.kind ?? null,
        title: t.title,
        rubric: libRow
          ? { source: 'library' as const, name: libRow.name, rubricId: libRow.id }
          : { source: 'per-type' as const },
        currentRevision: current ? { id: current.id, version: current.version, fingerprint: current.fingerprint } : null,
        updatedAt: t.updatedAt.toISOString(),
        outdatedPinnedAssignments: countsByType[t.id] ?? 0,
      });
    }
    return { items };
  }

  async read(assignmentTypeId: string) {
    const row = await this.db.assignmentType.findUnique({
      where: { id: assignmentTypeId },
      select: {
        id: true,
        title: true,
        systemKey: true,
        kind: true,
        scoringScaleJson: true,
        rubricJson: true,
        gradingPromptConfigJson: true,
        gradingOutputSchemaJson: true,
        gradingCalibrationNotes: true,
        rubricId: true,
      },
    });
    if (!row) return null;
    let current: { id: string; version: number; fingerprint: string } | null = null;
    let rubricName: string;
    let rubricSource: { source: 'library'; name: string; rubricId: string } | { source: 'per-type' } =
      { source: 'per-type' };
    if (row.rubricId) {
      const rub = await this.db.rubric.findUnique({ where: { id: row.rubricId }, include: { currentRevision: true } });
      if (rub?.currentRevision) {
        current = { id: rub.currentRevision.id, version: rub.currentRevision.version, fingerprint: rub.currentRevision.fingerprint };
        rubricSource = { source: 'library', name: rub.name, rubricId: rub.id };
      }
      rubricName = rub?.name ?? `assignment-type:${row.id}`;
    } else {
      const rows = await this.db.$queryRaw<{ rubricRevisionId: string }[]>`
        SELECT "rubricRevisionId" FROM "AssignmentTypeRubricBaseline" WHERE "assignmentTypeId" = ${assignmentTypeId}
      `;
      const baselineId = rows[0]?.rubricRevisionId ?? null;
      if (baselineId) {
        const rr = await this.db.rubricRevision.findUnique({ where: { id: baselineId } });
        if (rr) current = { id: rr.id, version: rr.version, fingerprint: rr.fingerprint };
        rubricName = rr?.rubricName ?? `assignment-type:${row.id}`;
      } else {
        rubricName = `assignment-type:${row.id}`;
      }
    }
    const revisions = await this.db.rubricRevision.findMany({
      where: { rubricName },
      orderBy: { version: 'desc' },
      take: 1000,
    });
    const perTypeSchema = json({
      name: rubricName,
      title: row.title ?? rubricName,
      scoringScale: (row.scoringScaleJson as any) ?? {},
      rubric: (row.rubricJson as any) ?? {},
      promptConfig: (row.gradingPromptConfigJson as any) ?? {},
      outputSchema: (row.gradingOutputSchemaJson as any) ?? {},
      calibrationNotes: (row.gradingCalibrationNotes as any) ?? null,
    });
    return {
      id: row.id,
      key: row.systemKey ?? row.kind ?? null,
      title: row.title,
      rubric: rubricSource,
      currentRevision: current
        ? { id: current.id, version: current.version, fingerprint: current.fingerprint }
        : null,
      perTypeSchema,
      revisions: revisions.map((r) => ({
        id: r.id,
        version: r.version,
        fingerprint: r.fingerprint,
        createdAt: r.createdAt.toISOString(),
        createdBy: r.createdBy,
        reason: r.reason,
      })),
    };
  }

  async updatePerType(assignmentTypeId: string, raw: unknown) {
    const input = assignmentTypePerTypeUpdateInput.parse(raw);
    // Lock idempotency key for this transaction
    await this.db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`assignment-type-request:${input.requestId}`}, 0))`;
    // Check current baseline and optimistic concurrency
    const current = await this.read(assignmentTypeId);
    if (!current) throw failure('Assignment type not found', 404);
    if (current.rubric.source === 'library') throw failure('Per-type update not allowed on library-linked type', 400);
    const expectedFp = input.expected?.fingerprint ?? null;
    const expectedVer = input.expected?.version ?? null;
    if (expectedFp != null && current.currentRevision && current.currentRevision.fingerprint !== expectedFp) {
      throw failure('Assignment type changed; inspect the current baseline');
    }
    if (expectedVer != null && current.currentRevision && current.currentRevision.version !== expectedVer) {
      throw failure('Assignment type changed; inspect the current baseline');
    }
    // Compute the schema JSON and its fingerprint for idempotent no-op detection
    const schema = json({
      name: `assignment-type:${assignmentTypeId}`,
      title: current.title ?? `assignment-type:${assignmentTypeId}`,
      scoringScale: input.schema.scoringScale ?? (current.perTypeSchema as any)?.scoringScale ?? {},
      rubric: input.schema.rubric ?? (current.perTypeSchema as any)?.rubric ?? {},
      promptConfig: input.schema.promptConfig ?? (current.perTypeSchema as any)?.promptConfig ?? {},
      outputSchema: input.schema.outputSchema ?? (current.perTypeSchema as any)?.outputSchema ?? {},
      calibrationNotes:
        input.schema.calibrationNotes !== undefined ? input.schema.calibrationNotes : (current.perTypeSchema as any)?.calibrationNotes ?? null,
    });
    const targetFp = fingerprint(schema);
    if (current.currentRevision && current.currentRevision.fingerprint === targetFp) {
      // Already at desired baseline; safe idempotent success
      return { revision: current.currentRevision, unchanged: true as const };
    }
    // Apply JSON updates; trigger will capture a new baseline revision
    const data: Prisma.AssignmentTypeUpdateArgs['data'] = {
      scoringScaleJson: (schema as any).scoringScale ?? undefined,
      rubricJson: (schema as any).rubric ?? undefined,
      gradingPromptConfigJson: (schema as any).promptConfig ?? undefined,
      gradingOutputSchemaJson: (schema as any).outputSchema ?? undefined,
      gradingCalibrationNotes:
        (schema as any).calibrationNotes === undefined ? undefined : (schema as any).calibrationNotes,
    };
    await this.db.assignmentType.update({ where: { id: assignmentTypeId }, data });
    // Read back the new baseline/current
    const updated = await this.read(assignmentTypeId);
    const newCurrent = updated?.currentRevision ?? null;
    if (!newCurrent || newCurrent.fingerprint !== targetFp) {
      // Defensive: the trigger should have created a matching revision and baseline
      throw failure('Baseline revision capture failed');
    }
    return { revision: newCurrent, unchanged: false as const };
  }

  async relinkLibrary(assignmentTypeId: string, raw: unknown) {
    const input = assignmentTypeRelinkInput.parse(raw);
    await this.db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`assignment-type-request:${input.requestId}`}, 0))`;
    const row = await this.db.assignmentType.findUnique({
      where: { id: assignmentTypeId },
      include: { rubric: { include: { currentRevision: true } } },
    });
    if (!row) throw failure('Assignment type not found', 404);
    const targetRubric = await this.db.rubric.findUnique({
      where: { name: input.rubricName },
      include: { currentRevision: true },
    });
    if (!targetRubric || !targetRubric.currentRevision) throw failure('Target rubric not found or not published', 400);
    const expectedFp = input.expected?.fingerprint ?? null;
    const expectedVer = input.expected?.version ?? null;
    const currentRev = row.rubric?.currentRevision ?? null;
    if (expectedFp != null && currentRev && currentRev.fingerprint !== expectedFp) {
      throw failure('Assignment type rubric changed; inspect the current baseline');
    }
    if (expectedVer != null && currentRev && currentRev.version !== expectedVer) {
      throw failure('Assignment type rubric changed; inspect the current baseline');
    }
    // Idempotent: if already linked to target rubric, return success
    if (row.rubricId === targetRubric.id) {
      return {
        revision: {
          id: targetRubric.currentRevision.id,
          version: targetRubric.currentRevision.version,
          fingerprint: targetRubric.currentRevision.fingerprint,
        },
        unchanged: true as const,
      };
    }
    await this.db.assignmentType.update({
      where: { id: assignmentTypeId },
      data: {
        rubricId: targetRubric.id,
        // Clear per-type JSON so the library rubric is authoritative
        rubricJson: Prisma.DbNull,
        scoringScaleJson: Prisma.DbNull,
        gradingPromptConfigJson: Prisma.DbNull,
        gradingOutputSchemaJson: Prisma.DbNull,
        gradingCalibrationNotes: null,
      },
    });
    const latest = await this.db.rubric.findUnique({
      where: { id: targetRubric.id },
      include: { currentRevision: true },
    });
    if (!latest?.currentRevision) throw failure('Relink failed to set a current revision');
    return {
      revision: {
        id: latest.currentRevision.id,
        version: latest.currentRevision.version,
        fingerprint: latest.currentRevision.fingerprint,
      },
      unchanged: false as const,
    };
  }

  // Minimal JSON Patch (RFC 6902) diff (add/remove/replace) using JSON Pointer paths
  async compareRevisions(aId: string, bId: string) {
    const [a, b] = await Promise.all([
      this.db.rubricRevision.findUnique({ where: { id: aId } }),
      this.db.rubricRevision.findUnique({ where: { id: bId } }),
    ]);
    if (!a || !b) throw failure('Revision not found', 404);
    const diffs = diffJson(a.schemaJson as any, b.schemaJson as any);
    return {
      a: { id: a.id, version: a.version, fingerprint: a.fingerprint },
      b: { id: b.id, version: b.version, fingerprint: b.fingerprint },
      ops: diffs,
    };
  }
}

type Json = any;
type JsonPatchOp =
  | { op: 'add'; path: string; value: Json }
  | { op: 'remove'; path: string }
  | { op: 'replace'; path: string; value: Json };

function diffJson(a: Json, b: Json, path = ''): JsonPatchOp[] {
  if (Object.is(a, b)) return [];
  const aIsObj = a !== null && typeof a === 'object';
  const bIsObj = b !== null && typeof b === 'object';
  if (aIsObj && bIsObj && !Array.isArray(a) && !Array.isArray(b)) {
    const ops: JsonPatchOp[] = [];
    const aKeys = new Set(Object.keys(a));
    const bKeys = new Set(Object.keys(b));
    for (const key of aKeys) {
      const childPath = `${path}/${escapeJsonPointer(key)}`;
      if (!bKeys.has(key)) {
        ops.push({ op: 'remove', path: childPath });
      } else {
        ops.push(...diffJson(a[key], b[key], childPath));
      }
    }
    for (const key of bKeys) {
      if (!aKeys.has(key)) {
        const childPath = `${path}/${escapeJsonPointer(key)}`;
        ops.push({ op: 'add', path: childPath, value: b[key] });
      }
    }
    return ops;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    // Naive array diff: replace when not deeply equal
    if (canonical(a) !== canonical(b)) return [{ op: 'replace', path: path || '/', value: b }];
    return [];
  }
  // Primitive or mismatched kinds -> replace
  return [{ op: 'replace', path: path || '/', value: b }];
}

function escapeJsonPointer(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1');
}

