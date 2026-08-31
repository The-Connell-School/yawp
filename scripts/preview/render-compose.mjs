import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  databaseUser = process.env.PREVIEW_DB_USER,
  databasePassword = process.env.PREVIEW_DB_PASSWORD,
  accessSeats = process.env.PREVIEW_ACCESS_SEATS,
  masterAccessCode = process.env.PREVIEW_MASTER_ACCESS_CODE,
  masterOrgGateEnabled = process.env.PREVIEW_MASTER_ORG_GATE_ENABLED === 'true',
  accessSecret = process.env.PREVIEW_ACCESS_SECRET,
  sessionSecret = process.env.PREVIEW_SESSION_SECRET,
  aiMode = process.env.PREVIEW_AI_MODE || 'live',
  customIngressActive = process.env.PREVIEW_CUSTOM_INGRESS_ACTIVE !== 'false',
} = {}) {
  const previewAccessSeats = requirePreviewAccessSeats(accessSeats);
  const previewMasterAccessCode = masterOrgGateEnabled
    ? requirePreviewMasterAccessCode(masterAccessCode)
    : '';
  const previewAccessSecret = requirePreviewAccessSecret(accessSecret);
  const previewSessionSecret = requirePreviewSessionSecret(sessionSecret);
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
  const directPortBlock = env.directPort
    ? `\n    ports:\n      - ${q(`127.0.0.1:${env.directPort}:8080`)}`
    : '';
  const routerBase = env.composeProject;
  const tlsLabels = enableTls
    ? `\n      - ${q(`traefik.http.routers.${routerBase}-https.rule=Host(\`${env.hostname}\`)`)}\n      - ${q(`traefik.http.routers.${routerBase}-https.entrypoints=websecure`)}\n      - ${q(`traefik.http.routers.${routerBase}-https.tls.certresolver=letsencrypt`)}\n      - ${q(`traefik.http.routers.${routerBase}-https.service=${routerBase}`)}`
    : '';
  const legacyTraefikLabels = (!env.prNumber || !customIngressActive)
    ? `    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=preview"
      - ${q(`traefik.http.routers.${routerBase}-http.rule=Host(\`${env.hostname}\`)`)}
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
      STRIPE_SECRET_KEY: ${q(optionalEnv('PREVIEW_STRIPE_SECRET_KEY'))}
      STRIPE_WEBHOOK_SECRET: ${q(optionalEnv('PREVIEW_STRIPE_WEBHOOK_SECRET'))}
      STRIPE_UA_2026_PRICE_ID: ${q(optionalEnv('PREVIEW_STRIPE_UA_2026_PRICE_ID'))}
      STRIPE_UA_EXISTING_SUBSCRIPTION_PRICE_IDS: ${q(optionalEnv('PREVIEW_STRIPE_UA_EXISTING_SUBSCRIPTION_PRICE_IDS'))}
      YAWP_APP_ORIGIN: ${q(`${enableTls ? 'https' : 'http'}://${env.hostname}`)}
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
      AWS_S3_BUCKET_FOR_VIDEOS: ${q(optionalEnv('PREVIEW_AWS_S3_BUCKET_FOR_VIDEOS', 'preview-videos'))}
      AWS_S3_REGION_FOR_VIDEOS: ${q(optionalEnv('PREVIEW_AWS_S3_REGION_FOR_VIDEOS', 'us-east-1'))}
      RESEND_FROM_EMAIL: ${q(optionalEnv('PREVIEW_RESEND_FROM_EMAIL', 'preview@yawp.local'))}
      RESEND_API_KEY: ${q(optionalEnv('PREVIEW_RESEND_API_KEY', 'preview-resend-key'))}
      OPENAI_ORGANIZATION_ID: ${q(optionalEnv('PREVIEW_OPENAI_ORGANIZATION_ID'))}
      OPENAI_API_KEY: ${q(optionalEnv('PREVIEW_OPENAI_API_KEY'))}
      YAWP_PREVIEW_AI_MODE: ${q(aiMode)}
      CLASS_INSIGHT_MOCK_MODE: ${q(aiMode === 'disabled' ? 'fixture' : optionalEnv('PREVIEW_CLASS_INSIGHT_MOCK_MODE'))}
      ANTHROPIC_API_KEY: ${q(anthropicApiKey)}
      AI_MODEL: ${q(optionalEnv('PREVIEW_AI_MODEL', 'claude-sonnet-4-6'))}
      BLACKBOARD_LTI_MOCK_URL: "http://blackboard-lti-mock:9473"${marketingStudioEnvironment}`;
  const fastVolumes = `    volumes:
      - ${q(`${env.sourceDir}:/app`)}
      - ${env.composeProject}-node-modules:/app/node_modules
      - ${env.composeProject}-web-node-modules:/app/services/web-app/node_modules`;
  const toolboxService =
    env.runtime === 'fast'
      ? `  toolbox:
    profiles: ["tools"]
    image: oven/bun:1.3.1
    working_dir: /app
${fastVolumes}
    environment:
${commonEnvironment}
    networks:
      - preview
`
      : `  toolbox:
    profiles: ["tools"]
    build:
      context: ${q(env.sourceDir)}
      dockerfile: services/web-app/Dockerfile
      target: deps
      args:
        DATABASE_URL: ${q(env.databaseUrl)}
    environment:
${commonEnvironment}
    networks:
      - preview
`;
  const webService =
    env.runtime === 'fast'
      ? `  web:
    image: oven/bun:1.3.1
    working_dir: /app
    command: bash -lc "cd services/web-app && bun run dev -- --host 0.0.0.0 --port 8080"
${fastVolumes}${mediaVolumeMount}
    environment:
${commonEnvironment}
`
      : `  web:
    image: ${q(`${routerBase}-web:current`)}
    build:
      context: ${q(env.sourceDir)}
      dockerfile: services/web-app/Dockerfile
      target: production
      args:
        DATABASE_URL: ${q(env.databaseUrl)}
    environment:
${commonEnvironment}
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
${rendererService}${webService}${legacyTraefikLabels}    restart: unless-stopped
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
    image: oven/bun:1.3.1
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
