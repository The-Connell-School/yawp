import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

const devPanelDir = import.meta.dir;
const devPanelCss = readFileSync(path.join(devPanelDir, 'dev-panel.css'), 'utf8');
const appCss = readFileSync(path.join(devPanelDir, '../app.css'), 'utf8');

let styleEl: HTMLStyleElement | null = null;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('dev panel header chrome (rendered)', () => {
  test('panel title uses 13px on a non-h1 heading and header row is 32px', () => {
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.textContent = `${appCss}\n${devPanelCss}`;
      document.head.appendChild(styleEl);
    }
    const container = document.createElement('aside');
    container.setAttribute('data-yawp-dev-panel', '');
    container.innerHTML = `
      <header class="yawp-dev-panel-header">
        <div class="yawp-dev-panel-header-title">
          <span class="size-4 shrink-0" aria-hidden="true"></span>
          <p role="heading" aria-level="1" class="yawp-dev-panel-header-heading">Developer tools</p>
        </div>
        <button type="button" class="size-7 shrink-0" aria-label="Close developer tools"></button>
      </header>
    `;
    document.body.appendChild(container);

    const header = container.querySelector('.yawp-dev-panel-header') as HTMLElement;
    const title = container.querySelector('.yawp-dev-panel-header-heading') as HTMLElement;
    expect(title?.textContent).toBe('Developer tools');
    expect(getComputedStyle(title).fontSize).toBe('13px');
    expect(getComputedStyle(header).height).toBe('32px');
    expect(getComputedStyle(header).minHeight).toBe('32px');
  });
});
