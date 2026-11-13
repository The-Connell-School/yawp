import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dir, '../../../..');
const devPanelHtml = readFileSync(
  path.join(
    repoRoot,
    'design/devpanel-v3/html/pe3-inline-2026-10-27/DevPanel.pe3.html'
  ),
  'utf8'
);
const css = readFileSync(path.join(import.meta.dir, 'dev-panel.css'), 'utf8');

describe('PE3 HTML export tokens', () => {
  test('inline DevPanel.pe3.html defines 320px docked panel and PE3 border', () => {
    expect(devPanelHtml).toContain('width: 320px');
    expect(devPanelHtml).toContain('border-left: 1px solid hsl(51.4286 7.8652% 82.549%)');
  });

  test('dev-panel.css mirrors key PE3 inline colors', () => {
    expect(css).toContain('--yawp-dev-panel-width: 320px');
    expect(css).toContain('--yawp-dev-panel-border: hsl(51.4286 7.8652% 82.549%)');
    expect(css).toContain('--yawp-dev-panel-active: hsl(45 24.2424% 87.0588%)');
    expect(css).toContain('--yawp-dev-panel-muted: hsl(50 2.4% 36%)');
  });
});
