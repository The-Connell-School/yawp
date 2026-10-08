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
  '20261008121500_daily_pages_engagement_rubric_consolidation'
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
const SJP_DAILY_PAGES_TYPE_ID = 'cmtk7cy2r017y01l8r5ix4kxf';
const BASELINE_REVISION_ID = 'dp-engagement-fixture-baseline-revision';
const PINNED_ASSIGNMENT_ID = 'dp-pinned-assignment-prod-shape';
const NEW_DP_ASSIGNMENT_ID = 'dp-new-assignment-post-migration';
const NEW_SJP_ASSIGNMENT_ID = 'sjp-new-assignment-post-migration';
const SUBMISSION_ID = 'dp-pinned-submission-prod-shape';
const DOCUMENT_ID = 'dp-pinned-document-prod-shape';
const FIXTURE_ORG_ID = 'dp-engagement-fixture-org';
const FIXTURE_USER_ID = 'dp-engagement-fixture-user';
const FIXTURE_MEMBERSHIP_ID = 'dp-engagement-fixture-membership';

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
    join(dir, 'migrations', '20261008121500_daily_pages_engagement_rubric_consolidation'),
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
  const schema = JSON.parse(
    readFileSync(
      join(
        ROOT,
        'services/web-app/app/domain/rubrics/library/daily-pages-engagement-v1.fixture.json'
      ),
      'utf8'
    )
  ) as Record<string, unknown>;
  const outputSchema = schema.outputSchema as Record<string, unknown> | undefined;
  if (outputSchema) {
    delete outputSchema.assignmentPointScaling;
    delete outputSchema.teacherNotesEnabled;
  }
  return schema;
}

describe('daily-pages-engagement migration (real Postgres)', () => {
  test('pins assignments, publishes v2, is idempotent, and rollback restores pins', () => {
    adminPsql(`CREATE DATABASE ${DB_NAME}`);

    const pre = setupWithoutDpMigration();
    prismaDeploy(pre);

    const v1Schema = v1EngagementSchema();
    const v1Literal = JSON.stringify(v1Schema).replaceAll("'", "''");

    const baselineRubricName = `assignment-type:${DAILY_PAGES_TYPE_ID}`;
    psql(`
      INSERT INTO "Rubric" ("id","createdAt","updatedAt","name","title","schemaJson","currentRevisionId")
      VALUES (
        '${ENGAGEMENT_ID}', now(), now(), 'daily-pages-engagement', 'Daily Pages engagement',
        '${v1Literal}'::jsonb,
        NULL
      );
      INSERT INTO "RubricRevision" (
        "id","rubricName","version","schemaJson","fingerprint","requestId","requestHash","createdBy","reason","createdAt"
      ) VALUES (
        '${BASELINE_REVISION_ID}', '${baselineRubricName}', 3, '${v1Literal}'::jsonb,
        encode(sha256(convert_to(canonical_json('${v1Literal}'::jsonb),'UTF8')),'hex'),
        'dp-engagement-fixture-baseline-req', encode(sha256(convert_to(canonical_json('${v1Literal}'::jsonb),'UTF8')),'hex'),
        'fixture', '${baselineRubricName}', now()
      );
      INSERT INTO "AssignmentType" ("id","createdAt","updatedAt","title","kind","position","rubricId")
      VALUES
        ('${DAILY_PAGES_TYPE_ID}', now(), now(), 'Daily Pages', 'daily_pages', 0, NULL),
        ('${SJP_DAILY_PAGES_TYPE_ID}', now(), now(), 'SJP Daily Pages', NULL, 1, NULL);
      INSERT INTO "AssignmentTypeRubricBaseline" ("assignmentTypeId","rubricRevisionId")
      VALUES ('${DAILY_PAGES_TYPE_ID}', '${BASELINE_REVISION_ID}');
      ALTER TABLE "Assignment" DISABLE TRIGGER "internal_assignment_rubric_pin";
      INSERT INTO "Assignment" ("id","createdAt","updatedAt","assignmentTypeId","prompt","rubricRevisionId")
      VALUES ('${PINNED_ASSIGNMENT_ID}', now(), now(), '${DAILY_PAGES_TYPE_ID}', 'Pinned prompt', '${BASELINE_REVISION_ID}');
      ALTER TABLE "Assignment" ENABLE TRIGGER "internal_assignment_rubric_pin";
      INSERT INTO "InternalAssignmentRubricPinBackfill" ("assignmentId","selectedRevisionId","reason")
      VALUES ('${PINNED_ASSIGNMENT_ID}', '${BASELINE_REVISION_ID}', NULL);
      INSERT INTO "Organization" ("id","createdAt","updatedAt","name")
      VALUES ('${FIXTURE_ORG_ID}', now(), now(), 'DP engagement fixture org');
      INSERT INTO "User" ("id","createdAt","updatedAt","email","name")
      VALUES ('${FIXTURE_USER_ID}', now(), now(), 'dp-fixture@example.test', 'DP Fixture');
      INSERT INTO "OrgMembership" ("id","createdAt","userId","organizationId","role")
      VALUES ('${FIXTURE_MEMBERSHIP_ID}', now(), '${FIXTURE_USER_ID}', '${FIXTURE_ORG_ID}', 'STUDENT');
      INSERT INTO "Document" ("id","createdAt","updatedAt","title","text","html","membershipId","assignmentTypeId","assignmentId")
      VALUES (
        '${DOCUMENT_ID}', now(), now(), 'Pinned doc', 'hello', '<p>hello</p>',
        '${FIXTURE_MEMBERSHIP_ID}',
        '${DAILY_PAGES_TYPE_ID}', '${PINNED_ASSIGNMENT_ID}'
      );
      INSERT INTO "Submission" ("id","createdAt","updatedAt","documentId","html","text","title","submittedAt","overallScore","score")
      VALUES (
        '${SUBMISSION_ID}', now(), now(), '${DOCUMENT_ID}', '<p>hello</p>', 'hello', 'Pinned doc', now(), 18, '18/30'
      );
    `);

    const before = jsonQuery(`
      SELECT json_build_object(
        'assignmentRevision', (SELECT "rubricRevisionId" FROM "Assignment" WHERE id='${PINNED_ASSIGNMENT_ID}'),
        'revisionSchema', (SELECT "schemaJson" FROM "RubricRevision" WHERE id='${BASELINE_REVISION_ID}'),
        'submissionScore', (SELECT score FROM "Submission" WHERE id='${SUBMISSION_ID}'),
        'libraryScaling', (SELECT "schemaJson"->'outputSchema'->>'assignmentPointScaling' FROM "Rubric" WHERE id='${ENGAGEMENT_ID}')
      )
    `);
    expect(before.assignmentRevision).toBe(BASELINE_REVISION_ID);
    expect(before.libraryScaling).toBeNull();

    psqlFile(join(MIGRATION_DIR, 'migration.sql'));

    const afterFirst = jsonQuery(`
      SELECT json_build_object(
        'assignmentRevision', (SELECT "rubricRevisionId" FROM "Assignment" WHERE id='${PINNED_ASSIGNMENT_ID}'),
        'revisionSchema', (SELECT "schemaJson" FROM "RubricRevision" WHERE id='${BASELINE_REVISION_ID}'),
        'submissionScore', (SELECT score FROM "Submission" WHERE id='${SUBMISSION_ID}'),
        'libraryScaling', (SELECT "schemaJson"->'outputSchema'->>'assignmentPointScaling' FROM "Rubric" WHERE id='${ENGAGEMENT_ID}'),
        'typeRubricId', (SELECT "rubricId" FROM "AssignmentType" WHERE id='${DAILY_PAGES_TYPE_ID}'),
        'pinBackfillReason', (SELECT reason FROM "InternalAssignmentRubricPinBackfill" WHERE "assignmentId"='${PINNED_ASSIGNMENT_ID}')
      )
    `);
    expect(afterFirst.assignmentRevision).toBe(BASELINE_REVISION_ID);
    expect(afterFirst.revisionSchema).toEqual(before.revisionSchema);
    expect(afterFirst.submissionScore).toBe('18/30');
    expect(afterFirst.libraryScaling).toBe('daily_pages_engagement_v2');
    expect(afterFirst.typeRubricId).toBe(ENGAGEMENT_ID);
    expect(afterFirst.pinBackfillReason).toBeNull();

    psqlFile(join(MIGRATION_DIR, 'migration.sql'));

    const afterSecond = jsonQuery(`
      SELECT json_build_object(
        'assignmentRevision', (SELECT "rubricRevisionId" FROM "Assignment" WHERE id='${PINNED_ASSIGNMENT_ID}'),
        'revisionCount', (SELECT COUNT(*) FROM "RubricRevision" WHERE id='${BASELINE_REVISION_ID}'),
        'libraryScaling', (SELECT "schemaJson"->'outputSchema'->>'assignmentPointScaling' FROM "Rubric" WHERE id='${ENGAGEMENT_ID}')
      )
    `);
    expect(afterSecond.assignmentRevision).toBe(BASELINE_REVISION_ID);
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
    ).toBe(BASELINE_REVISION_ID);
    expect(Number(afterRollback.pinBackfill)).toBe(0);

    psqlFile(join(MIGRATION_DIR, 'migration.sql'));

    const v2RevisionId = jsonQuery(
      `(SELECT id FROM "RubricRevision" WHERE "requestId" LIKE 'brian-dp-rubric-2026-10-02%' ORDER BY "createdAt" DESC LIMIT 1)`
    ) as string;

    psql(`
      INSERT INTO "Assignment" ("id","createdAt","updatedAt","assignmentTypeId","prompt")
      VALUES
        ('${NEW_DP_ASSIGNMENT_ID}', now(), now(), '${DAILY_PAGES_TYPE_ID}', 'New DP after migration'),
        ('${NEW_SJP_ASSIGNMENT_ID}', now(), now(), '${SJP_DAILY_PAGES_TYPE_ID}', 'New SJP after migration');
    `);

    const afterReapply = jsonQuery(`
      SELECT json_build_object(
        'libraryScaling', (SELECT "schemaJson"->'outputSchema'->>'assignmentPointScaling' FROM "Rubric" WHERE id='${ENGAGEMENT_ID}'),
        'assignmentRevision', (SELECT "rubricRevisionId" FROM "Assignment" WHERE id='${PINNED_ASSIGNMENT_ID}'),
        'submissionScore', (SELECT score FROM "Submission" WHERE id='${SUBMISSION_ID}'),
        'newDpRevision', (SELECT "rubricRevisionId" FROM "Assignment" WHERE id='${NEW_DP_ASSIGNMENT_ID}'),
        'newSjpRevision', (SELECT "rubricRevisionId" FROM "Assignment" WHERE id='${NEW_SJP_ASSIGNMENT_ID}'),
        'sjpTypeRubricId', (SELECT "rubricId" FROM "AssignmentType" WHERE id='${SJP_DAILY_PAGES_TYPE_ID}')
      )
    `);
    expect(afterReapply.libraryScaling).toBe('daily_pages_engagement_v2');
    expect(afterReapply.assignmentRevision).toBe(BASELINE_REVISION_ID);
    expect(afterReapply.submissionScore).toBe('18/30');
    expect(afterReapply.sjpTypeRubricId).toBe(ENGAGEMENT_ID);
    expect(afterReapply.newDpRevision).toBe(v2RevisionId);
    expect(afterReapply.newSjpRevision).toBe(v2RevisionId);
  }, 120000);

  test('migration preserves teacherNotesEnabled when prod library has notes ON', () => {
    const dbName = `yawp_dp_notes_on_${Date.now()}`;
    const dbUrl = (() => {
      const u = new URL(DB_BASE);
      u.pathname = `/${dbName}`;
      return u.toString();
    })();
    const psqlOn = (sql: string) => {
      const res = run('psql', ['-v', 'ON_ERROR_STOP=1', dbUrl, '-c', sql]);
      if (res.status !== 0) throw new Error(res.stderr);
    };
    const jsonOn = (sql: string) => {
      const res = run('psql', ['-t', '-A', dbUrl, '-c', `SELECT to_jsonb((${sql}))::text;`]);
      if (res.status !== 0) throw new Error(res.stderr);
      return JSON.parse(res.stdout.trim().split('\n').pop() || 'null');
    };

    adminPsql(`CREATE DATABASE ${dbName}`);
    const pre = setupWithoutDpMigration();
    const deployRes = run('bun', ['run', 'prisma', 'migrate', 'deploy'], pre, {
      PATH: PATH_WITH_ROOT_BIN,
      NODE_PATH: NODE_PATH_WITH_ROOT,
      DATABASE_URL: dbUrl,
    });
    if (deployRes.status !== 0) {
      throw new Error(deployRes.stderr);
    }

    const v1Schema = v1EngagementSchema() as Record<string, unknown>;
    const outputSchema = (v1Schema.outputSchema ?? {}) as Record<string, unknown>;
    outputSchema.teacherNotesEnabled = true;
    v1Schema.outputSchema = outputSchema;
    const v1Literal = JSON.stringify(v1Schema).replaceAll("'", "''");

    psqlOn(`
      INSERT INTO "Rubric" ("id","createdAt","updatedAt","name","title","schemaJson","currentRevisionId")
      VALUES (
        '${ENGAGEMENT_ID}', now(), now(), 'daily-pages-engagement', 'Daily Pages engagement',
        '${v1Literal}'::jsonb,
        NULL
      );
      INSERT INTO "AssignmentType" ("id","createdAt","updatedAt","title","kind","position","rubricId")
      VALUES ('${DAILY_PAGES_TYPE_ID}', now(), now(), 'Daily Pages', 'daily_pages', 0, NULL);
    `);

    const migrateRes = run(
      'psql',
      ['-v', 'ON_ERROR_STOP=1', '-f', join(MIGRATION_DIR, 'migration.sql'), dbUrl]
    );
    if (migrateRes.status !== 0) throw new Error(migrateRes.stderr);

    const notesEnabled = jsonOn(
      `(SELECT "schemaJson"->'outputSchema'->'teacherNotesEnabled' FROM "Rubric" WHERE id='${ENGAGEMENT_ID}')`
    );
    expect(notesEnabled).toBe(true);
  }, 120000);

  test('migration leaves teacherNotesEnabled absent when not on the current rubric', () => {
    const dbName = `yawp_dp_notes_off_${Date.now()}`;
    const dbUrl = (() => {
      const u = new URL(DB_BASE);
      u.pathname = `/${dbName}`;
      return u.toString();
    })();
    const psqlOn = (sql: string) => {
      const res = run('psql', ['-v', 'ON_ERROR_STOP=1', dbUrl, '-c', sql]);
      if (res.status !== 0) throw new Error(res.stderr);
    };
    const jsonOn = (sql: string) => {
      const res = run('psql', ['-t', '-A', dbUrl, '-c', `SELECT (${sql})::text;`]);
      if (res.status !== 0) throw new Error(res.stderr);
      const line = res.stdout.trim().split('\n').pop();
      return line === '' || line === undefined ? null : line;
    };

    adminPsql(`CREATE DATABASE ${dbName}`);
    const pre = setupWithoutDpMigration();
    const deployRes = run('bun', ['run', 'prisma', 'migrate', 'deploy'], pre, {
      PATH: PATH_WITH_ROOT_BIN,
      NODE_PATH: NODE_PATH_WITH_ROOT,
      DATABASE_URL: dbUrl,
    });
    if (deployRes.status !== 0) {
      throw new Error(deployRes.stderr);
    }

    const v1Schema = v1EngagementSchema();
    const v1Literal = JSON.stringify(v1Schema).replaceAll("'", "''");

    psqlOn(`
      INSERT INTO "Rubric" ("id","createdAt","updatedAt","name","title","schemaJson","currentRevisionId")
      VALUES (
        '${ENGAGEMENT_ID}', now(), now(), 'daily-pages-engagement', 'Daily Pages engagement',
        '${v1Literal}'::jsonb,
        NULL
      );
      INSERT INTO "AssignmentType" ("id","createdAt","updatedAt","title","kind","position","rubricId")
      VALUES ('${DAILY_PAGES_TYPE_ID}', now(), now(), 'Daily Pages', 'daily_pages', 0, NULL);
    `);

    const migrateRes = run(
      'psql',
      ['-v', 'ON_ERROR_STOP=1', '-f', join(MIGRATION_DIR, 'migration.sql'), dbUrl]
    );
    if (migrateRes.status !== 0) throw new Error(migrateRes.stderr);

    const hasKey = jsonOn(
      `SELECT ("schemaJson"->'outputSchema' ? 'teacherNotesEnabled') FROM "Rubric" WHERE id='${ENGAGEMENT_ID}'`
    );
    expect(hasKey).toBe('f');
  }, 120000);
});
