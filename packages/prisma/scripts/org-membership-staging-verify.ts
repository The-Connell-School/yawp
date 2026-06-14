/* eslint-disable no-console */
/**
 * POST-MIGRATION staging verification for OrgMembership + ClassAssignment cutover.
 * Runs postcheck invariants plus forensic/parity checks expected after a prod snapshot migrate.
 */
import { createPrismaClient } from './local-dev/connection';
import {
  buildPostcheckReport,
  type PostcheckInput,
} from './org-membership-postcheck';

const FORENSIC_TABLES = [
  'TeacherProfileForensic',
  'StudentProfileForensic',
  'ProfileDuplicateForensic',
  'ProfileOrphanForensic',
  'AssignmentClassIdForensic',
  'AssignmentDueDateForensic',
  'FeatureAccessTargetTeacherForensic',
  'DocumentStudentProfileIdForensic',
] as const;

export type StagingVerifyInput = {
  postcheck: PostcheckInput;
  forensicCounts: Record<string, number | null>;
  parity: {
    assignments: number;
    classAssignments: number;
    teacherScopedFeatureTargets: number;
    orphanTeacherFeatureTargets: number;
  };
  sampleAccounts: Array<{
    email: string;
    role: string;
    organizationName: string;
    isOrgOwner: boolean;
  }>;
};

export function buildStagingVerifyReport(input: StagingVerifyInput) {
  const postcheck = buildPostcheckReport(input.postcheck);
  const blockers = [...postcheck.blockers];

  for (const tableName of FORENSIC_TABLES) {
    const count = input.forensicCounts[tableName];
    if (count === null) {
      blockers.push({
        kind: 'missing_forensic_table' as const,
        row: { tableName },
      });
    }
  }

  if (
    input.parity.classAssignments !== input.parity.assignments &&
    input.forensicCounts.AssignmentClassIdForensic !== null
  ) {
    blockers.push({
      kind: 'assignment_deployment_parity' as const,
      row: {
        assignments: input.parity.assignments,
        classAssignments: input.parity.classAssignments,
        assignmentClassIdForensic:
          input.forensicCounts.AssignmentClassIdForensic ?? 0,
      },
    });
  }

  if (input.parity.orphanTeacherFeatureTargets > 0) {
    blockers.push({
      kind: 'orphan_teacher_feature_target' as const,
      row: { count: input.parity.orphanTeacherFeatureTargets },
    });
  }

  return {
    ok: blockers.length === 0,
    postcheck,
    forensicCounts: input.forensicCounts,
    parity: input.parity,
    sampleAccounts: input.sampleAccounts,
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

async function countTable(
  prisma: ReturnType<typeof createPrismaClient>,
  tableName: string
) {
  if (!(await tableExists(prisma, tableName))) {
    return null;
  }
  const rows = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int AS count FROM "${tableName}"`
  );
  return rows[0]?.count ?? 0;
}

async function main() {
  const prisma = createPrismaClient();
  try {
    const legacyPresence = await Promise.all(
      (['Profile', 'TeacherProfile', 'StudentProfile'] as const).map(
        async (tableName) => ({
          tableName,
          exists: await tableExists(prisma, tableName),
        })
      )
    );
    const legacyTablesPresent = legacyPresence
      .filter((row) => row.exists)
      .map((row) => row.tableName);

    if (legacyTablesPresent.length > 0) {
      console.error(
        JSON.stringify(
          {
            ok: false,
            error:
              'Database is not migrated yet. Run prisma migrate deploy before staging verify.',
            legacyTablesPresent,
          },
          null,
          2
        )
      );
      process.exit(1);
    }

    const [orgMemberships, documents, classes, assignments, classAssignments] =
      await Promise.all([
        prisma.orgMembership.count(),
        prisma.document.count(),
        prisma.class.count(),
        prisma.assignment.count(),
        prisma.classAssignment.count(),
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

    const forensicCounts: Record<string, number | null> = {};
    for (const tableName of FORENSIC_TABLES) {
      forensicCounts[tableName] = await countTable(prisma, tableName);
    }

    const teacherScopedFeatureTargets = await prisma.featureAccessTarget.count({
      where: { targetKind: 'teacher' },
    });

    const orphanTeacherFeatureTargetsRows = await prisma.$queryRaw<
      Array<{ count: number }>
    >`
      SELECT COUNT(*)::int AS count
      FROM "FeatureAccessTarget" fat
      WHERE fat."targetKind" = 'teacher'
        AND NOT EXISTS (
          SELECT 1 FROM "OrgMembership" m WHERE m.id = fat."targetId"
        )
    `;
    const orphanTeacherFeatureTargets =
      orphanTeacherFeatureTargetsRows[0]?.count ?? 0;

    const sampleAccounts = await prisma.orgMembership.findMany({
      take: 8,
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: {
        role: true,
        isOrgOwner: true,
        user: { select: { email: true } },
        organization: { select: { name: true } },
      },
    });

    const report = buildStagingVerifyReport({
      postcheck: {
        counts: { orgMemberships, documents, classes },
        legacyTablesPresent,
        documentsWithoutMembershipId,
        orphanClassTeacherLinks,
        orphanClassStudentLinks,
        duplicateUserOrgMemberships,
      },
      forensicCounts,
      parity: {
        assignments,
        classAssignments,
        teacherScopedFeatureTargets,
        orphanTeacherFeatureTargets,
      },
      sampleAccounts: sampleAccounts.map((row) => ({
        email: row.user.email,
        role: row.role,
        organizationName: row.organization.name,
        isOrgOwner: row.isOrgOwner,
      })),
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
