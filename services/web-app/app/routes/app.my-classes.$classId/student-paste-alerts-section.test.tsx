import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it } from 'bun:test';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';

import {
  StudentPasteAlertsSection,
  type StudentPasteAlert,
} from './student-paste-alerts-section';

function alert(overrides: Partial<StudentPasteAlert> = {}): StudentPasteAlert {
  return {
    id: 'alert-1',
    documentId: 'doc-abc123',
    textLength: 312,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

let root: Root | null = null;

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<MemoryRouter>{element}</MemoryRouter>);
  });
  return container;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  document.body.innerHTML = '';
  root = null;
});

describe('StudentPasteAlertsSection', () => {
  it('renders nothing when there are no alerts', () => {
    const el = render(<StudentPasteAlertsSection alerts={[]} exitTo="/app/my-classes/class-1" />);
    expect(el.textContent).toBe('');
  });

  it('shows the document id next to each entry', () => {
    const el = render(
      <StudentPasteAlertsSection
        alerts={[alert({ documentId: 'doc-abc123' })]}
        exitTo="/app/my-classes/class-1"
      />
    );
    expect(el.textContent).toContain('doc-abc123');
  });

  it('shows how much text was pasted', () => {
    const el = render(
      <StudentPasteAlertsSection
        alerts={[alert({ textLength: 312 })]}
        exitTo="/app/my-classes/class-1"
      />
    );
    expect(el.textContent).toContain('312');
  });

  it('links each entry to its document', () => {
    const el = render(
      <StudentPasteAlertsSection
        alerts={[alert({ documentId: 'doc-abc123' })]}
        exitTo="/app/my-classes/class-1"
      />
    );
    const link = el.querySelector('a');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toContain('/app/documents/doc-abc123');
  });

  it('carries an exitTo back to the class page so document navigation is reversible', () => {
    const el = render(
      <StudentPasteAlertsSection
        alerts={[alert()]}
        exitTo="/app/my-classes/class-1?tab=students"
      />
    );
    const link = el.querySelector('a')!;
    expect(link.getAttribute('href')).toContain(
      encodeURIComponent('/app/my-classes/class-1?tab=students')
    );
  });

  it('avoids alarm framing — no red/destructive/warning language or styling class', () => {
    const el = render(
      <StudentPasteAlertsSection alerts={[alert()]} exitTo="/app/my-classes/class-1" />
    );
    expect(el.textContent?.toLowerCase()).not.toMatch(
      /alert|warning|flag|suspicious|cheat|violation/
    );
    expect(el.innerHTML).not.toMatch(/text-red|text-destructive|bg-red/);
  });

  it('caps the visible rows and shows a count for the rest when there are many', () => {
    const alerts = Array.from({ length: 6 }, (_, i) =>
      alert({ id: `alert-${i}`, documentId: `doc-${i}` })
    );
    const el = render(
      <StudentPasteAlertsSection alerts={alerts} exitTo="/app/my-classes/class-1" />
    );
    const links = el.querySelectorAll('a');
    expect(links.length).toBeLessThan(6);
    expect(el.textContent).toMatch(/more/i);
  });

  it('does not cap or show a "more" count when alerts fit within the visible rows', () => {
    const alerts = [alert({ id: 'a1' }), alert({ id: 'a2', documentId: 'doc-2' })];
    const el = render(
      <StudentPasteAlertsSection alerts={alerts} exitTo="/app/my-classes/class-1" />
    );
    expect(el.querySelectorAll('a').length).toBe(2);
    expect(el.textContent).not.toMatch(/more/i);
  });
});
