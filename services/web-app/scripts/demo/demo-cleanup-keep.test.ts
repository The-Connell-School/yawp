import { describe, expect, test } from 'bun:test';
import {
  classifyOrganization,
  classifyUser,
  isSubstantiveAuthoredText,
  type DemoCleanupUserSnapshot,
} from './demo-cleanup-keep';
import { buildDemoCleanupPlan } from './demo-cleanup-lib';

function user(
  overrides: Partial<DemoCleanupUserSnapshot> = {}
): DemoCleanupUserSnapshot {
  return {
    id: 'user-1',
    email: 'sim-deadbeef-1@example.test',
    name: 'Alex Rivera',
    simulatedForClassId: 'class-1',
    isAdmin: false,
    isSuperAdmin: false,
    memberships: [
      {
        id: 'm-1',
        organizationId: 'org-1',
        role: 'STUDENT',
        isOrgOwner: false,
        isActive: true,
      },
    ],
    documentStats: {
      totalDocuments: 1,
      substantiveDocuments: 0,
      oneLineSubmittedDocuments: 1,
      submittedDocuments: 1,
    },
    ...overrides,
  };
}

describe('demo cleanup keep rules', () => {
  test('deletes dev-panel simulated students', () => {
    expect(classifyUser(user()).action).toBe('DELETE');
  });

  test('keeps Riley, Sam, and Taylor demo students', () => {
    for (const name of ['Riley Student', 'Sam Student', 'Taylor Student']) {
      expect(
        classifyUser(
          user({
            email: `${name.replace(/\s+/g, '.').toLowerCase()}@yawp.local`,
            name,
            simulatedForClassId: null,
            documentStats: {
              totalDocuments: 4,
              substantiveDocuments: 3,
              oneLineSubmittedDocuments: 0,
              submittedDocuments: 2,
            },
          })
        ).action
      ).toBe('KEEP');
    }
  });

  test('keeps substantive ambiguous students', () => {
    const text =
      'Paragraph one about Gatsby and the green light on the dock, which frames the whole novel.\n\nParagraph two with evidence from chapter three and a clear link back to the thesis about honesty.';
    expect(isSubstantiveAuthoredText(text)).toBe(true);
    expect(
      classifyUser(
        user({
          email: 'casey.student@yawp.local',
          name: 'Casey Student',
          simulatedForClassId: null,
          documentStats: {
            totalDocuments: 1,
            substantiveDocuments: 1,
            oneLineSubmittedDocuments: 0,
            submittedDocuments: 0,
          },
        })
      ).action
    ).toBe('KEEP');
  });

  test('deletes throwaway orgs with only delete users', () => {
    const plan = buildDemoCleanupPlan({
      users: [user({ id: 'u1' })],
      organizations: [
        {
          id: 'org-junk',
          name: 'Throwaway Org',
          plan: 'FREE_CLASSROOM',
          previewSeatCode: null,
          memberUserIds: ['u1'],
        },
      ],
    });
    expect(plan.organizations[0]?.decision.action).toBe('DELETE');
    expect(
      classifyOrganization(
        {
          id: 'local-dev-org',
          name: 'Yawp Local Dev',
          plan: 'SCHOOL',
          previewSeatCode: null,
          memberUserIds: ['u1'],
        },
        new Map([['u1', { action: 'DELETE', reason: 'sim' }]])
      ).action
    ).toBe('KEEP');
  });
});
