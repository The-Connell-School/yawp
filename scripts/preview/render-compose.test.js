import { describe, expect, test } from 'bun:test';
import { renderPreviewCompose } from './render-compose.mjs';

const deprecatedPreviewSlug = ['preview', String.fromCharCode(102, 111, 114, 103, 101)].join('-');

describe('renderPreviewCompose', () => {
  test('renders the fast full-stack preview runtime by default', () => {
    const compose = renderPreviewCompose({
      prNumber: '142',
      domain: 'preview.yawp.school',
      sourceDir: '/srv/yawp-preview/sources/pr-142',
    });

    expect(compose).toContain('services:');
    expect(compose).not.toContain('\n  postgres:\n');
    expect(compose).not.toContain('image: postgres:16');
    expect(compose).toContain('toolbox:');
    expect(compose).toContain('image: oven/bun:1.3.1');
    expect(compose).toContain('yawp-pr-142-node-modules');
    expect(compose).not.toContain('rm -rf services/web-app/.react-router services/web-app/.vite');
    expect(compose).toContain('cd services/web-app && bun run dev -- --host 0.0.0.0 --port 8080');
    expect(compose).not.toContain('bun install --ignore-scripts');
    expect(compose).not.toContain('bun prisma generate');
    expect(compose).not.toContain('bun run --cwd services/web-app dev');
    expect(compose).toContain('web:');
    expect(compose).toContain('PORT: "8080"');
    expect(compose).toContain('DATABASE_URL: "postgresql://postgres:postgres@preview-postgres:5432/yawp_pr_142"');
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
    const compose = renderPreviewCompose({
      prNumber: '142',
      domain: 'preview.yawp.school',
      sourceDir: '/srv/yawp-preview/sources/pr-142',
      runtime: 'production',
    });

    expect(compose).toContain('dockerfile: services/web-app/Dockerfile');
    expect(compose).toContain('target: deps');
    expect(compose).toContain('target: production');
  });

  test('pins Traefik to the shared preview network', () => {
    const compose = renderPreviewCompose({
      prNumber: '142',
      domain: 'preview.yawp.school',
      sourceDir: '/srv/yawp-preview/sources/pr-142',
    });

    expect(compose).toContain('traefik.docker.network=preview');
    expect(compose).not.toContain(deprecatedPreviewSlug);
  });

  test('passes preview Anthropic credentials into app containers', () => {
    const previousAnthropicKey = process.env.PREVIEW_ANTHROPIC_API_KEY;
    const previousModel = process.env.PREVIEW_AI_MODEL;
    process.env.PREVIEW_ANTHROPIC_API_KEY = 'anthropic-preview-key';
    process.env.PREVIEW_AI_MODEL = 'claude-opus-test';

    try {
      const compose = renderPreviewCompose({
        prNumber: '142',
        domain: 'preview.yawp.school',
        sourceDir: '/srv/yawp-preview/sources/pr-142',
      });

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
