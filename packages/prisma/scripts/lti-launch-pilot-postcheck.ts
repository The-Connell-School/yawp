/* eslint-disable no-console */
import { createPrismaClient } from './local-dev/connection';

const REQUIRED_TABLES = [
  'LtiRegistration',
  'LtiLaunchTransaction',
  'LtiPendingLink',
  'LtiExternalIdentity',
  'LtiCourseMapping',
  'LtiAuditEvent',
] as const;

const REQUIRED_TRIGGERS = [
  'LtiRegistration_tenant_reassignment_check',
  'LtiCourseMapping_tenant_check',
  'LtiPendingLink_registration_check',
  'OrgMembership_lti_tenant_check',
  'LtiAuditEvent_tenant_check',
  'LtiAuditEvent_append_only_update',
  'LtiAuditEvent_append_only_delete',
] as const;

export type LtiPostcheckInput = {
  missingTables: string[];
  missingTriggers: string[];
  defaultGateIncorrect: boolean;
  registrationTenantMismatches: string[];
  courseTenantMismatches: string[];
  identityTenantMismatches: string[];
  invalidDigestRows: string[];
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
    ...input.invalidDigestRows.map((id) => ({
      kind: 'invalid_digest_length',
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
      invalidDigestRows,
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
      invalidDigestRows: invalidDigestRows.map(({ id }) => id),
      outstandingDisabledArtifacts: outstandingDisabledArtifacts.map(
        ({ id }) => id
      ),
      counts: {
        registrations: counts[0],
        mappings: counts[1],
        identities: counts[2],
        auditEvents: counts[3],
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
