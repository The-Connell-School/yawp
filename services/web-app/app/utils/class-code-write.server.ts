import type { Prisma, PrismaClient } from '@app/prisma';
import { generateClassCode, normalizeClassCode } from './class';
import { CLASS_CODE_UNIQUE_FLAG, featureFlagSettingName, parseFeatureFlagValue } from '~/domain/feature-flags/feature-flags';

type CodeClient = Pick<Prisma.TransactionClient, 'setting' | 'class' | '$executeRaw'>;

/** Global invariant: targeted mode deliberately stays off for all writers. */
export async function classCodeUniquenessEnabled(client: Pick<CodeClient, 'setting'>) {
  const row = await client.setting.findUnique({
    where: { name: featureFlagSettingName(CLASS_CODE_UNIQUE_FLAG) },
    select: { value: true },
  });
  return parseFeatureFlagValue(row?.value).mode === 'everyone';
}

export class ClassCodeCollisionError extends Error {
  constructor() { super('Class code already in use. Choose a different code.'); }
}

/**
 * Call inside the SAME transaction as every class code create/update. The global
 * transaction lock serializes availability checks through commit, including
 * generated retries. No failed INSERT is retried inside an aborted transaction.
 * ECMAScript trim + uppercase is shared with the form and read-only report,
 * including Unicode legacy codes; selecting codes avoids database collation drift.
 */
export async function resolveClassCode(
  tx: CodeClient,
  input: string,
  { classId, generated = false, generate = generateClassCode }: {
    classId?: string; generated?: boolean; generate?: () => string;
  } = {}
): Promise<string> {
  if (!await classCodeUniquenessEnabled(tx)) return input;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(1869666150, 1)`;
  const rows = await tx.class.findMany({ select: { id: true, code: true } });
  let code = normalizeClassCode(input);
  // Preserve edits to a legacy duplicate's own code; never rewrite other classes.
  const own = rows.find(row => row.id === classId);
  if (own && normalizeClassCode(own.code) === code) return own.code;
  const taken = new Set(rows.map(row => normalizeClassCode(row.code)));
  const attempts = generated ? 4 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (code && !taken.has(code)) return code;
    if (attempt + 1 < attempts) code = normalizeClassCode(generate());
  }
  throw new ClassCodeCollisionError();
}

export type DuplicateClassCodeRow = {
  id: string; code: string; schoolId: string;
  school: { organizationId: string };
};

export function groupDuplicateClassCodes(rows: DuplicateClassCodeRow[]) {
  const groups = new Map<string, DuplicateClassCodeRow[]>();
  for (const row of rows) {
    const code = normalizeClassCode(row.code);
    const group = groups.get(code) ?? [];
    group.push(row); groups.set(code, group);
  }
  return [...groups.entries()].filter(([, classes]) => classes.length > 1)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([code, classes]) => ({ code, count: classes.length,
      classes: classes.map(row => ({ classId: row.id, storedCode: row.code,
        schoolId: row.schoolId, organizationId: row.school.organizationId }))
        .sort((a, b) => a.classId < b.classId ? -1 : a.classId > b.classId ? 1 : 0) }));
}

/** Database-enforced read-only transaction; includes archived classes. */
export async function readDuplicateClassCodes(db: PrismaClient) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    return groupDuplicateClassCodes(await tx.class.findMany({
      select: { id: true, code: true, schoolId: true, school: { select: { organizationId: true } } },
    }));
  });
}
