/* eslint-disable no-console */
import { createPrismaClient } from './local-dev/connection';

const REQUIRED_TABLES = [
  'LtiRegistration',
  'LtiLaunchTransaction',
  'LtiPendingLink',
  'LtiExternalIdentity',
  'LtiCourseMapping',
  'LtiAuditEvent',
  'LtiDeepLinkRequest',
  'LtiPlacement',
  'LtiRosterEnrollment',
  'LtiWorkflowRun',
  'LtiGradePassback',
] as const;

const REQUIRED_TRIGGERS = [
  'LtiRegistration_tenant_reassignment_check',
  'LtiCourseMapping_tenant_check',
  'LtiPendingLink_registration_check',
  'OrgMembership_lti_tenant_check',
  'LtiAuditEvent_tenant_check',
  'LtiAuditEvent_append_only_update',
  'LtiAuditEvent_append_only_delete',
  'LtiDeepLinkRequest_tenant_guard',
  'LtiPlacement_tenant_guard',
  'LtiRosterEnrollment_tenant_guard',
  'LtiWorkflowRun_tenant_guard',
  'LtiGradePassback_tenant_guard',
] as const;

export type LtiPostcheckInput = {
  missingTables: string[];
  missingTriggers: string[];
  defaultGateIncorrect: boolean;
  registrationTenantMismatches: string[];
  courseTenantMismatches: string[];
  identityTenantMismatches: string[];
  advantageTenantMismatches: string[];
  invalidDigestRows: string[];
  invalidWorkflowRows: string[];
  outstandingDisabledArtifacts: string[];
  counts: Record<string, number>;
};

export function buildLtiPostcheckReport(input: LtiPostcheckInput) {
  const blockers = [
    ...input.missingTables.map((id) => ({ kind: 'missing_table', id })),
    ...input.missingTriggers.map((id) => ({ kind: 'missing_trigger', id })),
    ...(input.defaultGateIncorrect
      ? [{ kind: 'organization_gate_default_not_false', id: 'ltiEnabled' }]
      : []),
    ...input.registrationTenantMismatches.map((id) => ({
      kind: 'registration_tenant_mismatch',
      id,
    })),
    ...input.courseTenantMismatches.map((id) => ({
      kind: 'course_tenant_mismatch',
      id,
    })),
    ...input.identityTenantMismatches.map((id) => ({
      kind: 'identity_tenant_mismatch',
      id,
    })),
    ...input.advantageTenantMismatches.map((id) => ({
      kind: 'advantage_tenant_mismatch',
      id,
    })),
    ...input.invalidDigestRows.map((id) => ({
      kind: 'invalid_digest_length',
      id,
    })),
    ...input.invalidWorkflowRows.map((id) => ({
      kind: 'invalid_workflow_state',
      id,
    })),
    ...input.outstandingDisabledArtifacts.map((id) => ({
      kind: 'outstanding_disabled_artifact',
      id,
    })),
  ];

  return { ok: blockers.length === 0, counts: input.counts, blockers };
}

async function main() {
  const prisma = createPrismaClient();
  try {
    const [tables, triggers, gateDefaults] = await Promise.all([
      prisma.$queryRaw<Array<{ name: string }>>`
        SELECT table_name AS name
        FROM information_schema.tables
        WHERE table_schema = current_schema()
      `,
      prisma.$queryRaw<Array<{ name: string }>>`
        SELECT tgname AS name
        FROM pg_trigger
        WHERE NOT tgisinternal
      `,
      prisma.$queryRaw<Array<{ columnDefault: string | null }>>`
        SELECT column_default AS "columnDefault"
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'Organization'
          AND column_name = 'ltiEnabled'
      `,
    ]);

    const tableNames = new Set(tables.map(({ name }) => name));
    const triggerNames = new Set(triggers.map(({ name }) => name));
    const defaultGateIncorrect =
      gateDefaults.length !== 1 || gateDefaults[0]?.columnDefault !== 'false';

    const [
      registrationTenantMismatches,
      courseTenantMismatches,
      identityTenantMismatches,
      advantageTenantMismatches,
      invalidDigestRows,
      invalidWorkflowRows,
      outstandingDisabledArtifacts,
      counts,
    ] = await Promise.all([
      prisma.$queryRaw<Array<{ id: string }>>`
        SELECT registration.id
        FROM "LtiRegistration" registration
        LEFT JOIN "Organization" organization
          ON organization.id = registration."organizationId"
        WHERE organization.id IS NULL
      `,
      prisma.$queryRaw<Array<{ id: string }>>`
        SELECT mapping.id
        FROM "LtiCourseMapping" mapping
        JOIN "Class" class_row ON class_row.id = mapping."classId"
        JOIN "School" school ON school.id = class_row."schoolId"
        WHERE mapping."organizationId" <> school."organizationId"
      `,
      prisma.$queryRaw<Array<{ id: string }>>`
        SELECT identity.id
        FROM "LtiExternalIdentity" identity
        JOIN "OrgMembership" membership
          ON membership.id = identity."membershipId"
        WHERE identity."organizationId" <> membership."organizationId"
      `,
      prisma.$queryRaw<Array<{ id: string }>>`
        SELECT 'placement:' || placement.id AS id
        FROM "LtiPlacement" placement
        JOIN "LtiCourseMapping" mapping ON mapping.id = placement."courseMappingId"
        JOIN "ClassAssignment" class_assignment ON class_assignment.id = placement."classAssignmentId"
        WHERE placement."registrationId" <> mapping."registrationId"
          OR placement."organizationId" <> mapping."organizationId"
          OR class_assignment."classId" <> mapping."classId"
        UNION ALL
        SELECT 'roster:' || roster.id AS id
        FROM "LtiRosterEnrollment" roster
        JOIN "LtiCourseMapping" mapping ON mapping.id = roster."courseMappingId"
        LEFT JOIN "LtiExternalIdentity" identity ON identity.id = roster."externalIdentityId"
        WHERE roster."registrationId" <> mapping."registrationId"
          OR roster."organizationId" <> mapping."organizationId"
          OR (identity.id IS NOT NULL AND identity."registrationId" <> roster."registrationId")
        UNION ALL
        SELECT 'grade:' || grade.id AS id
        FROM "LtiGradePassback" grade
        JOIN "LtiPlacement" placement ON placement.id = grade."placementId"
        JOIN "Submission" submission ON submission.id = grade."submissionId"
        JOIN "Document" document ON document.id = submission."documentId"
        JOIN "LtiExternalIdentity" identity ON identity.id = grade."externalIdentityId"
        WHERE grade."registrationId" <> placement."registrationId"
          OR grade."organizationId" <> placement."organizationId"
          OR grade."courseMappingId" <> placement."courseMappingId"
          OR document."classAssignmentId" <> placement."classAssignmentId"
          OR document."membershipId" <> identity."membershipId"
          OR submission."releasedAt" IS NULL
      `,
      prisma.$queryRaw<Array<{ id: string }>>`
        SELECT 'transaction:' || id AS id
        FROM "LtiLaunchTransaction"
        WHERE LENGTH("stateHash") <> 64
          OR LENGTH("nonceHash") <> 64
          OR LENGTH("loginHintHash") <> 64
          OR LENGTH("browserBindingHash") <> 64
          OR LENGTH("requesterHash") <> 64
          OR "verificationAttempts" NOT BETWEEN 0 AND 8
          OR ("messageHintHash" IS NOT NULL AND LENGTH("messageHintHash") <> 64)
        UNION ALL
        SELECT 'pending:' || id AS id
        FROM "LtiPendingLink"
        WHERE LENGTH("secretHash") <> 64
          OR LENGTH("subjectHash") <> 64
          OR LENGTH("subjectHashKeyId") NOT BETWEEN 1 AND 40
        UNION ALL
        SELECT 'identity:' || id AS id
        FROM "LtiExternalIdentity"
        WHERE LENGTH("subjectHash") <> 64
          OR LENGTH("subjectHashKeyId") NOT BETWEEN 1 AND 40
      `,
      prisma.$queryRaw<Array<{ id: string }>>`
        SELECT 'deep-link:' || id AS id
        FROM "LtiDeepLinkRequest"
        WHERE LENGTH("browserSecretHash") <> 64 OR "expiresAt" <= "createdAt"
        UNION ALL
        SELECT 'placement:' || id AS id
        FROM "LtiPlacement"
        WHERE "scoreMaximum" <= 0 OR "scoreMaximum" > 10000
        UNION ALL
        SELECT 'roster:' || id AS id
        FROM "LtiRosterEnrollment"
        WHERE LENGTH("subjectHash") <> 64
          OR "lmsStatus" NOT IN ('Active', 'Inactive', 'Deleted')
          OR "reconciliationState" NOT IN ('linked', 'unmatched', 'conflict', 'dropped')
        UNION ALL
        SELECT 'run:' || id AS id
        FROM "LtiWorkflowRun"
        WHERE "status" NOT IN ('running', 'succeeded', 'retry', 'dead_letter')
          OR "attemptCount" NOT BETWEEN 0 AND 10
        UNION ALL
        SELECT 'grade:' || id AS id
        FROM "LtiGradePassback"
        WHERE "status" NOT IN ('pending', 'delivering', 'retry', 'delivered', 'dead_letter')
          OR "attemptCount" NOT BETWEEN 0 AND 10
          OR "scoreGiven" < 0 OR "scoreGiven" > "scoreMaximum"
      `,
      prisma.$queryRaw<Array<{ id: string }>>`
        SELECT 'transaction:' || tx.id AS id
        FROM "LtiLaunchTransaction" tx
        JOIN "LtiRegistration" registration
          ON registration.id = tx."registrationId"
        JOIN "Organization" organization
          ON organization.id = tx."organizationId"
        WHERE tx."consumedAt" IS NULL
          AND (
            NOT registration.enabled
            OR registration."uninstalledAt" IS NOT NULL
            OR NOT organization."ltiEnabled"
          )
        UNION ALL
        SELECT 'pending:' || pending.id AS id
        FROM "LtiPendingLink" pending
        JOIN "LtiRegistration" registration
          ON registration.id = pending."registrationId"
        JOIN "Organization" organization
          ON organization.id = pending."organizationId"
        WHERE pending."consumedAt" IS NULL
          AND (
            NOT registration.enabled
            OR registration."uninstalledAt" IS NOT NULL
            OR NOT organization."ltiEnabled"
          )
        UNION ALL
        SELECT 'session:' || session.id AS id
        FROM "Session" session
        JOIN "LtiRegistration" registration
          ON registration.id = session."ltiRegistrationId"
         AND registration."organizationId" = session."ltiOrganizationId"
        JOIN "Organization" organization
          ON organization.id = session."ltiOrganizationId"
        WHERE NOT registration.enabled
          OR registration."uninstalledAt" IS NOT NULL
          OR NOT organization."ltiEnabled"
      `,
      Promise.all([
        prisma.ltiRegistration.count(),
        prisma.ltiCourseMapping.count(),
        prisma.ltiExternalIdentity.count(),
        prisma.ltiAuditEvent.count(),
        prisma.ltiPlacement.count(),
        prisma.ltiRosterEnrollment.count(),
        prisma.ltiWorkflowRun.count(),
        prisma.ltiGradePassback.count(),
      ]),
    ]);

    const report = buildLtiPostcheckReport({
      missingTables: REQUIRED_TABLES.filter((name) => !tableNames.has(name)),
      missingTriggers: REQUIRED_TRIGGERS.filter(
        (name) => !triggerNames.has(name)
      ),
      defaultGateIncorrect,
      registrationTenantMismatches: registrationTenantMismatches.map(
        ({ id }) => id
      ),
      courseTenantMismatches: courseTenantMismatches.map(({ id }) => id),
      identityTenantMismatches: identityTenantMismatches.map(({ id }) => id),
      advantageTenantMismatches: advantageTenantMismatches.map(({ id }) => id),
      invalidDigestRows: invalidDigestRows.map(({ id }) => id),
      invalidWorkflowRows: invalidWorkflowRows.map(({ id }) => id),
      outstandingDisabledArtifacts: outstandingDisabledArtifacts.map(
        ({ id }) => id
      ),
      counts: {
        registrations: counts[0],
        mappings: counts[1],
        identities: counts[2],
        auditEvents: counts[3],
        placements: counts[4],
        rosterEnrollments: counts[5],
        workflowRuns: counts[6],
        gradePassbacks: counts[7],
      },
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
