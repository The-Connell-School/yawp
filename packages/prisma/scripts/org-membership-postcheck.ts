/* eslint-disable no-console */
/**
 * POST-MIGRATION ONLY — validates OrgMembership cutover invariants.
 * Profile / TeacherProfile / StudentProfile must be gone; use this after migrate deploy.
 */
import { createPrismaClient } from './local-dev/connection';

const LEGACY_TABLES = ['Profile', 'TeacherProfile', 'StudentProfile'] as const;

export type PostcheckInput = {
  counts: {
    orgMemberships: number;
    documents: number;
    classes: number;
  };
  legacyTablesPresent: string[];
  documentsWithoutMembershipId: Array<{ documentId: string }>;
  orphanClassTeacherLinks: Array<{ classId: string; membershipId: string }>;
  orphanClassStudentLinks: Array<{ classId: string; membershipId: string }>;
  duplicateUserOrgMemberships: Array<{
    userId: string;
    organizationId: string;
    count: number;
  }>;
};

export function buildPostcheckReport(input: PostcheckInput) {
  const blockers = [
    ...(input.counts.orgMemberships <= 0
      ? [{ kind: 'empty_org_membership' as const, row: { count: 0 } }]
      : []),
    ...input.legacyTablesPresent.map((tableName) => ({
      kind: 'legacy_table_present' as const,
      row: { tableName },
    })),
    ...input.documentsWithoutMembershipId.map((row) => ({
      kind: 'document_missing_membership_id' as const,
      row,
    })),
    ...input.orphanClassTeacherLinks.map((row) => ({
      kind: 'orphan_class_teacher_link' as const,
      row,
    })),
    ...input.orphanClassStudentLinks.map((row) => ({
      kind: 'orphan_class_student_link' as const,
      row,
    })),
    ...input.duplicateUserOrgMemberships.map((row) => ({
      kind: 'duplicate_user_org_membership' as const,
      row,
    })),
  ];

  return {
    ok: blockers.length === 0,
    counts: input.counts,
    dualRoleCount: input.duplicateUserOrgMemberships.length,
    blockers,
  };
}

async function tableExists(
  prisma: ReturnType<typeof createPrismaClient>,
  tableName: string
) {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = ${tableName}
    ) AS "exists"
  `;
  return rows[0]?.exists ?? false;
}

async function main() {
  const prisma = createPrismaClient();
  try {
    const legacyPresence = await Promise.all(
      LEGACY_TABLES.map(async (tableName) => ({
        tableName,
        exists: await tableExists(prisma, tableName),
      }))
    );
    const legacyTablesPresent = legacyPresence
      .filter((row) => row.exists)
      .map((row) => row.tableName);

    const [orgMemberships, documents, classes] = await Promise.all([
      prisma.orgMembership.count(),
      prisma.document.count(),
      prisma.class.count(),
    ]);

    const documentsWithoutMembershipId = await prisma.$queryRaw<
      Array<{ documentId: string }>
    >`
      SELECT id AS "documentId"
      FROM "Document"
      WHERE "membershipId" IS NULL
    `;

    const orphanClassTeacherLinks = await prisma.$queryRaw<
      Array<{ classId: string; membershipId: string }>
    >`
      SELECT jt."A" AS "classId", jt."B" AS "membershipId"
      FROM "_ClassTeachers" jt
      LEFT JOIN "Class" c ON c.id = jt."A"
      LEFT JOIN "OrgMembership" m ON m.id = jt."B"
      WHERE c.id IS NULL OR m.id IS NULL
    `;

    const orphanClassStudentLinks = await prisma.$queryRaw<
      Array<{ classId: string; membershipId: string }>
    >`
      SELECT jt."A" AS "classId", jt."B" AS "membershipId"
      FROM "_ClassStudents" jt
      LEFT JOIN "Class" c ON c.id = jt."A"
      LEFT JOIN "OrgMembership" m ON m.id = jt."B"
      WHERE c.id IS NULL OR m.id IS NULL
    `;

    const duplicateUserOrgMemberships = await prisma.$queryRaw<
      Array<{ userId: string; organizationId: string; count: number }>
    >`
      SELECT "userId", "organizationId", COUNT(*)::int AS count
      FROM "OrgMembership"
      GROUP BY 1, 2
      HAVING COUNT(*) > 1
    `;

    const report = buildPostcheckReport({
      counts: { orgMemberships, documents, classes },
      legacyTablesPresent,
      documentsWithoutMembershipId,
      orphanClassTeacherLinks,
      orphanClassStudentLinks,
      duplicateUserOrgMemberships,
    });

    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
