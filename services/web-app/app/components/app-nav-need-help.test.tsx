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
  APP_NAV_NEED_HELP_GMAIL,
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
  return container.querySelector<HTMLElement>(
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
  test('expanded footer row shows the label and is a menu button, not a bare mailto', () => {
    const container = renderTree(<AppNavNeedHelp navExpanded />);
    const row = footerLink(container);
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain('Need help?');
    const trigger = row!.closest('button');
    expect(trigger).not.toBeNull();
    expect(trigger!.getAttribute('aria-label')).toBe('Need help?');
    expect(trigger!.getAttribute('aria-haspopup')).toBe('dialog');
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  test('support links point at support@yawp.school', () => {
    expect(APP_NAV_NEED_HELP_MAILTO).toBe('mailto:support@yawp.school');
    expect(APP_NAV_NEED_HELP_GMAIL).toContain('to=support%40yawp.school');
  });

  test('collapsed footer hides the label but keeps the accessible name', () => {
    const container = renderTree(<AppNavNeedHelp navExpanded={false} />);
    const row = footerLink(container);
    expect(row).not.toBeNull();
    expect(row!.textContent).not.toContain('Need help?');
    expect(row!.closest('button')!.getAttribute('aria-label')).toBe('Need help?');
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
