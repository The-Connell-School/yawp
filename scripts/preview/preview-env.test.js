import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildPreviewEnv,
  requirePreviewAccessSecret,
  requirePreviewAccessSeats,
  requirePreviewAccessCodes,
  requirePreviewSessionSecret,
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
    expect(env.databaseUrl).toBe(
      'postgresql://postgres:postgres@preview-postgres:5432/yawp_pr_142'
    );
  });

  test('rejects unsafe pull request numbers', () => {
    expect(() =>
      buildPreviewEnv({
        prNumber: '../142',
        domain: 'preview.yawp.school',
      })
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
    expect(env.databaseUrl).toBe(
      'postgresql://postgres:postgres@preview-postgres:5432/yawp_pr_153'
    );
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
      })
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
      })
    ).toThrow('PREVIEW_DATA_MODE must be seed or production-dump');
  });

  test('accepts one or more memorable access codes', () => {
    expect(requirePreviewAccessCodes('Brave-Otter-4193, calm-panda-8127')).toBe(
      'brave-otter-4193,calm-panda-8127'
    );
  });

  test('fails closed when access codes are missing or malformed', () => {
    expect(() => requirePreviewAccessCodes('')).toThrow(
      'PREVIEW_ACCESS_CODES is required'
    );
    expect(() => requirePreviewAccessCodes('shared password')).toThrow(
      'PREVIEW_ACCESS_CODES must contain two-word, four-digit codes'
    );
  });

  test('requires a strong cookie signing secret', () => {
    expect(
      requirePreviewSessionSecret('a-preview-session-secret-over-32-chars')
    ).toBe('a-preview-session-secret-over-32-chars');
    expect(() => requirePreviewSessionSecret('')).toThrow(
      'PREVIEW_SESSION_SECRET is required'
    );
    expect(() => requirePreviewSessionSecret('too-short')).toThrow(
      'PREVIEW_SESSION_SECRET must be at least 32 characters'
    );
  });

  test('validates a one-code-per-seat map', () => {
    const configured = requirePreviewAccessSeats(
      JSON.stringify([
        {
          code: 'Brave-Otter-4193',
          organizationId: 'local-dev-org',
          label: 'Brian Connell',
        },
        {
          code: 'calm-panda-8127',
          organizationId: 'preview-seat-2',
          label: 'Bryant Brock',
        },
      ])
    );

    expect(JSON.parse(configured)).toEqual([
      {
        code: 'brave-otter-4193',
        organizationId: 'local-dev-org',
        label: 'Brian Connell',
      },
      {
        code: 'calm-panda-8127',
        organizationId: 'preview-seat-2',
        label: 'Bryant Brock',
      },
    ]);
    expect(() => requirePreviewAccessSeats('[]')).toThrow(
      'PREVIEW_ACCESS_SEATS is required'
    );
    expect(() =>
      requirePreviewAccessSeats(
        JSON.stringify([
          {
            code: 'brave-otter-4193',
            organizationId: 'local-dev-org',
            label: 'Brian Connell',
          },
          {
            code: 'brave-otter-4193',
            organizationId: 'preview-seat-2',
            label: 'Bryant Brock',
          },
        ])
      )
    ).toThrow('unique code and organization');
  });

  test('requires an independent strong access-cookie secret', () => {
    expect(
      requirePreviewAccessSecret('a-preview-access-secret-over-32-chars')
    ).toBe('a-preview-access-secret-over-32-chars');
    expect(() => requirePreviewAccessSecret('')).toThrow(
      'PREVIEW_ACCESS_SECRET is required'
    );
    expect(() => requirePreviewAccessSecret('too-short')).toThrow(
      'PREVIEW_ACCESS_SECRET must be at least 32 characters'
    );
  });

  test('threads app access codes without transitional transport auth', () => {
    const workflow = readFileSync(
      new URL(
        '../../.github/workflows/preview-environments.yml',
        import.meta.url
      ),
      'utf8'
    );
    const deploy = readFileSync(
      new URL('./deploy.sh', import.meta.url),
      'utf8'
    );
    const githubConfig = readFileSync(
      new URL('../github-preview-config.sh', import.meta.url),
      'utf8'
    );

    const deprecatedTransportAuth = ['PREVIEW', 'BASIC', 'AUTH'].join('_');

    expect(workflow).not.toContain(deprecatedTransportAuth);
    expect(workflow).toContain('PREVIEW_ACCESS_CODE=');
    expect(deploy).toContain('access-code.mjs');
    expect(deploy).toContain('oven/bun:1.3.1');
    expect(deploy).toContain('bun scripts/preview/access-code.mjs --seats');
    expect(deploy).toContain('PREVIEW_ACCESS_CODES');
    expect(deploy).toContain('PREVIEW_ACCESS_SEATS');
    expect(deploy).toContain('PREVIEW_ACCESS_SECRET');
    expect(deploy).toContain('PREVIEW_SESSION_SECRET');
    expect(deploy).toContain('PREVIEW_ACCESS_CODE=');
    expect(deploy).toContain('PREVIEW_SEAT_COUNT="${PREVIEW_SEAT_COUNT:-1}"');
    expect(githubConfig).toContain(
      'gh_var PREVIEW_SEAT_COUNT "${PREVIEW_SEAT_COUNT:-1}"'
    );
    expect(deploy).not.toContain(deprecatedTransportAuth);
    expect(deploy).not.toContain('www-authenticate');
    expect(githubConfig).not.toContain(deprecatedTransportAuth);
  });
});

describe('named environments', () => {
  test('a slug override drops the pr- prefix and needs no PR number', () => {
    const env = buildPreviewEnv({
      slug: 'demo',
      domain: 'yawp.school',
      prNumber: undefined,
      runtime: 'production',
    });
    expect(env.slug).toBe('demo');
    expect(env.hostname).toBe('demo.yawp.school');
    expect(env.url).toBe('https://demo.yawp.school');
    expect(env.databaseName).toBe('yawp_demo');
    expect(env.composeProject).toBe('yawp-demo');
    expect(env.runtime).toBe('production');
  });

  test('PR previews are unchanged by the override existing', () => {
    const env = buildPreviewEnv({
      prNumber: '208',
      domain: 'preview.yawp.school',
    });
    expect(env.slug).toBe('pr-208');
    expect(env.hostname).toBe('pr-208.preview.yawp.school');
    expect(env.databaseName).toBe('yawp_pr_208');
  });

  test('a nonsense slug is rejected rather than silently building a bad hostname', () => {
    expect(() =>
      buildPreviewEnv({ slug: 'Demo Box!', domain: 'yawp.school' })
    ).toThrow();
  });

  // The slug override is only honored if the deploy path USES the names derived here.
  // deploy.sh sourced the env and then rebuilt DATABASE_NAME as "yawp_pr_${PR_NUMBER}",
  // which for a named environment (no PR number) silently became the database "yawp_pr_" —
  // silently, because PR_NUMBER is exported as an empty string rather than left unset, so
  // `set -u` never caught it. Naming belongs to preview-env.mjs; assert the consumer does
  // not re-derive it.
  test('deploy.sh does not re-derive names that preview-env.mjs owns', () => {
    const deployScript = readFileSync(
      path.join(import.meta.dir, 'deploy.sh'),
      'utf8'
    );
    const reDerived = deployScript
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .filter((line) =>
        /^\s*(export\s+)?(DATABASE_NAME|SLUG|PREVIEW_DIR|COMPOSE_PROJECT)=/.test(
          line
        )
      );
    expect(reDerived).toEqual([]);
    expect(deployScript).not.toMatch(/yawp_pr_\$\{?PR_NUMBER/);
  });
});
