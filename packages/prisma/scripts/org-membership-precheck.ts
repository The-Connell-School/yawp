/* eslint-disable no-console */
import { createPrismaClient } from './local-dev/connection';

export type PrecheckInput = {
  counts: Record<string, number>;
  dualSubProfiles: Array<{ profileId: string; userId: string; organizationId: string }>;
  documentMismatches: Array<{
    documentId: string;
    profileId: string;
    studentProfileId: string;
    expectedMembershipId: string;
  }>;
  orphanSubProfiles: Array<{ kind: 'teacher' | 'student'; id: string }>;
  duplicateUserOrgProfiles: Array<{ userId: string; organizationId: string; count: number }>;
};

export function buildPrecheckReport(input: PrecheckInput) {
  const blockers = [
    ...input.dualSubProfiles.map((row) => ({ kind: 'dual_sub_profile' as const, row })),
    ...input.documentMismatches.map((row) => ({ kind: 'document_mismatch' as const, row })),
    ...input.orphanSubProfiles.map((row) => ({ kind: 'orphan_sub_profile' as const, row })),
    ...input.duplicateUserOrgProfiles.map((row) => ({
      kind: 'duplicate_user_org' as const,
      row,
    })),
  ];
  return { ok: blockers.length === 0, counts: input.counts, blockers };
}

async function main() {
  const prisma = createPrismaClient();
  try {
    const [users, profiles, teacherProfiles, studentProfiles, documents, classes] =
      await Promise.all([
        prisma.user.count(),
        prisma.profile.count(),
        prisma.teacherProfile.count(),
        prisma.studentProfile.count(),
        prisma.document.count(),
        prisma.class.count(),
      ]);

    const dualSubProfiles = await prisma.$queryRaw<
      Array<{ profileId: string; userId: string; organizationId: string }>
    >`
      SELECT p.id AS "profileId", p."userId", p."organizationId"
      FROM "Profile" p
      WHERE EXISTS (SELECT 1 FROM "TeacherProfile" tp WHERE tp."profileId" = p.id)
        AND EXISTS (SELECT 1 FROM "StudentProfile" sp WHERE sp."profileId" = p.id)
    `;

    const documentMismatches = await prisma.$queryRaw<
      Array<{
        documentId: string;
        profileId: string;
        studentProfileId: string;
        expectedMembershipId: string;
      }>
    >`
      SELECT d.id AS "documentId", d."profileId", d."studentProfileId", sp."profileId" AS "expectedMembershipId"
      FROM "Document" d
      JOIN "StudentProfile" sp ON sp.id = d."studentProfileId"
      WHERE d."profileId" <> sp."profileId"
    `;

    const orphanTeacherProfiles = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT tp.id FROM "TeacherProfile" tp
      LEFT JOIN "Profile" p ON p.id = tp."profileId"
      WHERE p.id IS NULL
    `;
    const orphanStudentProfiles = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT sp.id FROM "StudentProfile" sp
      LEFT JOIN "Profile" p ON p.id = sp."profileId"
      WHERE p.id IS NULL
    `;
    const orphanSubProfiles = [
      ...orphanTeacherProfiles.map((row) => ({ kind: 'teacher' as const, id: row.id })),
      ...orphanStudentProfiles.map((row) => ({ kind: 'student' as const, id: row.id })),
    ];

    const duplicateUserOrgProfiles = await prisma.$queryRaw<
      Array<{ userId: string; organizationId: string; count: number }>
    >`
      SELECT "userId", "organizationId", COUNT(*)::int AS count
      FROM "Profile"
      GROUP BY 1, 2
      HAVING COUNT(*) > 1
    `;

    const report = buildPrecheckReport({
      counts: { users, profiles, teacherProfiles, studentProfiles, documents, classes },
      dualSubProfiles,
      documentMismatches,
      orphanSubProfiles,
      duplicateUserOrgProfiles,
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
