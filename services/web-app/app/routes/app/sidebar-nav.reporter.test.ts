import { describe, expect, test } from 'bun:test';
import {
  FLAT_SIDEBAR_SECTIONS,
  getVisibleSidebarSections,
} from './sidebar-nav';

function userWith({
  role,
  reporterEnabled,
  isAdmin = false,
}: {
  role: 'TEACHER' | 'STUDENT';
  reporterEnabled: boolean;
  isAdmin?: boolean;
}) {
  return {
    isAdmin,
    selectedMembership: {
      role,
      isOrgOwner: false,
      organization: { name: 'Org', reporterEnabled },
    },
  } as any;
}

function reporterVisible(user: any) {
  return getVisibleSidebarSections(
    FLAT_SIDEBAR_SECTIONS,
    user
  )
    .flatMap((section) => section.links)
    .some((link) => link.to === '/app/reporter');
}

function allDestinations(user: any) {
  return getVisibleSidebarSections(FLAT_SIDEBAR_SECTIONS, user).flatMap(
    (section) => section.links.map((link) => link.to)
  );
}

describe('Reporter sidebar gating', () => {
  test('visible for a teacher (always on)', () => {
    expect(
      reporterVisible(userWith({ role: 'TEACHER', reporterEnabled: true }))
    ).toBe(true);
  });

  test('still visible for a teacher when the org flag is off', () => {
    expect(
      reporterVisible(userWith({ role: 'TEACHER', reporterEnabled: false }))
    ).toBe(true);
  });

  test('hidden for a student even if the org flag is on', () => {
    expect(
      reporterVisible(userWith({ role: 'STUDENT', reporterEnabled: true }))
    ).toBe(false);
  });
});

describe('My Assignments navigation', () => {
  test('links teachers to the cross-class assignments page', () => {
    expect(
      allDestinations(userWith({ role: 'TEACHER', reporterEnabled: true }))
    ).toContain('/app/assignments');
  });

  test('hidden for a student', () => {
    expect(
      allDestinations(userWith({ role: 'STUDENT', reporterEnabled: true }))
    ).not.toContain('/app/assignments');
  });

  test('labeled "My Assignments"', () => {
    const link = FLAT_SIDEBAR_SECTIONS.flatMap((section) => section.links).find(
      (l) => l.to === '/app/assignments'
    );
    expect(link?.label).toBe('My Assignments');
  });
});
