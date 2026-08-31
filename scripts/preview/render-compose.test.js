import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
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
const previewMasterAccessCode = 'yawp-rocks';
const previewDatabasePassword = 'test-preview-database-password-0001';

function renderCompose(overrides = {}) {
  return renderPreviewCompose({
    prNumber: '142',
    domain: 'preview.yawp.school',
    sourceDir: '/srv/yawp-preview/sources/pr-142',
    accessSeats: previewAccessSeats,
    sessionSecret: previewSessionSecret,
    accessSecret: previewAccessSecret,
    masterAccessCode: previewMasterAccessCode,
    masterOrgGateEnabled: true,
    databasePassword: previewDatabasePassword,
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
      `DATABASE_URL: "postgresql://yawp_pr_142_app:${previewDatabasePassword}@preview-postgres:5432/yawp_pr_142"`
    );
    expect(compose).toContain('AWS_EC2_METADATA_DISABLED: "true"');
    expect(compose).toContain('BLACKBOARD_LTI_MOCK_URL: "http://blackboard-lti-mock:9473"');
    expect(compose).toContain('blackboard-lti-mock:');
    expect(compose).toContain('bun scripts/blackboard-lti-mock/server.mjs');
    expect(compose).toContain('BLACKBOARD_LTI_MOCK_ENABLED: "true"');
    expect(compose).toContain('BLACKBOARD_LTI_MOCK_ISSUER: "https://blackboard.com"');
    expect(compose).toContain('AI_MODEL: "claude-sonnet-4-6"');
    expect(compose).not.toContain('target: production');
    expect(compose).not.toContain('traefik');
    expect(compose).not.toContain('yawp-pr-142-postgres-data');
    expect(compose).not.toContain('apprunner');
    expect(compose).not.toContain('terraform');
    expect(compose).not.toContain('docker push');
  });

  test('still supports production-image previews when explicitly requested', () => {
    const compose = renderCompose({
      runtime: 'production',
    });

    expect(compose).toContain('image: "yawp-pr-142-web:current"');
    expect(compose).toContain('dockerfile: services/web-app/Dockerfile');
    expect(compose).toContain('target: deps');
    expect(compose).toContain('target: production');
  });

  test('joins the shared preview network for the host ingress', () => {
    const compose = renderCompose();
    const parsed = Bun.YAML.parse(compose);

    expect(parsed.services.web.networks).toContain('preview');
    expect(parsed.networks.preview.external).toBe(true);
    expect(compose).not.toContain('traefik');
    expect(compose).not.toContain(deprecatedPreviewSlug);
  });

  test('retains Traefik labels for the separately hosted demo environment', () => {
    const compose = renderCompose({ prNumber: undefined, slug: 'demo' });

    expect(compose).toContain('traefik.enable=true');
    expect(compose).toContain('Host(`demo.preview.yawp.school`)');
  });

  test('retains legacy PR labels only until the custom ingress is active', () => {
    const transitional = renderCompose({ customIngressActive: false });
    const migrated = renderCompose({ customIngressActive: true });

    expect(transitional).toContain('traefik.enable=true');
    expect(transitional).toContain('Host(`pr-142.preview.yawp.school`)');
    expect(migrated).not.toContain('traefik');
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
    expect(compose).toContain('PREVIEW_MASTER_ACCESS_CODE: "yawp-rocks"');
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

  test('requires the shared master access code', () => {
    expect(() => renderCompose({ masterAccessCode: '' })).toThrow(
      'PREVIEW_MASTER_ACCESS_CODE is required'
    );
    expect(() =>
      renderCompose({ masterAccessCode: 'shared password' })
    ).toThrow(
      'PREVIEW_MASTER_ACCESS_CODE must be a lowercase hyphenated code between 8 and 64 characters'
    );
  });

  test('keeps pre-feature application refs deployable without the master capability', () => {
    const compose = renderCompose({
      masterOrgGateEnabled: false,
      masterAccessCode: '',
    });

    expect(compose).not.toContain('PREVIEW_MASTER_ACCESS_CODE:');
    expect(compose).toContain('PREVIEW_ACCESS_SEATS:');
  });

  test('requires a non-default signing secret', () => {
    expect(() => renderCompose({ sessionSecret: '' })).toThrow(
      'PREVIEW_SESSION_SECRET is required'
    );
  });

  test('requires a dedicated preview access secret', () => {
    expect(() => renderCompose({ accessSecret: '' })).toThrow(
      'PREVIEW_ACCESS_SECRET is required'
    );
  });

  test('passes preview Anthropic credentials into app containers', () => {
    const previousAnthropicKey = process.env.PREVIEW_ANTHROPIC_API_KEY;
    const previousModel = process.env.PREVIEW_AI_MODEL;
    process.env.PREVIEW_ANTHROPIC_API_KEY = 'anthropic-preview-key';
    process.env.PREVIEW_AI_MODEL = 'claude-opus-test';

    try {
      const compose = renderCompose();

      expect(compose).toContain('YAWP_PREVIEW_AI_MODE: "live"');
      expect(compose).toContain('CLASS_INSIGHT_MOCK_MODE: ""');
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

  test('keeps UA billing disabled unless the preview is explicitly configured', () => {
    const compose = renderCompose();

    expect(compose).toContain('UA_STUDENT_BILLING_ENABLED: "false"');
    expect(compose).not.toContain('STRIPE_SECRET_KEY:');
    expect(compose).not.toContain('STRIPE_WEBHOOK_SECRET:');
  });

  test('passes a complete Stripe sandbox configuration to the preview app', () => {
    const names = [
      'PREVIEW_UA_STUDENT_BILLING_ENABLED',
      'PREVIEW_UA_ORGANIZATION_ID',
      'PREVIEW_STRIPE_SECRET_KEY',
      'PREVIEW_STRIPE_WEBHOOK_SECRET',
      'PREVIEW_STRIPE_UA_2026_PRICE_ID',
      'PREVIEW_STRIPE_UA_EXISTING_SUBSCRIPTION_PRICE_IDS',
    ];
    const previous = Object.fromEntries(
      names.map((name) => [name, process.env[name]])
    );
    Object.assign(process.env, {
      PREVIEW_UA_STUDENT_BILLING_ENABLED: 'true',
      PREVIEW_UA_ORGANIZATION_ID: 'university-of-alabama-preview',
      PREVIEW_STRIPE_SECRET_KEY: 'rk_test_preview',
      PREVIEW_STRIPE_WEBHOOK_SECRET: 'whsec_preview',
      PREVIEW_STRIPE_UA_2026_PRICE_ID: 'price_ua_2026',
      PREVIEW_STRIPE_UA_EXISTING_SUBSCRIPTION_PRICE_IDS: 'price_legacy',
    });

    try {
      const compose = renderCompose();

      expect(compose).toContain('UA_STUDENT_BILLING_ENABLED: "true"');
      expect(compose).toContain(
        'UA_ORGANIZATION_ID: "university-of-alabama-preview"'
      );
      expect(compose).toContain('STRIPE_SECRET_KEY: "rk_test_preview"');
      expect(compose).toContain('STRIPE_WEBHOOK_SECRET: "whsec_preview"');
      expect(compose).toContain(
        'STRIPE_UA_2026_PRICE_ID: "price_ua_2026"'
      );
      expect(compose).toContain(
        'STRIPE_UA_EXISTING_SUBSCRIPTION_PRICE_IDS: "price_legacy"'
      );
      expect(compose).toContain(
        'YAWP_APP_ORIGIN: "https://pr-142.preview.yawp.school"'
      );
    } finally {
      for (const name of names) {
        if (previous[name] === undefined) delete process.env[name];
        else process.env[name] = previous[name];
      }
    }
  });

  test('fails closed when preview billing is only partly configured', () => {
    const previousEnabled = process.env.PREVIEW_UA_STUDENT_BILLING_ENABLED;
    process.env.PREVIEW_UA_STUDENT_BILLING_ENABLED = 'true';
    try {
      expect(() => renderCompose()).toThrow(
        'PREVIEW_UA_ORGANIZATION_ID is required'
      );
    } finally {
      if (previousEnabled === undefined)
        delete process.env.PREVIEW_UA_STUDENT_BILLING_ENABLED;
      else
        process.env.PREVIEW_UA_STUDENT_BILLING_ENABLED = previousEnabled;
    }
  });

  test('keeps an explicit emergency AI-disabled mode without provider credentials', () => {
    const previousAnthropicKey = process.env.PREVIEW_ANTHROPIC_API_KEY;
    process.env.PREVIEW_ANTHROPIC_API_KEY = 'shared-provider-key';
    try {
      const compose = renderCompose({ aiMode: 'disabled' });
      expect(compose).toContain('YAWP_PREVIEW_AI_MODE: "disabled"');
      expect(compose).toContain('CLASS_INSIGHT_MOCK_MODE: "fixture"');
      expect(compose).toContain('ANTHROPIC_API_KEY: ""');
      expect(compose).not.toContain('shared-provider-key');
    } finally {
      if (previousAnthropicKey === undefined)
        delete process.env.PREVIEW_ANTHROPIC_API_KEY;
      else process.env.PREVIEW_ANTHROPIC_API_KEY = previousAnthropicKey;
    }
  });

  // The studio variables are an assertion that the target holds demo data, so
  // they are emitted only when the previewed source actually contains the
  // studio package AND the preview runs on seeded data. Shipping this control
  // plane ahead of the studio itself must change nothing for studio-less PRs.
  describe('marketing studio opt-in', () => {
    const { mkdtempSync, mkdirSync, rmSync } = require('node:fs');
    const { tmpdir } = require('node:os');
    const { join } = require('node:path');

    let sourceWithStudio;
    beforeAll(() => {
      sourceWithStudio = mkdtempSync(join(tmpdir(), 'yawp-compose-'));
      mkdirSync(join(sourceWithStudio, 'packages/marketing-media'), {
        recursive: true,
      });
    });
    afterAll(() => {
      rmSync(sourceWithStudio, { recursive: true, force: true });
    });

    test('a source without the studio package gets no studio variables', () => {
      const compose = renderCompose();

      expect(compose).not.toContain('MARKETING_STUDIO_ENABLED');
      expect(compose).not.toContain('renderer:');
    });

    test('a seed preview of studio-bearing source enables the studio pointed at itself', () => {
      const compose = renderCompose({ sourceDir: sourceWithStudio });

      expect(compose).toContain('MARKETING_STUDIO_ENABLED: "on"');
      expect(compose).toContain(
        'MARKETING_RENDER_TARGET_URL: "https://pr-142.preview.yawp.school"'
      );
      expect(compose).toContain('MARKETING_RENDER_TARGET_IS_DEMO: "confirmed"');
    });

    test('a seed preview of studio-bearing source runs a renderer filming the gated https preview', () => {
      const compose = renderCompose({ sourceDir: sourceWithStudio });

      expect(compose).toContain('renderer:');
      expect(compose).toContain('"pr-142.preview.yawp.school:host-gateway"');
      // Reuses the first configured seat: a renderer-only seat would need its
      // own organization, which the seed data never creates.
      expect(compose).toContain(
        'MARKETING_RENDERER_ACCESS_CODE: "brave-otter-4193"'
      );
      expect(compose).toContain('MARKETING_MEDIA_STORAGE: "disk"');
      expect(compose).toContain('MARKETING_MEDIA_DIR: "/media"');
      expect(compose).toContain('yawp-pr-142-media:/media');
      expect(compose).toContain('marketing-renderer start');
      // Playwright 1.60 images ship the browser as chrome-linux64 where 1.49
      // shipped chrome-linux; a narrow glob silently matches nothing and the
      // renderer falls back to the headless shell.
      expect(compose).toContain('chromium-*/chrome-linux*/chrome');
    });

    // The renderer image and the installed playwright library resolve browsers
    // by revision paths baked into the image, so they must move together.
    test('renderer image ships browsers for the installed playwright version', () => {
      const { version } = require('playwright-core/package.json');
      expect(renderCompose({ sourceDir: sourceWithStudio })).toContain(
        `image: mcr.microsoft.com/playwright:v${version}-jammy`
      );
    });

    test('production-dump previews never claim to be a marketing demo target', () => {
      const compose = renderCompose({
        sourceDir: sourceWithStudio,
        dataMode: 'production-dump',
      });

      expect(compose).not.toContain('MARKETING_STUDIO_ENABLED');
      expect(compose).not.toContain('MARKETING_RENDER_TARGET_IS_DEMO');
      expect(compose).not.toContain('renderer:');
    });
  });
});
