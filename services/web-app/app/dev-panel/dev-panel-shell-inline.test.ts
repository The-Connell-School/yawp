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
    expect(shell).toContain('DevPanelClassSimulationInline');
    expect(shell.includes('DevPanelClassSimulationFlyout')).toBe(false);
    expect(shell.includes('Blackboard link')).toBe(false);
    expect(shell).toContain("toggleSection('free-tier-states')");
    expect(shell).toContain("toggleSection('give-feedback')");
    expect(shell).toContain("toggleSection('class-simulation')");
  });

  test('give feedback inline omits send helper commentary', () => {
    const inline = readFileSync(
      path.join(devPanelDir, 'dev-panel-give-feedback-inline.tsx'),
      'utf8'
    );
    expect(inline.includes('Describe the issue to send')).toBe(false);
    expect(inline.includes('yawp-dev-panel-give-feedback-hint')).toBe(false);
  });

  test('stylesheet defines PE3 inline expanded padding', () => {
    const css = readFileSync(path.join(devPanelDir, 'dev-panel.css'), 'utf8');
    expect(css).toContain('padding: 12px 12px 12px 24px');
  });

  test('class simulation primary buttons use light text on terracotta fill', () => {
    const css = readFileSync(path.join(devPanelDir, 'dev-panel.css'), 'utf8');
    const block = css.match(
      /\.yawp-dev-panel-class-sim-btn-primary\s*\{[^}]+\}/s
    )?.[0];
    expect(block).toBeTruthy();
    expect(block).toContain('var(--yawp-dev-panel-coral-deep)');
    expect(block).toContain('var(--yawp-dev-panel-coral-on)');
    expect(block?.includes('var(--yawp-dev-panel-ink)')).toBe(false);
  });
});
