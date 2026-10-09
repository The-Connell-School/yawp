import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router';

const { DocumentLink } = await import('./document-link');

let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  document.body.innerHTML = '';
});

function render(props: Parameters<typeof DocumentLink>[0]) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const router = createMemoryRouter([
    { path: '/', element: <DocumentLink {...props} /> },
  ]);
  root = createRoot(container);
  act(() => {
    root!.render(<RouterProvider router={router} />);
  });
  return container;
}

const doc = {
  id: 'doc-1',
  title: 'Honest and kind — Sam',
  html: '<p>Yes, I think it is possible.</p>',
  updatedAt: new Date('2026-10-07T12:00:00Z'),
  assignmentModuleSessions: [{ assignmentModule: { title: 'Daily Pages' } }],
  submissions: [],
} as any;

describe('DocumentLink', () => {
  // A button inside a link (or inside another button) is invalid HTML. React
  // rejected the server markup over it and re-rendered every student page that
  // lists documents on the client.
  it('keeps the actions menu outside the link and never nests buttons', () => {
    const container = render({ doc, exitTo: '/app' });

    expect(container.querySelector('a')).not.toBeNull();
    expect(container.querySelector('a button, a a')).toBeNull();
    expect(container.querySelector('button button')).toBeNull();
    expect(container.querySelector('button[aria-haspopup="menu"]')).not.toBeNull();
  });

  it('still opens the document from the card', () => {
    const container = render({ doc, exitTo: '/app' });

    const link = container.querySelector('a');
    expect(link?.textContent).toContain('Honest and kind — Sam');
    expect(link?.getAttribute('href')).toContain('doc-1');
  });
});
