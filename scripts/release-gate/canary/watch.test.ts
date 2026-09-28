import { describe, expect, test } from 'bun:test';
import { evaluateAndMaybeRollback } from './watch.ts';

describe('canary watch', () => {
  test('triggers rollback and nonzero semantics when thresholds exceed', async () => {
    let disabled = false;
    const result = await evaluateAndMaybeRollback({
      minutes: 10,
      errorThreshold: 5,
      server5xxThreshold: 10,
      org: 'org-123',
      flag: 'reporterEnabled',
      getErrors: async () => 9, // exceed errorThreshold
      get5xx: () => 0,
      doDisable: () => {
        disabled = true;
        return 0;
      },
    });
    expect(result.rolledBack).toBe(true);
    expect(disabled).toBe(true);
  });

  test('does not rollback when below thresholds', async () => {
    let disabled = false;
    const result = await evaluateAndMaybeRollback({
      minutes: 10,
      errorThreshold: 5,
      server5xxThreshold: 10,
      org: 'org-123',
      flag: 'reporterEnabled',
      getErrors: async () => 1,
      get5xx: () => 0,
      doDisable: () => {
        disabled = true;
        return 0;
      },
    });
    expect(result.rolledBack).toBe(false);
    expect(disabled).toBe(false);
  });
});

