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
const PATH_WITH_ROOT_BIN = `${join(ROOT, 'node_modules', '.bin')}:${process.env.PATH || ''}`;
const NODE_PATH_WITH_ROOT = `${join(ROOT, 'node_modules')}${process.env.NODE_PATH ? `:${process.env.NODE_PATH}` : ''}`;

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

// Migrations that redefine the #383/#386 trigger functions. They must never be applied
// before those two in the "up to before" copies, or they create the functions early.
const DEPENDS_ON_PIN_MIGRATIONS = ['20261007160000_rubric_revision_actor'];

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
  const res = run('bun', ['run', 'prisma', 'migrate', 'deploy'], cwd, { PATH: PATH_WITH_ROOT_BIN, NODE_PATH: NODE_PATH_WITH_ROOT });
  if (res.status !== 0) {
    throw new Error(`migrate deploy failed: ${res.status}\n${res.stderr}\n${res.stdout}`);
  }
}

function prismaDeployExpectFail(cwd: string) {
  const res = run('bun', ['run', 'prisma', 'migrate', 'deploy'], cwd, { PATH: PATH_WITH_ROOT_BIN, NODE_PATH: NODE_PATH_WITH_ROOT });
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
      ...DEPENDS_ON_PIN_MIGRATIONS,
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
      -- Minimal ownership graph to satisfy Document ownership CHECKs
      INSERT INTO "Organization" ("id","createdAt","updatedAt","name")
      VALUES ('org-1', now(), now(), 'Test Org');
      INSERT INTO "User" ("id","createdAt","updatedAt","email","name","isAdmin","isSuperAdmin")
      VALUES ('user-1', now(), now(), 'user1@example.com', 'User One', false, false);
      INSERT INTO "OrgMembership" ("id","createdAt","userId","organizationId","role","isOrgOwner","isActive")
      VALUES ('mem-1', now(), 'user-1', 'org-1', 'STUDENT', false, true);

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
             ('a-lib-3', now(), now(), 't-lib-b', 'Lib B 2'),
             ('a-per-1', now(), now(), 't-per', 'Per 1'),
             ('a-per-2', now(), now(), 't-per', 'Per 2'),
             ('a-nj-1', now(), now(), 't-default', 'No JSON 1'),
             ('a-nj-2', now(), now(), 't-default', 'No JSON 2');
      -- Minimal document/submission to prove grades untouched
      INSERT INTO "Document" ("id","createdAt","updatedAt","revision","title","assignmentTypeId","assignmentId","membershipId")
      VALUES ('doc-1', now(), now(), 0, 'Doc', 't-per', 'a-per-1', 'mem-1');
      INSERT INTO "Submission" ("id","createdAt","updatedAt","title","text","html","submittedAt","score","rubricScores","overallScore","numericPercentage","documentId")
      VALUES ('sub-1', now(), now(), 'T', 'txt', '<p>t</p>', now(), '18/30', '{"engagement_with_prompt":{"score":18}}'::jsonb, 18, NULL, 'doc-1');
    `);
    // Seed a differing-schema publisher revision and pin one assignment to it; make it current
    const libSchemaJsonPub = JSON.stringify({
      name: 'lib-shared',
      title: 'Publisher Variant',
      scoringScale: { type: 'rubric_points', minScore: 0, maxScore: 30, step: 10 },
      rubric: { categories: [{ key: 'engagement_with_prompt', label: 'Engagement', description: 'Shows up (pub)', weight: 1, scoreLabels: [{ value: 0, label: 'Absent' }, { value: 10, label: 'Hardly' }, { value: 20, label: 'Showed up' }, { value: 30, label: 'All in' }] }] }
    }).replaceAll("'", "''");
    psql(`
      INSERT INTO "RubricRevision" ("id","rubricName","version","schemaJson","fingerprint","requestId","requestHash","createdBy","reason","createdAt")
      VALUES ('rev-pub-2','lib-shared',1,'${libSchemaJsonPub}'::jsonb,
              encode(sha256(convert_to(('${libSchemaJsonPub}'::jsonb)::text,'UTF8')),'hex'),
              'req-pub-2',
              encode(sha256(convert_to(('${libSchemaJsonPub}'::jsonb)::text,'UTF8')),'hex'),
              'publisher-x','Seeded revision', now());
      UPDATE "Rubric" SET "currentRevisionId"='rev-pub-2' WHERE id='rub-1';
      UPDATE "Assignment" SET "rubricRevisionId"='rev-pub-2' WHERE id='a-lib-2';
    `);
    // Capture pre-migration schema and data hashes AFTER seeding and BEFORE deploy
    function normalizeSchemaDump(s: string) {
      return s.split('\n').filter(l => !/^\s*\\(?:un)?restrict\b/.test(l)).join('\n');
    }
    const schemaPre = normalizeSchemaDump(run('pg_dump', ['-s', DB]).stdout);
    // Capture full pre-migration table snapshots for diff-on-failure
    function dumpTableRows(tbl: string): any[] {
      const out = run('psql', ['-t', '-A', DB, '-c', `SELECT row_to_json(t) FROM "${tbl}" t ORDER BY id;`]).stdout.trim();
      const rows = out ? out.split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
      return rows;
    }
    const preRows = {
      Rubric: dumpTableRows('Rubric'),
      AssignmentType: dumpTableRows('AssignmentType'),
      Assignment: dumpTableRows('Assignment'),
    };
    function hash(tbl: string) {
      // Use jsonb text form for deterministic key ordering
      return run('psql', ['-t', '-A', DB, '-c', `SELECT md5(COALESCE(string_agg((to_jsonb(t))::text, '' ORDER BY id), '')) FROM (SELECT * FROM "${tbl}" ORDER BY id) t;`]).stdout.trim().split('\n').pop();
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
      const rr = run('bun', ['run', 'prisma', 'migrate', 'resolve', '--rolled-back', '20260929034000_assignment_rubric_baseline_capture'], broken, { PATH: PATH_WITH_ROOT_BIN, NODE_PATH: NODE_PATH_WITH_ROOT });
      expect(rr.status).toBe(0);
    }
    const baselineExists = run('psql', ['-t', '-A', DB, '-c', `SELECT to_regclass('public."AssignmentTypeRubricBaseline"') IS NOT NULL;`]).stdout.trim().split('\n').pop();
    expect(baselineExists).toBe('f');
    const pinTrigger = run('psql', ['-t', '-A', DB, '-c', `SELECT COUNT(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='Assignment' AND t.tgname='internal_assignment_rubric_pin';`]).stdout.trim().split('\n').pop();
    expect(pinTrigger).toBe('1');

    // Apply migration 1 only, then assert a-lib-1 appears in audit with a selected revision id
    const onlyM1 = setupTempCopy([
      '20260929034000_assignment_rubric_baseline_capture',
      ...DEPENDS_ON_PIN_MIGRATIONS,
    ]);
    prismaDeploy(onlyM1);
    const aLib1AuditAfterM1 = jsonQuery(`
      SELECT EXISTS (
        SELECT 1 FROM "InternalAssignmentRubricPinBackfill" WHERE "assignmentId"='a-lib-1'
      )
    `);
    expect(aLib1AuditAfterM1).toBe(true);

    // Apply correct migrations (migration 2)
    const current = setupTempCopy();
    const res2 = run('bun', ['run', 'prisma', 'migrate', 'deploy'], current, { PATH: PATH_WITH_ROOT_BIN, NODE_PATH: NODE_PATH_WITH_ROOT });
    expect(res2.status).toBe(0);

    // (a) Pins for library/per-type; no-JSON unpinned with reason
    const counts = jsonQuery(`
      SELECT json_build_object(
        'pinned', (SELECT COUNT(*) FROM "Assignment" WHERE "rubricRevisionId" IS NOT NULL),
        'unpinned', (SELECT COUNT(*) FROM "Assignment" WHERE "rubricRevisionId" IS NULL),
        'codeDefault', (SELECT COUNT(*) FROM "InternalAssignmentRubricPinBackfill" WHERE reason = 'code-default')
      )
    `);
    expect(counts.pinned).toBe(5);
    expect(counts.unpinned).toBe(2);
    expect(counts.codeDefault).toBe(2);
    // Shared-rubric baseline mapping exists for both types and to the same revision
    const sharedBaseline = jsonQuery(`
      SELECT json_build_object(
        'rows', (SELECT COUNT(*) FROM "AssignmentTypeRubricBaseline" WHERE "assignmentTypeId" IN ('t-lib-a','t-lib-b')),
        'distinctRevs', (SELECT COUNT(DISTINCT "rubricRevisionId") FROM "AssignmentTypeRubricBaseline" WHERE "assignmentTypeId" IN ('t-lib-a','t-lib-b'))
      )
    `);
    expect(sharedBaseline.rows).toBe(2);
    expect(sharedBaseline.distinctRevs).toBe(1);
    const sharedPins = jsonQuery(`SELECT COUNT(DISTINCT "rubricRevisionId") FROM "Assignment" WHERE id IN ('a-lib-1','a-lib-3')`);
    expect(sharedPins).toBe(1);
    // Revisions: baseline + one seeded publisher (rev-pub-2)
    const revCount = jsonQuery(`SELECT COUNT(*) FROM "RubricRevision" WHERE "rubricName"='lib-shared'`);
    expect(revCount).toBe(2);
    // Baseline became current; previous pointer recorded once
    const currentIsBaseline = jsonQuery(`
      SELECT EXISTS (
        SELECT 1 FROM "Rubric" r
        JOIN "RubricRevision" rr ON rr.id = r."currentRevisionId"
        WHERE r.id='rub-1' AND rr."createdBy"='baseline-capture'
      )
    `);
    expect(currentIsBaseline).toBe(true);
    const restoreRows = jsonQuery(`SELECT COUNT(*) FROM "InternalRubricCurrentPointerRestore" WHERE "rubricId"='rub-1'`);
    expect(restoreRows).toBe(1);
    // pinned content equals sources
    const baselineEq = jsonQuery(`
      SELECT (
        SELECT rr."schemaJson"
        FROM "AssignmentTypeRubricBaseline" b
        JOIN "RubricRevision" rr ON rr.id = b."rubricRevisionId"
        WHERE b."assignmentTypeId"='t-lib-a'
      ) = (SELECT "schemaJson" FROM "Rubric" WHERE id='rub-1')
    `);
    expect(baselineEq).toBe(true);
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

    // (b) Re-run is a no-op: verify counts and hashes identical before vs after a second deploy
    const snapBefore = {
      rubRev: jsonQuery(`SELECT COUNT(*) FROM "RubricRevision"`),
      baseline: jsonQuery(`SELECT COUNT(*) FROM "AssignmentTypeRubricBaseline"`),
      audit: jsonQuery(`SELECT COUNT(*) FROM "InternalAssignmentRubricPinBackfill"`),
      restore: jsonQuery(`SELECT COUNT(*) FROM "InternalRubricCurrentPointerRestore"`),
      pinned: jsonQuery(`SELECT COUNT(*) FROM "Assignment" WHERE "rubricRevisionId" IS NOT NULL`),
      hRubric: hash('Rubric'),
      hType: hash('AssignmentType'),
      hAssign: hash('Assignment'),
      hRev: hash('RubricRevision'),
    };
    prismaDeploy(current);
    const snapAfter = {
      rubRev: jsonQuery(`SELECT COUNT(*) FROM "RubricRevision"`),
      baseline: jsonQuery(`SELECT COUNT(*) FROM "AssignmentTypeRubricBaseline"`),
      audit: jsonQuery(`SELECT COUNT(*) FROM "InternalAssignmentRubricPinBackfill"`),
      restore: jsonQuery(`SELECT COUNT(*) FROM "InternalRubricCurrentPointerRestore"`),
      pinned: jsonQuery(`SELECT COUNT(*) FROM "Assignment" WHERE "rubricRevisionId" IS NOT NULL`),
      hRubric: hash('Rubric'),
      hType: hash('AssignmentType'),
      hAssign: hash('Assignment'),
      hRev: hash('RubricRevision'),
    };
    expect(snapAfter).toEqual(snapBefore);

    // (c) Inserting a new assignment auto-pins (pre-rollback, then delete to keep rollback data hash clean)
    psql(`INSERT INTO "Assignment" ("id","createdAt","updatedAt","assignmentTypeId","prompt") VALUES ('a-per-3', now(), now(), 't-per','New before RB');`);
    const pinnedNewPre = jsonQuery(`SELECT "rubricRevisionId" IS NOT NULL FROM "Assignment" WHERE id='a-per-3'`);
    expect(pinnedNewPre).toBe(true);

    // (d) Updating schemaJson / rubricJson creates version+1 and moves baseline/current; then revert to avoid rollback hash delta
    const prevMaxVerLib = jsonQuery(`SELECT COALESCE(MAX(version),0) FROM "RubricRevision" WHERE "rubricName"='lib-shared'`);
    const updRubric = run('psql', ['-v', 'ON_ERROR_STOP=1', DB, '-c',
      `UPDATE "Rubric" SET "schemaJson" = jsonb_set("schemaJson",'{"title"}','"Shared Library Rubric (edited)"'::jsonb) WHERE id='rub-1'`]);
    expect(updRubric.status).toBe(0);
    const verLib = jsonQuery(`SELECT MAX(version) FROM "RubricRevision" WHERE "rubricName"='lib-shared'`);
    expect(verLib).toBe(prevMaxVerLib + 1);
    const createdByLib = jsonQuery(`SELECT "createdBy" FROM "RubricRevision" WHERE "rubricName"='lib-shared' AND version=${verLib} LIMIT 1`);
    expect(createdByLib).toBe('auto-revision');
    const pointerMoved = jsonQuery(`SELECT "currentRevisionId" = (SELECT id FROM "RubricRevision" WHERE "rubricName"='lib-shared' AND version=${verLib}) FROM "Rubric" WHERE id='rub-1'`);
    expect(pointerMoved).toBe(true);
    // revert rubric edit
    psql(`UPDATE "Rubric" SET "schemaJson"='${JSON.stringify(libSchema).replaceAll("'", "''")}'::jsonb WHERE id='rub-1'`);

    const prevMaxVerPer = jsonQuery(`SELECT COALESCE(MAX(version),0) FROM "RubricRevision" WHERE "rubricName"='assignment-type:t-per'`);
    const updPerType = run('psql', ['-v', 'ON_ERROR_STOP=1', DB, '-c',
      `UPDATE "AssignmentType" SET "rubricJson" = jsonb_set(COALESCE("rubricJson",'{}'::jsonb),'{"categories"}','[]'::jsonb) WHERE id='t-per'`]);
    expect(updPerType.status).toBe(0);
    const verPer = jsonQuery(`SELECT MAX(version) FROM "RubricRevision" WHERE "rubricName"='assignment-type:t-per'`);
    expect(verPer).toBe(prevMaxVerPer + 1);
    const createdByPer = jsonQuery(`SELECT "createdBy" FROM "RubricRevision" WHERE "rubricName"='assignment-type:t-per' AND version=${verPer} LIMIT 1`);
    expect(createdByPer).toBe('auto-revision');
    // revert per-type edit
    psql(`UPDATE "AssignmentType" SET "rubricJson"='${JSON.stringify(typeSchema.rubric).replaceAll("'", "''")}'::jsonb WHERE id='t-per'`);

    // Post-deploy publisher-pin scenario: add a publisher revision and pin a new library assignment to it.
    // This proves the rollback fallback spares publisher pins (not baseline/auto) and that the
    // baseline-capture pointer remains untouched pre-rollback.
    const currentIdBefore = jsonQuery(`SELECT "currentRevisionId" FROM "Rubric" WHERE id='rub-1'`);
    const libSchemaJsonPub3 = JSON.stringify({
      name: 'lib-shared',
      title: 'Publisher Variant 3',
      scoringScale: { type: 'rubric_points', minScore: 0, maxScore: 30, step: 10 },
      rubric: { categories: [{ key: 'engagement_with_prompt', label: 'Engagement (pub3)', description: 'Shows up', weight: 1, scoreLabels: [{ value: 0, label: 'Absent' }, { value: 10, label: 'Hardly' }, { value: 20, label: 'Showed up' }, { value: 30, label: 'All in' }] }] }
    }).replaceAll("'", "''");
    psql(`
      INSERT INTO "RubricRevision" ("id","rubricName","version","schemaJson","fingerprint","requestId","requestHash","createdBy","reason","createdAt")
      VALUES ('rev-pub-3','lib-shared',
              (SELECT COALESCE(MAX(version),0) + 1 FROM \"RubricRevision\" WHERE \"rubricName\"='lib-shared'),
              '${libSchemaJsonPub3}'::jsonb,
              encode(sha256(convert_to(('${libSchemaJsonPub3}'::jsonb)::text,'UTF8')),'hex'),
              'req-pub-3',
              encode(sha256(convert_to(('${libSchemaJsonPub3}'::jsonb)::text,'UTF8')),'hex'),
              'publisher-x','Seeded after deploy', now());
      INSERT INTO "Assignment" ("id","createdAt","updatedAt","assignmentTypeId","prompt","rubricRevisionId")
      VALUES ('a-lib-4', now(), now(), 't-lib-b', 'Lib B 3 (pub3)', 'rev-pub-3');
    `);
    const lib4PinnedPre = jsonQuery(`SELECT "rubricRevisionId"='rev-pub-3' FROM "Assignment" WHERE id='a-lib-4'`);
    expect(lib4PinnedPre).toBe(true);
    const pointerUntouchedPre = jsonQuery(`SELECT "currentRevisionId"='${currentIdBefore}' FROM "Rubric" WHERE id='rub-1'`);
    expect(pointerUntouchedPre).toBe(true);

    // (e) Changing a pin raises
    const targetRev = jsonQuery(`
      SELECT id FROM "RubricRevision"
      WHERE "rubricName"='lib-shared'
        AND id <> (SELECT "rubricRevisionId" FROM "Assignment" WHERE id='a-lib-1')
      ORDER BY version ASC
      LIMIT 1
    `);
    const upd = run('psql', ['-v', 'ON_ERROR_STOP=1', DB, '-c', `UPDATE "Assignment" SET \"rubricRevisionId\"='${targetRev}' WHERE id='a-lib-1'`]);
    expect(upd.status).not.toBe(0);
    expect(upd.stderr + upd.stdout).toContain('immutable');

    // (f) Submission remains byte-identical
    const afterGrade = jsonQuery(`SELECT row_to_json(s) FROM "Submission" s WHERE id='sub-1'`);
    expect(JSON.stringify(afterGrade)).toBe(JSON.stringify(beforeGrade));

    // (g) rollback restores schema/data
    const rollback = readFileSync(join(PRISMA_DIR, 'migrations', '20260928182000_pin_assignments_to_current_rubric_revision', 'rollback.sql'), 'utf8');
    psql(rollback);
    // Pointer restore (direct)
    const restoredPtr = jsonQuery(`SELECT "currentRevisionId" FROM "Rubric" WHERE id='rub-1'`);
    expect(restoredPtr).toBe('rev-pub-2');
    // Fallback cleared a-per-3, publisher pin survives, pre-pinned survives
    const per3Cleared = jsonQuery(`SELECT "rubricRevisionId" IS NULL FROM "Assignment" WHERE id='a-per-3'`);
    expect(per3Cleared).toBe(true);
    const lib2StillPinned = jsonQuery(`SELECT "rubricRevisionId"='rev-pub-2' FROM "Assignment" WHERE id='a-lib-2'`);
    expect(lib2StillPinned).toBe(true);
    const lib4StillPinned = jsonQuery(`SELECT "rubricRevisionId"='rev-pub-3' FROM "Assignment" WHERE id='a-lib-4'`);
    expect(lib4StillPinned).toBe(true);
    // Clean up post-rollback-only rows before hash compare
    psql(`DELETE FROM "Assignment" WHERE id IN ('a-per-3','a-lib-4');`);
    // Zero-diff schema vs pre-migration
    const schemaAfter = normalizeSchemaDump(run('pg_dump', ['-s', DB]).stdout);
    expect(schemaAfter).toBe(schemaPre);
    // Data byte-identical vs pre for core tables
    function hashWhere(tbl: string, whereSql?: string) {
      const where = whereSql ? `WHERE ${whereSql}` : '';
      return run('psql', ['-t', '-A', DB, '-c',
        `SELECT md5(COALESCE(string_agg((to_jsonb(t))::text, '' ORDER BY id), ''))
         FROM (SELECT * FROM "${tbl}" ${where} ORDER BY id) t;`]).stdout.trim().split('\n').pop();
    }
    const postHash = {
      Rubric: hash('Rubric'),
      AssignmentType: hash('AssignmentType'),
      Assignment: hash('Assignment'),
      // Exclude rev-pub-3 which is intentionally preserved after rollback
      RubricRevision: hashWhere('RubricRevision', `id <> 'rev-pub-3'`),
    };
    try {
      expect(postHash).toEqual(preHash);
    } catch (e) {
      // Dump surgical diffs for diagnosis
      function diffTable(tbl: 'Rubric' | 'AssignmentType' | 'Assignment', keys: string[] | 'ALL') {
        const postRows = dumpTableRows(tbl);
        const preIndex = new Map(preRows[tbl].map((r: any) => [r.id, r]));
        const diffs: any[] = [];
        for (const cur of postRows) {
          const prev = preIndex.get(cur.id);
          if (!prev) continue;
          const changed: Record<string, any> = {};
          const useKeys = keys === 'ALL' ? Array.from(new Set([...Object.keys(prev), ...Object.keys(cur)])) : keys;
          for (const k of useKeys) {
            const a = prev[k];
            const b = cur[k];
            if (JSON.stringify(a) !== JSON.stringify(b)) changed[k] = { before: a, after: b };
          }
          if (Object.keys(changed).length) diffs.push({ id: cur.id, changed });
        }
        if (diffs.length) {
          console.log(`Diff for ${tbl}:` + JSON.stringify(diffs, null, 2));
        }
        // Also list ids only in post or only in pre
        const postIds = new Set(postRows.map((r: any) => r.id));
        const preIds = new Set(preRows[tbl].map((r: any) => r.id));
        const onlyPost = [...postIds].filter((id) => !preIds.has(id));
        const onlyPre = [...preIds].filter((id) => !postIds.has(id));
        if (onlyPost.length || onlyPre.length) {
          console.log(`Row set diff for ${tbl}: onlyPost=${JSON.stringify(onlyPost)}, onlyPre=${JSON.stringify(onlyPre)}`);
        }
      }
      diffTable('Rubric', ['updatedAt', 'currentRevisionId', 'schemaJson', 'name', 'title']);
      diffTable('AssignmentType', ['updatedAt', 'rubricId', 'scoringScaleJson', 'rubricJson', 'gradingPromptConfigJson', 'gradingOutputSchemaJson', 'gradingCalibrationNotes', 'title', 'kind', 'position']);
      diffTable('Assignment', 'ALL');
      throw e;
    }
    // Migration receipts removed
    const migReceiptsAfterRollback = jsonQuery(`
      SELECT json_build_object(
        'm1', (SELECT COUNT(*) FROM "_prisma_migrations" WHERE "migration_name"='20260928182000_pin_assignments_to_current_rubric_revision'),
        'm2', (SELECT COUNT(*) FROM "_prisma_migrations" WHERE "migration_name"='20260929034000_assignment_rubric_baseline_capture')
      )
    `);
    expect(migReceiptsAfterRollback.m1).toBe(0);
    expect(migReceiptsAfterRollback.m2).toBe(0);
    // Publisher seed and pin survived rollback
    const pubStillThere = jsonQuery(`SELECT EXISTS (SELECT 1 FROM "RubricRevision" WHERE id='rev-pub-2' AND "createdBy"='publisher-x')`);
    expect(pubStillThere).toBe(true);
    const pinStillThere = jsonQuery(`SELECT "rubricRevisionId"='rev-pub-2' FROM "Assignment" WHERE id='a-lib-2'`);
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
    // (h) Confirm re-apply works and receipts recorded
    const migReceiptsAfterReapply = jsonQuery(`
      SELECT json_build_object(
        'm1', (SELECT BOOL_AND("finished_at" IS NOT NULL) FROM "_prisma_migrations" WHERE "migration_name"='20260928182000_pin_assignments_to_current_rubric_revision'),
        'm2', (SELECT BOOL_AND("finished_at" IS NOT NULL) FROM "_prisma_migrations" WHERE "migration_name"='20260929034000_assignment_rubric_baseline_capture')
      )
    `);
    expect(migReceiptsAfterReapply.m1).toBe(true);
    expect(migReceiptsAfterReapply.m2).toBe(true);
    // Re-assert identical counts/state as first deploy
    const counts2 = jsonQuery(`
      SELECT json_build_object(
        'pinned', (SELECT COUNT(*) FROM "Assignment" WHERE "rubricRevisionId" IS NOT NULL),
        'unpinned', (SELECT COUNT(*) FROM "Assignment" WHERE "rubricRevisionId" IS NULL),
        'codeDefault', (SELECT COUNT(*) FROM "InternalAssignmentRubricPinBackfill" WHERE reason = 'code-default')
      )
    `);
    expect(counts2.pinned).toBe(5);
    expect(counts2.unpinned).toBe(2);
    expect(counts2.codeDefault).toBe(2);
    const sharedBaseline2 = jsonQuery(`
      SELECT json_build_object(
        'rows', (SELECT COUNT(*) FROM "AssignmentTypeRubricBaseline" WHERE "assignmentTypeId" IN ('t-lib-a','t-lib-b')),
        'distinctRevs', (SELECT COUNT(DISTINCT "rubricRevisionId") FROM "AssignmentTypeRubricBaseline" WHERE "assignmentTypeId" IN ('t-lib-a','t-lib-b'))
      )
    `);
    expect(sharedBaseline2.rows).toBe(2);
    expect(sharedBaseline2.distinctRevs).toBe(1);
    const revCount2 = jsonQuery(`SELECT COUNT(*) FROM "RubricRevision" WHERE "rubricName"='lib-shared'`);
    expect(revCount2).toBe(3);
    const currentIsBaseline2 = jsonQuery(`
      SELECT EXISTS (
        SELECT 1 FROM "Rubric" r
        JOIN "RubricRevision" rr ON rr.id = r."currentRevisionId"
        WHERE r.id='rub-1' AND rr."createdBy"='baseline-capture'
      )
    `);
    expect(currentIsBaseline2).toBe(true);
    const restoreRows2 = jsonQuery(`SELECT COUNT(*) FROM "InternalRubricCurrentPointerRestore" WHERE "rubricId"='rub-1'`);
    expect(restoreRows2).toBe(1);
    // (h2) No-op check for direct SQL replay: re-run both migrations' SQL files and verify no changes.
    const replayBefore = {
      rubRev: jsonQuery(`SELECT COUNT(*) FROM "RubricRevision"`),
      baseline: jsonQuery(`SELECT COUNT(*) FROM "AssignmentTypeRubricBaseline"`),
      audit: jsonQuery(`SELECT COUNT(*) FROM "InternalAssignmentRubricPinBackfill"`),
      restore: jsonQuery(`SELECT COUNT(*) FROM "InternalRubricCurrentPointerRestore"`),
      pinned: jsonQuery(`SELECT COUNT(*) FROM "Assignment" WHERE "rubricRevisionId" IS NOT NULL`),
      hRubric: hash('Rubric'),
      hType: hash('AssignmentType'),
      hAssign: hash('Assignment'),
      hRev: hash('RubricRevision'),
    };
    const m1File = join(current, 'migrations', '20260928182000_pin_assignments_to_current_rubric_revision', 'migration.sql');
    const m2File = join(current, 'migrations', '20260929034000_assignment_rubric_baseline_capture', 'migration.sql');
    const rps1 = run('psql', ['-v', 'ON_ERROR_STOP=1', DB, '-f', m1File]);
    expect(rps1.status).toBe(0);
    const rps2 = run('psql', ['-v', 'ON_ERROR_STOP=1', DB, '-f', m2File]);
    expect(rps2.status).toBe(0);
    const replayAfter = {
      rubRev: jsonQuery(`SELECT COUNT(*) FROM "RubricRevision"`),
      baseline: jsonQuery(`SELECT COUNT(*) FROM "AssignmentTypeRubricBaseline"`),
      audit: jsonQuery(`SELECT COUNT(*) FROM "InternalAssignmentRubricPinBackfill"`),
      restore: jsonQuery(`SELECT COUNT(*) FROM "InternalRubricCurrentPointerRestore"`),
      pinned: jsonQuery(`SELECT COUNT(*) FROM "Assignment" WHERE "rubricRevisionId" IS NOT NULL`),
      hRubric: hash('Rubric'),
      hType: hash('AssignmentType'),
      hAssign: hash('Assignment'),
      hRev: hash('RubricRevision'),
    };
    expect(replayAfter).toEqual(replayBefore);
    // (i) Now insert a new assignment and verify auto-pin
    psql(`INSERT INTO "Assignment" ("id","createdAt","updatedAt","assignmentTypeId","prompt") VALUES ('a-per-4', now(), now(), 't-per','New');`);
    const pinnedNew = jsonQuery(`SELECT "rubricRevisionId" IS NOT NULL FROM "Assignment" WHERE id='a-per-4'`);
    expect(pinnedNew).toBe(true);
  }, 30000);

  test('lock_timeout enforced under migrate deploy', () => {
    try { adminPsql('DROP DATABASE IF EXISTS yawp_migration_integration WITH (FORCE)'); } catch {}
    adminPsql('CREATE DATABASE yawp_migration_integration');
    const pre = setupTempCopy([
      '20260928182000_pin_assignments_to_current_rubric_revision',
      '20260929034000_assignment_rubric_baseline_capture',
      ...DEPENDS_ON_PIN_MIGRATIONS,
    ]);
    prismaDeploy(pre);
    // Seed just enough to reach the DROP TRIGGER point, including one library-linked assignment to exercise library path
    psql(`
          INSERT INTO "Rubric" ("id","createdAt","updatedAt","name","title","schemaJson")
          VALUES ('rub-L', now(), now(), 'lib-lock', 'Lib Lock', '{"name":"lib-lock","title":"Lib Lock","rubric":{"categories":[]}}'::jsonb);
          INSERT INTO "AssignmentType" ("id","createdAt","updatedAt","title","kind","position","rubricId")
          VALUES ('t-lib', now(), now(), 'LibType', 'lib_kind', 0, 'rub-L');
          INSERT INTO "Assignment" ("id","createdAt","updatedAt","assignmentTypeId","prompt") VALUES ('a-lib', now(), now(), 't-lib','Lib A');
          INSERT INTO "AssignmentType" ("id","createdAt","updatedAt","title","kind","position") VALUES ('t1', now(), now(), 'Type', 'k', 0);
          INSERT INTO "Assignment" ("id","createdAt","updatedAt","assignmentTypeId","prompt") VALUES ('a1', now(), now(), 't1','P');
        `);
    // Apply migration 1 first so migration 2 is the one that times out (matches production)
    const onlyM1 = setupTempCopy([
      '20260929034000_assignment_rubric_baseline_capture',
      ...DEPENDS_ON_PIN_MIGRATIONS,
    ]);
    prismaDeploy(onlyM1);
    // Hold lock on Assignment to block migration 2's DISABLE TRIGGER
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
    const res = run('bun', ['run', 'prisma', 'migrate', 'deploy'], current, { PATH: PATH_WITH_ROOT_BIN, NODE_PATH: NODE_PATH_WITH_ROOT });
    const elapsed = Date.now() - start;
    // Expect failure due to lock_timeout (allow generous upper bound for CI variance)
    expect(res.status).not.toBe(0);
    expect(elapsed).toBeGreaterThanOrEqual(4500);
    expect(elapsed).toBeLessThan(13000);
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
      // Force-terminate any backend still holding the lock, then keep polling
      psql(`
        SELECT pg_terminate_backend(sa.pid)
        FROM pg_locks l
        JOIN pg_class c ON c.oid = l.relation
        JOIN pg_stat_activity sa ON sa.pid = l.pid
        WHERE c.relname='Assignment' AND l.mode='AccessExclusiveLock' AND l.granted
      `);
      if (Date.now() - startWait > 15000) throw new Error('lock not released in time');
    }
    // Resolve and re-deploy after lock timeout (exact sequence per production verification)
    const mig2Unfinished = jsonQuery(`SELECT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE "migration_name"='20260929034000_assignment_rubric_baseline_capture' AND "finished_at" IS NULL)`);
    expect(mig2Unfinished).toBe(true);
    const r2 = run('bun', ['run', 'prisma', 'migrate', 'resolve', '--rolled-back', '20260929034000_assignment_rubric_baseline_capture'], current, { PATH: PATH_WITH_ROOT_BIN, NODE_PATH: NODE_PATH_WITH_ROOT });
    expect(r2.status).toBe(0);
    prismaDeploy(current);
    // Deterministic final-state assertions after recovery
    // Baseline table exists now
    const baselineNow = run('psql', ['-t', '-A', DB, '-c', `SELECT to_regclass('public."AssignmentTypeRubricBaseline"') IS NOT NULL;`]).stdout.trim().split('\n').pop();
    expect(baselineNow).toBe('t');
    // Pin trigger exists
    const pinTriggerAfter = run('psql', ['-t', '-A', DB, '-c', `SELECT COUNT(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='Assignment' AND t.tgname='internal_assignment_rubric_pin';`]).stdout.trim().split('\n').pop();
    expect(pinTriggerAfter).toBe('1');
    // Migrations recorded properly after recovery:
    // - there exists a finished row (finished_at NOT NULL, rolled_back_at IS NULL)
    // - there is no stuck unfinished row (finished_at IS NULL AND rolled_back_at IS NULL)
    const m1Ok = jsonQuery(`
      SELECT json_build_object(
        'hasFinished', EXISTS (
          SELECT 1 FROM "_prisma_migrations"
          WHERE "migration_name"='20260928182000_pin_assignments_to_current_rubric_revision'
            AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
        ),
        'hasUnfinished', EXISTS (
          SELECT 1 FROM "_prisma_migrations"
          WHERE "migration_name"='20260928182000_pin_assignments_to_current_rubric_revision'
            AND "finished_at" IS NULL AND "rolled_back_at" IS NULL
        )
      )
    `);
    const m2Ok = jsonQuery(`
      SELECT json_build_object(
        'hasFinished', EXISTS (
          SELECT 1 FROM "_prisma_migrations"
          WHERE "migration_name"='20260929034000_assignment_rubric_baseline_capture'
            AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
        ),
        'hasUnfinished', EXISTS (
          SELECT 1 FROM "_prisma_migrations"
          WHERE "migration_name"='20260929034000_assignment_rubric_baseline_capture'
            AND "finished_at" IS NULL AND "rolled_back_at" IS NULL
        )
      )
    `);
    expect(m1Ok.hasFinished).toBe(true);
    expect(m1Ok.hasUnfinished).toBe(false);
    expect(m2Ok.hasFinished).toBe(true);
    expect(m2Ok.hasUnfinished).toBe(false);
    // Pins correct for the seed in this test (one assignment, no rubric JSON or library)
    const lockCounts = jsonQuery(`
      SELECT json_build_object(
        'pinned', (SELECT COUNT(*) FROM "Assignment" WHERE "rubricRevisionId" IS NOT NULL),
        'unpinned', (SELECT COUNT(*) FROM "Assignment" WHERE "rubricRevisionId" IS NULL),
        'codeDefault', (SELECT COUNT(*) FROM "InternalAssignmentRubricPinBackfill" WHERE reason = 'code-default')
      )
    `);
    expect(lockCounts.pinned).toBe(1);
    expect(lockCounts.unpinned).toBe(1);
    expect(lockCounts.codeDefault).toBe(1);
  }, 30000);

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
      const got = jsonQuery(`encode(sha256(convert_to(canonical_json('${sqlJson}'::jsonb),'UTF8')),'hex')`);
      expect(got).toBe(fp(value));
    }
  }, 20000);

  test('free tier admin approval migration (#416): deploy, re-run, rollback', () => {
    try {
      adminPsql('DROP DATABASE IF EXISTS yawp_migration_integration WITH (FORCE)');
    } catch {}
    adminPsql('CREATE DATABASE yawp_migration_integration');
    prismaDeploy(PRISMA_DIR);

    const tables = jsonQuery(`
      SELECT json_build_object(
        'signedLink', EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'FreeTierSignedLink'
        ),
        'adminApproval', EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'FreeTierAdminApproval'
        ),
        'emailLog', EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'FreeTierEmailLog'
        ),
        'teacherNote', EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'FreeTierApplication' AND column_name = 'teacherPersonalNote'
        )
      )
    `);
    expect(tables.signedLink).toBe(true);
    expect(tables.adminApproval).toBe(true);
    expect(tables.emailLog).toBe(true);
    expect(tables.teacherNote).toBe(true);

    prismaDeploy(PRISMA_DIR);

    const approvalRollback = readFileSync(
      join(
        PRISMA_DIR,
        'migrations',
        '20261009003000_free_tier_admin_approval_c',
        'rollback.sql'
      ),
      'utf8'
    );
    psql(approvalRollback);

    const gone = jsonQuery(`
      SELECT json_build_object(
        'signedLink', EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'FreeTierSignedLink'
        )
      )
    `);
    expect(gone.signedLink).toBe(false);

    const approvalForward = readFileSync(
      join(
        PRISMA_DIR,
        'migrations',
        '20261009003000_free_tier_admin_approval_c',
        'migration.sql'
      ),
      'utf8'
    );
    psql(approvalForward);

    const back = jsonQuery(`
      SELECT json_build_object(
        'signedLink', EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'FreeTierSignedLink'
        )
      )
    `);
    expect(back.signedLink).toBe(true);
  }, 120000);
});

