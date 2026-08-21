/* eslint-disable no-console */
import { createPrismaClient } from './local-dev/connection';
import {
  PRODUCTION_QA_IDS,
  assertProductionQaFixturePreflight,
  assertProductionQaIdentitySafety,
} from './production-qa-profile';

type MigrationRow = {
  migration_name: string;
  checksum: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
};

type ColumnRow = { column_default: string | null };
type IndexRow = { indexname: string };
type FixtureGraphRow = {
  school_exact: boolean;
  class_exact: boolean;
  assignment_type_exact: boolean;
  assignment_exact: boolean;
  class_assignment_exact: boolean;
  document_exact: boolean;
  submission_exact: boolean;
  teacher_roster_exact: boolean;
  student_roster_exact: boolean;
  school_teacher_exact: boolean;
};

const EXPECTED_INDEXES = [
  'SubmissionActivity_actorMembershipId_createdAt_idx',
  'SubmissionActivity_eventType_createdAt_idx',
  'SubmissionActivity_organizationId_createdAt_idx',
  'SubmissionActivity_submissionId_createdAt_idx',
];
const EXPECTED_MIGRATIONS = [
  '20260820110000_add_submission_activity',
  '20260821010000_harden_submission_activity_tenant_guard',
];

const prisma = createPrismaClient();
try {
  const migrations = await prisma.$queryRaw<MigrationRow[]>`
    SELECT migration_name, checksum, finished_at, rolled_back_at
    FROM "_prisma_migrations"
    WHERE migration_name IN (
      '20260820110000_add_submission_activity',
      '20260821010000_harden_submission_activity_tenant_guard'
    )
  `;
  if (
    migrations.length !== EXPECTED_MIGRATIONS.length ||
    migrations.some(
      ({ migration_name, finished_at, rolled_back_at }) =>
        !EXPECTED_MIGRATIONS.includes(migration_name) ||
        !finished_at ||
        rolled_back_at
    )
  ) {
    throw new Error('Submission activity migration is not cleanly applied.');
  }
  const initialMigration = migrations.find(
    ({ migration_name }) =>
      migration_name === '20260820110000_add_submission_activity'
  )!;

  await assertProductionQaFixturePreflight(prisma);
  const [fixtureGraph] = await prisma.$queryRaw<FixtureGraphRow[]>`
    SELECT
      EXISTS (
        SELECT 1 FROM "School"
        WHERE id = ${PRODUCTION_QA_IDS.schoolId}
          AND code = ${PRODUCTION_QA_IDS.schoolCode}
          AND "organizationId" = ${PRODUCTION_QA_IDS.organizationId}
      ) AS school_exact,
      EXISTS (
        SELECT 1 FROM "Class"
        WHERE id = ${PRODUCTION_QA_IDS.classId}
          AND code = ${PRODUCTION_QA_IDS.classCode}
          AND "schoolId" = ${PRODUCTION_QA_IDS.schoolId}
      ) AS class_exact,
      EXISTS (
        SELECT 1 FROM "AssignmentType"
        WHERE id = ${PRODUCTION_QA_IDS.assignmentTypeId}
          AND "ownerOrgId" = ${PRODUCTION_QA_IDS.organizationId}
      ) AS assignment_type_exact,
      EXISTS (
        SELECT 1 FROM "Assignment"
        WHERE id = ${PRODUCTION_QA_IDS.assignmentId}
          AND "assignmentTypeId" = ${PRODUCTION_QA_IDS.assignmentTypeId}
      ) AS assignment_exact,
      EXISTS (
        SELECT 1 FROM "ClassAssignment"
        WHERE id = ${PRODUCTION_QA_IDS.classAssignmentId}
          AND "assignmentId" = ${PRODUCTION_QA_IDS.assignmentId}
          AND "classId" = ${PRODUCTION_QA_IDS.classId}
      ) AS class_assignment_exact,
      EXISTS (
        SELECT 1 FROM "Document"
        WHERE id = ${PRODUCTION_QA_IDS.documentId}
          AND "membershipId" = ${PRODUCTION_QA_IDS.studentMembershipId}
          AND "assignmentTypeId" = ${PRODUCTION_QA_IDS.assignmentTypeId}
          AND "assignmentId" = ${PRODUCTION_QA_IDS.assignmentId}
          AND "classAssignmentId" = ${PRODUCTION_QA_IDS.classAssignmentId}
      ) AS document_exact,
      EXISTS (
        SELECT 1 FROM "Submission"
        WHERE id = ${PRODUCTION_QA_IDS.submissionId}
          AND "documentId" = ${PRODUCTION_QA_IDS.documentId}
      ) AS submission_exact,
      EXISTS (
        SELECT 1 FROM "_ClassTeachers"
        WHERE "A" = ${PRODUCTION_QA_IDS.classId}
          AND "B" = ${PRODUCTION_QA_IDS.teacherMembershipId}
      ) AS teacher_roster_exact,
      EXISTS (
        SELECT 1 FROM "_ClassStudents"
        WHERE "A" = ${PRODUCTION_QA_IDS.classId}
          AND "B" = ${PRODUCTION_QA_IDS.studentMembershipId}
      ) AS student_roster_exact,
      EXISTS (
        SELECT 1 FROM "_SchoolTeachers"
        WHERE "A" = ${PRODUCTION_QA_IDS.teacherMembershipId}
          AND "B" = ${PRODUCTION_QA_IDS.schoolId}
      ) AS school_teacher_exact
  `;
  if (!fixtureGraph || Object.values(fixtureGraph).some((value) => !value)) {
    throw new Error('Production QA fixture graph is incomplete.');
  }

  const columns = await prisma.$queryRaw<ColumnRow[]>`
    SELECT column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Organization'
      AND column_name = 'submissionActivityEnabled'
  `;
  if (columns.length !== 1 || !columns[0].column_default?.includes('false')) {
    throw new Error(
      'Submission activity rollout column does not default false.'
    );
  }

  const indexes = await prisma.$queryRaw<IndexRow[]>`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'SubmissionActivity'
    ORDER BY indexname
  `;
  const indexNames = indexes.map(({ indexname }) => indexname);
  for (const expected of EXPECTED_INDEXES) {
    if (!indexNames.includes(expected)) {
      throw new Error(`Missing production index ${expected}.`);
    }
  }

  const activityBeforeMigration = await prisma.submissionActivity.count({
    where: { createdAt: { lt: initialMigration.finished_at! } },
  });
  if (activityBeforeMigration !== 0) {
    throw new Error('Historical submission activity was backfilled.');
  }

  const [
    organization,
    submission,
    fixtureActivityCount,
    fixtureUsers,
    fixtureMemberships,
  ] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: PRODUCTION_QA_IDS.organizationId },
      select: { id: true, submissionActivityEnabled: true },
    }),
    prisma.submission.findUnique({
      where: { id: PRODUCTION_QA_IDS.submissionId },
      select: {
        id: true,
        numericPercentage: true,
        releasedAt: true,
        overallComment: true,
      },
    }),
    prisma.submissionActivity.count({
      where: {
        organizationId: PRODUCTION_QA_IDS.organizationId,
        submissionId: PRODUCTION_QA_IDS.submissionId,
      },
    }),
    prisma.user.findMany({
      where: {
        id: {
          in: [
            PRODUCTION_QA_IDS.teacherUserId,
            PRODUCTION_QA_IDS.studentUserId,
          ],
        },
      },
      select: {
        id: true,
        email: true,
        memberships: {
          select: {
            id: true,
            userId: true,
            organizationId: true,
            role: true,
            isOrgOwner: true,
          },
        },
      },
    }),
    prisma.orgMembership.findMany({
      where: {
        id: {
          in: [
            PRODUCTION_QA_IDS.teacherMembershipId,
            PRODUCTION_QA_IDS.studentMembershipId,
          ],
        },
      },
      select: {
        id: true,
        userId: true,
        organizationId: true,
        role: true,
        isOrgOwner: true,
      },
    }),
  ]);

  assertProductionQaIdentitySafety({
    users: fixtureUsers,
    memberships: fixtureMemberships,
  });
  if (fixtureUsers.length !== 2 || fixtureMemberships.length !== 2) {
    throw new Error('Production QA identity graph is incomplete.');
  }

  if (!organization?.submissionActivityEnabled) {
    throw new Error('Disposable production QA organization is not enabled.');
  }
  if (
    !submission?.releasedAt ||
    submission.numericPercentage !== 91 ||
    submission.overallComment !==
      'Production QA verified released-grade feedback.'
  ) {
    throw new Error('Disposable production QA submission post-state is wrong.');
  }
  if (fixtureActivityCount !== 1) {
    throw new Error(
      `Expected one retained QA activity row, found ${fixtureActivityCount}.`
    );
  }

  console.log(
    JSON.stringify(
      {
        classification: 'pass',
        migration: {
          applied: migrations.map(
            ({ migration_name, checksum, finished_at }) => ({
              name: migration_name,
              checksum,
              finishedAt: finished_at,
            })
          ),
        },
        schema: {
          rolloutDefault: columns[0].column_default,
          requiredIndexes: EXPECTED_INDEXES,
        },
        data: {
          activityBeforeMigration,
          fixtureOrganizationId: organization.id,
          fixtureSubmissionId: submission.id,
          fixtureActivityCount,
          fixtureUserIds: fixtureUsers.map(({ id }) => id).sort(),
          fixtureMembershipIds: fixtureMemberships.map(({ id }) => id).sort(),
          fixtureGraph: 'exclusive',
          fixtureGraphChecks: fixtureGraph,
          acceptedResidue:
            'One exact-ID QA ledger row is retained until the next run resets the disposable fixture with its session-scoped cleanup capability.',
        },
      },
      null,
      2
    )
  );
} finally {
  await prisma.$disconnect();
}
