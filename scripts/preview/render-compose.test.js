import { describe, expect, test } from 'bun:test';
import { createRequire } from 'node:module';
import { renderPreviewCompose } from './render-compose.mjs';

const require = createRequire(import.meta.url);

const deprecatedPreviewSlug = [
  'preview',
  String.fromCharCode(102, 111, 114, 103, 101),
].join('-');
const previewBasicAuth = 'preview-admin:$apr1$salt$hash';

function renderCompose(overrides = {}) {
  return renderPreviewCompose({
    prNumber: '142',
    domain: 'preview.yawp.school',
    sourceDir: '/srv/yawp-preview/sources/pr-142',
    basicAuth: previewBasicAuth,
    ...overrides,
  });
}

describe('renderPreviewCompose', () => {
  test('renders the fast full-stack preview runtime by default', () => {
    const compose = renderCompose();

    expect(compose).toContain('services:');
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

  test('protects both Traefik routers with escaped shared basic auth', () => {
    const compose = renderCompose();

    expect(compose).toContain(
      'traefik.http.middlewares.yawp-pr-142-auth.basicauth.users=preview-admin:$$apr1$$salt$$hash'
    );
    expect(compose).toContain(
      'traefik.http.routers.yawp-pr-142-http.middlewares=yawp-pr-142-auth'
    );
    expect(compose).toContain(
      'traefik.http.routers.yawp-pr-142-https.middlewares=yawp-pr-142-auth'
    );
    expect(compose).not.toContain(
      'basicauth.users=preview-admin:$apr1$salt$hash'
    );
  });

  // The app trusts PREVIEW_ACCESS_GATE to decide whether role-swap may be exposed, so
  // the flag is only safe if it cannot be emitted without the middleware that justifies
  // it. Both come from this one render, and this test is what keeps them together: if
  // anyone ever makes the basicauth labels conditional, the flag must become conditional
  // in the same edit or this fails.
  test('the access-gate flag ships with the middleware that earns it', () => {
    const compose = renderCompose();

    expect(compose).toContain('PREVIEW_ACCESS_GATE: "on"');
    expect(compose).toContain('basicauth.users=');

    const gateIndex = compose.indexOf('PREVIEW_ACCESS_GATE');
    const authIndex = compose.indexOf('basicauth.users=');
    expect(gateIndex).toBeGreaterThan(-1);
    expect(authIndex).toBeGreaterThan(-1);
  });

  // The Marketing Studio films its target and publishes the result, so the same rule
  // as dev-login applies: seeded data only, and the "confirmed" statement may only be
  // emitted for a target this render can vouch for — the preview itself.
  test('seed previews enable the Marketing Studio pointed at themselves', () => {
    const compose = renderCompose();

    expect(compose).toContain('MARKETING_STUDIO_ENABLED: "on"');
    expect(compose).toContain(
      'MARKETING_RENDER_TARGET_URL: "https://pr-142.preview.yawp.school"'
    );
    expect(compose).toContain('MARKETING_RENDER_TARGET_IS_DEMO: "confirmed"');
  });

  // The renderer stores outputs on a volume the app serves, so seeded previews
  // produce their own marketing media with no AWS anywhere. It films the
  // public https hostname, not the internal http route: newer chromium
  // refuses the Secure session cookie over plain http to a non-localhost
  // host, and every page filmed that way was the logged-out landing page.
  // host-gateway makes the hostname resolve to this host's Traefik, and the
  // worker carries the shared gate credential like any reviewer's browser.
  test('seed previews run a renderer filming the gated https preview itself', () => {
    const previous = process.env.PREVIEW_BASIC_AUTH_PASSWORD;
    process.env.PREVIEW_BASIC_AUTH_PASSWORD = 'sw0rdf$sh';
    try {
      const compose = renderCompose();

      expect(compose).toContain('renderer:');
      expect(compose).toContain(
        'MARKETING_RENDER_TARGET_URL: "https://pr-142.preview.yawp.school"'
      );
      expect(compose).toContain(
        '"pr-142.preview.yawp.school:host-gateway"'
      );
      expect(compose).toContain(
        'MARKETING_RENDERER_BASIC_AUTH: "preview-admin:sw0rdf$$sh"'
      );
      expect(compose).toContain('MARKETING_MEDIA_STORAGE: "disk"');
      expect(compose).toContain('MARKETING_MEDIA_DIR: "/media"');
      expect(compose).toContain('yawp-pr-142-media:/media');
      expect(compose).toContain('marketing-renderer start');
    } finally {
      if (previous === undefined) {
        delete process.env.PREVIEW_BASIC_AUTH_PASSWORD;
      } else {
        process.env.PREVIEW_BASIC_AUTH_PASSWORD = previous;
      }
    }
    // Playwright 1.60 images ship the browser as chrome-linux64 where 1.49
    // shipped chrome-linux; the narrow glob silently matched nothing and the
    // renderer fell back to the headless shell, which segfaulted on the host.
    expect(compose).toContain('chromium-*/chrome-linux*/chrome');
  });

  // The library resolves browsers and its recording ffmpeg by revision paths
  // baked into the image, so image tag and installed library version must move
  // together. They drifted once — playwright's ^ range floated to 1.60 while
  // the image stayed 1.49 — and every clip render died at newPage with
  // "Executable doesn't exist". This reads the actually-installed version, so
  // a future playwright bump fails here until the image tag is bumped with it.
  test('renderer image ships browsers for the installed playwright version', () => {
    const { version } = require('playwright-core/package.json');
    expect(renderCompose()).toContain(
      `image: mcr.microsoft.com/playwright:v${version}-jammy`
    );
  });

  test('production-runtime and production-dump previews run no renderer', () => {
    expect(renderCompose({ runtime: 'production' })).not.toContain('renderer:');
    expect(renderCompose({ dataMode: 'production-dump' })).not.toContain(
      'renderer:'
    );
    expect(renderCompose({ dataMode: 'production-dump' })).not.toContain(
      '-media'
    );
  });

  test('production-dump previews never claim to be a marketing demo target', () => {
    const compose = renderCompose({ dataMode: 'production-dump' });

    expect(compose).not.toContain('MARKETING_STUDIO_ENABLED');
    expect(compose).not.toContain('MARKETING_RENDER_TARGET_IS_DEMO');
  });

  test('requires a basic-auth credential before rendering a preview', () => {
    expect(() =>
      renderPreviewCompose({
        prNumber: '142',
        domain: 'preview.yawp.school',
        sourceDir: '/srv/yawp-preview/sources/pr-142',
        basicAuth: '',
      })
    ).toThrow('PREVIEW_BASIC_AUTH is required');
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
