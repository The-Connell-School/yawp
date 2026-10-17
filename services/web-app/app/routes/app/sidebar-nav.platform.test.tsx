import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { getSidebarIcon, FLAT_SIDEBAR_SECTIONS, getVisibleSidebarSections } from './sidebar-nav';

test('selects the new 18px mapping only when enabled', () => {
  const mapping = { Dashboard: 'gauge', 'My Classes': 'users', 'My Assignments': 'pen-line', Documents: 'file', 'My Documents': 'file', Reporter: 'microscope', 'Writing Practice': 'notebook-pen', "Teacher's Lounge": 'coffee', Organization: 'building', Admin: 'shield-check', 'Lesson Planner': 'lightbulb' };
  for (const [label, icon] of Object.entries(mapping)) {
    const old = FLAT_SIDEBAR_SECTIONS[0].links.find(link => link.label === label)!.icon;
    expect(getSidebarIcon(label, false, old)).toBe(old);
    const markup = renderToStaticMarkup(<>{getSidebarIcon(label, true, old)}</>);
    expect(markup).toContain(`lucide-${icon}`);
    expect(markup).toContain('width="18"');
    expect(markup).toContain('stroke-width="2"');
  }
});

for (const [name, role, plan, isAdmin] of [['teacher', 'TEACHER', 'SCHOOL', false], ['student', 'STUDENT', 'SCHOOL', false], ['free-classroom teacher', 'TEACHER', 'FREE_CLASSROOM', false], ['admin', 'TEACHER', 'SCHOOL', true]] as const) {
  test(`${name} has no repeated visible destinations or labels`, () => {
    const user = { isAdmin, selectedMembership: { role, isOrgOwner: isAdmin, organization: { plan } } } as any;
    const links = getVisibleSidebarSections(FLAT_SIDEBAR_SECTIONS, user).flatMap(section => section.links);
    expect(new Set(links.map(link => link.to)).size).toBe(links.length);
    expect(new Set(links.map(link => link.label)).size).toBe(links.length);
  });
}
