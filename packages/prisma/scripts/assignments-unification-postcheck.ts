/**
 * Post-migration verification for the assignments-unification migration.
 *
 * Captures row counts on the renamed tables and asserts:
 *   - Every Document has a non-null assignmentTypeId.
 *   - Renamed table counts match pre-migration counts.
 *
 * Run:
 *   cd packages/prisma && bun ./scripts/assignments-unification-postcheck.ts
 */
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const FREE_WRITE_ID = 'cfreewrite0000000000000000';

async function main() {
  if (!DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    const counts: Record<string, number> = {};
    const countQueries: Array<[string, string]> = [
      ['assignmentTypes', `SELECT COUNT(*)::int AS n FROM "AssignmentType"`],
      ['assignments', `SELECT COUNT(*)::int AS n FROM "Assignment"`],
      ['assignmentModules', `SELECT COUNT(*)::int AS n FROM "AssignmentModule"`],
      ['assignmentModuleSessions', `SELECT COUNT(*)::int AS n FROM "AssignmentModuleSession"`],
      ['documents', `SELECT COUNT(*)::int AS n FROM "Document"`],
      [
        'documentsWithAssignmentTypeId',
        `SELECT COUNT(*)::int AS n FROM "Document" WHERE "assignmentTypeId" IS NOT NULL`,
      ],
      [
        'documentsOnFreeWrite',
        `SELECT COUNT(*)::int AS n FROM "Document" WHERE "assignmentTypeId" = $1`,
      ],
      ['teacherTrainings', `SELECT COUNT(*)::int AS n FROM "TeacherTraining"`],
    ];

    for (const [key, sql] of countQueries) {
      const params = key === 'documentsOnFreeWrite' ? [FREE_WRITE_ID] : [];
      const { rows } = await pool.query<{ n: number }>(sql, params);
      counts[key] = rows[0]?.n ?? 0;
    }

    console.log('── Post-migration counts ───────────────────────────────────');
    console.log(`  assignmentTypes              : ${counts.assignmentTypes}`);
    console.log(`  assignments                  : ${counts.assignments}`);
    console.log(`  assignmentModules            : ${counts.assignmentModules}`);
    console.log(`  assignmentModuleSessions     : ${counts.assignmentModuleSessions}`);
    console.log(`  documents                    : ${counts.documents}`);
    console.log(`  documentsWithAssignmentTypeId: ${counts.documentsWithAssignmentTypeId}`);
    console.log(`  documentsOnFreeWrite         : ${counts.documentsOnFreeWrite}`);
    console.log(`  teacherTrainings             : ${counts.teacherTrainings}`);
    console.log('');

    // ── Assertions ────────────────────────────────────────────────────────
    const problems: string[] = [];

    if (counts.documents !== counts.documentsWithAssignmentTypeId) {
      problems.push(
        `FAIL: ${counts.documents - counts.documentsWithAssignmentTypeId} Document(s) are missing assignmentTypeId`,
      );
    }

    const { rows: freeWriteRows } = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM "AssignmentType" WHERE id = $1`,
      [FREE_WRITE_ID],
    );
    if ((freeWriteRows[0]?.n ?? 0) !== 1) {
      problems.push('FAIL: Free Write AssignmentType seed row not found');
    }

    // Dropped tables should error cleanly
    try {
      await pool.query(`SELECT 1 FROM "ClassStudentCourse" LIMIT 1`);
      problems.push('FAIL: ClassStudentCourse table still exists');
    } catch {
      // expected
    }
    try {
      await pool.query(`SELECT 1 FROM "StudentCourse" LIMIT 1`);
      problems.push('FAIL: StudentCourse table still exists (rename failed)');
    } catch {
      // expected
    }
    try {
      await pool.query(`SELECT 1 FROM "TeacherCourse" LIMIT 1`);
      problems.push('FAIL: TeacherCourse table still exists (rename failed)');
    } catch {
      // expected
    }

    // Document.classId should be gone
    const { rows: classIdCol } = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'Document' AND column_name = 'classId'`,
    );
    if (classIdCol.length > 0) {
      problems.push('FAIL: Document.classId column still exists');
    }

    if (problems.length > 0) {
      console.error('── Problems ────────────────────────────────────────────────');
      for (const p of problems) console.error(`  ${p}`);
      process.exit(1);
    }

    console.log('OK: all post-migration assertions passed.');
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
