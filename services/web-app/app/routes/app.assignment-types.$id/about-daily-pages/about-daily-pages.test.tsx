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

const { AboutDailyPages } = await import('./about-daily-pages');
const { GRADING_SUMMARY, PROMPT_REWRITES, PROMPT_WARNINGS, WHAT_IT_IS_NOT } =
  await import('./content');

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(element);
  });

  return { root };
}

let activeRoot: Root | null = null;

afterEach(() => {
  if (activeRoot) {
    act(() => activeRoot?.unmount());
    activeRoot = null;
  }
  document.body.innerHTML = '';
});

function renderAbout() {
  activeRoot = render(<AboutDailyPages />).root;
  return document.body;
}

describe('the Daily Pages about section', () => {
  it('leads with what the assignment type is', () => {
    const body = renderAbout();
    const headings = Array.from(body.querySelectorAll('h3, h4')).map(
      (node) => node.textContent
    );

    expect(headings).toContain('About Daily Pages');
    expect(headings).toContain('What a Daily Pages entry is');
    expect(headings).toContain('What it is not');
    expect(headings).toContain('How it is graded');
    expect(headings).toContain('Using it with a class');
    expect(headings).toContain('Writing your own prompt');
  });

  it('says what it is not, and what to reach for instead', () => {
    const body = renderAbout();

    for (const item of WHAT_IT_IS_NOT) {
      expect(body.textContent).toContain(item.claim);
    }
    // The Class Starter boundary is the one teachers get wrong.
    expect(body.textContent).toContain('Class Starter');
  });

  it('puts every rubric category in a table row with its weight', () => {
    const body = renderAbout();
    const rows = Array.from(body.querySelectorAll('tbody tr'));

    expect(rows).toHaveLength(GRADING_SUMMARY.length);
    for (const [index, row] of rows.entries()) {
      const summary = GRADING_SUMMARY[index];
      expect(row.textContent).toContain(summary.label);
      expect(row.textContent).toContain(`${summary.weightPercent}%`);
    }
  });

  it('shows each prompt rewrite as a before and an after', () => {
    const body = renderAbout();

    for (const rewrite of PROMPT_REWRITES) {
      expect(body.textContent).toContain(rewrite.before);
      expect(body.textContent).toContain(rewrite.after);
      expect(body.textContent).toContain(rewrite.why);
    }
  });

  it('lists the ways a prompt fails to grade', () => {
    const body = renderAbout();

    for (const warning of PROMPT_WARNINGS) {
      expect(body.textContent).toContain(warning);
    }
  });
});
