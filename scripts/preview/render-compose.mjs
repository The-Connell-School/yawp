import { fileURLToPath } from 'node:url';
import { buildPreviewEnv, requirePreviewBasicAuth } from './preview-env.mjs';

function q(value) {
  return JSON.stringify(String(value));
}

function optionalEnv(name, fallback = '') {
  return process.env[name] || fallback;
}

function escapeComposeInterpolation(value) {
  return value.replace(/\$/g, () => '$$');
}

export function renderPreviewCompose({
  prNumber = process.env.PR_NUMBER,
  domain = process.env.PREVIEW_DOMAIN,
  root = process.env.PREVIEW_ROOT,
  sourceDir = process.env.SOURCE_DIR,
  directPort = process.env.PREVIEW_DIRECT_PORT,
  enableTls = process.env.PREVIEW_TLS !== 'false',
  runtime = process.env.PREVIEW_RUNTIME || 'fast',
  dataMode = process.env.PREVIEW_DATA_MODE || 'seed',
  basicAuth = process.env.PREVIEW_BASIC_AUTH,
} = {}) {
  const previewBasicAuth = requirePreviewBasicAuth(basicAuth);
  const env = buildPreviewEnv({
    prNumber,
    domain,
    root,
    sourceDir,
    directPort,
    tls: enableTls,
    runtime,
    dataMode,
  });
  const routerBase = env.composeProject;
  const authMiddleware = `${routerBase}-auth`;
  const escapedBasicAuth = escapeComposeInterpolation(previewBasicAuth);
  const directPortBlock = env.directPort
    ? `\n    ports:\n      - ${q(`127.0.0.1:${env.directPort}:8080`)}`
    : '';
  const tlsLabels = enableTls
    ? `\n      - ${q(`traefik.http.routers.${routerBase}-https.rule=Host(\`${env.hostname}\`)`)}\n      - ${q(`traefik.http.routers.${routerBase}-https.entrypoints=websecure`)}\n      - ${q(`traefik.http.routers.${routerBase}-https.tls.certresolver=letsencrypt`)}\n      - ${q(`traefik.http.routers.${routerBase}-https.service=${routerBase}`)}\n      - ${q(`traefik.http.routers.${routerBase}-https.middlewares=${authMiddleware}`)}`
    : '';
  const cookieSecure = enableTls ? '"true"' : '"false"';
  // The Marketing Studio films whatever these variables point at and publishes the
  // result, so they follow the same rule as dev-login: seeded data only. A
  // production-dump preview never gets them — "confirmed" is a statement that the
  // target holds no real student work, and a dump is exactly that work. Seed-mode
  // previews target themselves, which is the one URL this render can vouch for.
  const rendererEnabled = env.dataMode === 'seed' && env.runtime === 'fast';
  const mediaVolumeMount = rendererEnabled
    ? `\n      - ${env.composeProject}-media:/media`
    : '';
  const mediaVolumeDefinition = rendererEnabled
    ? `\n  ${env.composeProject}-media:`
    : '';
  const marketingStudioEnvironment =
    env.dataMode === 'seed'
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
  // PREVIEW_ACCESS_GATE below is emitted by the same render that attaches the basicauth
  // middleware to the router, and is only reachable because requirePreviewBasicAuth()
  // already accepted a credential above — so the flag and the gate cannot drift apart.
  // The app reads it to decide whether role-swap may be exposed; absent, it falls back
  // to the local-only rule, so a compose file rendered without a gate never enables it.
  const commonEnvironment = `      DATABASE_URL: ${q(env.databaseUrl)}
      DATABASE_SSL_REJECT_UNAUTHORIZED: "false"
      NODE_ENV: ${env.runtime === 'fast' ? 'development' : 'production'}
      YAWP_ENVIRONMENT: "preview"
      PREVIEW_DATA_MODE: ${q(env.dataMode)}
      PREVIEW_ACCESS_GATE: "on"
      PORT: "8080"
      COOKIE_SECURE: ${cookieSecure}
      AWS_EC2_METADATA_DISABLED: "true"
      SESSION_SECRET: ${q(optionalEnv('PREVIEW_SESSION_SECRET', 'preview-session-secret'))}
      INTERNAL_COMMAND_TOKEN: ${q(optionalEnv('PREVIEW_INTERNAL_COMMAND_TOKEN', 'preview-internal-token'))}
      HONEYPOT_SECRET: ${q(optionalEnv('PREVIEW_HONEYPOT_SECRET', 'preview-honeypot-secret'))}
      AWS_S3_BUCKET_FOR_VIDEOS: ${q(optionalEnv('PREVIEW_AWS_S3_BUCKET_FOR_VIDEOS', 'preview-videos'))}
      AWS_S3_REGION_FOR_VIDEOS: ${q(optionalEnv('PREVIEW_AWS_S3_REGION_FOR_VIDEOS', 'us-east-1'))}
      RESEND_FROM_EMAIL: ${q(optionalEnv('PREVIEW_RESEND_FROM_EMAIL', 'preview@yawp.local'))}
      RESEND_API_KEY: ${q(optionalEnv('PREVIEW_RESEND_API_KEY', 'preview-resend-key'))}
      OPENAI_ORGANIZATION_ID: ${q(optionalEnv('PREVIEW_OPENAI_ORGANIZATION_ID'))}
      OPENAI_API_KEY: ${q(optionalEnv('PREVIEW_OPENAI_API_KEY'))}
      ANTHROPIC_API_KEY: ${q(optionalEnv('PREVIEW_ANTHROPIC_API_KEY'))}
      AI_MODEL: ${q(optionalEnv('PREVIEW_AI_MODEL', 'claude-sonnet-4-6'))}${marketingStudioEnvironment}`;
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
  // outputs on a volume the app serves at /media. The worker films the web
  // container over the internal network, so the public gate never applies.
  const rendererService = rendererEnabled
    ? `  renderer:
    image: mcr.microsoft.com/playwright:v1.60.0-jammy
    working_dir: /app
    restart: unless-stopped
${fastVolumes}
      - ${env.composeProject}-media:/media
    environment:
      DATABASE_URL: ${q(env.databaseUrl)}
      DATABASE_SSL_REJECT_UNAUTHORIZED: "false"
      MARKETING_RENDER_TARGET_URL: "http://web:8080"
      MARKETING_RENDER_TARGET_IS_DEMO: "confirmed"
      MARKETING_MEDIA_STORAGE: "disk"
      MARKETING_MEDIA_DIR: "/media"
      FFMPEG_PATH: "ffmpeg"
    command: >
      bash -lc "
      export PATH=\$$HOME/.bun/bin:\$$PATH;
      command -v ffmpeg >/dev/null || (apt-get update -qq && apt-get install -y -qq ffmpeg) || echo 'renderer: ffmpeg install failed';
      command -v bun >/dev/null || npm install -g bun || { echo 'renderer: bun install failed'; exit 1; };
      export MARKETING_RENDERER_CHROMIUM_PATH=\$$(ls -d /ms-playwright/chromium-*/chrome-linux/chrome | head -1);
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
${rendererService}${webService}    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=preview"
      - ${q(`traefik.http.routers.${routerBase}-http.rule=Host(\`${env.hostname}\`)`)}
      - ${q(`traefik.http.routers.${routerBase}-http.entrypoints=web`)}
      - ${q(`traefik.http.routers.${routerBase}-http.service=${routerBase}`)}
      - ${q(`traefik.http.routers.${routerBase}-http.middlewares=${authMiddleware}`)}${tlsLabels}
      - ${q(`traefik.http.middlewares.${authMiddleware}.basicauth.users=${escapedBasicAuth}`)}
      - ${q(`traefik.http.middlewares.${authMiddleware}.basicauth.removeheader=true`)}
      - ${q(`traefik.http.services.${routerBase}.loadbalancer.server.port=8080`)}
    networks:
      - default
      - preview${directPortBlock}

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
