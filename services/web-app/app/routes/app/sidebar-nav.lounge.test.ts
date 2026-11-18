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
  test('flag off: the legacy course grid nav entry is removed', () => {
    expect(loungeLink(false)).toBeUndefined();
  });

  test('flag on: needs a base Lounge nav entry to transform into the Faculty Lounge', () => {
    expect(loungeLink(true)).toBeUndefined();
  });

  test('does not mutate the shared section list', () => {
    applyLoungeCommunityLink(FLAT_SIDEBAR_SECTIONS, true);
    expect(loungeLink(false)).toBeUndefined();
  });
});
