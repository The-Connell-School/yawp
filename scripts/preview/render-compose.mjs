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
  // PREVIEW_ACCESS_GATE is consumed by the root route middleware itself. This render
  // cannot emit that enforcement switch without validated seats and its own signing secret,
  // so enabling role-swap necessarily enables the request-boundary gate too.
  const masterAccessEnvironment = masterOrgGateEnabled
    ? `      PREVIEW_MASTER_ACCESS_CODE: ${q(previewMasterAccessCode)}\n`
    : '';
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
      INTERNAL_COMMAND_TOKEN: ${q(optionalEnv('PREVIEW_INTERNAL_COMMAND_TOKEN', 'preview-internal-token'))}
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
      AI_MODEL: ${q(optionalEnv('PREVIEW_AI_MODEL', 'claude-sonnet-4-6'))}`;
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
${fastVolumes}
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

  return `name: ${env.composeProject}
services:
${toolboxService}
${webService}${legacyTraefikLabels}    restart: unless-stopped
    healthcheck:
      test: ["CMD", "bun", "-e", "fetch('http://127.0.0.1:8080/api/healthcheck').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
      interval: 15s
      timeout: 5s
      retries: 8
      start_period: 90s
    networks:
      - default
      - preview${directPortBlock}

volumes:
  ${env.composeProject}-node-modules:
  ${env.composeProject}-web-node-modules:

networks:
  preview:
    external: true
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(renderPreviewCompose());
}
