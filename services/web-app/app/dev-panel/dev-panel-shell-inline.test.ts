import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const devPanelDir = import.meta.dir;

describe('dev panel inline accordions', () => {
  test('shell inlines free-tier and give feedback without side flyouts', () => {
    const shell = readFileSync(path.join(devPanelDir, 'dev-panel-shell.tsx'), 'utf8');
    expect(shell).toContain('DevPanelFreeTierInline');
    expect(shell).toContain('DevPanelGiveFeedbackInline');
    expect(shell.includes('DevPanelFreeTierFlyout')).toBe(false);
    expect(shell.includes('DevPanelGiveFeedbackFlyout')).toBe(false);
    expect(shell).toContain("toggleSection('free-tier-states')");
    expect(shell).toContain("toggleSection('give-feedback')");
  });

  test('stylesheet defines PE3 inline expanded padding', () => {
    const css = readFileSync(path.join(devPanelDir, 'dev-panel.css'), 'utf8');
    expect(css).toContain('padding: 12px 12px 12px 24px');
  });
});
