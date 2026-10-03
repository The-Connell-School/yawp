import { describe, expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import { createRoutesStub } from 'react-router';

import { DocumentLink } from './document-link';

function renderLink(overrides: Record<string, unknown> = {}) {
  const doc = {
    id: 'doc-1',
    title: 'Argue a position',
    html: '<p>Draft</p>',
    updatedAt: new Date('2026-10-01T12:00:00Z'),
    assignmentModuleSessions: [{ assignmentModule: { title: 'Daily Pages' } }],
    submissions: [],
    assignment: null,
    group: null,
    ...overrides,
  } as any;
  const Stub = createRoutesStub([
    {
      path: '/',
      Component: () => <DocumentLink doc={doc} exitTo="/app" isStudentView />,
    },
  ]);
  return renderToString(<Stub initialEntries={['/']} />);
}

/** Every <button> opened before the matching </button> closes it. */
function hasNestedButton(html: string): boolean {
  let depth = 0;
  for (const [tag] of html.matchAll(/<\/?button\b/g)) {
    depth += tag === '<button' ? 1 : -1;
    if (depth > 1) return true;
  }
  return false;
}

/**
 * A browser will not put a <button> inside a <button>: it closes the first
 * before opening the second, so the page it builds from the server's HTML
 * no longer matches what React renders, and hydration fails for the whole
 * page. The document card's menu used to render exactly that.
 */
describe('DocumentLink', () => {
  test('renders the card with its title and menu', () => {
    const html = renderLink();
    expect(html).toContain('Argue a position');
    expect(html).toContain('<button');
  });

  test('never nests a button inside a button', () => {
    expect(hasNestedButton(renderLink())).toBe(false);
  });
});
