import { describe, expect, test } from 'bun:test';
import { renderPreviewCompose } from './render-compose.mjs';

describe('renderPreviewCompose', () => {
  test('renders the fast full-stack preview runtime by default', () => {
    const compose = renderPreviewCompose({
      prNumber: '142',
      domain: 'preview.yawp.school',
      sourceDir: '/srv/yawp-preview-forge/sources/pr-142',
    });

    expect(compose).toContain('services:');
    expect(compose).toContain('postgres:');
    expect(compose).toContain('image: postgres:16');
    expect(compose).toContain('toolbox:');
    expect(compose).toContain('image: oven/bun:1.3.1');
    expect(compose).toContain('yawp-pr-142-node-modules');
    expect(compose).toContain('rm -rf services/web-app/.react-router services/web-app/.vite');
    expect(compose).toContain('cd services/web-app && bun run dev -- --host 0.0.0.0 --port 8080');
    expect(compose).not.toContain('bun run --cwd services/web-app dev');
    expect(compose).toContain('web:');
    expect(compose).toContain('PORT: "8080"');
    expect(compose).not.toContain('target: production');
    expect(compose).toContain('traefik.enable=true');
    expect(compose).toContain('Host(`pr-142.preview.yawp.school`)');
    expect(compose).toContain('yawp-pr-142-postgres-data');
    expect(compose).not.toContain('apprunner');
    expect(compose).not.toContain('terraform');
    expect(compose).not.toContain('docker push');
  });

  test('still supports production-image previews when explicitly requested', () => {
    const compose = renderPreviewCompose({
      prNumber: '142',
      domain: 'preview.yawp.school',
      sourceDir: '/srv/yawp-preview-forge/sources/pr-142',
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
      sourceDir: '/srv/yawp-preview-forge/sources/pr-142',
    });

    expect(compose).toContain('traefik.docker.network=preview-forge');
  });
});
