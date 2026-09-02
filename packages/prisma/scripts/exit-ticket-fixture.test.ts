import { describe, expect, test } from 'bun:test';
import assignmentModuleInstructions from '../fixtures/prod-fidelity/assignment-module-instructions.json';
import assignmentModules from '../fixtures/prod-fidelity/assignment-modules.json';
import assignmentTypes from '../fixtures/prod-fidelity/assignment-types.json';
import manifest from '../fixtures/prod-fidelity/manifest.json';
import { EXIT_TICKET_ASSIGNMENT_TYPE_KIND } from './exit-ticket-assignment-type-data';

// The prod-fidelity fixtures are what a seeded database — local worktree or PR
// preview — actually gets. The seed script covers production, where the type is
// rolled out deliberately; these rows are what makes it visible anywhere else.
// A fixture re-export that drops them is the exact bug that made the type
// invisible in preview, so it fails here rather than silently.

const exitTicketType = (assignmentTypes as Array<Record<string, unknown>>).find(
  (row) => row.kind === EXIT_TICKET_ASSIGNMENT_TYPE_KIND
);

describe('the Exit Ticket prod-fidelity fixture', () => {
  test('exists and is keyed by kind', () => {
    expect(exitTicketType).toBeDefined();
    expect(exitTicketType!.title).toBe('Exit Ticket');
    expect(exitTicketType!.archivedAt).toBeNull();
  });

  test('is global, so every organization in a seeded database gets it', () => {
    // The importer creates an OrganizationAssignmentType row for every
    // organization only for types that belong to none.
    expect(exitTicketType!.ownerOrgId).toBeNull();
    expect(exitTicketType!.ownerMembershipId).toBeNull();
  });

  test('saves no rubric of its own, so grading is unchanged', () => {
    // Grading falls back to the default for a kind that registered none —
    // exactly today's behaviour — until a rubric is deliberately chosen.
    expect(exitTicketType!.rubricId).toBeNull();
    expect(exitTicketType!.rubricJson).toBeNull();
    expect(exitTicketType!.scoringScaleJson).toBeNull();
  });

  test('carries a module and instruction, which a document needs to open', () => {
    const modules = (assignmentModules as Array<Record<string, unknown>>).filter(
      (row) => row.assignmentTypeId === exitTicketType!.id
    );
    expect(modules).toHaveLength(1);

    const instructions = (
      assignmentModuleInstructions as Array<Record<string, unknown>>
    ).filter((row) => row.assignmentModuleId === modules[0].id);
    expect(instructions).toHaveLength(1);
    expect(String(instructions[0].prompt).trim()).not.toBe('');
  });

  test('the manifest counts the rows the bundle actually holds', () => {
    expect(manifest.counts.assignmentTypes).toBe(assignmentTypes.length);
    expect(manifest.counts.assignmentModules).toBe(assignmentModules.length);
    expect(manifest.counts.assignmentModuleInstructions).toBe(
      assignmentModuleInstructions.length
    );
  });
});
