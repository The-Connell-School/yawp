/**
 * The Exit Ticket assignment type, and how a run of the seed script decides
 * which organizations get it.
 *
 * Split from the script so the decisions can be tested without a database.
 * The web app keys every exit ticket behaviour off `AssignmentType.kind`, so
 * that value is the contract this file exists to get right — the title is
 * cosmetic and an organization is free to rename it.
 */

/** Must match EXIT_TICKET_ASSIGNMENT_TYPE_KIND in the web app. */
export const EXIT_TICKET_ASSIGNMENT_TYPE_KIND = 'exit_ticket';

/**
 * The row id the fixtures use. The seed script creates the type with the same
 * id, so a database seeded either way converges on one row — and the course
 * image, which the fixtures carry keyed by this id, attaches on both paths.
 */
export const EXIT_TICKET_ASSIGNMENT_TYPE_ID = 'cexitticket000000000000000';

export const EXIT_TICKET_ASSIGNMENT_TYPE_DATA = {
  title: 'Exit Ticket',
  description:
    'A short piece of writing at the end of a lesson that shows whether it landed.',
  position: 51,
} as const;

export const EXIT_TICKET_MODULE_DATA = {
  title: 'Exit Ticket',
  position: 1,
  description: 'Answer the exit ticket in your own words.',
} as const;

export const EXIT_TICKET_INSTRUCTION_DATA = {
  title: 'Write',
  prompt: 'Answer the prompt in your own words, and explain your thinking.',
  position: 1,
  showChatButton: false,
} as const;

/**
 * Which organizations this run gives the type to.
 *
 * Named organizations win, then `--all-orgs`. With neither it falls back to the
 * oldest organization only — a deliberate one-org rollout rather than switching
 * a new assignment type on for every customer at once. Previews pass
 * `--all-orgs`, where a throwaway per-PR database has nothing to roll out to.
 */
export function resolveExitTicketOrganizationIds({
  requestedOrganizationIds,
  existingOrganizationIds,
  allOrganizations = false,
}: {
  requestedOrganizationIds: string[];
  existingOrganizationIds: string[];
  allOrganizations?: boolean;
}): { organizationIds: string[]; unknownOrganizationIds: string[] } {
  const existing = new Set(existingOrganizationIds);

  if (requestedOrganizationIds.length === 0) {
    return {
      organizationIds: allOrganizations
        ? existingOrganizationIds
        : existingOrganizationIds.slice(0, 1),
      unknownOrganizationIds: [],
    };
  }

  const requested = Array.from(new Set(requestedOrganizationIds));
  return {
    organizationIds: requested.filter((id) => existing.has(id)),
    unknownOrganizationIds: requested.filter((id) => !existing.has(id)),
  };
}

/** `--org=a --org=b`, or `--org=a,b`. */
export function parseExitTicketOrganizationArgs(argv: string[]): string[] {
  return argv
    .filter((arg) => arg.startsWith('--org='))
    .flatMap((arg) => arg.slice('--org='.length).split(','))
    .map((id) => id.trim())
    .filter(Boolean);
}

export function parseExitTicketAllOrgsArg(argv: string[]): boolean {
  return argv.includes('--all-orgs');
}

