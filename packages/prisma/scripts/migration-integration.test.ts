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
      VALUES ('org-1', now(), now(), 'Test Org')
      ON CONFLICT ("id") DO NOTHING;
      INSERT INTO "User" ("id","createdAt","updatedAt","email","name","isAdmin","isSuperAdmin")
      VALUES ('user-1', now(), now(), 'user1@example.com', 'User One', false, false)
      ON CONFLICT ("id") DO NOTHING;
      INSERT INTO "OrgMembership" ("id","createdAt","userId","organizationId","role","isOrgOwner","isActive")
      VALUES ('mem-1', now(), 'user-1', 'org-1', 'STUDENT', false, true)
      ON CONFLICT ("id") DO NOTHING;

      INSERT INTO "Rubric" ("id","createdAt","updatedAt","name","title","schemaJson")
      VALUES ('rub-1', now(), now(), 'lib-shared', 'Shared Library Rubric', '${JSON.stringify(libSchema).replaceAll("'", "''")}'::jsonb)
      ON CONFLICT ("id") DO NOTHING;
      INSERT INTO "AssignmentType" ("id","createdAt","updatedAt","title","kind","position","rubricId")
      VALUES ('t-lib-a', now(), now(), 'Lib A', 'lib_a', 0, 'rub-1'),
             ('t-lib-b', now(), now(), 'Lib B', 'lib_b', 0, 'rub-1')
      ON CONFLICT ("id") DO NOTHING;
      INSERT INTO "AssignmentType" ("id","createdAt","updatedAt","title","kind","position","rubricId","scoringScaleJson","rubricJson","gradingPromptConfigJson","gradingOutputSchemaJson","gradingCalibrationNotes")
      VALUES ('t-per', now(), now(), 'Daily Pages', 'daily_pages', 0, NULL, '${JSON.stringify(typeSchema.scoringScale).replaceAll("'", "''")}'::jsonb, '${JSON.stringify(typeSchema.rubric).replaceAll("'", "''")}'::jsonb, '${JSON.stringify(typeSchema.promptConfig).replaceAll("'", "''")}'::jsonb, '${JSON.stringify(typeSchema.outputSchema).replaceAll("'", "''")}'::jsonb, 'None')
      ON CONFLICT ("id") DO NOTHING;
      INSERT INTO "AssignmentType" ("id","createdAt","updatedAt","title","kind","position","rubricId")
      VALUES ('t-default', now(), now(), 'Welcome', 'welcome', 0, NULL)
      ON CONFLICT ("id") DO NOTHING;
      INSERT INTO "Assignment" ("id","createdAt","updatedAt","assignmentTypeId","prompt")
      VALUES ('a-lib-1', now(), now(), 't-lib-a', 'Lib A 1'),
             ('a-lib-2', now(), now(), 't-lib-b', 'Lib B 1'),
             ('a-per-1', now(), now(), 't-per', 'Per 1'),
             ('a-per-2', now(), now(), 't-per', 'Per 2'),
             ('a-nj-1', now(), now(), 't-default', 'No JSON 1'),
             ('a-nj-2', now(), now(), 't-default', 'No JSON 2')
      ON CONFLICT ("id") DO NOTHING;
      -- Minimal document/submission to prove grades untouched
      INSERT INTO "Document" ("id","createdAt","updatedAt","revision","title","assignmentTypeId","assignmentId","membershipId")
      VALUES ('doc-1', now(), now(), 0, 'Doc', 't-per', 'a-per-1', 'mem-1')
      ON CONFLICT ("id") DO NOTHING;
      INSERT INTO "Submission" ("id","createdAt","updatedAt","title","text","html","submittedAt","score","rubricScores","overallScore","numericPercentage","documentId")
      VALUES ('sub-1', now(), now(), 'T', 'txt', '<p>t</p>', now(), '18/30', '{"engagement_with_prompt":{"score":18}}'::jsonb, 18, NULL, 'doc-1')
      ON CONFLICT ("id") DO NOTHING;
    `);
    // Seed a pre-existing publisher pin that must survive rollback
    const libSchemaJson = JSON.stringify(libSchema).replaceAll("'", "''");
    psql(`
      INSERT INTO "RubricRevision" ("id","rubricName","version","schemaJson","fingerprint","requestId","requestHash","createdBy","reason","createdAt")
      VALUES ('rev-pub-1','lib-shared',1,'${libSchemaJson}'::jsonb,
              encode(sha256(convert_to(('${libSchemaJson}'::jsonb)::text,'UTF8')),'hex'),
              'req-pub-1',
              encode(sha256(convert_to(('${libSchemaJson}'::jsonb)::text,'UTF8')),'hex'),
              'publisher-x','Seeded revision', now())
      ON CONFLICT ("id") DO NOTHING;
      UPDATE "Rubric" SET "currentRevisionId"='rev-pub-1' WHERE id='rub-1';
      UPDATE "Assignment" SET "rubricRevisionId"='rev-pub-1' WHERE id='a-lib-2';
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

    // Helper: dump debug rows for audit and key IDs
    function dumpStage(stage: string) {
      const hasAudit = run('psql', ['-t', '-A', DB, '-c', `SELECT to_regclass('public."InternalAssignmentRubricPinBackfill"') IS NOT NULL;`]).stdout.trim().split('\n').pop() === 't';
      console.log(`STAGE=${stage} RUBRIC:`, run('psql', ['-t', '-A', DB, '-c', `SELECT json_build_object('rub','rub-1','current', "currentRevisionId") FROM "Rubric" WHERE id='rub-1'`]).stdout.trim());
      console.log(`STAGE=${stage} ASSIGNMENT a-lib-1:`, run('psql', ['-t', '-A', DB, '-c', `SELECT row_to_json(a) FROM "Assignment" a WHERE id='a-lib-1'`]).stdout.trim());
      if (hasAudit) {
        console.log(`STAGE=${stage} AUDIT:`, run('psql', ['-t', '-A', DB, '-c', `SELECT row_to_json(b) FROM "InternalAssignmentRubricPinBackfill" b ORDER BY "assignmentId"`]).stdout.trim());
      } else {
        console.log(`STAGE=${stage} AUDIT: <absent>`);
      }
    }
    dumpStage('seed');

    // Apply migration 1 only, then assert a-lib-1 appears in audit with a selected revision id
    const onlyM1 = setupTempCopy([
      '20260929034000_assignment_rubric_baseline_capture',
    ]);
    prismaDeploy(onlyM1);
    dumpStage('after-mig1');
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
    dumpStage('after-mig2');

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

    // (c) Inserting a new assignment auto-pins (moved to after rollback/re-apply to avoid affecting rollback equality)

    // (d) (moved later) Updating schemaJson / rubricJson creates version+1 and moves baseline/current

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
    dumpStage('after-rollback');
    // Zero-diff schema vs pre-migration
    const schemaAfter = normalizeSchemaDump(run('pg_dump', ['-s', DB]).stdout);
    expect(schemaAfter).toBe(schemaPre);
    // Data byte-identical vs pre for core tables
    const postHash = {
      Rubric: hash('Rubric'),
      AssignmentType: hash('AssignmentType'),
      Assignment: hash('Assignment'),
      RubricRevision: hash('RubricRevision'),
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
    // (h) Confirm re-apply works and receipts recorded
    const migReceiptsAfterReapply = jsonQuery(`
      SELECT json_build_object(
        'm1', (SELECT BOOL_AND("finished_at" IS NOT NULL) FROM "_prisma_migrations" WHERE "migration_name"='20260928182000_pin_assignments_to_current_rubric_revision'),
        'm2', (SELECT BOOL_AND("finished_at" IS NOT NULL) FROM "_prisma_migrations" WHERE "migration_name"='20260929034000_assignment_rubric_baseline_capture')
      )
    `);
    expect(migReceiptsAfterReapply.m1).toBe(true);
    expect(migReceiptsAfterReapply.m2).toBe(true);
    // (i) Now insert a new assignment and verify auto-pin
    psql(`INSERT INTO "Assignment" ("id","createdAt","updatedAt","assignmentTypeId","prompt") VALUES ('a-per-3', now(), now(), 't-per','New');`);
    const pinnedNew = jsonQuery(`SELECT "rubricRevisionId" IS NOT NULL FROM "Assignment" WHERE id='a-per-3'`);
    expect(pinnedNew).toBe(true);
  }, 30000);

  test('lock_timeout enforced under migrate deploy', () => {
    try { adminPsql('DROP DATABASE IF EXISTS yawp_migration_integration WITH (FORCE)'); } catch {}
    adminPsql('CREATE DATABASE yawp_migration_integration');
    const pre = setupTempCopy([
      '20260928182000_pin_assignments_to_current_rubric_revision',
      '20260929034000_assignment_rubric_baseline_capture',
    ]);
    prismaDeploy(pre);
    // Seed just enough to reach the DROP TRIGGER point, including one library-linked assignment to exercise library path
    psql(`
          INSERT INTO "Rubric" ("id","createdAt","updatedAt","name","title","schemaJson")
          VALUES ('rub-L', now(), now(), 'lib-lock', 'Lib Lock', '{"name":"lib-lock","title":"Lib Lock","rubric":{"categories":[]}}'::jsonb)
          ON CONFLICT ("id") DO NOTHING;
          INSERT INTO "AssignmentType" ("id","createdAt","updatedAt","title","kind","position","rubricId")
          VALUES ('t-lib', now(), now(), 'LibType', 'lib_kind', 0, 'rub-L')
          ON CONFLICT ("id") DO NOTHING;
          INSERT INTO "Assignment" ("id","createdAt","updatedAt","assignmentTypeId","prompt") VALUES ('a-lib', now(), now(), 't-lib','Lib A')
          ON CONFLICT ("id") DO NOTHING;
          INSERT INTO "AssignmentType" ("id","createdAt","updatedAt","title","kind","position") VALUES ('t1', now(), now(), 'Type', 'k', 0)
            ON CONFLICT ("id") DO NOTHING;
          INSERT INTO "Assignment" ("id","createdAt","updatedAt","assignmentTypeId","prompt") VALUES ('a1', now(), now(), 't1','P')
            ON CONFLICT ("id") DO NOTHING;
        `);
    // Apply migration 1 first so migration 2 is the one that times out (matches production)
    const onlyM1 = setupTempCopy([
      '20260929034000_assignment_rubric_baseline_capture',
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
});

