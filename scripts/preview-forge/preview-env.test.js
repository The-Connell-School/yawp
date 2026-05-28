import { describe, expect, test } from 'bun:test';
import { buildPreviewForgeEnv } from './preview-env.mjs';

describe('buildPreviewForgeEnv', () => {
  test('derives stable PR-scoped names and URLs', () => {
    const env = buildPreviewForgeEnv({
      prNumber: '142',
      domain: 'preview.yawp.school',
      root: '/srv/yawp-preview-forge',
    });

    expect(env.slug).toBe('pr-142');
    expect(env.composeProject).toBe('yawp-pr-142');
    expect(env.hostname).toBe('pr-142.preview.yawp.school');
    expect(env.url).toBe('https://pr-142.preview.yawp.school');
    expect(env.runtime).toBe('fast');
    expect(env.previewDir).toBe('/srv/yawp-preview-forge/previews/pr-142');
    expect(env.sourceDir).toBe('/srv/yawp-preview-forge/sources/pr-142');
    expect(env.databaseName).toBe('yawp_pr_142');
    expect(env.databaseHost).toBe('preview-postgres');
    expect(env.databaseUrl).toBe('postgresql://postgres:postgres@preview-postgres:5432/yawp_pr_142');
  });

  test('rejects unsafe pull request numbers', () => {
    expect(() =>
      buildPreviewForgeEnv({
        prNumber: '../142',
        domain: 'preview.yawp.school',
      }),
    ).toThrow('PR_NUMBER must be a positive integer');
  });

  test('honors an explicit source directory for local and rsync deploys', () => {
    const env = buildPreviewForgeEnv({
      prNumber: '142',
      domain: 'preview.yawp.school',
      sourceDir: '/tmp/source-checkout',
    });

    expect(env.sourceDir).toBe('/tmp/source-checkout');
  });

  test('can publish HTTP URLs for temporary sslip.io hosts without certificates', () => {
    const env = buildPreviewForgeEnv({
      prNumber: '142',
      domain: '54-243-7-236.sslip.io',
      tls: false,
    });

    expect(env.url).toBe('http://pr-142.54-243-7-236.sslip.io');
  });

  test('rejects unsupported runtimes', () => {
    expect(() =>
      buildPreviewForgeEnv({
        prNumber: '142',
        domain: 'preview.yawp.school',
        runtime: 'apprunner',
      }),
    ).toThrow('PREVIEW_FORGE_RUNTIME must be fast or production');
  });
});
