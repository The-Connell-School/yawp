import { z } from 'zod';
import { prisma } from '~/utils/db.server';

const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const gradingStatsQuerySchema = z
  .object({
    since: daySchema,
    until: daySchema,
  })
  .strict();

export type GradingStatsRow = {
  day: string;
  organizationId: string;
  assignmentTypeId: string | null;
  outcome: 'success' | 'failure';
  teacherNote: 'present' | 'absent';
  count: number;
};

export async function loadGradingStats(input: {
  since: Date;
  until: Date;
}): Promise<GradingStatsRow[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      day: Date;
      organizationId: string;
      assignmentTypeId: string | null;
      outcome: string;
      teacherNote: string;
      count: number;
    }>
  >`
    SELECT
      (date_trunc('day', r."createdAt" AT TIME ZONE 'UTC'))::date AS day,
      m."organizationId" AS "organizationId",
      d."assignmentTypeId" AS "assignmentTypeId",
      CASE WHEN r.status = 'succeeded' THEN 'success' ELSE 'failure' END AS outcome,
      CASE
        WHEN COALESCE(NULLIF(TRIM(r.metadata->>'teacherNote'), ''), '') <> '' THEN 'present'
        ELSE 'absent'
      END AS "teacherNote",
      COUNT(*)::int AS count
    FROM "SubmissionGradingAssistantRun" r
    INNER JOIN "Submission" s ON s.id = r."submissionId"
    INNER JOIN "Document" d ON d.id = s."documentId"
    INNER JOIN "OrgMembership" m ON m.id = d."membershipId"
    WHERE r."createdAt" >= ${input.since}
      AND r."createdAt" < ${input.until}
    GROUP BY 1, 2, 3, 4, 5
    ORDER BY 1, 2, 3, 4, 5
  `;

  return rows.map(row => ({
    day: row.day.toISOString().slice(0, 10),
    organizationId: row.organizationId,
    assignmentTypeId: row.assignmentTypeId,
    outcome: row.outcome === 'success' ? 'success' : 'failure',
    teacherNote: row.teacherNote === 'present' ? 'present' : 'absent',
    count: row.count,
  }));
}

export function parseGradingStatsRange(query: z.infer<typeof gradingStatsQuerySchema>) {
  const since = new Date(`${query.since}T00:00:00.000Z`);
  const until = new Date(`${query.until}T00:00:00.000Z`);
  if (!(since < until)) throw new Error('Invalid range');
  const maxSpanMs = 366 * 24 * 60 * 60 * 1000;
  if (until.getTime() - since.getTime() > maxSpanMs) throw new Error('Range too large');
  return { since, until };
}
