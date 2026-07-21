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

function reporterVisible(user: any, studentPreviewActive = false) {
  return getVisibleSidebarSections(
    FLAT_SIDEBAR_SECTIONS,
    user,
    studentPreviewActive
  )
    .flatMap((section) => section.links)
    .some((link) => link.to === '/app/reporter');
}

describe('Reporter sidebar gating', () => {
  test('visible for a teacher in a reporter-enabled org', () => {
    expect(
      reporterVisible(userWith({ role: 'TEACHER', reporterEnabled: true }))
    ).toBe(true);
  });

  test('hidden for a teacher when the org flag is off', () => {
    expect(
      reporterVisible(userWith({ role: 'TEACHER', reporterEnabled: false }))
    ).toBe(false);
  });

  test('hidden for a student even if the org flag is on', () => {
    expect(
      reporterVisible(userWith({ role: 'STUDENT', reporterEnabled: true }))
    ).toBe(false);
  });

  test('hidden while previewing as a student', () => {
    expect(
      reporterVisible(
        userWith({ role: 'TEACHER', reporterEnabled: true }),
        true
      )
    ).toBe(false);
  });
});
