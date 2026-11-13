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
import { MemoryRouter } from 'react-router';

const { ReporterGuide } = await import('./reporter-guide');
const { GUIDE_ACCENTS } = await import('~/components/how-it-works/guide-accents');

let activeRoot: Root | null = null;
let container: HTMLDivElement | null = null;

function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter>
        <ReporterGuide />
      </MemoryRouter>
    );
  });
  activeRoot = root;
  return container;
}

afterEach(() => {
  if (activeRoot) {
    act(() => activeRoot?.unmount());
    activeRoot = null;
  }
  container?.remove();
  container = null;
});

describe('the Reporter guide, restyled (Brian, Nov 5)', () => {
  it('is the charcoal page: no eyebrows, one-color headline, accent step circles', () => {
    const root = render();
    expect(root.querySelector('[data-guide-accent]')?.getAttribute('data-guide-accent')).toBe(GUIDE_ACCENTS.charcoal);
    expect(root.querySelectorAll('[data-eyebrow]')).toHaveLength(0);
    for (const label of ['What it can do', 'Growth reports']) {
      expect({ label, shown: root.textContent?.includes(label) }).toEqual({ label, shown: false });
    }
    expect(root.querySelector('h1')?.textContent).toBe('Ask about your classes in plain language.');
    expect(root.querySelector('h1 span')).toBeNull();
    expect(root.querySelectorAll('[data-guide-step]')).toHaveLength(3);
  });

  it('keeps the content, structure, clips, and screenshots', () => {
    const root = render();
    expect([...root.querySelectorAll('h2')].map((h) => h.textContent)).toEqual([
      'Reports you can run on any of your classes',
      'Track student growth over time',
      'What it will do, and what it won’t',
    ]);
    expect(root.querySelectorAll('video')).toHaveLength(3);
    expect(root.querySelector('img[src="/img/reporter-guide/hero.jpg"]')).not.toBeNull();
    expect(root.querySelector('img[src="/img/reporter-guide/starters.jpg"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="guide-reports"]')?.textContent).toContain('Who needs attention?');
    expect(root.querySelector('[data-testid="guide-uses"]')?.textContent).toContain('Parent-teacher conferences:');
    expect(root.querySelector('[data-testid="guide-wont"]')?.textContent).toContain('Talk to students. It’s for teachers only.');
  });

  it('says each step in a complete sentence (the copy pass)', () => {
    const text = render().textContent ?? '';
    expect(text).toContain('It shows every student’s average and who is trending down.');
    expect(text).not.toContain('Every student’s average, and who is trending down.');
    expect(text).toContain(
      'The report shows scores over time, what your feedback keeps saying, and suggested next steps. Print or save any report as a PDF.'
    );
    expect(text).not.toContain('Scores over time, what your feedback keeps saying, and suggested next steps. Print');
  });
});
