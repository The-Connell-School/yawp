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

const { TutorOffBadge } = await import('./tutor-off-badge');

let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  document.body.innerHTML = '';
  root = null;
});

function render(element: React.ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(element));
}

describe('TutorOffBadge', () => {
  it('marks an assignment written without the tutor', () => {
    render(<TutorOffBadge tutorEnabled={false} />);

    const badge = document.querySelector('[data-testid="tutor-off-badge"]');
    expect(badge?.textContent).toBe('Tutor off');
  });

  it('explains what the badge means on hover', () => {
    render(<TutorOffBadge tutorEnabled={false} />);

    const badge = document.querySelector('[data-testid="tutor-off-badge"]');
    expect(badge?.getAttribute('title')).toContain('without the tutor');
  });

  it('renders nothing when the tutor was on', () => {
    // The tutor is on by default, so badging every ordinary assignment would
    // be noise. Only the deliberate exception is worth marking.
    render(<TutorOffBadge tutorEnabled={true} />);

    expect(
      document.querySelector('[data-testid="tutor-off-badge"]')
    ).toBeNull();
    expect(document.body.textContent).toBe('');
  });
});
