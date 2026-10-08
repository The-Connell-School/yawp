import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const PRISMA_DIR = join(import.meta.dir, '..');
const ROOT = join(PRISMA_DIR, '..', '..');
const HOLISTIC_MIGRATION = '20261008001200_set_holistic_tier_hornbuckle';
const TARGET_ID = 'cmur0glku00d401l1cg6ou25q';
const LABEL_DB = 'yawp_holistic_migration_label';
const DB = `postgresql://postgres:postgres@127.0.0.1:5432/${LABEL_DB}`;
const ADMIN_DB = 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';
const PATH_WITH_ROOT_BIN = `${join(ROOT, 'node_modules', '.bin')}:${process.env.PATH || ''}`;
const NODE_PATH_WITH_ROOT = `${join(ROOT, 'node_modules')}${process.env.NODE_PATH ? `:${process.env.NODE_PATH}` : ''}`;

function run(cmd: string, args: string[], cwd?: string, env?: Record<string, string>) {
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
  const res = run('psql', ['-v', 'ON_ERROR_STOP=1', ADMIN_DB, '-c', sql], ROOT, {
    DATABASE_URL: ADMIN_DB,
  });
  if (res.status !== 0) {
    throw new Error(`admin psql failed: ${res.stderr}\n${res.stdout}`);
  }
}

function psql(sql: string) {
  const res = run('psql', ['-v', 'ON_ERROR_STOP=1', DB, '-c', sql]);
  if (res.status !== 0) {
    throw new Error(`psql failed: ${res.stderr}\n${res.stdout}`);
  }
  return res.stdout;
}

function jsonQuery(sql: string) {
  const res = run('psql', ['-t', '-A', DB, '-c', `SELECT to_jsonb((${sql}))::text;`]);
  if (res.status !== 0) throw new Error(res.stderr);
  const line = res.stdout.trim().split('\n').pop() || '{}';
  return JSON.parse(line);
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

describe('holistic hornbuckle migration label (migrate deploy)', () => {
  test('RubricRevision createdBy is migration:holistic-tier-hornbuckle', () => {
    try {
      adminPsql(`DROP DATABASE IF EXISTS ${LABEL_DB} WITH (FORCE)`);
    } catch {}
    adminPsql(`CREATE DATABASE ${LABEL_DB}`);

    const dir = mkdtempSync(join(tmpdir(), 'yawp-holistic-label-'));
    cpSync(PRISMA_DIR, dir, { recursive: true });
    rmSync(join(dir, 'migrations', HOLISTIC_MIGRATION), { recursive: true, force: true });

    prismaDeploy(dir);

    psql(`
      INSERT INTO "Organization" ("id","createdAt","updatedAt","name")
      VALUES ('org-holistic-proof', now(), now(), 'Holistic proof org');
      INSERT INTO "AssignmentType" (
        "id","createdAt","updatedAt","title","position",
        "gradingOutputSchemaJson","rubricJson","scoringScaleJson"
      ) VALUES (
        '${TARGET_ID}',
        now(),
        now(),
        'In-class Essay/Analysis (Cristo Rey)',
        1,
        '{"responseShape":"categories_overall_comment","schemaVersion":1,"teacherNotesEnabled":true}'::jsonb,
        '{"categories":[{"key":"thesis","label":"Thesis","description":"Clear thesis","weight":1}]}'::jsonb,
        '{"type":"rubric_points","minScore":0,"maxScore":20,"step":1}'::jsonb
      );
    `);

    cpSync(
      join(PRISMA_DIR, 'migrations', HOLISTIC_MIGRATION),
      join(dir, 'migrations', HOLISTIC_MIGRATION),
      { recursive: true }
    );
    prismaDeploy(dir);

    const row = jsonQuery(`
      SELECT "createdBy", reason, version
      FROM "RubricRevision"
      WHERE "rubricName" = 'assignment-type:${TARGET_ID}'
      ORDER BY version DESC
      LIMIT 1
    `);
    expect(row.createdBy).toBe('migration:holistic-tier-hornbuckle');
    expect(String(row.reason)).toInclude('PR #411');

    rmSync(dir, { recursive: true, force: true });
  }, 180000);
});
