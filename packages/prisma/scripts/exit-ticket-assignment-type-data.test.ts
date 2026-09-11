import { describe, expect, test } from 'bun:test';
import {
  EXIT_TICKET_ASSIGNMENT_TYPE_KIND,
  parseExitTicketAllOrgsArg,
  parseExitTicketOrganizationArgs,
  resolveExitTicketOrganizationIds,
  resolveExitTicketScopeGrants,
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

describe('resolveExitTicketOrganizationIds with --all-orgs', () => {
  test('takes every organization', () => {
    // A preview is a throwaway per-PR database. There is nothing to roll out
    // to slowly, and a type nobody can see is the whole bug this fixes.
    expect(
      resolveExitTicketOrganizationIds({
        requestedOrganizationIds: [],
        existingOrganizationIds: ['org-1', 'org-2'],
        allOrganizations: true,
      })
    ).toEqual({
      organizationIds: ['org-1', 'org-2'],
      unknownOrganizationIds: [],
    });
  });

  test('named organizations still win over it', () => {
    expect(
      resolveExitTicketOrganizationIds({
        requestedOrganizationIds: ['org-2'],
        existingOrganizationIds: ['org-1', 'org-2'],
        allOrganizations: true,
      })
    ).toEqual({ organizationIds: ['org-2'], unknownOrganizationIds: [] });
  });
});

describe('parseExitTicketAllOrgsArg', () => {
  test('reads the flag', () => {
    expect(parseExitTicketAllOrgsArg(['--all-orgs'])).toBe(true);
    expect(parseExitTicketAllOrgsArg(['--org=a'])).toBe(false);
    expect(parseExitTicketAllOrgsArg([])).toBe(false);
  });
});

describe('resolveExitTicketScopeGrants', () => {
  test('grants to the schools and teachers that picked their own list', () => {
    // Visibility is an override chain: a customized scope ignores the
    // organization defaults entirely, so granting at the org alone leaves the
    // type invisible to exactly these schools and teachers.
    expect(
      resolveExitTicketScopeGrants({
        organizationIds: ['org-1'],
        schools: [
          { id: 'school-1', organizationId: 'org-1', customized: true },
          { id: 'school-2', organizationId: 'org-1', customized: false },
        ],
        teachers: [
          { id: 'teacher-1', organizationId: 'org-1', customized: true },
          { id: 'teacher-2', organizationId: 'org-1', customized: false },
        ],
      })
    ).toEqual({ schoolIds: ['school-1'], membershipIds: ['teacher-1'] });
  });

  test('leaves uncustomized scopes to inherit the organization default', () => {
    expect(
      resolveExitTicketScopeGrants({
        organizationIds: ['org-1'],
        schools: [
          { id: 'school-1', organizationId: 'org-1', customized: false },
        ],
        teachers: [
          { id: 'teacher-1', organizationId: 'org-1', customized: false },
        ],
      })
    ).toEqual({ schoolIds: [], membershipIds: [] });
  });

  test('never reaches into an organization this run is not targeting', () => {
    expect(
      resolveExitTicketScopeGrants({
        organizationIds: ['org-1'],
        schools: [
          { id: 'school-2', organizationId: 'org-2', customized: true },
        ],
        teachers: [
          { id: 'teacher-2', organizationId: 'org-2', customized: true },
        ],
      })
    ).toEqual({ schoolIds: [], membershipIds: [] });
  });
});
