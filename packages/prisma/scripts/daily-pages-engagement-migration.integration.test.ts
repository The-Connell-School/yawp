import { describe, expect, test } from 'bun:test';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const PRISMA_DIR = join(import.meta.dir, '..');
const ROOT = join(PRISMA_DIR, '..', '..');
const MIGRATION_DIR = join(
  PRISMA_DIR,
  'migrations',
  '20261007210000_daily_pages_engagement_rubric_consolidation'
);
const DB_BASE =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:5432/postgres';
const DB_NAME = `yawp_dp_eng_${Date.now()}`;
const DB = (() => {
  const u = new URL(DB_BASE);
  u.pathname = `/${DB_NAME}`;
  return u.toString();
})();
const ADMIN_DB = (() => {
  const u = new URL(DB_BASE);
  u.pathname = '/postgres';
  return u.toString();
})();
const PATH_WITH_ROOT_BIN = `${join(ROOT, 'node_modules', '.bin')}:${process.env.PATH || ''}`;
const NODE_PATH_WITH_ROOT = `${join(ROOT, 'node_modules')}${process.env.NODE_PATH ? `:${process.env.NODE_PATH}` : ''}`;

const ENGAGEMENT_ID = 'cmsvqo8lf002801l60o74x8wr';
const DAILY_PAGES_TYPE_ID = 'cmlgtyo8j01em0qjs6knw7cni';
const PINNED_REVISION_ID = 'dp-engagement-fixture-pinned-revision';
const PINNED_ASSIGNMENT_ID = 'dp-pinned-assignment-prod-shape';

function run(
  cmd: string,
  args: string[],
  cwd?: string,
  env?: Record<string, string>
) {
  const res = spawnSync(cmd, args, {
    cwd: cwd || ROOT,
    env: { ...process.env, DATABASE_URL: DB, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 180000,
  });
  return res;
}

function adminPsql(sql: string) {
  const res = run('psql', ['-v', 'ON_ERROR_STOP=1', ADMIN_DB, '-c', sql]);
  if (res.status !== 0) {
    throw new Error(`admin psql failed: ${res.stderr}\n${res.stdout}`);
  }
}

function psql(sql: string) {
  const res = run('psql', ['-v', 'ON_ERROR_STOP=1', DB, '-c', sql]);
  if (res.status !== 0) {
    throw new Error(`psql failed: ${res.stderr}\n${res.stdout}`);
  }
}

function psqlFile(path: string) {
  const res = run('psql', ['-v', 'ON_ERROR_STOP=1', '-f', path, DB]);
  if (res.status !== 0) {
    throw new Error(`psql file failed: ${res.stderr}\n${res.stdout}`);
  }
}

function jsonQuery(sql: string) {
  const res = run('psql', ['-t', '-A', DB, '-c', `SELECT to_jsonb((${sql}))::text;`]);
  if (res.status !== 0) throw new Error(`psql json failed: ${res.stderr}`);
  const line = res.stdout.trim().split('\n').pop() || '{}';
  return JSON.parse(line);
}

function setupWithoutDpMigration() {
  const dir = mkdtempSync(join(tmpdir(), 'yawp-prisma-dp-'));
  cpSync(PRISMA_DIR, dir, { recursive: true });
  rmSync(
    join(dir, 'migrations', '20261007210000_daily_pages_engagement_rubric_consolidation'),
    { recursive: true, force: true }
  );
  return dir;
}

function prismaDeploy(cwd: string) {
  const res = run('bun', ['run', 'prisma', 'migrate', 'deploy'], cwd, {
    PATH: PATH_WITH_ROOT_BIN,
    NODE_PATH: NODE_PATH_WITH_ROOT,
  });
  if (res.status !== 0) {
    throw new Error(`migrate deploy failed: ${res.stderr}\n${res.stdout}`);
  }
}

function v1EngagementSchema() {
  const current = JSON.parse(
    readFileSync(
      join(
        ROOT,
        'services/web-app/app/domain/rubrics/library/daily-pages-engagement.json'
      ),
      'utf8'
    )
  ) as Record<string, unknown>;
  const schema = structuredClone(current);
  const outputSchema = schema.outputSchema as Record<string, unknown>;
  delete outputSchema.assignmentPointScaling;
  delete outputSchema.teacherNotesEnabled;
  (schema.scoringScale as { step: number }).step = 10;
  return schema;
}

describe('daily-pages-engagement migration (real Postgres)', () => {
  test('pins assignments, publishes v2, is idempotent, and rollback restores pins', () => {
    adminPsql(`CREATE DATABASE ${DB_NAME}`);

    const pre = setupWithoutDpMigration();
    prismaDeploy(pre);

    const v1Schema = v1EngagementSchema();
    const v1Literal = JSON.stringify(v1Schema).replaceAll("'", "''");

    psql(`
      INSERT INTO "RubricRevision" (
        "id","rubricName","version","schemaJson","fingerprint","requestId","requestHash","createdBy","reason","createdAt"
      ) VALUES (
        '${PINNED_REVISION_ID}', 'daily-pages-engagement', 5, '${v1Literal}'::jsonb,
        encode(sha256(convert_to(canonical_json('${v1Literal}'::jsonb),'UTF8')),'hex'),
        'dp-engagement-fixture-pinned-revision-req', encode(sha256(convert_to(canonical_json('${v1Literal}'::jsonb),'UTF8')),'hex'),
        'fixture', 'Prod-shaped pinned revision', now()
      );
      INSERT INTO "Rubric" ("id","createdAt","updatedAt","name","title","schemaJson","currentRevisionId")
      VALUES (
        '${ENGAGEMENT_ID}', now(), now(), 'daily-pages-engagement', 'Daily Pages engagement',
        '${v1Literal}'::jsonb,
        '${PINNED_REVISION_ID}'
      );
      INSERT INTO "AssignmentType" ("id","createdAt","updatedAt","title","kind","position","rubricId")
      VALUES ('${DAILY_PAGES_TYPE_ID}', now(), now(), 'Daily Pages', 'daily_pages', 0, NULL);
      ALTER TABLE "Assignment" DISABLE TRIGGER "internal_assignment_rubric_pin";
      INSERT INTO "Assignment" ("id","createdAt","updatedAt","assignmentTypeId","prompt","rubricRevisionId")
      VALUES ('${PINNED_ASSIGNMENT_ID}', now(), now(), '${DAILY_PAGES_TYPE_ID}', 'Pinned prompt', '${PINNED_REVISION_ID}');
      ALTER TABLE "Assignment" ENABLE TRIGGER "internal_assignment_rubric_pin";
    `);

    const before = jsonQuery(`
      SELECT json_build_object(
        'assignmentRevision', (SELECT "rubricRevisionId" FROM "Assignment" WHERE id='${PINNED_ASSIGNMENT_ID}'),
        'revisionSchema', (SELECT "schemaJson" FROM "RubricRevision" WHERE id='${PINNED_REVISION_ID}'),
        'libraryScaling', (SELECT "schemaJson"->'outputSchema'->>'assignmentPointScaling' FROM "Rubric" WHERE id='${ENGAGEMENT_ID}')
      )
    `);
    expect(before.assignmentRevision).toBe(PINNED_REVISION_ID);
    expect(before.libraryScaling).toBeNull();

    psqlFile(join(MIGRATION_DIR, 'migration.sql'));

    const afterFirst = jsonQuery(`
      SELECT json_build_object(
        'assignmentRevision', (SELECT "rubricRevisionId" FROM "Assignment" WHERE id='${PINNED_ASSIGNMENT_ID}'),
        'revisionSchema', (SELECT "schemaJson" FROM "RubricRevision" WHERE id='${PINNED_REVISION_ID}'),
        'libraryScaling', (SELECT "schemaJson"->'outputSchema'->>'assignmentPointScaling' FROM "Rubric" WHERE id='${ENGAGEMENT_ID}'),
        'typeRubricId', (SELECT "rubricId" FROM "AssignmentType" WHERE id='${DAILY_PAGES_TYPE_ID}'),
        'pinBackfill', (SELECT COUNT(*) FROM "InternalAssignmentRubricPinBackfill" WHERE "assignmentId"='${PINNED_ASSIGNMENT_ID}' AND reason='dp_engagement_v2_pre_publish')
      )
    `);
    expect(afterFirst.assignmentRevision).toBe(PINNED_REVISION_ID);
    expect(afterFirst.revisionSchema).toEqual(before.revisionSchema);
    expect(afterFirst.libraryScaling).toBe('daily_pages_engagement_v2');
    expect(afterFirst.typeRubricId).toBe(ENGAGEMENT_ID);
    expect(Number(afterFirst.pinBackfill)).toBe(1);

    psqlFile(join(MIGRATION_DIR, 'migration.sql'));

    const afterSecond = jsonQuery(`
      SELECT json_build_object(
        'assignmentRevision', (SELECT "rubricRevisionId" FROM "Assignment" WHERE id='${PINNED_ASSIGNMENT_ID}'),
        'revisionCount', (SELECT COUNT(*) FROM "RubricRevision" WHERE id='${PINNED_REVISION_ID}'),
        'libraryScaling', (SELECT "schemaJson"->'outputSchema'->>'assignmentPointScaling' FROM "Rubric" WHERE id='${ENGAGEMENT_ID}')
      )
    `);
    expect(afterSecond.assignmentRevision).toBe(PINNED_REVISION_ID);
    expect(Number(afterSecond.revisionCount)).toBe(1);
    expect(afterSecond.libraryScaling).toBe('daily_pages_engagement_v2');

    psqlFile(join(MIGRATION_DIR, 'rollback.sql'));

    const afterRollback = jsonQuery(`
      SELECT json_build_object(
        'libraryScaling', (SELECT "schemaJson"->'outputSchema'->>'assignmentPointScaling' FROM "Rubric" WHERE id='${ENGAGEMENT_ID}'),
        'currentRevisionId', (SELECT "currentRevisionId" FROM "Rubric" WHERE id='${ENGAGEMENT_ID}'),
        'typeRubricId', (SELECT "rubricId" FROM "AssignmentType" WHERE id='${DAILY_PAGES_TYPE_ID}'),
        'pinBackfill', (SELECT COUNT(*) FROM "InternalAssignmentRubricPinBackfill" WHERE reason='dp_engagement_v2_pre_publish')
      )
    `);
    expect(afterRollback.libraryScaling).toBeNull();
    expect(afterRollback.currentRevisionId).toBeNull();
    expect(afterRollback.typeRubricId).toBeNull();
    expect(
      jsonQuery(
        `(SELECT "rubricRevisionId" FROM "Assignment" WHERE id='${PINNED_ASSIGNMENT_ID}')`
      )
    ).toBe(PINNED_REVISION_ID);
    expect(Number(afterRollback.pinBackfill)).toBe(0);
  }, 120000);
});
