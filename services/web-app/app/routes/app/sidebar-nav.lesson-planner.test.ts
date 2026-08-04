import { describe, expect, test } from 'bun:test';
import {
  FLAT_SIDEBAR_SECTIONS,
  getVisibleSidebarSections,
} from './sidebar-nav';

function userWith({
  role,
  lessonPlannerEnabled,
  reporterEnabled = false,
}: {
  role: 'TEACHER' | 'STUDENT';
  lessonPlannerEnabled: boolean;
  reporterEnabled?: boolean;
}) {
  return {
    isAdmin: false,
    selectedMembership: {
      role,
      isOrgOwner: false,
      organization: { name: 'Org', reporterEnabled, lessonPlannerEnabled },
    },
  } as any;
}

function visibleLinks(user: any, studentPreviewActive = false) {
  return getVisibleSidebarSections(
    FLAT_SIDEBAR_SECTIONS,
    user,
    studentPreviewActive
  ).flatMap((section) => section.links);
}

function plannerVisible(user: any, studentPreviewActive = false) {
  return visibleLinks(user, studentPreviewActive).some(
    (link) => link.to === '/app/lesson-planner'
  );
}

describe('Lesson Planner sidebar gating', () => {
  test('visible for a teacher in a planner-enabled org', () => {
    expect(
      plannerVisible(userWith({ role: 'TEACHER', lessonPlannerEnabled: true }))
    ).toBe(true);
  });

  test('hidden for a teacher when the org flag is off', () => {
    expect(
      plannerVisible(userWith({ role: 'TEACHER', lessonPlannerEnabled: false }))
    ).toBe(false);
  });

  test('hidden for a student even if the org flag is on', () => {
    expect(
      plannerVisible(userWith({ role: 'STUDENT', lessonPlannerEnabled: true }))
    ).toBe(false);
  });

  test('hidden while previewing as a student', () => {
    expect(
      plannerVisible(
        userWith({ role: 'TEACHER', lessonPlannerEnabled: true }),
        true
      )
    ).toBe(false);
  });

  test('gates independently of Reporter', () => {
    const plannerOnly = userWith({
      role: 'TEACHER',
      lessonPlannerEnabled: true,
      reporterEnabled: false,
    });
    const destinations = visibleLinks(plannerOnly).map((link) => link.to);
    expect(destinations).toContain('/app/lesson-planner');
    expect(destinations).not.toContain('/app/reporter');
  });

  test('sits directly under Reporter when both are on', () => {
    const both = userWith({
      role: 'TEACHER',
      lessonPlannerEnabled: true,
      reporterEnabled: true,
    });
    const destinations = visibleLinks(both).map((link) => link.to);
    expect(destinations.indexOf('/app/lesson-planner')).toBe(
      destinations.indexOf('/app/reporter') + 1
    );
  });
});
