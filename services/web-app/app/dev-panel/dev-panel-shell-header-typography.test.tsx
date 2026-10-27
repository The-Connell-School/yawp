import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // shared process
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const matchMedia = window.matchMedia.bind(window);
window.matchMedia = (query: string) => {
  const desktop =
    query.includes('max-width: 639px') ||
    query.includes('max-width: 1023px') ||
    query.includes('orientation: portrait')
      ? false
      : matchMedia(query).matches;
  return {
    matches: desktop,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  } as MediaQueryList;
};

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DevPanelProvider } from './dev-panel-provider';
import { DevPanelShell } from './dev-panel-shell';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { writeDevPanelState } from './dev-panel-storage';

const devPanelCss = readFileSync(path.join(import.meta.dir, 'dev-panel.css'), 'utf8');
const styleEl = document.createElement('style');
styleEl.textContent = devPanelCss;
document.head.appendChild(styleEl);

mock.module('react-router', () => ({
  useRouteLoaderData: () => ({
    user: {
      email: 'dev.teacher@yawp.local',
      name: 'Dev Teacher',
      memberships: [{ role: 'teacher' }],
    },
  }),
  useLocation: () => ({ pathname: '/teacher/dashboard', search: '' }),
  useFetcher: () => ({
    Form: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
      method?: string;
      action?: string;
      className?: string;
    }) => createElement('form', props, children),
  }),
  Form: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    method?: string;
    action?: string;
    className?: string;
  }) => createElement('form', props, children),
}));

const originalFetch = globalThis.fetch;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  globalThis.fetch = originalFetch;
});

describe('dev panel shell header typography', () => {
  test('header title computed font-size is 13px on desktop', async () => {
    writeDevPanelState(window.localStorage, {
      open: true,
      openSections: ['sign-in'],
      org: null,
      subSheet: null,
      scroll: {},
      forms: { throwawaySwitch: true, blackboardRole: 'teacher' },
    });

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/dev-panel/orgs')) {
        return new Response(JSON.stringify({ organizations: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ options: [] }), { status: 200 });
    }) as typeof fetch;

    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(
        createElement(DevPanelProvider, {
          envBadge: 'Dev',
          previewAccessGateEnabled: false,
          previewAccessSeatLabel: null,
          children: createElement(DevPanelShell),
        })
      );
    });

    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });
    });

    const title = document.getElementById('devtools-title');
    expect(title).toBeTruthy();
    if (!title) return;
    const fontSize = window.getComputedStyle(title).fontSize;
    expect(fontSize).toBe('13px');
  });
});
