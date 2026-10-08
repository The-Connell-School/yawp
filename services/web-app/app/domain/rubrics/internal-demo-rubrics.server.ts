import { Prisma } from '@app/prisma';
import { perTypeKey } from './rubric-catalog.server';

/**
 * Demo-org rollout of rubric revisions staged in Yawp Internal.
 *
 * Yawp Internal v3 shares this database and owns schema `internal`. Its
 * contract with the platform:
 * - `internal.demo_orgs(org_id text primary key, ...)` lists platform
 *   `Organization.id` values that are demo orgs;
 * - `internal.platform_demo_revisions(rubric_key, platform_revision_id,
 *   version_number, staged_at)` holds at most one staged `RubricRevision` per
 *   catalog key (library `Rubric.name` or `assignment-type:<typeId>`), written
 *   via POST /api/internal/v1/rubric-catalog/stage.
 *
 * When `INTERNAL_DEMO_RUBRICS_ENABLED=true` and the assignment's classes belong
 * to a demo org, a new assignment is pinned to the staged revision instead of
 * the rubric's current one. Schools are never affected, and this lookup must
 * never block assignment creation: the `internal` schema is absent in local,
 * CI and e2e databases, and any missing table/view/row, permission problem or
 * mismatch falls back to the normal pin (with a warning when unexpected).
 */

type RawTx = {
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]): Prisma.PrismaPromise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Prisma.PrismaPromise<number>;
};

const SAVEPOINT = 'internal_demo_rubric_lookup';

export function internalDemoRubricsEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.INTERNAL_DEMO_RUBRICS_ENABLED === 'true';
}

/**
 * Returns the staged revision id to pin a new assignment to, or null to keep
 * today's behavior. Runs inside the caller's transaction, isolated by a
 * savepoint so that a failing read cannot abort the assignment insert.
 */
export async function findInternalDemoRubricRevisionId(
  tx: RawTx,
  params: { assignmentTypeId: string; classIds: string[] },
  env: NodeJS.ProcessEnv = process.env
): Promise<string | null> {
  if (!internalDemoRubricsEnabled(env) || params.classIds.length === 0) return null;

  await tx.$executeRawUnsafe(`SAVEPOINT ${SAVEPOINT}`);
  try {
    const result = await lookup(tx, params);
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${SAVEPOINT}`);
    return result;
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`);
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${SAVEPOINT}`);
    console.warn('internal_demo_rubric_lookup_failed', {
      assignmentTypeId: params.assignmentTypeId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function lookup(tx: RawTx, { assignmentTypeId, classIds }: { assignmentTypeId: string; classIds: string[] }) {
  const [contract] = await tx.$queryRaw<{ orgs: boolean; revisions: boolean }[]>`
    SELECT to_regclass('internal.demo_orgs') IS NOT NULL AS orgs,
           to_regclass('internal.platform_demo_revisions') IS NOT NULL AS revisions`;
  if (!contract?.orgs || !contract.revisions) {
    console.warn('internal_demo_rubric_contract_missing', { demoOrgs: Boolean(contract?.orgs), platformDemoRevisions: Boolean(contract?.revisions) });
    return null;
  }

  const [demo] = await tx.$queryRaw<{ isDemo: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM "Class" c
      JOIN "School" s ON s.id = c."schoolId"
      JOIN internal.demo_orgs d ON d.org_id = s."organizationId"
      WHERE c.id IN (${Prisma.join(classIds)})
    ) AS "isDemo"`;
  if (!demo?.isDemo) return null;

  const [type] = await tx.$queryRaw<{ rubricId: string | null; rubricName: string | null; currentRevisionId: string | null; baselineRevisionId: string | null }[]>`
    SELECT t."rubricId", r.name AS "rubricName", r."currentRevisionId", b."rubricRevisionId" AS "baselineRevisionId"
    FROM "AssignmentType" t
    LEFT JOIN "Rubric" r ON r.id = t."rubricId"
    LEFT JOIN "AssignmentTypeRubricBaseline" b ON b."assignmentTypeId" = t.id
    WHERE t.id = ${assignmentTypeId}`;
  if (!type) return null;
  // Mirror the pin trigger: it validates an explicit pin against the library
  // rubric only once that rubric has a current revision, else the per-type
  // baseline. Anything else would make the insert fail, so keep the default.
  let rubricKey: string | null = null;
  if (type.rubricId) rubricKey = type.currentRevisionId ? type.rubricName : null;
  else if (type.baselineRevisionId) rubricKey = perTypeKey(assignmentTypeId);
  if (!rubricKey) return null;

  const staged = await tx.$queryRaw<{ revisionId: string | null }[]>`
    SELECT platform_revision_id::text AS "revisionId" FROM internal.platform_demo_revisions
    WHERE rubric_key = ${rubricKey} ORDER BY staged_at DESC LIMIT 1`;
  const revisionId = staged[0]?.revisionId;
  if (!revisionId) return null;

  const [revision] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "RubricRevision" WHERE id = ${revisionId} AND "rubricName" = ${rubricKey}`;
  if (!revision) {
    console.warn('internal_demo_rubric_revision_mismatch', { rubricKey, revisionId });
    return null;
  }
  return revision.id;
}
