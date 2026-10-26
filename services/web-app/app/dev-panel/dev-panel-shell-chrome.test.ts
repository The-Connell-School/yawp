import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const devPanelDir = import.meta.dir;

describe('dev panel v3 chrome', () => {
  test('shell header omits environment badge and panel drop shadow', () => {
    const shell = readFileSync(path.join(devPanelDir, 'dev-panel-shell.tsx'), 'utf8');
    expect(shell.includes('Environment:')).toBe(false);
    expect(shell.includes('envBadge')).toBe(false);
    expect(shell.includes('shadow-xl')).toBe(false);
    expect(shell.includes('ChevronsRight')).toBe(true);
    expect(shell.includes('yawp-dev-panel-header')).toBe(true);
  });

  test('flyouts use border-only docked chrome', () => {
    for (const file of [
      'dev-panel-give-feedback-flyout.tsx',
      'dev-panel-free-tier-flyout.tsx',
      'dev-panel-class-simulation-flyout.tsx',
    ]) {
      const src = readFileSync(path.join(devPanelDir, file), 'utf8');
      expect(src.includes('shadow-lg')).toBe(false);
      expect(src.includes('yawp-dev-panel-flyout-docked')).toBe(true);
    }
    const fallback = readFileSync(
      path.join(devPanelDir, 'dev-panel-fallback-shell.tsx'),
      'utf8'
    );
    expect(fallback.includes('shadow-xl')).toBe(false);
  });

  test('stylesheet defines compact rows and reduced-motion flyouts', () => {
    const css = readFileSync(path.join(devPanelDir, 'dev-panel.css'), 'utf8');
    expect(css).toContain('--yawp-dev-panel-inset: 12px');
    expect(css).toContain('yawp-dev-panel-reduced-motion [data-yawp-dev-panel-flyout]');
    expect(css).toContain('box-shadow: none');
  });

  test('beaker shows locked affordance when preview gate applies', () => {
    const beaker = readFileSync(path.join(devPanelDir, 'dev-panel-beaker.tsx'), 'utf8');
    expect(beaker).toContain('Developer tools · locked · Alt+Shift+D');
    expect(beaker).toContain('<Lock');
  });
});
