/**
 * Preflight checks before the assignments-unification migration.
 *
 * Captures row counts for tables being renamed/modified and verifies the
 * invariant that the migration's backfill depends on: no Document has
 * StudentCourseModuleSessions pointing at multiple distinct StudentCourses.
 *
 * Run:
 *   cd packages/prisma && bun ./scripts/assignments-unification-preflight.ts
 */
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

async function main() {
  if (!DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    // ── 1. Row counts ────────────────────────────────────────────────────────

    const counts: Record<string, number> = {};

    const countQueries: Array<[string, string]> = [
      ['studentCourses', `SELECT COUNT(*)::int AS n FROM "StudentCourse"`],
      ['assignments', `SELECT COUNT(*)::int AS n FROM "Assignment"`],
      ['studentCourseModules', `SELECT COUNT(*)::int AS n FROM "StudentCourseModule"`],
      [
        'orphanModules',
        `SELECT COUNT(*)::int AS n FROM "StudentCourseModule" WHERE "studentCourseId" IS NULL`,
      ],
      ['studentCourseModuleSessions', `SELECT COUNT(*)::int AS n FROM "StudentCourseModuleSession"`],
      ['documents', `SELECT COUNT(*)::int AS n FROM "Document"`],
      [
        'documentsWithAssignment',
        `SELECT COUNT(*)::int AS n FROM "Document" WHERE "assignmentId" IS NOT NULL`,
      ],
      [
        'documentsWithoutAssignment',
        `SELECT COUNT(*)::int AS n FROM "Document" WHERE "assignmentId" IS NULL`,
      ],
      ['teacherCourses', `SELECT COUNT(*)::int AS n FROM "TeacherCourse"`],
      ['classStudentCourses', `SELECT COUNT(*)::int AS n FROM "ClassStudentCourse"`],
    ];

    for (const [key, sql] of countQueries) {
      const { rows } = await pool.query<{ n: number }>(sql);
      counts[key] = rows[0]?.n ?? 0;
    }

    console.log('── Row counts ──────────────────────────────────────────────');
    console.log(`  studentCourses           : ${counts.studentCourses}`);
    console.log(`  assignments              : ${counts.assignments}`);
    console.log(`  studentCourseModules     : ${counts.studentCourseModules}`);
    console.log(`  orphanModules            : ${counts.orphanModules}`);
    console.log(`  studentCourseModuleSessions: ${counts.studentCourseModuleSessions}`);
    console.log(`  documents                : ${counts.documents}`);
    console.log(`  documentsWithAssignment  : ${counts.documentsWithAssignment}`);
    console.log(`  documentsWithoutAssignment: ${counts.documentsWithoutAssignment}`);
    console.log(`  teacherCourses           : ${counts.teacherCourses}`);
    console.log(`  classStudentCourses      : ${counts.classStudentCourses}`);
    console.log('');

    // ── 2. Invariant check (pass-7b) ─────────────────────────────────────────

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

    // ── 3. Backfill bucket estimates ─────────────────────────────────────────

    console.log('── Backfill bucket estimates ───────────────────────────────');

    const pass7a = counts.documentsWithAssignment;

    const { rows: pass7bRows } = await pool.query<{ n: number }>(`
      SELECT COUNT(DISTINCT s."documentId")::int AS n
      FROM "StudentCourseModuleSession" s
      JOIN "Document" d ON d.id = s."documentId"
      WHERE d."assignmentId" IS NULL
    `);
    const pass7b = pass7bRows[0]?.n ?? 0;

    const pass7c = counts.documents - pass7a - pass7b;

    console.log(`  pass 7a (via Assignment)        : ${pass7a} documents`);
    console.log(`  pass 7b (via ModuleSession)     : ${pass7b} documents`);
    console.log(`  pass 7c (fallback: Free Write)  : ${pass7c} documents`);
    console.log('');

    if (pass7c > pass7a) {
      console.warn(
        `WARN: pass 7c (${pass7c}) > pass 7a (${pass7a}) — more documents fall back to Free Write than have an Assignment; suggest investigating before migration.`,
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
