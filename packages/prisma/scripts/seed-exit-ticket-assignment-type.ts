/* eslint-disable no-console */
/**
 * Creates the Exit Ticket assignment type and gives it to one or more
 * organizations. Idempotent — safe to re-run.
 *
 *   cd packages/prisma && DATABASE_URL=... bun run scripts/seed-exit-ticket-assignment-type.ts
 *   ... scripts/seed-exit-ticket-assignment-type.ts --org=<id> --org=<id>
 *   ... scripts/seed-exit-ticket-assignment-type.ts --all-orgs
 *
 * With no flags it targets the oldest organization only, so a new assignment
 * type is never switched on for every customer at once. Previews pass
 * --all-orgs, where a throwaway per-PR database has nothing to roll out to.
 *
 * Granting at the organization is not sufficient on its own: visibility is an
 * override chain, so a school or teacher that picked its own list ignores the
 * organization defaults entirely. Those scopes are granted too, so a run that
 * reports success means the teacher can actually see the type.
 *
 * The admin assignment-type creator cannot set `kind`, and `kind` is what the
 * web app reads to show the exit ticket form instead of a prompt box. So this
 * script — not the admin UI — is how an Exit Ticket type comes into being.
 */
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { isLocalDatabaseUrl } from './seed-overlay-connection';
import {
  EXIT_TICKET_ASSIGNMENT_TYPE_DATA,
  EXIT_TICKET_ASSIGNMENT_TYPE_KIND,
  EXIT_TICKET_INSTRUCTION_DATA,
  EXIT_TICKET_MODULE_DATA,
  parseExitTicketAllOrgsArg,
  parseExitTicketOrganizationArgs,
  resolveExitTicketOrganizationIds,
  resolveExitTicketScopeGrants,
} from './exit-ticket-assignment-type-data';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

function getSchemaFromDatabaseUrl(url: string): string | undefined {
  const match = url.match(/[?&]schema=([^&]+)/i);
  if (!match) return undefined;
  return decodeURIComponent(match[1]);
}

const schema =
  process.env.DATABASE_SCHEMA?.trim() ||
  getSchemaFromDatabaseUrl(connectionString);

const isLocal = isLocalDatabaseUrl(connectionString);
const isSimpleLocal =
  !schema &&
  (connectionString.includes('localhost') ||
    connectionString.includes('127.0.0.1'));

const adapter = isSimpleLocal
  ? new PrismaPg({ connectionString, ssl: false })
  : new PrismaPg(
      {
        connectionString,
        ssl: isLocal ? false : { rejectUnauthorized: false },
      },
      schema ? { schema } : undefined
    );

const prisma = new PrismaClient({ adapter });

async function seedExitTicketAssignmentType() {
  const organizations = await prisma.organization.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  });

  const argv = process.argv.slice(2);
  const { organizationIds, unknownOrganizationIds } =
    resolveExitTicketOrganizationIds({
      requestedOrganizationIds: parseExitTicketOrganizationArgs(argv),
      existingOrganizationIds: organizations.map((org) => org.id),
      allOrganizations: parseExitTicketAllOrgsArg(argv),
    });

  if (unknownOrganizationIds.length > 0) {
    throw new Error(
      `Unknown organization ids: ${unknownOrganizationIds.join(', ')}`
    );
  }
  if (organizationIds.length === 0) {
    throw new Error(
      'Cannot seed the Exit Ticket assignment type without an organization.'
    );
  }

  const ownerOrgId = organizationIds[0];

  const assignmentType = await prisma.assignmentType.upsert({
    where: { kind: EXIT_TICKET_ASSIGNMENT_TYPE_KIND },
    // Re-running restores an archived type and refreshes its copy. It does not
    // touch ownership or the rubric, so anything an admin configured survives.
    update: {
      ...EXIT_TICKET_ASSIGNMENT_TYPE_DATA,
      archivedAt: null,
    },
    create: {
      ...EXIT_TICKET_ASSIGNMENT_TYPE_DATA,
      kind: EXIT_TICKET_ASSIGNMENT_TYPE_KIND,
      ownerOrgId,
      assignmentModules: {
        create: {
          ...EXIT_TICKET_MODULE_DATA,
          instructions: { create: EXIT_TICKET_INSTRUCTION_DATA },
        },
      },
    },
    select: { id: true },
  });

  for (const organizationId of organizationIds) {
    await prisma.organizationAssignmentType.upsert({
      where: {
        organizationId_assignmentTypeId: {
          organizationId,
          assignmentTypeId: assignmentType.id,
        },
      },
      create: { organizationId, assignmentTypeId: assignmentType.id },
      update: {},
    });
  }

  // Organization grants are invisible to a school or teacher that picked its
  // own list, so those scopes are granted directly. Without this the script
  // reports success while the type never appears in the assignment dropdown.
  const [schools, teachers] = await Promise.all([
    prisma.school.findMany({
      where: { organizationId: { in: organizationIds } },
      select: {
        id: true,
        organizationId: true,
        assignmentTypesCustomized: true,
      },
    }),
    prisma.orgMembership.findMany({
      where: { organizationId: { in: organizationIds }, role: 'TEACHER' },
      select: {
        id: true,
        organizationId: true,
        assignmentTypesCustomized: true,
      },
    }),
  ]);

  const { schoolIds, membershipIds } = resolveExitTicketScopeGrants({
    organizationIds,
    schools: schools.map((school) => ({
      id: school.id,
      organizationId: school.organizationId,
      customized: school.assignmentTypesCustomized,
    })),
    teachers: teachers.map((teacher) => ({
      id: teacher.id,
      organizationId: teacher.organizationId,
      customized: teacher.assignmentTypesCustomized,
    })),
  });

  for (const schoolId of schoolIds) {
    await prisma.schoolAssignmentType.upsert({
      where: {
        schoolId_assignmentTypeId: {
          schoolId,
          assignmentTypeId: assignmentType.id,
        },
      },
      create: { schoolId, assignmentTypeId: assignmentType.id },
      update: {},
    });
  }

  for (const membershipId of membershipIds) {
    await prisma.teacherAssignmentType.upsert({
      where: {
        membershipId_assignmentTypeId: {
          membershipId,
          assignmentTypeId: assignmentType.id,
        },
      },
      create: { membershipId, assignmentTypeId: assignmentType.id },
      update: {},
    });
  }

  const named = organizations
    .filter((org) => organizationIds.includes(org.id))
    .map((org) => `${org.name} (${org.id})`);

  console.log(
    `Exit Ticket assignment type ${assignmentType.id} available to: ${named.join(', ')}`
  );
  console.log(
    `Also granted directly to ${schoolIds.length} customized school(s) and ${membershipIds.length} customized teacher(s).`
  );
}

seedExitTicketAssignmentType()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
