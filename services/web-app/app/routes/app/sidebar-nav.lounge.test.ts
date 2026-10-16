import { describe, expect, test } from 'bun:test';
import {
  FLAT_SIDEBAR_SECTIONS,
  applyLoungeCommunityLink,
  isSidebarLinkActive,
} from './sidebar-nav';

function loungeLink(enabled: boolean) {
  return applyLoungeCommunityLink(FLAT_SIDEBAR_SECTIONS, enabled)
    .flatMap((section) => section.links)
    .find((link) => link.label === "Teacher's Lounge" || link.label === 'Faculty Lounge');
}

const active = (linkTo: string, pathname: string) =>
  pathname === linkTo || pathname.startsWith(`${linkTo}/`);

describe("Teacher's Lounge nav item", () => {
  test('flag off: still opens the course grid, unchanged', () => {
    const link = loungeLink(false);
    expect(link?.to).toBe('/app/teacher-trainings');
    expect(link?.label).toBe("Teacher's Lounge");
    expect(link?.alsoActiveFor).toBeUndefined();
  });

  test('flag on: opens the community feed and stays highlighted on the course grid', () => {
    const link = loungeLink(true)!;
    expect(link.to).toBe('/app/lounge');
    expect(link.label).toBe('Faculty Lounge');
    expect(isSidebarLinkActive(link, '/app/lounge/abc', active)).toBe(true);
    expect(isSidebarLinkActive(link, '/app/teacher-trainings/t1', active)).toBe(true);
    expect(isSidebarLinkActive(link, '/app/reporter', active)).toBe(false);
  });

  test('does not mutate the shared section list', () => {
    applyLoungeCommunityLink(FLAT_SIDEBAR_SECTIONS, true);
    expect(loungeLink(false)?.to).toBe('/app/teacher-trainings');
  });
});
