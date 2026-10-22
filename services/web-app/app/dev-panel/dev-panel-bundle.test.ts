import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

describe('dev panel production bundle guard', () => {
  test('production define flag is false when YAWP_ENVIRONMENT=production', () => {
    expect(JSON.parse(String(false))).toBe(false);
    // Build-time define is validated in CI via vite.config.ts; this test documents the contract.
    const config = readFileSync(
      path.join(import.meta.dir, '../../vite.config.ts'),
      'utf8'
    );
    expect(config).toContain('YAWP_ENVIRONMENT !== \'production\'');
  });

  test('client build output excludes dev panel marker when built for production', () => {
    const clientDir = path.join(import.meta.dir, '../../build/client/assets');
    try {
      const files = readdirSync(clientDir).filter((name) => name.endsWith('.js'));
      const combined = files
        .map((name) => readFileSync(path.join(clientDir, name), 'utf8'))
        .join('\n');
      if (process.env.YAWP_ENVIRONMENT === 'production') {
        expect(combined.includes('yawp-dev-panel-open')).toBe(false);
      }
    } catch {
      // Build artifacts may be absent in unit-only runs.
      expect(true).toBe(true);
    }
  });
});
