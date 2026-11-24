import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, test } from 'bun:test';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  APP_NAV_COLLAPSE_LABEL,
  APP_NAV_EXPAND_LABEL,
  APP_NAV_HEADER_COLLAPSE_LABEL,
  AppNavCollapseToggleButton,
  AppNavHeaderCollapseButton,
} from './app-nav-collapse-toggle';

let root: Root | null = null;
const submits: string[] = [];

function renderTree(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(element);
  });
  return container;
}

function preferenceForm(nextState: string, control: ReactElement) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submits.push(String(new FormData(event.currentTarget).get('state')));
      }}
    >
      <input type="hidden" name="state" value={nextState} />
      {control}
    </form>
  );
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  submits.length = 0;
});

describe('sidebar collapse controls', () => {
  test('header collapse arrow submits the nav preference form', () => {
    const container = renderTree(
      preferenceForm(
        'collapsed',
        <AppNavHeaderCollapseButton disabled={false} />
      )
    );
    const button = container.querySelector(
      '[data-testid="app-nav-header-collapse"]'
    ) as HTMLButtonElement;
    expect(button.type).toBe('submit');
    expect(button.getAttribute('aria-label')).toBe(
      APP_NAV_HEADER_COLLAPSE_LABEL
    );
    act(() => {
      button.click();
    });
    expect(submits).toEqual(['collapsed']);
  });

  test('Hide labels submits collapsed and Show labels submits expanded', () => {
    const expanded = renderTree(
      preferenceForm(
        'collapsed',
        <AppNavCollapseToggleButton navExpanded disabled={false} />
      )
    );
    const hide = expanded.querySelector(
      '[data-testid="app-nav-collapse-toggle"]'
    ) as HTMLButtonElement;
    expect(hide.type).toBe('submit');
    expect(hide.getAttribute('aria-label')).toBe(APP_NAV_COLLAPSE_LABEL);
    expect(hide.textContent).toContain(APP_NAV_COLLAPSE_LABEL);
    expect(hide.className).toContain('max-sm:hidden');
    act(() => {
      hide.click();
    });
    expect(submits).toEqual(['collapsed']);

    act(() => root?.unmount());
    submits.length = 0;
    const collapsed = renderTree(
      preferenceForm(
        'expanded',
        <AppNavCollapseToggleButton navExpanded={false} disabled={false} />
      )
    );
    const show = collapsed.querySelector(
      '[data-testid="app-nav-collapse-toggle"]'
    ) as HTMLButtonElement;
    expect(show.type).toBe('submit');
    expect(show.getAttribute('aria-label')).toBe(APP_NAV_EXPAND_LABEL);
    expect(show.textContent).not.toContain(APP_NAV_EXPAND_LABEL);
    act(() => {
      show.click();
    });
    expect(submits).toEqual(['expanded']);
  });

  test('the app shell keeps the logo-hover expand submit and the labeled row', () => {
    const source = readFileSync(
      new URL('../routes/app/route.tsx', import.meta.url),
      'utf8'
    );
    expect(source).toContain('<AppNavHeaderCollapseButton');
    expect(source).toContain('<AppNavCollapseToggle');
    expect(source).toContain('app-nav-collapsed-logo-swap');
    const expandLabel = source.indexOf('aria-label="Expand app navigation"');
    expect(expandLabel).toBeGreaterThan(-1);
    expect(source.slice(expandLabel - 500, expandLabel)).toContain(
      'type="submit"'
    );
  });
});
