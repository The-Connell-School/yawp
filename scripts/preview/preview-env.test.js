import { describe, expect, test } from 'bun:test';
import { buildPreviewEnv } from './preview-env.mjs';

describe('buildPreviewEnv', () => {
  test('derives stable PR-scoped names and URLs', () => {
    const env = buildPreviewEnv({
      prNumber: '142',
      domain: 'preview.yawp.school',
      root: '/srv/yawp-preview',
    });

    expect(env.slug).toBe('pr-142');
    expect(env.composeProject).toBe('yawp-pr-142');
    expect(env.hostname).toBe('pr-142.preview.yawp.school');
    expect(env.url).toBe('https://pr-142.preview.yawp.school');
    expect(env.runtime).toBe('fast');
    expect(env.previewDir).toBe('/srv/yawp-preview/previews/pr-142');
    expect(env.sourceDir).toBe('/srv/yawp-preview/sources/pr-142');
    expect(env.databaseName).toBe('yawp_pr_142');
    expect(env.databaseHost).toBe('preview-postgres');
    expect(env.databaseUrl).toBe('postgresql://postgres:postgres@preview-postgres:5432/yawp_pr_142');
  });

  test('rejects unsafe pull request numbers', () => {
    expect(() =>
      buildPreviewEnv({
        prNumber: '../142',
        domain: 'preview.yawp.school',
      }),
    ).toThrow('PR_NUMBER must be a positive integer');
  });

  test('honors an explicit source directory for local and rsync deploys', () => {
    const env = buildPreviewEnv({
      prNumber: '142',
      domain: 'preview.yawp.school',
      sourceDir: '/tmp/source-checkout',
    });

    expect(env.sourceDir).toBe('/tmp/source-checkout');
  });

  test('uses a shared Postgres host with a PR-scoped database by default', () => {
    const env = buildPreviewEnv({
      prNumber: '153',
      domain: 'preview.yawp.school',
    });

    expect(env.databaseName).toBe('yawp_pr_153');
    expect(env.databaseHost).toBe('preview-postgres');
    expect(env.databaseUrl).toBe('postgresql://postgres:postgres@preview-postgres:5432/yawp_pr_153');
  });

  test('can publish HTTP URLs for temporary sslip.io hosts without certificates', () => {
    const env = buildPreviewEnv({
      prNumber: '142',
      domain: '54-243-7-236.sslip.io',
      tls: false,
    });

    expect(env.url).toBe('http://pr-142.54-243-7-236.sslip.io');
  });

  test('rejects unsupported runtimes', () => {
    expect(() =>
      buildPreviewEnv({
        prNumber: '142',
        domain: 'preview.yawp.school',
        runtime: 'apprunner',
      }),
    ).toThrow('PREVIEW_RUNTIME must be fast or production');
  });
});
