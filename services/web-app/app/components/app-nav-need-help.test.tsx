import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, test } from 'bun:test';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  APP_NAV_NEED_HELP_MAILTO,
  AppNavNeedHelp,
} from './app-nav-need-help';

let root: Root | null = null;

function renderTree(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(element);
  });
  return container;
}

function footerLink(container: ParentNode) {
  return container.querySelector<HTMLAnchorElement>(
    '[data-testid="app-nav-need-help"]'
  );
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

function AppShellFooter({
  withUsage,
  navExpanded,
}: {
  withUsage: boolean;
  navExpanded: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-col justify-end">
      {withUsage ? <div data-testid="free-tier-sidebar-usage" /> : null}
      <AppNavNeedHelp navExpanded={navExpanded} />
      <div data-testid="app-nav-settings">Settings</div>
    </div>
  );
}

describe('AppNavNeedHelp', () => {
  test('expanded footer link uses support mailto, label, and aria-label', () => {
    const container = renderTree(<AppNavNeedHelp navExpanded />);
    const link = footerLink(container);
    expect(link).not.toBeNull();
    expect(APP_NAV_NEED_HELP_MAILTO).toBe('mailto:support@yawp.school');
    expect(link!.getAttribute('href')).toBe(APP_NAV_NEED_HELP_MAILTO);
    expect(link!.getAttribute('aria-label')).toBe('Need help?');
    expect(link!.textContent).toContain('Need help?');
  });

  test('collapsed footer keeps mailto with tooltip title and hides the label', () => {
    const container = renderTree(<AppNavNeedHelp navExpanded={false} />);
    const link = footerLink(container);
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe(APP_NAV_NEED_HELP_MAILTO);
    expect(link!.getAttribute('aria-label')).toBe('Need help?');
    expect(link!.getAttribute('title')).toBe('Need help?');
    expect(link!.textContent).not.toContain('Need help?');
  });

  test('renders above Settings with or without the free-tier Usage row', () => {
    for (const withUsage of [true, false] as const) {
      const container = renderTree(
        <AppShellFooter withUsage={withUsage} navExpanded />
      );
      const ids = [...container.querySelectorAll('[data-testid]')].map((el) =>
        el.getAttribute('data-testid')
      );
      const needHelpIndex = ids.indexOf('app-nav-need-help');
      const settingsIndex = ids.indexOf('app-nav-settings');
      expect(needHelpIndex).toBeGreaterThan(-1);
      expect(settingsIndex).toBeGreaterThan(needHelpIndex);
      if (withUsage) {
        const usageIndex = ids.indexOf('free-tier-sidebar-usage');
        expect(usageIndex).toBeGreaterThan(-1);
        expect(needHelpIndex).toBeGreaterThan(usageIndex);
      }
    }
  });
});
