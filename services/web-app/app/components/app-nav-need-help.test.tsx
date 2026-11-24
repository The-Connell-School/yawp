import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  APP_NAV_NEED_HELP_GMAIL,
  APP_NAV_NEED_HELP_MAILTO,
  AppNavNeedHelp,
  AppNavNeedHelpMenu,
  copySupportEmail,
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

  test('menu offers Gmail, the mail app, and copy', () => {
    let copied = false;
    const writeText = mock(async () => {});
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const container = renderTree(
      <AppNavNeedHelpMenu
        copied={copied}
        onCopy={() => {
          copied = true;
          void navigator.clipboard.writeText('support@yawp.school');
        }}
      />
    );
    const menu = container.querySelector('[data-testid="app-nav-need-help-menu"]');
    expect(menu).not.toBeNull();
    expect(menu!.textContent).toContain('support@yawp.school');
    expect(menu!.textContent).toContain('Need help?');
    const gmail = container.querySelector<HTMLAnchorElement>(
      '[data-testid="app-nav-need-help-gmail"]'
    );
    const mailto = container.querySelector<HTMLAnchorElement>(
      '[data-testid="app-nav-need-help-mailto"]'
    );
    expect(gmail!.getAttribute('href')).toBe(APP_NAV_NEED_HELP_GMAIL);
    expect(gmail!.getAttribute('target')).toBe('_blank');
    expect(mailto!.getAttribute('href')).toBe(APP_NAV_NEED_HELP_MAILTO);
    expect(mailto!.textContent).toContain('Open my email app');
    const copy = container.querySelector<HTMLButtonElement>(
      '[data-testid="app-nav-need-help-copy"]'
    );
    expect(copy!.textContent).toContain('Copy email address');
    act(() => {
      copy!.click();
    });
    expect(writeText).toHaveBeenCalledWith('support@yawp.school');
    expect(copied).toBe(true);
  });

  test('copy falls back to a prompt when the clipboard is unavailable', () => {
    const prompt = mock(() => null);
    window.prompt = prompt as typeof window.prompt;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('clipboard blocked');
        },
      },
    });
    return copySupportEmail().then((result) => {
      expect(result).toBe('prompt');
      expect(prompt).toHaveBeenCalledWith(
        'Copy our support email:',
        'support@yawp.school'
      );
    });
  });

  test('copied state replaces the copy label', () => {
    const container = renderTree(
      <AppNavNeedHelpMenu copied onCopy={() => {}} />
    );
    expect(
      container.querySelector('[data-testid="app-nav-need-help-copy"]')!
        .textContent
    ).toContain('Copied!');
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
