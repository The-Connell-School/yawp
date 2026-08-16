import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { renderPreviewCompose } from './render-compose.mjs';

const deprecatedPreviewSlug = [
  'preview',
  String.fromCharCode(102, 111, 114, 103, 101),
].join('-');
const previewAccessSeats = JSON.stringify([
  {
    code: 'brave-otter-4193',
    organizationId: 'local-dev-org',
    label: 'Master',
  },
]);
const previewSessionSecret = 'test-preview-session-secret-32-bytes';
const previewAccessSecret = 'test-preview-access-secret-32-bytes';

function renderCompose(overrides = {}) {
  return renderPreviewCompose({
    prNumber: '142',
    domain: 'preview.yawp.school',
    sourceDir: '/srv/yawp-preview/sources/pr-142',
    accessSeats: previewAccessSeats,
    sessionSecret: previewSessionSecret,
    accessSecret: previewAccessSecret,
    ...overrides,
  });
}

describe('renderPreviewCompose', () => {
  test('renders the fast full-stack preview runtime by default', () => {
    const compose = renderCompose();
    const parsed = Bun.YAML.parse(compose);

    expect(compose).toContain('services:');
    expect(parsed.services.web.healthcheck.test).toEqual([
      'CMD',
      'bun',
      '-e',
      "fetch('http://127.0.0.1:8080/api/healthcheck').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))",
    ]);
    expect(compose).not.toContain('\n  postgres:\n');
    expect(compose).not.toContain('image: postgres:16');
    expect(compose).toContain('toolbox:');
    expect(compose).toContain('image: oven/bun:1.3.1');
    expect(compose).toContain('yawp-pr-142-node-modules');
    expect(compose).not.toContain(
      'rm -rf services/web-app/.react-router services/web-app/.vite'
    );
    expect(compose).toContain(
      'cd services/web-app && bun run dev -- --host 0.0.0.0 --port 8080'
    );
    expect(compose).not.toContain('bun install --ignore-scripts');
    expect(compose).not.toContain('bun prisma generate');
    expect(compose).not.toContain('bun run --cwd services/web-app dev');
    expect(compose).toContain('web:');
    expect(compose).toContain('restart: unless-stopped');
    expect(compose).toContain('healthcheck:');
    expect(compose).toContain('/api/healthcheck');
    expect(compose).toContain('PORT: "8080"');
    expect(compose).toContain(
      'DATABASE_URL: "postgresql://postgres:postgres@preview-postgres:5432/yawp_pr_142"'
    );
    expect(compose).toContain('AWS_EC2_METADATA_DISABLED: "true"');
    expect(compose).toContain('YAWP_ENVIRONMENT: "preview"');
    expect(compose).toContain('AI_MODEL: "claude-sonnet-4-6"');
    expect(compose).not.toContain('target: production');
    expect(compose).toContain('traefik.enable=true');
    expect(compose).toContain('Host(`pr-142.preview.yawp.school`)');
    expect(compose).not.toContain('yawp-pr-142-postgres-data');
    expect(compose).not.toContain('apprunner');
    expect(compose).not.toContain('terraform');
    expect(compose).not.toContain('docker push');
  });

  test('still supports production-image previews when explicitly requested', () => {
    const compose = renderCompose({
      runtime: 'production',
    });

    expect(compose).toContain('dockerfile: services/web-app/Dockerfile');
    expect(compose).toContain('target: deps');
    expect(compose).toContain('target: production');
  });

  test('pins Traefik to the shared preview network', () => {
    const compose = renderCompose();

    expect(compose).toContain('traefik.docker.network=preview');
    expect(compose).not.toContain(deprecatedPreviewSlug);
  });

  test('leaves running preview traffic independent of the wake service', () => {
    const compose = renderCompose();

    expect(compose).not.toContain('basicauth');
    expect(compose).not.toContain('.middlewares=');
  });

  test('contains no transitional transport auth references', () => {
    const source = readFileSync(
      new URL('./render-compose.mjs', import.meta.url),
      'utf8'
    );
    const deprecatedTransportAuth = ['PREVIEW', 'BASIC', 'AUTH'].join('_');
    const compose = renderCompose();

    expect(source).not.toContain(deprecatedTransportAuth);
    expect(compose).not.toContain('basicauth');
    expect(compose).not.toContain('preview-wake-request@file');
  });

  // PREVIEW_ACCESS_GATE is the same switch read by the root route middleware. Requiring
  // codes and a signing secret in this render keeps role-swap coupled to an enforceable
  // app gate instead of trusting a separate deployment claim.
  test('the access-gate flag ships with codes and a signing secret', () => {
    const compose = renderCompose();

    expect(compose).toContain('PREVIEW_ACCESS_GATE: "on"');
    expect(compose).toContain('PREVIEW_ACCESS_SEATS:');
    expect(compose).toContain(
      'PREVIEW_ACCESS_SECRET: "test-preview-access-secret-32-bytes"'
    );
    expect(compose).toContain('PREVIEW_SEAT_COUNT: "1"');
    expect(compose).toContain(
      'SESSION_SECRET: "test-preview-session-secret-32-bytes"'
    );
  });

  test('fails closed without access codes', () => {
    expect(() =>
      renderPreviewCompose({
        prNumber: '142',
        domain: 'preview.yawp.school',
        sourceDir: '/srv/yawp-preview/sources/pr-142',
        accessSeats: '',
        sessionSecret: previewSessionSecret,
        accessSecret: previewAccessSecret,
      })
    ).toThrow('PREVIEW_ACCESS_SEATS is required');
  });

  test('requires a non-default signing secret', () => {
    expect(() =>
      renderPreviewCompose({
        prNumber: '142',
        domain: 'preview.yawp.school',
        sourceDir: '/srv/yawp-preview/sources/pr-142',
        accessSeats: previewAccessSeats,
        sessionSecret: '',
        accessSecret: previewAccessSecret,
      })
    ).toThrow('PREVIEW_SESSION_SECRET is required');
  });

  test('requires a dedicated preview access secret', () => {
    expect(() =>
      renderPreviewCompose({
        prNumber: '142',
        domain: 'preview.yawp.school',
        sourceDir: '/srv/yawp-preview/sources/pr-142',
        accessSeats: previewAccessSeats,
        sessionSecret: previewSessionSecret,
        accessSecret: '',
      })
    ).toThrow('PREVIEW_ACCESS_SECRET is required');
  });

  test('passes preview Anthropic credentials into app containers', () => {
    const previousAnthropicKey = process.env.PREVIEW_ANTHROPIC_API_KEY;
    const previousModel = process.env.PREVIEW_AI_MODEL;
    process.env.PREVIEW_ANTHROPIC_API_KEY = 'anthropic-preview-key';
    process.env.PREVIEW_AI_MODEL = 'claude-opus-test';

    try {
      const compose = renderCompose();

      expect(compose).toContain('ANTHROPIC_API_KEY: "anthropic-preview-key"');
      expect(compose).toContain('AI_MODEL: "claude-opus-test"');
    } finally {
      if (previousAnthropicKey === undefined) {
        delete process.env.PREVIEW_ANTHROPIC_API_KEY;
      } else {
        process.env.PREVIEW_ANTHROPIC_API_KEY = previousAnthropicKey;
      }
      if (previousModel === undefined) {
        delete process.env.PREVIEW_AI_MODEL;
      } else {
        process.env.PREVIEW_AI_MODEL = previousModel;
      }
    }
  });
});
