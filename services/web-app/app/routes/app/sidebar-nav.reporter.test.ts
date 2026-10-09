import { describe, expect, test } from 'bun:test';
import {
  FLAT_SIDEBAR_SECTIONS,
  getVisibleSidebarSections,
} from './sidebar-nav';

function userWith({
  role,
  plan = 'SCHOOL',
  reporterEnabled = true,
  isAdmin = false,
}: {
  role: 'TEACHER' | 'STUDENT';
  plan?: 'SCHOOL' | 'FREE_CLASSROOM';
  reporterEnabled?: boolean;
  isAdmin?: boolean;
}) {
  return {
    isAdmin,
    selectedMembership: {
      role,
      isOrgOwner: false,
      organization: { name: 'Org', plan, reporterEnabled },
    },
  } as any;
}

function reporterVisible(user: any) {
  return getVisibleSidebarSections(FLAT_SIDEBAR_SECTIONS, user)
    .flatMap((section) => section.links)
    .some((link) => link.to === '/app/reporter');
}

function allDestinations(user: any) {
  return getVisibleSidebarSections(FLAT_SIDEBAR_SECTIONS, user).flatMap(
    (section) => section.links.map((link) => link.to)
  );
}

describe('Reporter sidebar gating', () => {
  test('visible for a SCHOOL teacher even when reporterEnabled is false', () => {
    expect(
      reporterVisible(
        userWith({ role: 'TEACHER', plan: 'SCHOOL', reporterEnabled: false })
      )
    ).toBe(true);
  });

  test('hidden for a FREE_CLASSROOM teacher', () => {
    expect(
      reporterVisible(
        userWith({ role: 'TEACHER', plan: 'FREE_CLASSROOM', reporterEnabled: true })
      )
    ).toBe(false);
  });

  test('hidden for a student even on SCHOOL plan', () => {
    expect(
      reporterVisible(userWith({ role: 'STUDENT', plan: 'SCHOOL' }))
    ).toBe(false);
  });
});

describe('My Assignments navigation', () => {
  test('links teachers to the cross-class assignments page', () => {
    expect(
      allDestinations(userWith({ role: 'TEACHER', plan: 'SCHOOL' }))
    ).toContain('/app/assignments');
  });

  test('hidden for a student', () => {
    expect(
      allDestinations(userWith({ role: 'STUDENT', plan: 'SCHOOL' }))
    ).not.toContain('/app/assignments');
  });

  test('labeled "My Assignments"', () => {
    const link = FLAT_SIDEBAR_SECTIONS.flatMap((section) => section.links).find(
      (l) => l.to === '/app/assignments'
    );
    expect(link?.label).toBe('My Assignments');
  });
});
