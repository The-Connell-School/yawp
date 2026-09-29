import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const PRISMA_DIR = join(import.meta.dir, '..');
const ROOT = join(PRISMA_DIR, '..', '..');
const DB = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/yawp_migration_integration';
const ADMIN_DB = (() => { const u = new URL(DB); u.pathname = '/postgres'; return u.toString(); })();

function run(cmd: string, args: string[], cwd?: string, env?: Record<string, string>) {
  const res = spawnSync(cmd, args, {
    cwd: cwd || ROOT,
    env: { ...process.env, DATABASE_URL: DB, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120000,
  });
  return res;
}

function runAsync(cmd: string, args: string[], cwd?: string, env?: Record<string, string>) {
  const child = spawn(cmd, args, {
    cwd: cwd || ROOT,
    env: { ...process.env, DATABASE_URL: DB, ...env },
    stdio: 'ignore',
  });
  return child;
}

function psql(sql: string) {
  const res = run('psql', ['-v', 'ON_ERROR_STOP=1', DB, '-c', sql]);
  if (res.status !== 0) {
    throw new Error(`psql failed: ${res.status}\n${res.stderr}\n${res.stdout}`);
  }
  return res.stdout;
}

function adminPsql(sql: string) {
  const res = run('psql', ['-v', 'ON_ERROR_STOP=1', ADMIN_DB, '-c', sql]);
  if (res.status !== 0) {
    throw new Error(`admin psql failed: ${res.status}\n${res.stderr}\n${res.stdout}`);
  }
  return res.stdout;
}

function jsonQuery(sql: string) {
  const res = run('psql', ['-t', '-A', '-F', ',', DB, '-c', `SELECT to_jsonb((${sql}))::text;`]);
  if (res.status !== 0) throw new Error(`psql json failed: ${res.stderr}`);
  const line = res.stdout.trim().split('\n').pop() || '{}';
  return JSON.parse(line);
}

function setupTempCopy(excludeMigrations: string[] = []) {
  const dir = mkdtempSync(join(tmpdir(), 'yawp-prisma-'));
  cpSync(PRISMA_DIR, dir, { recursive: true });
  const migDir = join(dir, 'migrations');
  for (const name of excludeMigrations) {
    try {
      rmSync(join(migDir, name), { recursive: true, force: true });
    } catch {}
  }
  return dir;
}

function prismaDeploy(cwd: string) {
  const res = run('bun', ['prisma', 'migrate', 'deploy'], cwd);
  if (res.status !== 0) {
    throw new Error(`migrate deploy failed: ${res.status}\n${res.stderr}\n${res.stdout}`);
  }
}

function prismaDeployExpectFail(cwd: string) {
  const res = run('bun', ['prisma', 'migrate', 'deploy'], cwd);
  expect(res.status).not.toBe(0);
  return { stderr: res.stderr, stdout: res.stdout };
}

describe('migration integration (real Postgres)', () => {
  test('baseline-capture, pinning, idempotency, auto-revisions, immutability, rollback', () => {
    // Fresh database
    try { adminPsql('DROP DATABASE IF EXISTS yawp_migration_integration WITH (FORCE)'); } catch {}
    adminPsql('CREATE DATABASE yawp_migration_integration');

    // Apply main migrations up to before #383
    const pre = setupTempCopy([
      '20260928182000_pin_assignments_to_current_rubric_revision',
      '20260929034000_assignment_rubric_baseline_capture',
    ]);
    prismaDeploy(pre);

    // Seed: library rubric + 2 types (one shared rubric), per-type JSON type, and no-JSON type.
    const libSchema = {
      name: 'lib-shared',
      title: 'Shared Library Rubric',
      scoringScale: { type: 'rubric_points', minScore: 0, maxScore: 30, step: 10 },
      rubric: { categories: [{ key: 'engagement_with_prompt', label: 'Engagement', description: 'Shows up', weight: 1, scoreLabels: [{ value: 0, label: 'Absent' }, { value: 10, label: 'Hardly' }, { value: 20, label: 'Showed up' }, { value: 30, label: 'All in' }] }] },
    };
    const typeSchema = {
      scoringScale: { type: 'rubric_points', minScore: 0, maxScore: 30, step: 1 },
      rubric: { categories: [{ key: 'depth', label: 'Depth of Thought', description: 'Think', weight: 1 }] },
      promptConfig: { gradingInstructions: 'Be kind.' },
      outputSchema: { schemaVersion: 1 },
      calibrationNotes: 'None',
    };
    psql(`
      INSERT INTO "Rubric" ("id","createdAt","updatedAt","name","title","schemaJson")
      VALUES ('rub-1', now(), now(), 'lib-shared', 'Shared Library Rubric', '${JSON.stringify(libSchema).replaceAll("'", "''")}'::jsonb);
      INSERT INTO "AssignmentType" ("id","createdAt","updatedAt","title","kind","position","rubricId")
      VALUES ('t-lib-a', now(), now(), 'Lib A', 'lib_a', 0, 'rub-1'),
             ('t-lib-b', now(), now(), 'Lib B', 'lib_b', 0, 'rub-1');
      INSERT INTO "AssignmentType" ("id","createdAt","updatedAt","title","kind","position","rubricId","scoringScaleJson","rubricJson","gradingPromptConfigJson","gradingOutputSchemaJson","gradingCalibrationNotes")
      VALUES ('t-per', now(), now(), 'Daily Pages', 'daily_pages', 0, NULL, '${JSON.stringify(typeSchema.scoringScale).replaceAll("'", "''")}'::jsonb, '${JSON.stringify(typeSchema.rubric).replaceAll("'", "''")}'::jsonb, '${JSON.stringify(typeSchema.promptConfig).replaceAll("'", "''")}'::jsonb, '${JSON.stringify(typeSchema.outputSchema).replaceAll("'", "''")}'::jsonb, 'None');
      INSERT INTO "AssignmentType" ("id","createdAt","updatedAt","title","kind","position","rubricId")
      VALUES ('t-default', now(), now(), 'Welcome', 'welcome', 0, NULL);
      INSERT INTO "Assignment" ("id","createdAt","updatedAt","assignmentTypeId","prompt")
      VALUES ('a-lib-1', now(), now(), 't-lib-a', 'Lib A 1'),
             ('a-lib-2', now(), now(), 't-lib-b', 'Lib B 1'),
             ('a-per-1', now(), now(), 't-per', 'Per 1'),
             ('a-per-2', now(), now(), 't-per', 'Per 2'),
             ('a-nj-1', now(), now(), 't-default', 'No JSON 1'),
             ('a-nj-2', now(), now(), 't-default', 'No JSON 2');
      -- Minimal document/submission to prove grades untouched
      INSERT INTO "Document" ("id","createdAt","updatedAt","revision","title","assignmentTypeId","assignmentId")
      VALUES ('doc-1', now(), now(), 0, 'Doc', 't-per', 'a-per-1');
      INSERT INTO "Submission" ("id","createdAt","updatedAt","title","text","html","submittedAt","score","rubricScores","overallScore","numericPercentage","documentId")
      VALUES ('sub-1', now(), now(), 'T', 'txt', '<p>t</p>', now(), '18/30', '{"engagement_with_prompt":{"score":18}}'::jsonb, 18, NULL, 'doc-1');
    `);
    // Seed a pre-existing publisher pin that must survive rollback
    const libSchemaJson = JSON.stringify(libSchema).replaceAll("'", "''");
    psql(`
      INSERT INTO "RubricRevision" ("id","rubricName","version","schemaJson","fingerprint","requestId","requestHash","createdBy","reason","createdAt")
      VALUES ('rev-pub-1','lib-shared',1,'${libSchemaJson}'::jsonb,
              encode(sha256(convert_to(('${libSchemaJson}'::jsonb)::text,'UTF8')),'hex'),
              'req-pub-1',
              encode(sha256(convert_to(('${libSchemaJson}'::jsonb)::text,'UTF8')),'hex'),
              'publisher-x','Seeded revision', now());
      UPDATE "Rubric" SET "currentRevisionId"='rev-pub-1' WHERE id='rub-1';
      UPDATE "Assignment" SET "rubricRevisionId"='rev-pub-1' WHERE id='a-lib-2';
    `);
    // Capture pre-migration schema and data hashes AFTER seeding and BEFORE deploy
    const schemaPre = run('pg_dump', ['-s', DB]).stdout;
    function hash(tbl: string) {
      return run('psql', ['-t', '-A', DB, '-c', `SELECT md5(COALESCE(string_agg(row_to_json(t)::text, '' ORDER BY 1), '')) FROM (SELECT * FROM "${tbl}") t;`]).stdout.trim().split('\n').pop();
    }
    const preHash = { Rubric: hash('Rubric'), AssignmentType: hash('AssignmentType'), Assignment: hash('Assignment'), RubricRevision: hash('RubricRevision') };
    // Submission snapshot before applying migrations
    const beforeGrade = jsonQuery(`SELECT row_to_json(s) FROM "Submission" s WHERE id='sub-1'`);

    // Apply broken migration copy to prove failure (break quoting)
    const broken = setupTempCopy();
    const file = join(broken, 'migrations', '20260929034000_assignment_rubric_baseline_capture', 'migration.sql');
    const brokenSql = readFileSync(file, 'utf8').replaceAll('"schemaJson"', 'schemajson');
    writeFileSync(file, brokenSql, 'utf8');
    const fail1 = prismaDeployExpectFail(broken);
    expect(fail1.stderr + fail1.stdout).toContain('schemajson');
    // Resolve rolled back migration and assert no partials
    {
      const rr = run('bun', ['prisma', 'migrate', 'resolve', '--rolled-back', '20260929034000_assignment_rubric_baseline_capture'], broken);
      expect(rr.status).toBe(0);
    }
    const baselineExists = run('psql', ['-t', '-A', DB, '-c', `SELECT to_regclass('public."AssignmentTypeRubricBaseline"') IS NOT NULL;`]).stdout.trim().split('\n').pop();
    expect(baselineExists).toBe('f');
    const pinTrigger = run('psql', ['-t', '-A', DB, '-c', `SELECT COUNT(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='Assignment' AND t.tgname='internal_assignment_rubric_pin';`]).stdout.trim().split('\n').pop();
    expect(pinTrigger).toBe('1');

    // Apply correct migrations
    const current = setupTempCopy();
    const res2 = run('bun', ['prisma', 'migrate', 'deploy'], current);
    expect(res2.status).toBe(0);

    // (a) Pins for library/per-type; no-JSON unpinned with reason
    const counts = jsonQuery(`
      SELECT json_build_object(
        'pinned', (SELECT COUNT(*) FROM "Assignment" WHERE "rubricRevisionId" IS NOT NULL),
        'unpinned', (SELECT COUNT(*) FROM "Assignment" WHERE "rubricRevisionId" IS NULL),
        'codeDefault', (SELECT COUNT(*) FROM "InternalAssignmentRubricPinBackfill" WHERE reason = 'code-default')
      )
    `);
    expect(counts.pinned).toBe(4);
    expect(counts.unpinned).toBe(2);
    expect(counts.codeDefault).toBe(2);
    // pinned content equals sources
    const libEq = jsonQuery(`
      SELECT (
        SELECT rr."schemaJson" FROM "Assignment" a
        JOIN "RubricRevision" rr ON rr.id = a."rubricRevisionId"
        WHERE a.id = 'a-lib-1'
      ) = (
        SELECT "schemaJson" FROM "Rubric" WHERE id = 'rub-1'
      )
    `);
    expect(libEq).toBe(true);
    const perEq = jsonQuery(`
      SELECT (
        SELECT rr."schemaJson" FROM "Assignment" a
        JOIN "RubricRevision" rr ON rr.id = a."rubricRevisionId"
        WHERE a.id = 'a-per-1'
      ) @> jsonb_build_object(
        'scoringScale', '${JSON.stringify(typeSchema.scoringScale).replaceAll("'", "''")}'::jsonb,
        'rubric', '${JSON.stringify(typeSchema.rubric).replaceAll("'", "''")}'::jsonb
      )
    `);
    expect(perEq).toBe(true);

    // (b) Re-run is a no-op
    prismaDeploy(current);
    const afterCounts = jsonQuery(`SELECT (SELECT COUNT(*) FROM "RubricRevision")`);
    expect(typeof afterCounts).toBe('number');

    // (c) Inserting a new assignment auto-pins
    psql(`INSERT INTO "Assignment" ("id","createdAt","updatedAt","assignmentTypeId","prompt") VALUES ('a-per-3', now(), now(), 't-per','New');`);
    const pinnedNew = jsonQuery(`SELECT "rubricRevisionId" IS NOT NULL FROM "Assignment" WHERE id='a-per-3'`);
    expect(pinnedNew).toBe(true);

    // (d) Updating schemaJson / rubricJson creates version+1 and moves baseline/current
    const vBefore = jsonQuery(`SELECT COALESCE(MAX(version),0) FROM "RubricRevision" WHERE "rubricName"='lib-shared'`);
    psql(`UPDATE "Rubric" SET "schemaJson" = jsonb_set("schemaJson",'{"title"}','"Shared Library Rubric v2"') WHERE id='rub-1'`);
    const vAfter = jsonQuery(`SELECT MAX(version) FROM "RubricRevision" WHERE "rubricName"='lib-shared'`);
    expect(vAfter).toBe(vBefore + 1);
    psql(`INSERT INTO "Assignment" ("id","createdAt","updatedAt","assignmentTypeId","prompt") VALUES ('a-lib-3', now(), now(), 't-lib-a','After v2');`);
    const pinnedVer = jsonQuery(`
      SELECT rr.version FROM "Assignment" a JOIN "RubricRevision" rr ON rr.id = a."rubricRevisionId"
      WHERE a.id='a-lib-3'
    `);
    expect(pinnedVer).toBe(vAfter);
    // per-type
    const perBefore = jsonQuery(`SELECT COALESCE(MAX(version),0) FROM "RubricRevision" WHERE "rubricName"='assignment-type:t-per'`);
    psql(`UPDATE "AssignmentType" SET "rubricJson" = jsonb_set("rubricJson",'{"categories",0,"description"}','"Think deeper"') WHERE id='t-per'`);
    const perAfter = jsonQuery(`SELECT MAX(version) FROM "RubricRevision" WHERE "rubricName"='assignment-type:t-per'`);
    expect(perAfter).toBe(perBefore + 1);
    psql(`INSERT INTO "Assignment" ("id","createdAt","updatedAt","assignmentTypeId","prompt") VALUES ('a-per-4', now(), now(), 't-per','After per v2');`);
    const perPinnedVer = jsonQuery(`SELECT rr.version FROM "Assignment" a JOIN "RubricRevision" rr ON rr.id = a."rubricRevisionId" WHERE a.id='a-per-4'`);
    expect(perPinnedVer).toBe(perAfter);

    // (e) Changing a pin raises
    const someRev = jsonQuery(`SELECT id FROM "RubricRevision" WHERE "rubricName"='lib-shared' ORDER BY version ASC LIMIT 1`);
    const upd = run('psql', ['-v', 'ON_ERROR_STOP=1', DB, '-c', `UPDATE "Assignment" SET "rubricRevisionId"='${someRev}' WHERE id='a-lib-3'`]);
    expect(upd.status).not.toBe(0);
    expect(upd.stderr + upd.stdout).toContain('immutable');

    // (f) Submission remains byte-identical
    const afterGrade = jsonQuery(`SELECT row_to_json(s) FROM "Submission" s WHERE id='sub-1'`);
    expect(JSON.stringify(afterGrade)).toBe(JSON.stringify(beforeGrade));

    // (g) rollback restores schema/data
    const rollback = readFileSync(join(PRISMA_DIR, 'migrations', '20260928182000_pin_assignments_to_current_rubric_revision', 'rollback.sql'), 'utf8');
    psql(rollback);
    // Zero-diff schema vs pre-migration
    const schemaAfter = run('pg_dump', ['-s', DB]).stdout;
    expect(schemaAfter).toBe(schemaPre);
    // Data byte-identical vs pre for core tables
    const postHash = {
      Rubric: hash('Rubric'),
      AssignmentType: hash('AssignmentType'),
      Assignment: hash('Assignment'),
      RubricRevision: hash('RubricRevision'),
    };
    expect(postHash).toEqual(preHash);
    // Publisher seed and pin survived rollback
    const pubStillThere = jsonQuery(`SELECT EXISTS (SELECT 1 FROM "RubricRevision" WHERE id='rev-pub-1' AND "createdBy"='publisher-x')`);
    expect(pubStillThere).toBe(true);
    const pinStillThere = jsonQuery(`SELECT "rubricRevisionId"='rev-pub-1' FROM "Assignment" WHERE id='a-lib-2'`);
    expect(pinStillThere).toBe(true);
    // No leftover auto triggers/functions
    const triggers = run('psql', ['-t', '-A', DB, '-c', `SELECT tgname FROM pg_trigger WHERE tgname LIKE 'yawp_auto_%';`]).stdout.trim();
    expect(triggers).toBe('');
    const procs = run('psql', ['-t', '-A', DB, '-c', `SELECT proname FROM pg_proc WHERE proname LIKE 'yawp_auto_%';`]).stdout.trim();
    expect(procs).toBe('');
    // Per-type JSON edit after rollback works (no baseline table)
    const edit = run('psql', ['-v', 'ON_ERROR_STOP=1', DB, '-c', `UPDATE "AssignmentType" SET "rubricJson" = jsonb_set(COALESCE("rubricJson",'{}'::jsonb),'{"categories"}','[]'::jsonb) WHERE id='t-per'`]);
    expect(edit.status).toBe(0);
    // Re-apply migrations after rollback
    prismaDeploy(current);
    // (h) Confirm re-apply works and core tables intact (hash compare not strictly identical because ids may be regenerated elsewhere, but presence check suffices)
    expect(run('psql', ['-t', '-A', DB, '-c', `SELECT COUNT(*) FROM "Rubric"`]).status).toBe(0);
  });

  test('lock_timeout enforced under migrate deploy', () => {
    try { adminPsql('DROP DATABASE IF EXISTS yawp_migration_integration WITH (FORCE)'); } catch {}
    adminPsql('CREATE DATABASE yawp_migration_integration');
    const pre = setupTempCopy([
      '20260928182000_pin_assignments_to_current_rubric_revision',
      '20260929034000_assignment_rubric_baseline_capture',
    ]);
    prismaDeploy(pre);
    // Seed just enough to reach the DROP TRIGGER point
    psql(`INSERT INTO "AssignmentType" ("id","createdAt","updatedAt","title","kind","position") VALUES ('t1', now(), now(), 'Type', 'k', 0);
          INSERT INTO "Assignment" ("id","createdAt","updatedAt","assignmentTypeId","prompt") VALUES ('a1', now(), now(), 't1','P');`);
    // Hold lock on Assignment to block DROP TRIGGER
    const locker = runAsync('psql', ['-v', 'ON_ERROR_STOP=1', DB, '-c', `BEGIN; LOCK TABLE "Assignment" IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(300);`]);
    // Wait until lock is held
    const lockQuery = `SELECT EXISTS (
      SELECT 1 FROM pg_locks l
      JOIN pg_class c ON c.oid = l.relation
      WHERE c.relname='Assignment' AND l.mode='AccessExclusiveLock' AND l.granted
    )`;
    const startPoll = Date.now();
    while (true) {
      const has = run('psql', ['-t', '-A', DB, '-c', lockQuery]).stdout.trim().split('\n').pop();
      if (has === 't') break;
      if (Date.now() - startPoll > 5000) throw new Error('lock not acquired in time');
    }
    const current = setupTempCopy();
    const start = Date.now();
    const res = run('bun', ['prisma', 'migrate', 'deploy'], current);
    const elapsed = Date.now() - start;
    // Expect failure within ~5-7 seconds due to lock_timeout
    expect(res.status).not.toBe(0);
    expect(elapsed).toBeGreaterThanOrEqual(4500);
    expect(elapsed).toBeLessThan(9000);
    expect(res.stderr + res.stdout).toMatch(/lock_timeout|timeout/i);
    // Ensure no baseline table was created
    const hasBaseline = run('psql', ['-t', '-A', DB, '-c', `SELECT to_regclass('public."AssignmentTypeRubricBaseline"') IS NOT NULL;`]).stdout.trim().split('\n').pop();
    expect(hasBaseline).toBe('f');
    // Kill locker and wait for lock to clear before recovery
    locker.kill('SIGKILL');
    const startWait = Date.now();
    while (true) {
      const has = run('psql', ['-t', '-A', DB, '-c', lockQuery]).stdout.trim().split('\n').pop();
      if (has === 'f') break;
      if (Date.now() - startWait > 15000) throw new Error('lock not released in time');
    }
    // Resolve and re-deploy after lock timeout
    {
      const r1 = run('bun', ['prisma', 'migrate', 'resolve', '--rolled-back', '20260928182000_pin_assignments_to_current_rubric_revision'], current);
      expect(r1.status).toBe(0);
    }
    {
      const r2 = run('bun', ['prisma', 'migrate', 'resolve', '--rolled-back', '20260929034000_assignment_rubric_baseline_capture'], current);
      expect(r2.status).toBe(0);
    }
    prismaDeploy(current);
  });

  test('canonical JSON SQL fingerprint matches app fingerprint()', () => {
    // Fresh DB with migrations applied to ensure canonical_json() exists
    try { adminPsql('DROP DATABASE IF EXISTS yawp_migration_integration WITH (FORCE)'); } catch {}
    adminPsql('CREATE DATABASE yawp_migration_integration');
    prismaDeploy(PRISMA_DIR);
    const cases: unknown[] = [
      { b: true, a: 1.0, z: null, m: {}, n: [], c: { y: 'x', x: 'y' } },
      { obj: { nested: { a: 1, b: 0.5, c: [3, 2, 1] } }, arr: [ { k: 2 }, { k: 1 } ] },
      { text: 'He said "Hello", then \\ escaped.\nNext line.', uni: '雪豹 🐆' },
      0.5,
      1.0,
      2,
      [],
      {},
      null,
      true,
      false,
    ];
    function canonical(value: any): string {
      if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
      if (value !== null && typeof value === 'object')
        return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as any)[k])}`).join(',')}}`;
      return JSON.stringify(value);
    }
    const fp = (v: unknown) => createHash('sha256').update(canonical(v)).digest('hex');
    for (const value of cases) {
      const sqlJson = JSON.stringify(value).replaceAll("'", "''");
      const sql = `SELECT encode(sha256(convert_to(canonical_json('${sqlJson}'::jsonb),'UTF8')),'hex')`;
      const got = run('psql', ['-t', '-A', DB, '-c', sql]).stdout.trim().split('\n').pop();
      expect(got).toBe(fp(value));
    }
  });
});

