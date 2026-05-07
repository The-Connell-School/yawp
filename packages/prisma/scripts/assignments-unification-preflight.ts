/**
 * Preflight checks before the assignments-unification migration.
 *
 * Captures row counts on tables being renamed/modified, verifies the
 * pass-7b invariant (no Document spans multiple StudentCourses), and
 * writes captured state to JSON for consumption by:
 *   - assignments-unification-postcheck.ts (transformation assertions)
 *   - assignments-unification-contracts.test.ts (behavior contracts)
 *
 * Run:
 *   cd packages/prisma && bun ./scripts/assignments-unification-preflight.ts
 *
 * State file: /tmp/assignments-unification-preflight.json
 *   (override via PREFLIGHT_STATE_PATH env var)
 */
import pg from 'pg';
import { writeFileSync } from 'node:fs';

const DATABASE_URL = process.env.DATABASE_URL;
const STATE_PATH =
  process.env.PREFLIGHT_STATE_PATH ||
  '/tmp/assignments-unification-preflight.json';

type State = {
  capturedAt: string;
  counts: Record<string, number>;
  assignedDocParity: Array<{ documentId: string; assignmentTypeId: string }>;
  documentStudentMappings: Array<{ documentId: string; studentProfileId: string }>;
  unmappedDocuments: Array<{ documentId: string; profileId: string; deletedAt: string | null }>;
  documentsWithClassNoAssignment: Array<{ documentId: string; oldClassId: string }>;
  sessionStudentMappings: Array<{
    sessionId: string;
    documentId: string;
    oldStudentProfileId: string;
    documentStudentProfileId: string | null;
  }>;
  buckets: { pass7a: number; pass7b: number; pass7c: number };
  bucketSamples: {
    pass7a: Array<{ documentId: string }>;
    pass7b: Array<{ documentId: string; assignmentTypeId: string }>;
    pass7c: Array<{ documentId: string }>;
  };
  whitelistMappings: Array<{ classId: string; studentCourseId: string }>;
};

const COUNT_QUERIES: Array<[string, string]> = [
  ['StudentCourse', `SELECT COUNT(*)::int AS n FROM "StudentCourse"`],
  ['StudentCourseImage', `SELECT COUNT(*)::int AS n FROM "StudentCourseImage"`],
  ['StudentCourseModule', `SELECT COUNT(*)::int AS n FROM "StudentCourseModule"`],
  [
    'StudentCourseModuleInstruction',
    `SELECT COUNT(*)::int AS n FROM "StudentCourseModuleInstruction"`,
  ],
  [
    'StudentCourseModuleInstructionButton',
    `SELECT COUNT(*)::int AS n FROM "StudentCourseModuleInstructionButton"`,
  ],
  [
    'StudentCourseModuleSession',
    `SELECT COUNT(*)::int AS n FROM "StudentCourseModuleSession"`,
  ],
  [
    'StudentCourseModuleSessionMessage',
    `SELECT COUNT(*)::int AS n FROM "StudentCourseModuleSessionMessage"`,
  ],
  ['TeacherCourse', `SELECT COUNT(*)::int AS n FROM "TeacherCourse"`],
  ['TeacherCourseImage', `SELECT COUNT(*)::int AS n FROM "TeacherCourseImage"`],
  ['TeacherCourseModule', `SELECT COUNT(*)::int AS n FROM "TeacherCourseModule"`],
  [
    'TeacherCourseModuleResource',
    `SELECT COUNT(*)::int AS n FROM "TeacherCourseModuleResource"`,
  ],
  [
    'TeacherCourseModuleSession',
    `SELECT COUNT(*)::int AS n FROM "TeacherCourseModuleSession"`,
  ],
  ['TeacherCourseResource', `SELECT COUNT(*)::int AS n FROM "TeacherCourseResource"`],
  ['Assignment', `SELECT COUNT(*)::int AS n FROM "Assignment"`],
  ['Document', `SELECT COUNT(*)::int AS n FROM "Document"`],
  ['ClassStudentCourse', `SELECT COUNT(*)::int AS n FROM "ClassStudentCourse"`],
  [
    'orphanModules',
    `SELECT COUNT(*)::int AS n FROM "StudentCourseModule" WHERE "studentCourseId" IS NULL`,
  ],
  [
    'documentsWithAssignment',
    `SELECT COUNT(*)::int AS n FROM "Document" WHERE "assignmentId" IS NOT NULL`,
  ],
  [
    'documentsWithClassId',
    `SELECT COUNT(*)::int AS n FROM "Document" WHERE "classId" IS NOT NULL`,
  ],
];

async function main() {
  if (!DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    const counts: Record<string, number> = {};
    for (const [key, sql] of COUNT_QUERIES) {
      const { rows } = await pool.query<{ n: number }>(sql);
      counts[key] = rows[0]?.n ?? 0;
    }

    console.log('── Row counts ──────────────────────────────────────────────');
    for (const [key, n] of Object.entries(counts)) {
      console.log(`  ${key.padEnd(40)} : ${n}`);
    }
    console.log('');

    // ── Invariant check (pass-7b) ──────────────────────────────────────────
    console.log('── Invariant check (pass-7b) ───────────────────────────────');
    const { rows: conflicts } = await pool.query<{
      documentId: string;
      distinct_courses: string;
    }>(`
      SELECT s."documentId", COUNT(DISTINCT m."studentCourseId") AS distinct_courses
      FROM "StudentCourseModuleSession" s
      JOIN "StudentCourseModule" m ON m.id = s."studentCourseModuleId"
      GROUP BY s."documentId"
      HAVING COUNT(DISTINCT m."studentCourseId") > 1
    `);
    if (conflicts.length > 0) {
      console.error(
        `FAIL: ${conflicts.length} Document(s) span multiple StudentCourses — human review required before migration.`,
      );
      console.error('First 20 conflict rows:');
      for (const row of conflicts.slice(0, 20)) {
        console.error(`  documentId=${row.documentId}  distinct_courses=${row.distinct_courses}`);
      }
      process.exit(1);
    }
    console.log('OK: pass-7b invariant holds (no Document spans multiple courses).');
    console.log('');

    // ── Assigned-doc parity map (for pass-7a postcheck) ────────────────────
    const { rows: assignedDocParity } = await pool.query<{
      documentId: string;
      assignmentTypeId: string;
    }>(`
      SELECT d.id AS "documentId", a."studentCourseId" AS "assignmentTypeId"
      FROM "Document" d
      JOIN "Assignment" a ON a.id = d."assignmentId"
    `);

    // ── Canonical Document.studentProfileId mapping ────────────────────────
    const { rows: documentStudentMappings } = await pool.query<{
      documentId: string;
      studentProfileId: string;
    }>(`
      SELECT d.id AS "documentId", sp.id AS "studentProfileId"
      FROM "Document" d
      JOIN "StudentProfile" sp ON sp."profileId" = d."profileId"
    `);

    const { rows: unmappedDocuments } = await pool.query<{
      documentId: string;
      profileId: string;
      deletedAt: string | null;
    }>(`
      SELECT d.id AS "documentId", d."profileId", d."deletedAt"
      FROM "Document" d
      LEFT JOIN "StudentProfile" sp ON sp."profileId" = d."profileId"
      WHERE sp.id IS NULL
      ORDER BY d."deletedAt" NULLS FIRST, d.id
    `);

    const liveUnmapped = unmappedDocuments.filter((row) => row.deletedAt === null);
    if (liveUnmapped.length > 0) {
      console.error(
        `FAIL: ${liveUnmapped.length} non-deleted Document row(s) cannot map profileId → StudentProfile.`,
      );
      console.error('First 20 unmapped live documents:');
      for (const row of liveUnmapped.slice(0, 20)) {
        console.error(`  documentId=${row.documentId} profileId=${row.profileId}`);
      }
      process.exit(1);
    }
    if (unmappedDocuments.length > 0) {
      console.error(
        `FAIL: ${unmappedDocuments.length} total Document row(s) cannot map profileId → StudentProfile; Document.studentProfileId is required after migration.`,
      );
      console.error('First 20 unmapped documents:');
      for (const row of unmappedDocuments.slice(0, 20)) {
        console.error(
          `  documentId=${row.documentId} profileId=${row.profileId} deletedAt=${row.deletedAt ?? 'null'}`,
        );
      }
      process.exit(1);
    }

    const { rows: documentsWithClassNoAssignment } = await pool.query<{
      documentId: string;
      oldClassId: string;
    }>(`
      SELECT id AS "documentId", "classId" AS "oldClassId"
      FROM "Document"
      WHERE "classId" IS NOT NULL
        AND "assignmentId" IS NULL
      ORDER BY id
    `);
    if (documentsWithClassNoAssignment.length > 0) {
      console.warn(
        `WARN: ${documentsWithClassNoAssignment.length} Document row(s) have old classId but no assignmentId; forensic preservation will keep the class link.`,
      );
    }

    const { rows: sessionStudentMappings } = await pool.query<{
      sessionId: string;
      documentId: string;
      oldStudentProfileId: string;
      documentStudentProfileId: string | null;
    }>(`
      SELECT
        s.id AS "sessionId",
        s."documentId",
        s."studentProfileId" AS "oldStudentProfileId",
        sp.id AS "documentStudentProfileId"
      FROM "StudentCourseModuleSession" s
      JOIN "Document" d ON d.id = s."documentId"
      LEFT JOIN "StudentProfile" sp ON sp."profileId" = d."profileId"
    `);

    const sessionMismatches = sessionStudentMappings.filter(
      (row) =>
        row.documentStudentProfileId !== null &&
        row.oldStudentProfileId !== row.documentStudentProfileId,
    );
    if (sessionMismatches.length > 0) {
      console.warn(
        `WARN: ${sessionMismatches.length} AssignmentModuleSession row(s) point at a different studentProfileId than their Document owner; forensic preservation will keep the old session value.`,
      );
    }

    // ── Bucket estimates ───────────────────────────────────────────────────
    const pass7a = counts.documentsWithAssignment;
    const { rows: pass7bRows } = await pool.query<{ n: number }>(`
      SELECT COUNT(DISTINCT s."documentId")::int AS n
      FROM "StudentCourseModuleSession" s
      JOIN "Document" d ON d.id = s."documentId"
      WHERE d."assignmentId" IS NULL
    `);
    const pass7b = pass7bRows[0]?.n ?? 0;
    const pass7c = counts.Document - pass7a - pass7b;

    console.log('── Backfill bucket estimates ───────────────────────────────');
    console.log(`  pass 7a (via Assignment)        : ${pass7a} documents`);
    console.log(`  pass 7b (via ModuleSession)     : ${pass7b} documents`);
    console.log(`  pass 7c (fallback: Free Write)  : ${pass7c} documents`);
    console.log('');

    if (pass7c > pass7a) {
      console.warn(
        `WARN: pass 7c (${pass7c}) > pass 7a (${pass7a}) — more documents fall back to Free Write than have an Assignment; suggest investigating before migration.`,
      );
    }

    // ── Bucket samples (up to 5 per bucket, used by contract tests) ────────
    const { rows: bucket7aSample } = await pool.query<{ documentId: string }>(`
      SELECT id AS "documentId" FROM "Document"
      WHERE "assignmentId" IS NOT NULL
      ORDER BY id LIMIT 5
    `);
    const { rows: bucket7bSample } = await pool.query<{
      documentId: string;
      assignmentTypeId: string;
    }>(`
      SELECT DISTINCT ON (d.id) d.id AS "documentId", m."studentCourseId" AS "assignmentTypeId"
      FROM "Document" d
      JOIN "StudentCourseModuleSession" s ON s."documentId" = d.id
      JOIN "StudentCourseModule" m ON m.id = s."studentCourseModuleId"
      WHERE d."assignmentId" IS NULL
      ORDER BY d.id, s."createdAt" ASC
      LIMIT 5
    `);
    const { rows: bucket7cSample } = await pool.query<{ documentId: string }>(`
      SELECT d.id AS "documentId" FROM "Document" d
      WHERE d."assignmentId" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "StudentCourseModuleSession" s WHERE s."documentId" = d.id
        )
      ORDER BY d.id LIMIT 5
    `);

    // ── ClassStudentCourse whitelist mappings (used by C5 contract) ────────
    const { rows: whitelistMappings } = await pool.query<{
      classId: string;
      studentCourseId: string;
    }>(`SELECT "classId", "studentCourseId" FROM "ClassStudentCourse"`);

    // ── Persist state ──────────────────────────────────────────────────────
    const state: State = {
      capturedAt: new Date().toISOString(),
      counts,
      assignedDocParity,
      documentStudentMappings,
      unmappedDocuments,
      documentsWithClassNoAssignment,
      sessionStudentMappings,
      buckets: { pass7a, pass7b, pass7c },
      bucketSamples: {
        pass7a: bucket7aSample,
        pass7b: bucket7bSample,
        pass7c: bucket7cSample,
      },
      whitelistMappings,
    };
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
    console.log(
      `State written to ${STATE_PATH} (${assignedDocParity.length} assigned-doc parity rows, ` +
        `${bucket7aSample.length}/${bucket7bSample.length}/${bucket7cSample.length} bucket samples, ` +
        `${whitelistMappings.length} whitelist mappings captured).`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
