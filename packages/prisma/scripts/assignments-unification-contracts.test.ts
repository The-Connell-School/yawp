/**
 * Behavior contracts for the assignments-unification migration.
 *
 * These tests run against the MIGRATED database and assert the semantic-change
 * region of the refactor. Each contract maps to a section of:
 *   docs/superpowers/specs/2026-04-20-assignments-unification-migration-delta.md
 *
 * Run after applying the migration (and after preflight has captured state):
 *   cd packages/prisma && bun test scripts/assignments-unification-contracts.test.ts
 *
 * Requires:
 *   - DATABASE_URL pointing at migrated DB
 *   - PREFLIGHT_STATE_PATH (default /tmp/assignments-unification-preflight.json)
 */
import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import pg from 'pg';
import { existsSync, readFileSync } from 'node:fs';

const DATABASE_URL = process.env.DATABASE_URL;
const FREE_WRITE_ID = 'cfreewrite0000000000000000';
const STATE_PATH =
  process.env.PREFLIGHT_STATE_PATH ||
  '/tmp/assignments-unification-preflight.json';

type PreflightState = {
  bucketSamples: {
    pass7a: Array<{ documentId: string }>;
    pass7b: Array<{ documentId: string; assignmentTypeId: string }>;
    pass7c: Array<{ documentId: string }>;
  };
  assignedDocParity: Array<{ documentId: string; assignmentTypeId: string }>;
  documentStudentMappings: Array<{ documentId: string; studentProfileId: string }>;
  documentsWithClassNoAssignment: Array<{ documentId: string; oldClassId: string }>;
  sessionStudentMappings: Array<{
    sessionId: string;
    documentId: string;
    oldStudentProfileId: string;
    documentStudentProfileId: string | null;
  }>;
  whitelistMappings: Array<{ classId: string; studentCourseId: string }>;
};

let pool: pg.Pool;
let preflight: PreflightState | null = null;

beforeAll(() => {
  if (!DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  pool = new pg.Pool({ connectionString: DATABASE_URL });
  if (existsSync(STATE_PATH)) {
    preflight = JSON.parse(readFileSync(STATE_PATH, 'utf8')) as PreflightState;
  }
});

afterAll(async () => {
  await pool.end();
});

describe('C1 — Ownership visibility baseline', () => {
  test('all AssignmentType rows are system-owned (both owner cols NULL)', async () => {
    const { rows } = await pool.query<{ total: number; owned: number }>(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE "ownerOrgId" IS NOT NULL OR "ownerTeacherId" IS NOT NULL)::int AS owned
      FROM "AssignmentType"
    `);
    expect(rows[0].total).toBeGreaterThanOrEqual(6);
    expect(rows[0].owned).toBe(0);
  });

  test('owner-single CHECK constraint exists', async () => {
    const { rows } = await pool.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'AssignmentType_owner_single_check'
          AND constraint_type = 'CHECK'
      ) AS exists
    `);
    expect(rows[0].exists).toBe(true);
  });
});

describe('C2 — Free Write usability', () => {
  test('Free Write AssignmentType exists and has expected shape', async () => {
    const { rows } = await pool.query<{
      id: string;
      title: string;
      ownerOrgId: string | null;
      ownerTeacherId: string | null;
    }>(
      `SELECT id, title, "ownerOrgId", "ownerTeacherId" FROM "AssignmentType" WHERE id = $1`,
      [FREE_WRITE_ID],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe('Free Write');
    expect(rows[0].ownerOrgId).toBeNull();
    expect(rows[0].ownerTeacherId).toBeNull();
  });

  test('Free Write is reachable as an FK target', async () => {
    // Verify the FK on Document.assignmentTypeId actually points at AssignmentType.
    const { rows } = await pool.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.referential_constraints rc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_name = rc.constraint_name
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = rc.unique_constraint_name
        WHERE kcu.table_name = 'Document'
          AND kcu.column_name = 'assignmentTypeId'
          AND ccu.table_name = 'AssignmentType'
      ) AS exists
    `);
    expect(rows[0].exists).toBe(true);
  });
});

describe('C3 — Document → Class derivation paths', () => {
  test('assigned doc resolves Class via Assignment.classId', async () => {
    if (!preflight || preflight.bucketSamples.pass7a.length === 0) {
      console.warn('Skipping: no pass-7a bucket sample available from preflight');
      return;
    }
    const { documentId } = preflight.bucketSamples.pass7a[0];
    const { rows } = await pool.query<{ classId: string | null }>(
      `SELECT a."classId"
       FROM "Document" d
       JOIN "Assignment" a ON a.id = d."assignmentId"
       WHERE d.id = $1`,
      [documentId],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].classId).not.toBeNull();
  });

  test('unassigned doc class-derivation query is well-formed against post-migration schema', async () => {
    if (!preflight || preflight.bucketSamples.pass7b.length === 0) {
      console.warn('Skipping: no pass-7b bucket sample available from preflight');
      return;
    }
    const { documentId } = preflight.bucketSamples.pass7b[0];
    const { rows } = await pool.query<{ n: number }>(
      `SELECT COUNT(DISTINCT cs."A")::int AS n
       FROM "Document" d
       JOIN "StudentProfile" sp ON sp.id = d."studentProfileId"
       JOIN "_ClassToStudentProfile" cs ON cs."B" = sp.id
       WHERE d.id = $1`,
      [documentId],
    );
    // Many unassigned docs are personal writing — their author may not be in any class.
    // The contract here is that the SQL query parses cleanly against the post-migration
    // schema (FK names, junction-table column names). The actual class count is informational.
    expect(rows.length).toBe(1);
  });
});

describe('C6 — Document student ownership is canonical', () => {
  test('Document.studentProfileId exists and is required', async () => {
    const { rows } = await pool.query<{ isNullable: string }>(`
      SELECT is_nullable AS "isNullable"
      FROM information_schema.columns
      WHERE table_name = 'Document' AND column_name = 'studentProfileId'
    `);
    expect(rows.length).toBe(1);
    expect(rows[0].isNullable).toBe('NO');
  });

  test('preflight document owner sample is preserved', async () => {
    if (!preflight || preflight.documentStudentMappings.length === 0) {
      console.warn('Skipping: no document student mappings in preflight');
      return;
    }
    for (const { documentId, studentProfileId } of preflight.documentStudentMappings.slice(0, 5)) {
      const { rows } = await pool.query<{ studentProfileId: string | null }>(
        `SELECT "studentProfileId" FROM "Document" WHERE id = $1`,
        [documentId],
      );
      expect(rows[0]?.studentProfileId).toBe(studentProfileId);
    }
  });

  test('AssignmentModuleSession no longer stores student ownership', async () => {
    const { rows } = await pool.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'AssignmentModuleSession'
          AND column_name = 'studentProfileId'
      ) AS exists
    `);
    expect(rows[0].exists).toBe(false);
  });
});

describe('C7 — Forensic preservation', () => {
  test('old Document.classId values remain queryable by documentId', async () => {
    if (!preflight || preflight.documentsWithClassNoAssignment.length === 0) {
      console.warn('Skipping: no class-without-assignment samples in preflight');
      return;
    }
    const { documentId, oldClassId } = preflight.documentsWithClassNoAssignment[0];
    const { rows } = await pool.query<{ oldClassId: string }>(
      `SELECT "oldClassId" FROM "DocumentClassForensic" WHERE "documentId" = $1`,
      [documentId],
    );
    expect(rows[0]?.oldClassId).toBe(oldClassId);
  });

  test('old AssignmentModuleSession.studentProfileId values remain queryable by sessionId', async () => {
    if (!preflight || preflight.sessionStudentMappings.length === 0) {
      console.warn('Skipping: no session student mappings in preflight');
      return;
    }
    const { sessionId, oldStudentProfileId, documentId } = preflight.sessionStudentMappings[0];
    const { rows } = await pool.query<{
      oldStudentProfileId: string;
      documentId: string;
    }>(
      `SELECT "oldStudentProfileId", "documentId"
       FROM "AssignmentModuleSessionStudentForensic"
       WHERE "sessionId" = $1`,
      [sessionId],
    );
    expect(rows[0]?.oldStudentProfileId).toBe(oldStudentProfileId);
    expect(rows[0]?.documentId).toBe(documentId);
  });

  test('old ClassStudentCourse rows remain queryable after live table removal', async () => {
    if (!preflight || preflight.whitelistMappings.length === 0) {
      console.warn('Skipping: no whitelist mappings in preflight');
      return;
    }
    const { classId, studentCourseId } = preflight.whitelistMappings[0];
    const { rows } = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM "ClassStudentCourseForensic"
        WHERE "classId" = $1 AND "studentCourseId" = $2
      ) AS exists`,
      [classId, studentCourseId],
    );
    expect(rows[0].exists).toBe(true);
  });
});

describe('C4 — Backfill correctness sample', () => {
  test('pass-7a sample: assignmentTypeId matches Assignment.assignmentTypeId', async () => {
    if (!preflight) {
      console.warn('Skipping C4 pass-7a sample — preflight state unavailable');
      return;
    }
    for (const { documentId, assignmentTypeId } of preflight.assignedDocParity.slice(0, 5)) {
      const { rows } = await pool.query<{ assignmentTypeId: string | null }>(
        `SELECT "assignmentTypeId" FROM "Document" WHERE id = $1`,
        [documentId],
      );
      expect(rows[0]?.assignmentTypeId).toBe(assignmentTypeId);
    }
  });

  test('pass-7b sample: assignmentTypeId matches earliest-session-derived type', async () => {
    if (!preflight || preflight.bucketSamples.pass7b.length === 0) {
      console.warn('Skipping C4 pass-7b sample — preflight state unavailable or bucket empty');
      return;
    }
    for (const { documentId, assignmentTypeId } of preflight.bucketSamples.pass7b) {
      const { rows } = await pool.query<{ assignmentTypeId: string | null }>(
        `SELECT "assignmentTypeId" FROM "Document" WHERE id = $1`,
        [documentId],
      );
      expect(rows[0]?.assignmentTypeId).toBe(assignmentTypeId);
    }
  });

  test('pass-7c sample: assignmentTypeId is Free Write', async () => {
    if (!preflight || preflight.bucketSamples.pass7c.length === 0) {
      console.warn('Skipping C4 pass-7c sample — preflight state unavailable or bucket empty');
      return;
    }
    for (const { documentId } of preflight.bucketSamples.pass7c) {
      const { rows } = await pool.query<{ assignmentTypeId: string | null }>(
        `SELECT "assignmentTypeId" FROM "Document" WHERE id = $1`,
        [documentId],
      );
      expect(rows[0]?.assignmentTypeId).toBe(FREE_WRITE_ID);
    }
  });
});

describe('C5 — Whitelist removal preserves access', () => {
  test('every formerly-whitelisted StudentCourse still exists as an AssignmentType', async () => {
    if (!preflight) {
      console.warn('Skipping: no preflight state — cannot verify whitelist preservation');
      return;
    }
    const distinctIds = [
      ...new Set(preflight.whitelistMappings.map((m) => m.studentCourseId)),
    ];
    for (const id of distinctIds) {
      const { rows } = await pool.query<{ exists: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM "AssignmentType" WHERE id = $1) AS exists`,
        [id],
      );
      expect(rows[0]?.exists).toBe(true);
    }
  });

  test('ClassStudentCourse table is gone', async () => {
    const { rows } = await pool.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name = 'ClassStudentCourse'
      ) AS exists
    `);
    expect(rows[0]?.exists).toBe(false);
  });
});
