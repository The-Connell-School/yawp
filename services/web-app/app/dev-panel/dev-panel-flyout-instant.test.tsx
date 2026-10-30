import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const devPanelDir = import.meta.dir;

describe('dev panel layout', () => {
  test('class simulation is inline in the 320px panel (no second flyout)', () => {
    const shell = readFileSync(path.join(devPanelDir, 'dev-panel-shell.tsx'), 'utf8');
    expect(shell).toContain('DevPanelClassSimulationInline');
    expect(shell.includes('DevPanelClassSimulationFlyout')).toBe(false);
    expect(shell.includes('Blackboard link')).toBe(false);
  });
});
