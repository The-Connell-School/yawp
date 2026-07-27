import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  buildPreviewEnv,
  requirePreviewBasicAuth,
} from './preview-env.mjs';

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
    expect(env.dataMode).toBe('seed');
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

  test('still supports production dump data mode when explicitly requested', () => {
    const env = buildPreviewEnv({
      prNumber: '142',
      domain: 'preview.yawp.school',
      dataMode: 'production-dump',
    });

    expect(env.dataMode).toBe('production-dump');
  });

  test('rejects unsupported data modes', () => {
    expect(() =>
      buildPreviewEnv({
        prNumber: '142',
        domain: 'preview.yawp.school',
        dataMode: 'prod',
      }),
    ).toThrow('PREVIEW_DATA_MODE must be seed or production-dump');
  });

  test('accepts one htpasswd-format preview credential', () => {
    expect(
      requirePreviewBasicAuth('preview-admin:$apr1$salt$hash'),
    ).toBe('preview-admin:$apr1$salt$hash');
  });

  test('fails closed when the preview credential is missing or malformed', () => {
    expect(() => requirePreviewBasicAuth('')).toThrow(
      'PREVIEW_BASIC_AUTH is required',
    );
    expect(() => requirePreviewBasicAuth('preview-admin:plaintext')).toThrow(
      'PREVIEW_BASIC_AUTH must be a single htpasswd-format credential',
    );
  });

  test('threads basic-auth secrets through the preview workflow and deploy', () => {
    const workflow = readFileSync(
      new URL('../../.github/workflows/preview-environments.yml', import.meta.url),
      'utf8',
    );
    const deploy = readFileSync(new URL('./deploy.sh', import.meta.url), 'utf8');
    const githubConfig = readFileSync(
      new URL('../github-preview-config.sh', import.meta.url),
      'utf8',
    );

    expect(workflow).toContain(
      'PREVIEW_BASIC_AUTH: ${{ secrets.PREVIEW_BASIC_AUTH }}',
    );
    expect(workflow).toContain(
      'PREVIEW_BASIC_AUTH_PASSWORD: ${{ secrets.PREVIEW_BASIC_AUTH_PASSWORD }}',
    );
    expect(workflow).toContain(
      '"PREVIEW_BASIC_AUTH=$(shell_quote "$PREVIEW_BASIC_AUTH")"',
    );
    expect(workflow).toContain(
      '"PREVIEW_BASIC_AUTH_PASSWORD=$(shell_quote "$PREVIEW_BASIC_AUTH_PASSWORD")"',
    );
    expect(deploy).toContain('Missing PREVIEW_BASIC_AUTH');
    expect(deploy).toContain('Missing PREVIEW_BASIC_AUTH_PASSWORD');
    expect(deploy).toContain('gate_status');
    expect(deploy).toContain('[[ "$gate_status" != "401" ]]');
    expect(deploy).toContain(
      "grep -qi '^www-authenticate:[[:space:]]*Basic'",
    );
    expect(deploy).toContain('if [[ -z "${DIRECT_PORT:-}" ]]');
    expect(githubConfig).toContain(
      'gh_sec PREVIEW_BASIC_AUTH "$PREVIEW_BASIC_AUTH"',
    );
    expect(githubConfig).toContain(
      'gh_sec PREVIEW_BASIC_AUTH_PASSWORD "$PREVIEW_BASIC_AUTH_PASSWORD"',
    );
  });
});
