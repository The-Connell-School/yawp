import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const devPanelDir = import.meta.dir;

describe('dev panel PE3 accordion spacing contract', () => {
  test('CSS hides closed collapsible content and uses section hairlines only', () => {
    const css = readFileSync(path.join(devPanelDir, 'dev-panel.css'), 'utf8');
    expect(css).toContain('.yawp-dev-panel-section');
    expect(css).toContain("border-bottom: 0");
    expect(css).toContain('.yawp-dev-panel-collapsible-content[data-state=\'closed\']');
    expect(css).toContain('display: none');
    expect(css).toContain('--yawp-dev-panel-expanded-bg: hsl(46.6667 36% 95.098%)');
    expect(css).toContain('gap: 8px');
    expect(css).not.toMatch(/\.yawp-dev-panel-row[\s\S]{0,120}gap: 6px/);
  });

  test('shell wraps accordion sections for flush 32px rows + 1px borders', () => {
    const shell = readFileSync(path.join(devPanelDir, 'dev-panel-shell.tsx'), 'utf8');
    expect(shell).toContain('yawp-dev-panel-section');
    expect(shell).toContain('yawp-dev-panel-collapsible-content');
    expect(shell).toContain('yawp-dev-panel-scroll');
  });

  test('default panel state keeps sign-in collapsed like PE3 DevPanel.pe3.html', () => {
    const types = readFileSync(path.join(devPanelDir, 'dev-panel-types.ts'), 'utf8');
    expect(types).toContain('openSections: []');
  });
});
