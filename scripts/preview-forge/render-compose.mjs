import { fileURLToPath } from 'node:url';
import { buildPreviewForgeEnv } from './preview-env.mjs';

function q(value) {
  return JSON.stringify(String(value));
}

function optionalEnv(name, fallback = '') {
  return process.env[name] || fallback;
}

export function renderPreviewCompose({
  prNumber = process.env.PR_NUMBER,
  domain = process.env.PREVIEW_FORGE_DOMAIN,
  root = process.env.PREVIEW_FORGE_ROOT,
  sourceDir = process.env.SOURCE_DIR,
  directPort = process.env.PREVIEW_FORGE_DIRECT_PORT,
  enableTls = process.env.PREVIEW_FORGE_TLS !== 'false',
  runtime = process.env.PREVIEW_FORGE_RUNTIME || 'fast',
} = {}) {
  const env = buildPreviewForgeEnv({
    prNumber,
    domain,
    root,
    sourceDir,
    directPort,
    tls: enableTls,
    runtime,
  });
  const routerBase = env.composeProject;
  const directPortBlock = env.directPort
    ? `\n    ports:\n      - ${q(`127.0.0.1:${env.directPort}:8080`)}`
    : '';
  const tlsLabels = enableTls
    ? `\n      - ${q(`traefik.http.routers.${routerBase}-https.rule=Host(\`${env.hostname}\`)`)}\n      - ${q(`traefik.http.routers.${routerBase}-https.entrypoints=websecure`)}\n      - ${q(`traefik.http.routers.${routerBase}-https.tls.certresolver=letsencrypt`)}\n      - ${q(`traefik.http.routers.${routerBase}-https.service=${routerBase}`)}`
    : '';
  const cookieSecure = enableTls ? '"true"' : '"false"';
  const commonEnvironment = `      DATABASE_URL: ${q(env.databaseUrl)}
      DATABASE_SSL_REJECT_UNAUTHORIZED: "false"
      NODE_ENV: ${env.runtime === 'fast' ? 'development' : 'production'}
      PORT: "8080"
      COOKIE_SECURE: ${cookieSecure}
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
      AI_MODEL: ${q(optionalEnv('PREVIEW_AI_MODEL', 'gpt-4o-mini'))}`;
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
    depends_on:
      postgres:
        condition: service_healthy
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
    depends_on:
      postgres:
        condition: service_healthy
`;
  const webService =
    env.runtime === 'fast'
      ? `  web:
    image: oven/bun:1.3.1
    working_dir: /app
    command: bash -lc "rm -rf services/web-app/.react-router services/web-app/.vite && bun install --ignore-scripts && bun prisma generate && cd services/web-app && bun run dev -- --host 0.0.0.0 --port 8080"
${fastVolumes}
    environment:
${commonEnvironment}
    depends_on:
      postgres:
        condition: service_healthy
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
    depends_on:
      postgres:
        condition: service_healthy
`;

  return `name: ${env.composeProject}
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: yawp_preview
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d yawp_preview"]
      interval: 2s
      timeout: 2s
      retries: 30
    volumes:
      - ${env.composeProject}-postgres-data:/var/lib/postgresql/data

${toolboxService}
${webService}    labels:
      - "traefik.enable=true"
      - ${q(`traefik.http.routers.${routerBase}-http.rule=Host(\`${env.hostname}\`)`)}
      - ${q(`traefik.http.routers.${routerBase}-http.entrypoints=web`)}
      - ${q(`traefik.http.routers.${routerBase}-http.service=${routerBase}`)}${tlsLabels}
      - ${q(`traefik.http.services.${routerBase}.loadbalancer.server.port=8080`)}
    networks:
      - default
      - preview-forge${directPortBlock}

volumes:
  ${env.composeProject}-postgres-data:
  ${env.composeProject}-node-modules:
  ${env.composeProject}-web-node-modules:

networks:
  preview-forge:
    external: true
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(renderPreviewCompose());
}
