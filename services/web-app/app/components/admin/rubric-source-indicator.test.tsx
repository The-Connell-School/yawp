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

const { RubricSourceBanner } = await import('./rubric-source-indicator');

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(element);
  });

  return { root };
}

const completeCategory = {
  key: 'claim',
  label: 'Claim',
  description: 'A clear defensible claim.',
  weight: 0.5,
};

const emptyCategory = {
  key: 'evidence',
  label: 'Evidence',
  description: '',
  weight: 0.5,
};

describe('RubricSourceBanner', () => {
  let root: Root | null = null;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    document.body.innerHTML = '';
  });

  it('says the thesis default applies when no category is filled in', () => {
    ({ root } = render(<RubricSourceBanner rubric={{ categories: [] }} />));

    expect(
      document.querySelector('[data-testid="rubric-source-default"]')
    ).not.toBeNull();
    expect(
      document.querySelector('[data-testid="rubric-source-incomplete"]')
    ).toBeNull();
  });

  it('shows nothing when every category is fully populated', () => {
    ({ root } = render(
      <RubricSourceBanner rubric={{ categories: [completeCategory] }} />
    ));

    expect(
      document.querySelector('[data-testid="rubric-source-default"]')
    ).toBeNull();
    expect(
      document.querySelector('[data-testid="rubric-source-incomplete"]')
    ).toBeNull();
  });

  it('flags a partially-filled rubric instead of claiming the default applies', () => {
    ({ root } = render(
      <RubricSourceBanner
        rubric={{ categories: [completeCategory, emptyCategory] }}
      />
    ));

    const incomplete = document.querySelector(
      '[data-testid="rubric-source-incomplete"]'
    );
    expect(incomplete).not.toBeNull();
    expect(incomplete?.textContent).toContain('Evidence');
    // The rubric is still this assignment type's own, so the "using the
    // default thesis rubric" banner would be a lie.
    expect(
      document.querySelector('[data-testid="rubric-source-default"]')
    ).toBeNull();
  });
});
