/**
 * Post-migration verification for the assignments-unification migration.
 *
 * If a preflight state file exists, runs strict transformation assertions:
 *   - Every renamed-table count matches pre-state
 *   - AssignmentType count = pre + 1 (Free Write seed)
 *   - For all 8 docs with assignmentId: Document.assignmentTypeId = Assignment.assignmentTypeId
 *   - AssignmentModule.assignmentTypeId has zero NULLs
 *   - All AssignmentType rows have NULL ownerOrgId AND ownerTeacherId
 *   - All renamed old tables are absent
 *   - Document.classId column is absent
 *
 * Without a state file, falls back to plausibility checks and warns.
 *
 * Run:
 *   cd packages/prisma && bun ./scripts/assignments-unification-postcheck.ts
 *
 * State file: /tmp/assignments-unification-preflight.json
 *   (override via PREFLIGHT_STATE_PATH env var)
 */
import pg from 'pg';
import { existsSync, readFileSync } from 'node:fs';

const DATABASE_URL = process.env.DATABASE_URL;
const FREE_WRITE_ID = 'cfreewrite0000000000000000';
const STATE_PATH =
  process.env.PREFLIGHT_STATE_PATH ||
  '/tmp/assignments-unification-preflight.json';

const DROPPED_OLD_TABLES = [
  'StudentCourse',
  'StudentCourseImage',
  'StudentCourseModule',
  'StudentCourseModuleInstruction',
  'StudentCourseModuleInstructionButton',
  'StudentCourseModuleSession',
  'StudentCourseModuleSessionMessage',
  'TeacherCourse',
  'TeacherCourseImage',
  'TeacherCourseModule',
  'TeacherCourseModuleResource',
  'TeacherCourseModuleSession',
  'TeacherCourseResource',
  'ClassStudentCourse',
];

const RENAMED_TABLE_PAIRS: Array<{ before: string; after: string }> = [
  { before: 'StudentCourse', after: 'AssignmentType' },
  { before: 'StudentCourseImage', after: 'AssignmentTypeImage' },
  { before: 'StudentCourseModule', after: 'AssignmentModule' },
  { before: 'StudentCourseModuleInstruction', after: 'AssignmentModuleInstruction' },
  { before: 'StudentCourseModuleInstructionButton', after: 'AssignmentModuleInstructionButton' },
  { before: 'StudentCourseModuleSession', after: 'AssignmentModuleSession' },
  { before: 'StudentCourseModuleSessionMessage', after: 'AssignmentModuleSessionMessage' },
  { before: 'TeacherCourse', after: 'TeacherTraining' },
  { before: 'TeacherCourseImage', after: 'TeacherTrainingImage' },
  { before: 'TeacherCourseModule', after: 'TeacherTrainingModule' },
  { before: 'TeacherCourseModuleResource', after: 'TeacherTrainingModuleResource' },
  { before: 'TeacherCourseModuleSession', after: 'TeacherTrainingModuleSession' },
  { before: 'TeacherCourseResource', after: 'TeacherTrainingResource' },
  { before: 'Assignment', after: 'Assignment' },
  { before: 'Document', after: 'Document' },
];

type PreflightState = {
  capturedAt: string;
  counts: Record<string, number>;
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
  buckets: { pass7a: number; pass7b: number; pass7c: number };
};

async function main() {
  if (!DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const problems: string[] = [];

  try {
    // ── Read preflight state if available ──────────────────────────────────
    let preflight: PreflightState | null = null;
    if (existsSync(STATE_PATH)) {
      preflight = JSON.parse(readFileSync(STATE_PATH, 'utf8')) as PreflightState;
      console.log(`Loaded preflight state from ${STATE_PATH} (captured ${preflight.capturedAt}).`);
    } else {
      console.warn(
        `WARN: No preflight state file at ${STATE_PATH}. Running plausibility checks only — strict transformation assertions skipped.`,
      );
    }

    // ── 1. Renamed table row counts ────────────────────────────────────────
    console.log('── Renamed table counts ────────────────────────────────────');
    for (const { before, after } of RENAMED_TABLE_PAIRS) {
      const { rows } = await pool.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM "${after}"`,
      );
      const postCount = rows[0]?.n ?? 0;
      const preCount = preflight?.counts[before];
      const expected = after === 'AssignmentType' && preCount !== undefined
        ? preCount + 1 // Free Write seed
        : preCount;
      const marker = preCount === undefined ? '?' : postCount === expected ? '✓' : '✗';
      console.log(
        `  ${after.padEnd(40)} : ${postCount}${preCount !== undefined ? ` (was ${preCount}${after === 'AssignmentType' ? ', +1 seed' : ''})` : ''} ${marker}`,
      );
      if (preCount !== undefined && postCount !== expected) {
        problems.push(
          `Row count drift on ${after}: pre=${preCount}, post=${postCount}, expected=${expected}`,
        );
      }
    }
    console.log('');

    // ── 2. Free Write seed exists ──────────────────────────────────────────
    const { rows: freeWriteRows } = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM "AssignmentType" WHERE id = $1`,
      [FREE_WRITE_ID],
    );
    if ((freeWriteRows[0]?.n ?? 0) !== 1) {
      problems.push('Free Write AssignmentType seed row not found');
    }

    // ── 3. Document.assignmentTypeId NOT NULL on every row ─────────────────
    const { rows: docTotals } = await pool.query<{ total: number; nulls: number }>(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE "assignmentTypeId" IS NULL)::int AS nulls
      FROM "Document"
    `);
    if ((docTotals[0]?.nulls ?? 0) > 0) {
      problems.push(`${docTotals[0]?.nulls} Document(s) have NULL assignmentTypeId`);
    }

    const { rows: docStudentTotals } = await pool.query<{ total: number; nulls: number }>(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE "studentProfileId" IS NULL)::int AS nulls
      FROM "Document"
    `);
    if ((docStudentTotals[0]?.nulls ?? 0) > 0) {
      problems.push(`${docStudentTotals[0]?.nulls} Document(s) have NULL studentProfileId`);
    }

    if (preflight) {
      let studentOwnerFailures = 0;
      for (const { documentId, studentProfileId: expected } of preflight.documentStudentMappings) {
        const { rows } = await pool.query<{ studentProfileId: string | null }>(
          `SELECT "studentProfileId" FROM "Document" WHERE id = $1`,
          [documentId],
        );
        if (rows[0]?.studentProfileId !== expected) {
          studentOwnerFailures++;
        }
      }
      if (studentOwnerFailures > 0) {
        problems.push(
          `${studentOwnerFailures} of ${preflight.documentStudentMappings.length} Document rows have wrong studentProfileId`,
        );
      } else {
        console.log(
          `Document student ownership: ${preflight.documentStudentMappings.length}/${preflight.documentStudentMappings.length} rows match preflight mapping.`,
        );
      }
    }

    // ── 4. Pass-7a parity (assigned docs) ──────────────────────────────────
    if (preflight) {
      let parityFailures = 0;
      for (const { documentId, assignmentTypeId: expected } of preflight.assignedDocParity) {
        const { rows } = await pool.query<{ assignmentTypeId: string | null }>(
          `SELECT "assignmentTypeId" FROM "Document" WHERE id = $1`,
          [documentId],
        );
        if (rows[0]?.assignmentTypeId !== expected) {
          parityFailures++;
        }
      }
      if (parityFailures > 0) {
        problems.push(
          `${parityFailures} of ${preflight.assignedDocParity.length} assigned docs have wrong assignmentTypeId (pass-7a parity broken)`,
        );
      } else {
        console.log(
          `Pass-7a parity: ${preflight.assignedDocParity.length}/${preflight.assignedDocParity.length} assigned docs have correct assignmentTypeId.`,
        );
      }
    }

    // ── 5. AssignmentModule.assignmentTypeId zero NULLs ────────────────────
    const { rows: amNulls } = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM "AssignmentModule" WHERE "assignmentTypeId" IS NULL`,
    );
    if ((amNulls[0]?.n ?? 0) > 0) {
      problems.push(`${amNulls[0]?.n} AssignmentModule row(s) have NULL assignmentTypeId`);
    }

    // ── 6. AssignmentType ownership baseline (all NULL) ────────────────────
    const { rows: ownedRows } = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM "AssignmentType"
       WHERE "ownerOrgId" IS NOT NULL OR "ownerTeacherId" IS NOT NULL`,
    );
    if ((ownedRows[0]?.n ?? 0) > 0) {
      problems.push(
        `${ownedRows[0]?.n} AssignmentType row(s) have non-NULL ownership; expected all system-owned`,
      );
    }

    // ── 7. Old tables absent ───────────────────────────────────────────────
    for (const table of DROPPED_OLD_TABLES) {
      const { rows } = await pool.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = current_schema() AND table_name = $1
         ) AS exists`,
        [table],
      );
      if (rows[0]?.exists) {
        problems.push(`Old table "${table}" still exists (rename or drop failed)`);
      }
    }

    // ── 8. Document.classId column absent ──────────────────────────────────
    const { rows: classIdCol } = await pool.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'Document' AND column_name = 'classId'`,
    );
    if (classIdCol.length > 0) {
      problems.push('Document.classId column still exists');
    }

    const { rows: sessionStudentCol } = await pool.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'AssignmentModuleSession'
         AND column_name = 'studentProfileId'`,
    );
    if (sessionStudentCol.length > 0) {
      problems.push('AssignmentModuleSession.studentProfileId column still exists');
    }

    if (preflight) {
      const forensicChecks: Array<{
        table: string;
        expected: number;
        description: string;
      }> = [
        {
          table: 'DocumentClassForensic',
          expected: preflight.counts.documentsWithClassId ?? 0,
          description: 'Document.classId forensic rows',
        },
        {
          table: 'AssignmentModuleSessionStudentForensic',
          expected: preflight.sessionStudentMappings.length,
          description: 'AssignmentModuleSession.studentProfileId forensic rows',
        },
        {
          table: 'ClassStudentCourseForensic',
          expected: preflight.whitelistMappings.length,
          description: 'ClassStudentCourse forensic rows',
        },
      ];

      for (const { table, expected, description } of forensicChecks) {
        const { rows } = await pool.query<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM "${table}"`,
        );
        const observed = rows[0]?.n ?? 0;
        if (observed !== expected) {
          problems.push(`${description} mismatch: observed ${observed}, expected ${expected}`);
        } else {
          console.log(`${description}: ${observed}/${expected} rows preserved.`);
        }
      }
    }

    // ── 9. Pass-7c bucket size ─────────────────────────────────────────────
    if (preflight) {
      const { rows: freeWriteDocs } = await pool.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM "Document" WHERE "assignmentTypeId" = $1`,
        [FREE_WRITE_ID],
      );
      const observed = freeWriteDocs[0]?.n ?? 0;
      const expected = preflight.buckets.pass7c;
      if (observed !== expected) {
        problems.push(
          `Pass-7c bucket size mismatch: observed ${observed} docs on Free Write, expected ${expected} from preflight estimate`,
        );
      } else {
        console.log(`Pass-7c bucket: ${observed} docs on Free Write (matches preflight estimate).`);
      }
    }

    console.log('');

    if (problems.length > 0) {
      console.error('── Problems ────────────────────────────────────────────────');
      for (const p of problems) console.error(`  FAIL: ${p}`);
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
