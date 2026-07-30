import { fileURLToPath } from 'node:url';
import {
  buildPreviewEnv,
  requirePreviewBasicAuth,
} from './preview-env.mjs';

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
${webService}    labels:
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
  ${env.composeProject}-web-node-modules:

networks:
  preview:
    external: true
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(renderPreviewCompose());
}
