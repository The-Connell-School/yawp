import { describe, expect, test } from 'bun:test';
import assignmentModuleInstructions from '../fixtures/prod-fidelity/assignment-module-instructions.json';
import assignmentModules from '../fixtures/prod-fidelity/assignment-modules.json';
import assignmentTypeImages from '../fixtures/prod-fidelity/assignment-type-images.json';
import assignmentTypes from '../fixtures/prod-fidelity/assignment-types.json';
import manifest from '../fixtures/prod-fidelity/manifest.json';
import {
  EXIT_TICKET_ASSIGNMENT_TYPE_ID,
  EXIT_TICKET_ASSIGNMENT_TYPE_KIND,
} from './exit-ticket-assignment-type-data';

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

  test('uses the id the seed script creates, so both paths converge', () => {
    // The seed script creates the type with this id and attaches the course
    // image by it. If they drift, a script-seeded database gets no artwork.
    expect(exitTicketType!.id).toBe(EXIT_TICKET_ASSIGNMENT_TYPE_ID);
  });

  test('carries course artwork that decodes to a real PNG', () => {
    const image = (
      assignmentTypeImages as Array<Record<string, any>>
    ).find((row) => row.assignmentTypeId === EXIT_TICKET_ASSIGNMENT_TYPE_ID);

    expect(image).toBeDefined();
    expect(image!.contentType).toBe('image/png');
    expect(String(image!.altText).trim()).not.toBe('');

    const bytes = Buffer.from(image!.blob.base64, 'base64');
    expect(bytes.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
    // Square, matching the rest of the course art rather than an odd crop.
    expect(bytes.readUInt32BE(16)).toBe(1080);
    expect(bytes.readUInt32BE(20)).toBe(1080);
  });

  test('the manifest counts the rows the bundle actually holds', () => {
    expect(manifest.counts.assignmentTypes).toBe(assignmentTypes.length);
    expect(manifest.counts.assignmentModules).toBe(assignmentModules.length);
    expect(manifest.counts.assignmentModuleInstructions).toBe(
      assignmentModuleInstructions.length
    );
    expect(manifest.counts.assignmentTypeImages).toBe(
      assignmentTypeImages.length
    );
  });
});
