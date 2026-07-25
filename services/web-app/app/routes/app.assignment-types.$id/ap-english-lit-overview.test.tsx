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

const { ApEnglishLitOverview } = await import('./ap-english-lit-overview');

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(element);
  });

  return { root };
}

function cleanup(root: Root | null) {
  if (root) {
    act(() => {
      root.unmount();
    });
  }
  document.body.innerHTML = '';
}

function scoringToggle() {
  return document.querySelector<HTMLButtonElement>(
    '[data-testid="ap-lit-rubric-toggle"]',
  );
}

describe('ApEnglishLitOverview', () => {
  let root: Root | null = null;

  afterEach(() => {
    cleanup(root);
    root = null;
  });

  it('always shows the compact scoring summary with all three rows', () => {
    ({ root } = render(<ApEnglishLitOverview />));

    const text = document.body.textContent ?? '';
    expect(text).toContain('6-point analytic rubric');
    expect(text).toContain('Thesis');
    expect(text).toContain('Evidence and Commentary');
    expect(text).toContain('Sophistication');
  });

  it('renders the rubric detail as a collapsed dropdown by default', () => {
    ({ root } = render(<ApEnglishLitOverview />));

    const toggle = scoringToggle();
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');

    // Detailed, per-score-point criteria are hidden until expanded.
    expect(document.body.textContent ?? '').not.toContain(
      'Makes an arguable interpretive claim about the text.',
    );
  });

  it('reveals how scoring works and per-row detail when expanded', async () => {
    ({ root } = render(<ApEnglishLitOverview />));

    const toggle = scoringToggle();
    await act(async () => {
      toggle?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(scoringToggle()?.getAttribute('aria-expanded')).toBe('true');

    const text = document.body.textContent ?? '';
    // "How scoring works" explanation.
    expect(text).toContain('How scoring works');
    // Row description from the canonical rubric.
    expect(text).toContain('presents a defensible interpretation');
    // A specific score-point criterion.
    expect(text).toContain('Makes an arguable interpretive claim about the text.');
    // A common failure / pitfall.
    expect(text).toContain('Restating the prompt as if it were a thesis.');
  });

  it('collapses again when toggled a second time', async () => {
    ({ root } = render(<ApEnglishLitOverview />));

    await act(async () => {
      scoringToggle()?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(scoringToggle()?.getAttribute('aria-expanded')).toBe('true');

    await act(async () => {
      scoringToggle()?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(scoringToggle()?.getAttribute('aria-expanded')).toBe('false');
    expect(document.body.textContent ?? '').not.toContain(
      'Makes an arguable interpretive claim about the text.',
    );
  });
});
