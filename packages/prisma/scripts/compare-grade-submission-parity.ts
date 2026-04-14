/**
 * Compare snapshot-linked Grade rows (pre-migration DB) to Submission rows (post-migration DB)
 * for the same ids (Submission.id = DocumentSnapshot.id = Grade.snapshotId).
 *
 * SOURCE_DATABASE_URL — DB with "Grade" + "DocumentSnapshot" (e.g. local yawp_source from pre-consolidate dump)
 * TARGET_DATABASE_URL — DB with "Submission" (e.g. prod via SSH tunnel)
 *
 * Optional: NODE_TLS_REJECT_UNAUTHORIZED=0 for RDS self-signed chain.
 *
 * Run:
 *   cd packages/prisma && SOURCE_DATABASE_URL=... TARGET_DATABASE_URL=... bun ./scripts/compare-grade-submission-parity.ts
 */
import pg from 'pg';

const SOURCE_URL = process.env.SOURCE_DATABASE_URL;
const TARGET_URL = process.env.TARGET_DATABASE_URL ?? process.env.DATABASE_URL;

/** Grade uses `updatedAt` for “when graded”; Submission uses `gradedAt` (filled from g.updatedAt in migrate). */
type GradeRow = {
  id: string;
  score: string | null;
  feedback: string | null;
  rubricScores: unknown;
  overallScore: number | null;
  overallComment: string | null;
  numericPercentage: number | null;
  letterGrade: string | null;
  grammarIssues: unknown;
  promptConfig: unknown;
  aiMeta: unknown;
  gradedAt: Date | null;
  gradedById: string | null;
  releasedAt: Date | null;
};

function normJson(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

function normStr(a: string | null | undefined): string {
  return a ?? '';
}

function normNum(a: number | null | undefined): string {
  return a === null || a === undefined ? '' : String(a);
}

function normDate(a: Date | null | undefined): string {
  return a ? new Date(a).toISOString() : '';
}

type GradeSourceRow = GradeRow & { gradeUpdatedAt: Date | null };

function rowMatch(g: GradeSourceRow, s: GradeRow): boolean {
  return (
    normStr(g.score) === normStr(s.score) &&
    normStr(g.feedback) === normStr(s.feedback) &&
    normJson(g.rubricScores) === normJson(s.rubricScores) &&
    normNum(g.overallScore) === normNum(s.overallScore) &&
    normStr(g.overallComment) === normStr(s.overallComment) &&
    normNum(g.numericPercentage) === normNum(s.numericPercentage) &&
    normStr(g.letterGrade) === normStr(s.letterGrade) &&
    normJson(g.grammarIssues) === normJson(s.grammarIssues) &&
    normJson(g.promptConfig) === normJson(s.promptConfig) &&
    normJson(g.aiMeta) === normJson(s.aiMeta) &&
    normDate(g.gradeUpdatedAt) === normDate(s.gradedAt) &&
    normStr(g.gradedById) === normStr(s.gradedById) &&
    normDate(g.releasedAt) === normDate(s.releasedAt)
  );
}

async function main() {
  if (!SOURCE_URL?.trim() || !TARGET_URL?.trim()) {
    throw new Error('Set SOURCE_DATABASE_URL and TARGET_DATABASE_URL');
  }

  const sourcePool = new pg.Pool({ connectionString: SOURCE_URL });
  const targetPool = new pg.Pool({
    connectionString: TARGET_URL,
    ssl:
      process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0'
        ? { rejectUnauthorized: false }
        : undefined,
  });

  try {
    const { rows: grades } = await sourcePool.query<GradeSourceRow>(`
      SELECT
        g."snapshotId" AS id,
        g.score,
        g.feedback,
        g."rubricScores",
        g."overallScore",
        g."overallComment",
        g."numericPercentage",
        g."letterGrade",
        g."grammarIssues",
        g."promptConfig",
        g."aiMeta",
        g."updatedAt" AS "gradeUpdatedAt",
        g."gradedById",
        g."releasedAt"
      FROM "Grade" g
      WHERE g."snapshotId" IS NOT NULL
      ORDER BY g."snapshotId"
    `);

    const { rows: decoupled } = await sourcePool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM "Grade" WHERE "snapshotId" IS NULL`,
    );

    const ids = grades.map((g) => g.id);
    if (ids.length === 0) {
      console.log('No snapshot-linked grades in source.');
      return;
    }

    const { rows: subs } = await targetPool.query<GradeRow>(
      `
      SELECT
        s.id,
        s.score,
        s.feedback,
        s."rubricScores",
        s."overallScore",
        s."overallComment",
        s."numericPercentage",
        s."letterGrade",
        s."grammarIssues",
        s."promptConfig",
        s."aiMeta",
        s."gradedAt",
        s."gradedById",
        s."releasedAt"
      FROM "Submission" s
      WHERE s.id = ANY($1::text[])
    `,
      [ids],
    );

    const subById = new Map(subs.map((s) => [s.id, s]));
    let missingOnTarget = 0;
    let matched = 0;
    let mismatched = 0;
    const sampleMismatch: string[] = [];

    for (const g of grades) {
      const s = subById.get(g.id);
      if (!s) {
        missingOnTarget++;
        if (sampleMismatch.length < 10) sampleMismatch.push(`${g.id} (missing Submission)`);
        continue;
      }
      if (rowMatch(g, s)) {
        matched++;
      } else {
        mismatched++;
        if (sampleMismatch.length < 10) sampleMismatch.push(`${g.id} (field mismatch)`);
      }
    }

    console.log('--- Grade ↔ Submission parity (snapshot-linked grades) ---');
    console.log(`Source: snapshot-linked Grade rows: ${grades.length}`);
    console.log(`Source: decoupled Grade rows (snapshotId NULL): ${decoupled[0]?.n ?? '?'}`);
    console.log(`Target: Submission rows found for those ids: ${subs.length}`);
    console.log(`Matched (all compared columns equal): ${matched}`);
    console.log(`Missing Submission row on target: ${missingOnTarget}`);
    console.log(`Present but column mismatch: ${mismatched}`);
    if (sampleMismatch.length > 0) {
      console.log(`Sample issues (up to 10): ${sampleMismatch.join('; ')}`);
    }
    console.log(
      '\nNote: Backup may be older than prod; missing rows can be new deletes or id drift.',
    );
  } finally {
    await sourcePool.end();
    await targetPool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
