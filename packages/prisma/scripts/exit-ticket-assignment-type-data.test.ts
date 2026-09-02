import { describe, expect, test } from 'bun:test';
import {
  EXIT_TICKET_ASSIGNMENT_TYPE_KIND,
  parseExitTicketOrganizationArgs,
  resolveExitTicketOrganizationIds,
} from './exit-ticket-assignment-type-data';

describe('the exit ticket assignment type seed', () => {
  test('carries the kind the web app keys every behaviour off', () => {
    // If this drifts, the type still gets created and still works — it just
    // silently stops being an exit ticket and shows a blank prompt box.
    expect(EXIT_TICKET_ASSIGNMENT_TYPE_KIND).toBe('exit_ticket');
  });
});

describe('resolveExitTicketOrganizationIds', () => {
  test('defaults to the oldest organization only', () => {
    // A new assignment type is not switched on for every customer at once.
    expect(
      resolveExitTicketOrganizationIds({
        requestedOrganizationIds: [],
        existingOrganizationIds: ['org-1', 'org-2', 'org-3'],
      })
    ).toEqual({ organizationIds: ['org-1'], unknownOrganizationIds: [] });
  });

  test('gives it to exactly the organizations that were named', () => {
    expect(
      resolveExitTicketOrganizationIds({
        requestedOrganizationIds: ['org-3', 'org-2', 'org-3'],
        existingOrganizationIds: ['org-1', 'org-2', 'org-3'],
      })
    ).toEqual({
      organizationIds: ['org-3', 'org-2'],
      unknownOrganizationIds: [],
    });
  });

  test('reports a named organization that does not exist rather than skipping it', () => {
    expect(
      resolveExitTicketOrganizationIds({
        requestedOrganizationIds: ['org-1', 'typo-org'],
        existingOrganizationIds: ['org-1'],
      })
    ).toEqual({
      organizationIds: ['org-1'],
      unknownOrganizationIds: ['typo-org'],
    });
  });

  test('asks for nothing when there is nothing to give it to', () => {
    expect(
      resolveExitTicketOrganizationIds({
        requestedOrganizationIds: [],
        existingOrganizationIds: [],
      })
    ).toEqual({ organizationIds: [], unknownOrganizationIds: [] });
  });
});

describe('parseExitTicketOrganizationArgs', () => {
  test('reads repeated and comma-separated flags the same way', () => {
    expect(
      parseExitTicketOrganizationArgs(['--org=a', '--org=b,c', '--other=d'])
    ).toEqual(['a', 'b', 'c']);
    expect(parseExitTicketOrganizationArgs([])).toEqual([]);
    expect(parseExitTicketOrganizationArgs(['--org= a , b '])).toEqual([
      'a',
      'b',
    ]);
  });
});
