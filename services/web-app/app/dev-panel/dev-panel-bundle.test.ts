import { describe, expect, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const webAppRoot = path.join(import.meta.dir, '../..');
const clientDir = path.join(webAppRoot, 'build/client/assets');

const FORBIDDEN_CLIENT_MARKERS = [
  'dev-panel-mount',
  'useDevPanelShortcut',
  'yawp-dev-panel-open',
  'Open developer tools',
  'event.code !== "KeyD"',
  '/api/dev-panel/orgs',
  '/api/dev-panel/feedback',
  'Sent as a tester',
  'DevPanelShell',
];

function buildProductionClient() {
  execSync('bun run build', {
    cwd: webAppRoot,
    env: {
      ...process.env,
      YAWP_ENVIRONMENT: 'production',
      NODE_ENV: 'production',
    },
    stdio: 'pipe',
  });
}

function readProductionClientJs() {
  if (!existsSync(clientDir)) {
    buildProductionClient();
  }
  const files = readdirSync(clientDir).filter((name) => name.endsWith('.js'));
  let combined = files
    .map((name) => readFileSync(path.join(clientDir, name), 'utf8'))
    .join('\n');
  if (combined.includes('dev-panel-mount') || combined.includes('yawp-dev-panel-open')) {
    buildProductionClient();
    const refreshed = readdirSync(clientDir).filter((name) => name.endsWith('.js'));
    combined = refreshed
      .map((name) => readFileSync(path.join(clientDir, name), 'utf8'))
      .join('\n');
  }
  return { combined, files: readdirSync(clientDir).filter((name) => name.endsWith('.js')) };
}

describe('dev panel production bundle guard', () => {
  test('production define flag is false when YAWP_ENVIRONMENT=production', () => {
    const config = readFileSync(
      path.join(webAppRoot, 'vite.config.ts'),
      'utf8'
    );
    expect(config).toContain("YAWP_ENVIRONMENT !== 'production'");
    expect(config).toContain('dev-panel-entry.stub.tsx');
  });

  test('feedback server modules exclude local dev persona imports', () => {
    for (const file of [
      'dev-panel-feedback.server.ts',
      'dev-panel-signed-out-feedback.server.ts',
    ]) {
      const src = readFileSync(path.join(import.meta.dir, file), 'utf8');
      expect(src.includes('dev-personas')).toBe(false);
      expect(src.includes('LOCAL_DEV_PASSWORD')).toBe(false);
    }
  });

  test(
    'production client build output excludes dev panel modules and shortcut handler',
    () => {
      const { combined, files } = readProductionClientJs();
      expect(files.length).toBeGreaterThan(0);
      for (const marker of FORBIDDEN_CLIENT_MARKERS) {
        expect(combined.includes(marker)).toBe(false);
      }
      expect(files.some((name) => name.includes('dev-panel'))).toBe(false);
    },
    180_000
  );
});
