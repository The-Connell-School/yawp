import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoInternalApiKeys } from './demo-internal-api-config.mjs';
import {
  buildPreviewEnv,
  requirePreviewAccessSecret,
  requirePreviewMasterAccessCode,
  requirePreviewAccessSeats,
  requirePreviewSessionSecret,
} from './preview-env.mjs';

function q(value) {
  return JSON.stringify(String(value));
}

function optionalEnv(name, fallback = '') {
  return process.env[name] || fallback;
}

// Same shape the Rubric Catalog HTTP layer accepts
// (services/web-app/app/utils/internal-rubric-catalog-http.server.ts). A key it
// would reject is a broken deploy, so refuse it here — and never echo the value.
const MANAGEMENT_SERVICE_KEY_PATTERN = /^[A-Za-z0-9_-]{43,}$/;

function optionalManagementServiceKey(value) {
  if (!value) return '';
  if (!MANAGEMENT_SERVICE_KEY_PATTERN.test(value)) {
    throw new Error(
      'PREVIEW_MANAGEMENT_SERVICE_KEY must be at least 43 characters of A-Z, a-z, 0-9, _ or -'
    );
  }
  return value;
}

/** Comma-separated https origins (no paths) for which a PR preview offers
 * Google sign-in. Anything else fails the render rather than widening it. */
export function googleOriginAllowlist(raw = '') {
  const entries = String(raw).split(',').map((entry) => entry.trim()).filter(Boolean);
  for (const entry of entries) {
    let url;
    try { url = new URL(entry); } catch { url = null; }
    if (!url || url.protocol !== 'https:' || url.origin !== entry) {
      throw new Error('PREVIEW_GOOGLE_OAUTH_ORIGINS must be comma-separated https origins');
    }
  }
  return entries.join(',');
}

export function renderPreviewCompose({
  prNumber = process.env.PR_NUMBER,
  slug = process.env.PREVIEW_SLUG,
  domain = process.env.PREVIEW_DOMAIN,
  root = process.env.PREVIEW_ROOT,
  sourceDir = process.env.SOURCE_DIR,
  directPort = process.env.PREVIEW_DIRECT_PORT,
  enableTls = process.env.PREVIEW_TLS !== 'false',
  runtime = process.env.PREVIEW_RUNTIME || 'fast',
  dataMode = process.env.PREVIEW_DATA_MODE || 'seed',
  unifiedSignOn = process.env.PREVIEW_UNIFIED_SIGN_ON ?? 'true',
  controlDir = process.env.PREVIEW_CONTROL_DIR || dirname(fileURLToPath(import.meta.url)),
  databaseUser = process.env.PREVIEW_DB_USER,
  databasePassword = process.env.PREVIEW_DB_PASSWORD,
  accessSeats = process.env.PREVIEW_ACCESS_SEATS,
  masterAccessCode = process.env.PREVIEW_MASTER_ACCESS_CODE,
  masterOrgGateEnabled = process.env.PREVIEW_MASTER_ORG_GATE_ENABLED === 'true',
  accessSecret = process.env.PREVIEW_ACCESS_SECRET,
  sessionSecret = process.env.PREVIEW_SESSION_SECRET,
  aiMode = process.env.PREVIEW_AI_MODE || 'live',
  managementServiceKey = process.env.PREVIEW_MANAGEMENT_SERVICE_KEY,
  internalApiKeys = process.env.DEMO_INTERNAL_API_KEYS,
  demoTrainingMediaEnabled = process.env.DEMO_TRAINING_MEDIA_ENABLED || 'false',
  customIngressActive = process.env.PREVIEW_CUSTOM_INGRESS_ACTIVE !== 'false',
  demoWebImage = process.env.DEMO_WEB_IMAGE,
  demoToolboxImage = process.env.DEMO_TOOLBOX_IMAGE,
} = {}) {
  if (!['true', 'false'].includes(unifiedSignOn)) {
    throw new Error('PREVIEW_UNIFIED_SIGN_ON must be true or false');
  }
  const previewAccessSeats = requirePreviewAccessSeats(accessSeats);
  const previewMasterAccessCode = masterOrgGateEnabled
    ? requirePreviewMasterAccessCode(masterAccessCode)
    : '';
  const previewAccessSecret = requirePreviewAccessSecret(accessSecret);
  const previewSessionSecret = requirePreviewSessionSecret(sessionSecret);
  const previewManagementServiceKey =
    optionalManagementServiceKey(managementServiceKey);
  if (!['disabled', 'live'].includes(aiMode)) {
    throw new Error('PREVIEW_AI_MODE must be disabled or live');
  }
  const anthropicApiKey =
    aiMode === 'live' ? optionalEnv('PREVIEW_ANTHROPIC_API_KEY') : '';
  const env = buildPreviewEnv({
    prNumber,
    slug,
    domain,
    root,
    sourceDir,
    directPort,
    tls: enableTls,
    runtime,
    dataMode,
    databaseUser,
    databasePassword,
  });
  const demoKeys = demoInternalApiKeys(internalApiKeys);
  if (!['true', 'false'].includes(demoTrainingMediaEnabled)) {
    throw new Error('DEMO_TRAINING_MEDIA_ENABLED must be true or false');
  }
  const demoMedia = demoTrainingMediaEnabled === 'true';
  if (demoMedia && (env.slug !== 'demo' || String(prNumber ?? '').trim())) {
    throw new Error('Demo training media requires the demo target');
  }
  // Only web receives the scoped, expiring credentials. Never expose host IMDS.
  const demoMediaVolume = demoMedia
    ? `\n      - ${q(`${env.root}/training-media-credentials:/run/demo-training-media:ro`)}`
    : '';
  if (demoKeys && (env.slug !== 'demo' || String(prNumber ?? '').trim())) {
    throw new Error('Demo Internal API keys require the demo target');
  }
  const directPortBlock = env.directPort
    ? `\n    ports:\n      - ${q(`127.0.0.1:${env.directPort}:8080`)}`
    : '';
  const routerBase = env.composeProject;
  const hostRule = `Host(\`${env.hostname}\`) || Host(\`${env.uaHostname}\`)`;
  const tlsLabels = enableTls
    ? `\n      - ${q(`traefik.http.routers.${routerBase}-https.rule=${hostRule}`)}\n      - ${q(`traefik.http.routers.${routerBase}-https.entrypoints=websecure`)}\n      - ${q(`traefik.http.routers.${routerBase}-https.tls.certresolver=letsencrypt`)}\n      - ${q(`traefik.http.routers.${routerBase}-https.service=${routerBase}`)}`
    : '';
  const legacyTraefikLabels = (!env.prNumber || !customIngressActive)
    ? `    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=preview"
      - ${q(`traefik.http.routers.${routerBase}-http.rule=${hostRule}`)}
      - ${q(`traefik.http.routers.${routerBase}-http.entrypoints=web`)}
      - ${q(`traefik.http.routers.${routerBase}-http.service=${routerBase}`)}
${tlsLabels}
      - ${q(`traefik.http.services.${routerBase}.loadbalancer.server.port=8080`)}
`
    : '';
  const cookieSecure = enableTls ? '"true"' : '"false"';
  // The Marketing Studio films whatever these variables point at and publishes
  // the result, so they follow the same rule as dev-login: seeded data only. A
  // production-dump preview never gets them — "confirmed" is a statement that
  // the target holds no real student work, and a dump is exactly that work.
  // Seed-mode previews target themselves, the one URL this render can vouch
  // for. The package check makes this control-plane change safe to ship ahead
  // of the studio itself: a preview whose source has no studio code gets no
  // studio variables and no renderer container, so nothing points a worker at
  // an app without the studio's tables.
  const hasMarketingPackage = existsSync(
    join(env.sourceDir, 'packages/marketing-media')
  );
  const rendererEnabled =
    hasMarketingPackage && env.dataMode === 'seed' && env.runtime === 'fast';
  const mediaVolumeMount = rendererEnabled
    ? `\n      - ${env.composeProject}-media:/media`
    : '';
  const mediaVolumeDefinition = rendererEnabled
    ? `\n  ${env.composeProject}-media:`
    : '';
  const marketingStudioEnvironment =
    hasMarketingPackage && env.dataMode === 'seed'
      ? `
      MARKETING_STUDIO_ENABLED: "on"
      MARKETING_RENDER_TARGET_URL: ${q(`${enableTls ? 'https' : 'http'}://${env.hostname}`)}
      MARKETING_RENDER_TARGET_IS_DEMO: "confirmed"${
        rendererEnabled
          ? `
      MARKETING_MEDIA_DIR: "/media"`
          : ''
      }`
      : '';
  // PREVIEW_ACCESS_GATE is consumed by the root route middleware itself. This render
  // cannot emit that enforcement switch without validated seats and its own signing secret,
  // so enabling role-swap necessarily enables the request-boundary gate too.
  const masterAccessEnvironment = masterOrgGateEnabled
    ? `      PREVIEW_MASTER_ACCESS_CODE: ${q(previewMasterAccessCode)}\n`
    : '';
  const uaStudentBillingEnabled =
    optionalEnv('PREVIEW_UA_STUDENT_BILLING_ENABLED', 'false') === 'true';
  const uaStudentBillingEnvironment = uaStudentBillingEnabled
    ? `      UA_STUDENT_BILLING_ENABLED: "true"
      UA_ORGANIZATION_ID: ${q(optionalEnv('PREVIEW_UA_ORGANIZATION_ID'))}
      UA_PARTNER_CODE: ${q(optionalEnv('PREVIEW_UA_PARTNER_CODE'))}
      UA_PARTNER_HOSTNAME: ${q(env.directPort ? '127.0.0.1' : env.uaHostname)}
      STRIPE_SECRET_KEY: ${q(optionalEnv('PREVIEW_STRIPE_SECRET_KEY'))}
      STRIPE_WEBHOOK_SECRET: ${q(optionalEnv('PREVIEW_STRIPE_WEBHOOK_SECRET'))}
      STRIPE_UA_2026_PRICE_ID: ${q(optionalEnv('PREVIEW_STRIPE_UA_2026_PRICE_ID'))}
      STRIPE_UA_EXISTING_SUBSCRIPTION_PRICE_IDS: ${q(optionalEnv('PREVIEW_STRIPE_UA_EXISTING_SUBSCRIPTION_PRICE_IDS'))}
      YAWP_APP_ORIGIN: ${q(env.uaUrl)}
`
    : '      UA_STUDENT_BILLING_ENABLED: "false"\n';

  if (uaStudentBillingEnabled) {
    for (const name of [
      'PREVIEW_UA_ORGANIZATION_ID',
      'PREVIEW_UA_PARTNER_CODE',
      'PREVIEW_STRIPE_SECRET_KEY',
      'PREVIEW_STRIPE_WEBHOOK_SECRET',
      'PREVIEW_STRIPE_UA_2026_PRICE_ID',
    ]) {
      if (!optionalEnv(name)) throw new Error(`${name} is required`);
    }
  }
  const commonEnvironment = `      DATABASE_URL: ${q(env.databaseUrl)}
      DATABASE_SSL_REJECT_UNAUTHORIZED: "false"
      NODE_ENV: ${env.runtime === 'fast' ? 'development' : 'production'}
      YAWP_ENVIRONMENT: "preview"
      MOCK_ADMIN_ENABLED: ${q(env.slug === 'demo' ? 'true' : 'false')}
      PRIMARY_APP_URL: ${q(env.url)}
      PREVIEW_SLUG: ${q(env.slug)}
      TESTER_FEEDBACK_ENABLED: ${q(env.slug === 'demo' ? 'true' : 'false')}
      PREVIEW_DOMAIN: ${q(env.domain)}
      PREVIEW_DATA_MODE: ${q(env.dataMode)}
      PREVIEW_ACCESS_GATE: "on"
      PREVIEW_ACCESS_SEATS: ${q(previewAccessSeats)}
${masterAccessEnvironment}      PREVIEW_ACCESS_SECRET: ${q(previewAccessSecret)}
      PREVIEW_SEAT_COUNT: ${q(optionalEnv('PREVIEW_SEAT_COUNT', '1'))}
      PORT: "8080"
      COOKIE_SECURE: ${cookieSecure}
      AWS_EC2_METADATA_DISABLED: "true"
      SESSION_SECRET: ${q(previewSessionSecret)}
${uaStudentBillingEnvironment}      INTERNAL_COMMAND_TOKEN: ${q(optionalEnv('PREVIEW_INTERNAL_COMMAND_TOKEN', 'preview-internal-token'))}
      HONEYPOT_SECRET: ${q(optionalEnv('PREVIEW_HONEYPOT_SECRET', 'preview-honeypot-secret'))}
      AWS_S3_BUCKET_FOR_VIDEOS: ${q(demoMedia ? 'yawp-demo-training-media-422348803522' : optionalEnv('PREVIEW_AWS_S3_BUCKET_FOR_VIDEOS', 'preview-videos'))}
      AWS_S3_REGION_FOR_VIDEOS: ${q(demoMedia ? 'us-east-1' : optionalEnv('PREVIEW_AWS_S3_REGION_FOR_VIDEOS', 'us-east-1'))}
${env.slug === 'demo' ? '      EMAIL_PROVIDER: "resend"\n' : ''}      RESEND_FROM_EMAIL: ${q(optionalEnv('PREVIEW_RESEND_FROM_EMAIL', 'preview@yawp.local'))}
      RESEND_API_KEY: ${q(optionalEnv('PREVIEW_RESEND_API_KEY', ''))}
      OPENAI_ORGANIZATION_ID: ${q(optionalEnv('PREVIEW_OPENAI_ORGANIZATION_ID'))}
      OPENAI_API_KEY: ${q(optionalEnv('PREVIEW_OPENAI_API_KEY'))}
      YAWP_PREVIEW_AI_MODE: ${q(aiMode)}
      CLASS_INSIGHT_MOCK_MODE: ${q(aiMode === 'disabled' ? 'fixture' : optionalEnv('PREVIEW_CLASS_INSIGHT_MOCK_MODE'))}
      ANTHROPIC_API_KEY: ${q(anthropicApiKey)}
      AI_MODEL: ${q(optionalEnv('PREVIEW_AI_MODEL', 'claude-sonnet-4-6'))}
      BLACKBOARD_LTI_MOCK_URL: "http://blackboard-lti-mock:9473"${marketingStudioEnvironment}`;
  // Only the demo deploy supplies this key (Yawp Internal publishes rubrics to
  // demo through the Rubric Catalog API). It goes to the web app alone; without
  // it those routes 404, which is the right state for every PR preview.
  // Compose expands dollar signs even in quoted YAML. Preserve literal key bytes.
  const webEnvironment = commonEnvironment
    + (demoMedia ? `
      AWS_REGION: "us-east-1"
      AWS_PROFILE: "demo-training-media"
      AWS_CONFIG_FILE: "/run/demo-training-media/config"` : '')
    + `\n      GOOGLE_OAUTH_CLIENT_ID: ${q(optionalEnv('PREVIEW_GOOGLE_OAUTH_CLIENT_ID').replaceAll('$', '$$$$'))}`
    + `\n      GOOGLE_OAUTH_CLIENT_SECRET: ${q(optionalEnv('PREVIEW_GOOGLE_OAUTH_CLIENT_SECRET').replaceAll('$', '$$$$'))}`
    // PR previews share the OAuth client but most of their origins are not
    // registered with Google: offer Google only on allowlisted origins. Demo
    // (no PR number) keeps its current behavior.
    + (env.prNumber
      ? `\n      GOOGLE_OAUTH_REQUIRE_ORIGIN_ALLOWLIST: "true"`
        + `\n      GOOGLE_OAUTH_ORIGIN_ALLOWLIST: ${q(googleOriginAllowlist(optionalEnv('PREVIEW_GOOGLE_OAUTH_ORIGINS')))}`
      : '')
    + (previewManagementServiceKey
      ? `\n      YAWP_MANAGEMENT_SERVICE_KEY: ${q(previewManagementServiceKey)}` : '')
    + (demoKeys
      ? `\n      YAWP_INTERNAL_API_KEYS: ${q(demoKeys.replaceAll('$', '$$$$'))}` : '');
  const fastVolumes = `    volumes:
      - ${q(`${env.sourceDir}:/app`)}
      - ${env.composeProject}-node-modules:/app/node_modules
      - ${env.composeProject}-web-node-modules:/app/services/web-app/node_modules`;
  // Mount reviewed default-branch tooling even when the PR source predates it.
  // This also avoids baking control-plane updates into PR-owned Dockerfiles.
  const toolboxControlVolume = env.prNumber
    ? `      - ${q(`${controlDir}:/preview-control:ro`)}` : '';
  const toolboxFlagEnvironment = env.prNumber
    ? `      PREVIEW_UNIFIED_SIGN_ON: ${q(unifiedSignOn)}` : '';
  const registryImagesConfigured = Boolean(demoWebImage && demoToolboxImage);
  if (demoWebImage && !demoToolboxImage) {
    throw new Error('DEMO_TOOLBOX_IMAGE is required when DEMO_WEB_IMAGE is set');
  }
  if (demoToolboxImage && !demoWebImage) {
    throw new Error('DEMO_WEB_IMAGE is required when DEMO_TOOLBOX_IMAGE is set');
  }
  const productionToolboxBuild = registryImagesConfigured
    ? ''
    : `    build:
      context: ${q(env.sourceDir)}
      dockerfile: services/web-app/Dockerfile
      target: deps
`;
  const toolboxService =
    env.runtime === 'fast'
      ? `  toolbox:
    profiles: ["tools"]
    image: oven/bun:1.4.3
    working_dir: /app
${fastVolumes}
${toolboxControlVolume}
    environment:
${commonEnvironment}
${toolboxFlagEnvironment}
    networks:
      - preview
`
      : `  toolbox:
    profiles: ["tools"]
    image: ${q(registryImagesConfigured ? demoToolboxImage : `${env.composeProject}-toolbox:current`)}
${productionToolboxBuild}${toolboxControlVolume ? `    volumes:
${toolboxControlVolume}` : ''}
    environment:
${commonEnvironment}
${toolboxFlagEnvironment}
    networks:
      - preview
`;
  const webService =
    env.runtime === 'fast'
      ? `  web:
    image: oven/bun:1.4.3
    restart: unless-stopped
    working_dir: /app
    command: bash -lc "cd services/web-app && bun run dev -- --host 0.0.0.0 --port 8080"
${fastVolumes}${mediaVolumeMount}${demoMediaVolume}
    environment:
${webEnvironment}
`
      : `  web:
    image: ${q(registryImagesConfigured ? demoWebImage : `${routerBase}-web:current`)}
${registryImagesConfigured ? '' : `    build:
      context: ${q(env.sourceDir)}
      dockerfile: services/web-app/Dockerfile
      target: production
`}${demoMedia ? `    volumes:${demoMediaVolume}\n` : ''}    environment:
${webEnvironment}
    restart: unless-stopped
`;

  // Renders the preview's own marketing jobs. Seed-mode fast previews only:
  // the service mounts the same source volumes as the web container and stores
  // outputs on a volume the app serves at /media. The worker films the public
  // https hostname — newer chromium refuses the session cookie over the plain
  // internal http route, and every page it filmed there was the logged-out
  // landing page. host-gateway points the hostname at this host's Traefik, and
  // the worker clears the access gate the way a reviewer does, by presenting a
  // seat code.
  //
  // It reuses the first configured seat rather than getting one of its own: a
  // seat is bound to a unique organization, so a renderer-only seat would need
  // an organization the seed data never creates, and seat validation would
  // reject it at request time.
  const rendererService = rendererEnabled
    ? `  renderer:
    image: mcr.microsoft.com/playwright:v1.60.0-jammy
    working_dir: /app
    restart: unless-stopped
    extra_hosts:
      - ${q(`${env.hostname}:host-gateway`)}
${fastVolumes}
      - ${env.composeProject}-media:/media
    environment:
      DATABASE_URL: ${q(env.databaseUrl)}
      DATABASE_SSL_REJECT_UNAUTHORIZED: "false"
      MARKETING_RENDER_TARGET_URL: ${q(`${enableTls ? 'https' : 'http'}://${env.hostname}`)}
      MARKETING_RENDERER_ACCESS_CODE: ${q(JSON.parse(previewAccessSeats)[0].code)}
      MARKETING_RENDER_TARGET_IS_DEMO: "confirmed"
      MARKETING_MEDIA_STORAGE: "disk"
      MARKETING_MEDIA_DIR: "/media"
      FFMPEG_PATH: "ffmpeg"
    command: >
      bash -lc "
      export PATH=\$$HOME/.bun/bin:\$$PATH;
      command -v ffmpeg >/dev/null || (apt-get update -qq && apt-get install -y -qq ffmpeg) || echo 'renderer: ffmpeg install failed';
      command -v bun >/dev/null || npm install -g bun || { echo 'renderer: bun install failed'; exit 1; };
      export MARKETING_RENDERER_CHROMIUM_PATH=\$$(ls -d /ms-playwright/chromium-*/chrome-linux*/chrome 2>/dev/null | head -1);
      test -z \$$MARKETING_RENDERER_CHROMIUM_PATH && echo 'renderer: WARNING no full chromium under /ms-playwright, playwright falls back to its default browser';
      until curl -fsS -o /dev/null http://web:8080/api/healthcheck; do echo 'renderer: waiting for web'; sleep 3; done;
      bun run --cwd services/marketing-renderer start"
    networks:
      - default
      - preview
`
    : '';

  return `name: ${env.composeProject}
services:
${toolboxService}
${rendererService}${webService}${legacyTraefikLabels}
    healthcheck:
      test: ["CMD", "bun", "-e", "fetch('http://127.0.0.1:8080/api/healthcheck').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
      interval: 15s
      timeout: 5s
      retries: 8
      start_period: 90s
    networks:
      - default
      - preview${directPortBlock}

  blackboard-lti-mock:
    image: oven/bun:1.4.3
    working_dir: /app
    command: bun scripts/blackboard-lti-mock/server.mjs
    volumes:
      - ${q(`${env.sourceDir}:/app`)}
    environment:
      NODE_ENV: ${env.runtime === 'fast' ? 'development' : 'production'}
      YAWP_ENVIRONMENT: "preview"
      BLACKBOARD_LTI_MOCK_ENABLED: "true"
      BLACKBOARD_LTI_MOCK_PORT: "9473"
      BLACKBOARD_LTI_MOCK_ISSUER: "https://blackboard.com"
      BLACKBOARD_LTI_MOCK_CLIENT_ID: "yawp-blackboard-mock"
      BLACKBOARD_LTI_MOCK_DEPLOYMENT_ID: "yawp-mock-deployment"
      BLACKBOARD_LTI_MOCK_PUBLIC_URL: "http://blackboard-lti-mock:9473"
      BLACKBOARD_LTI_MOCK_PUBLIC_BASE_PATH: "/dev/blackboard-lti-mock"
      BLACKBOARD_LTI_MOCK_TOOL_REDIRECT_URI: ${q(`${env.url}/lti/launch`)}
      BLACKBOARD_LTI_MOCK_TOOL_OIDC_LOGIN_URL: ${q(`${env.url}/lti/login`)}
      BLACKBOARD_LTI_MOCK_TOOL_JWKS_URL: ${q(`${env.url}/lti/jwks`)}
      BLACKBOARD_LTI_MOCK_TOKEN_TTL_SECONDS: "60"
      AWS_EC2_METADATA_DISABLED: "true"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "bun", "-e", "fetch('http://127.0.0.1:9473/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
      interval: 15s
      timeout: 5s
      retries: 8
      start_period: 20s
    networks:
      - default
      - preview

volumes:
  ${env.composeProject}-node-modules:
  ${env.composeProject}-web-node-modules:${mediaVolumeDefinition}

networks:
  preview:
    external: true
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(renderPreviewCompose());
}
