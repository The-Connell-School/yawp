import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

const repoRoot = join(import.meta.dir, '..');

function readRepoFile(path: string) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

describe('production deployment contract', () => {
  test('container startup does not run Prisma migrations', () => {
    const startScript = readRepoFile('services/web-app/start.sh');

    expect(startScript).toContain('set -euo pipefail');
    expect(startScript).not.toContain('bun prisma migrate deploy');
  });

  test('CI has a dedicated migration validation job against Postgres', () => {
    const ciWorkflow = readRepoFile('.github/workflows/ci.yml');

    expect(ciWorkflow).toContain('validate-prisma-migrations');
    expect(ciWorkflow).toContain('bun test ./scripts/deployment-contract.test.ts');
    expect(ciWorkflow).toContain('bun prisma migrate deploy');
    expect(ciWorkflow).toContain('postgres:16');
  });

  test('Docker build uses the Bun version that wrote the lockfile', () => {
    const dockerfile = readRepoFile('services/web-app/Dockerfile');

    expect(dockerfile).toContain('FROM oven/bun:1.3.1 AS base');
  });

  test('Dockerfile exposes a dependency target for preview migration tooling', () => {
    const dockerfile = readRepoFile('services/web-app/Dockerfile');

    expect(dockerfile).toContain('FROM base AS deps');
    expect(dockerfile).toContain('FROM deps AS build');
  });

  test('Docker runtime image includes workspace node_modules for web app binaries', () => {
    const dockerfile = readRepoFile('services/web-app/Dockerfile');

    expect(dockerfile).toContain(
      'COPY --from=build /app/services/web-app/node_modules ./services/web-app/node_modules',
    );
  });

  test('Docker runtime image exposes client assets for root-level serve commands', () => {
    const dockerfile = readRepoFile('services/web-app/Dockerfile');

    expect(dockerfile).toContain(
      'COPY --from=build /app/services/web-app/build/client ./build/client',
    );
  });

  test('container startup runs React Router serve with Bun instead of requiring Node', () => {
    const startScript = readRepoFile('services/web-app/start.sh');

    expect(startScript).toContain('cd "$(dirname "$0")"');
    expect(startScript).toContain('exec bun node_modules/@react-router/serve/bin.js');
    expect(startScript).not.toContain('bun run web-app:start');
  });

  test('Vite dev redirects bare /app before static middleware handles the app directory', () => {
    const viteConfig = readRepoFile('services/web-app/vite.config.ts');

    expect(viteConfig).toContain('redirectBareAppRoute');
    expect(viteConfig).toContain("req.url === '/app'");
    expect(viteConfig).toContain("startsWith('/app?')");
    expect(viteConfig).toContain("res.setHeader('Location', location)");
  });

  test('React Router dev pre-optimizes route dependencies before first login', () => {
    const reactRouterConfig = readRepoFile('services/web-app/react-router.config.ts');

    expect(reactRouterConfig).toContain('unstable_optimizeDeps: true');
  });

  test('main deploy runs production Prisma migrations before publishing the image', () => {
    const deployWorkflow = readRepoFile('.github/workflows/deploy.yml');
    const migrateIndex = deployWorkflow.indexOf('bun prisma:migrate-remote production');
    const pushIndex = deployWorkflow.indexOf('bun web-app:docker:production:push');

    expect(deployWorkflow).toContain('validate-prisma-migrations');
    expect(deployWorkflow).toContain('needs: [validate-prisma-migrations]');
    expect(deployWorkflow).toContain('PROD_SSH_PRIVATE_KEY');
    expect(deployWorkflow).toContain('PROD_SSH_KEY_PATH');
    expect(deployWorkflow).toContain('PROD_DB_HOST');
    expect(deployWorkflow).toContain('PROD_DB_NAME');
    expect(deployWorkflow).toContain('PROD_DB_USER');
    expect(deployWorkflow).toContain('PROD_DB_PASSWORD');
    expect(migrateIndex).toBeGreaterThan(-1);
    expect(pushIndex).toBeGreaterThan(-1);
    expect(migrateIndex).toBeLessThan(pushIndex);
  });
});

describe('PR preview deployment contract', () => {
  test('preview workflow deploys every same-repo pull request through preview environments', () => {
    const previewWorkflow = readRepoFile('.github/workflows/preview-environments.yml');

    expect(previewWorkflow).toContain('name: PR preview');
    expect(previewWorkflow).toContain('pull_request');
    expect(previewWorkflow).toContain('types: [opened, synchronize, reopened, closed]');
    expect(previewWorkflow).toContain("github.event.pull_request.head.repo.full_name == github.repository");
    expect(previewWorkflow).toContain('scripts/preview-forge/deploy.sh');
    expect(previewWorkflow).toContain('scripts/preview-forge/destroy.sh');
    expect(previewWorkflow).not.toContain('Preview Forge');
  });

  test('preview workflow no longer uses App Runner, Terraform, ECR pushes, or slash-command previews', () => {
    const previewWorkflow = readRepoFile('.github/workflows/preview-environments.yml').toLowerCase();

    expect(previewWorkflow).not.toContain('apprunner');
    expect(previewWorkflow).not.toContain('infra-pr');
    expect(previewWorkflow).not.toContain('terraform');
    expect(previewWorkflow).not.toContain('docker push');
    expect(previewWorkflow).not.toMatch(/(^|\s)\/preview(\s|$)/);
  });

  test('preview deploy restores production data before migrations and skips overlay seeding', () => {
    const deployScript = readRepoFile('scripts/preview-forge/deploy.sh');
    const restoreIndex = deployScript.indexOf('Restoring production dump');
    const migrateIndex = deployScript.indexOf('bun prisma migrate deploy');
    const webStartIndex = deployScript.indexOf('"${compose[@]}" up -d --force-recreate web');

    expect(deployScript).toContain('PREVIEW_DB_DUMP_S3_URI');
    expect(deployScript).toContain('PREVIEW_DB_DUMP_URL');
    expect(deployScript).toContain('stream_preview_dump()');
    expect(deployScript).toContain('curl -fSsL --retry 3 --retry-delay 2 "$PREVIEW_DB_DUMP_URL"');
    expect(deployScript).toContain('aws s3 cp "$DUMP_URI" -');
    expect(deployScript).toContain('psql -U postgres -d yawp_preview');
    expect(deployScript).toContain('Schema already has');
    expect(deployScript).not.toContain('seed-overlay.ts');
    expect(restoreIndex).toBeGreaterThan(-1);
    expect(migrateIndex).toBeGreaterThan(-1);
    expect(webStartIndex).toBeGreaterThan(-1);
    expect(restoreIndex).toBeLessThan(migrateIndex);
    expect(migrateIndex).toBeLessThan(webStartIndex);
  });

  test('preview workflow passes dump location and login credentials to remote deploy', () => {
    const previewWorkflow = readRepoFile('.github/workflows/preview-environments.yml');

    expect(previewWorkflow).toContain('PREVIEW_DB_DUMP_S3_URI');
    expect(previewWorkflow).toContain('PREVIEW_DB_DUMP_URL');
    expect(previewWorkflow).toContain('secrets.PREVIEW_LOGIN_EMAIL');
    expect(previewWorkflow).toContain('secrets.PREVIEW_LOGIN_PASSWORD');
    expect(previewWorkflow).toContain('shell_quote()');
    expect(previewWorkflow).toContain('PREVIEW_DB_DUMP_S3_URI=$(shell_quote "$PREVIEW_DB_DUMP_S3_URI")');
    expect(previewWorkflow).toContain('PREVIEW_DB_DUMP_URL=$(shell_quote "$PREVIEW_DB_DUMP_URL")');
    expect(previewWorkflow).toContain('PREVIEW_LOGIN_EMAIL=$(shell_quote "$PREVIEW_LOGIN_EMAIL")');
    expect(previewWorkflow).toContain('PREVIEW_LOGIN_PASSWORD=$(shell_quote "$PREVIEW_LOGIN_PASSWORD")');
  });

  test('preview workflow creates a masked presigned dump URL on the runner', () => {
    const previewWorkflow = readRepoFile('.github/workflows/preview-environments.yml');

    expect(previewWorkflow).toContain('aws-actions/configure-aws-credentials@v4');
    expect(previewWorkflow).toContain('secrets.AWS_ACCESS_KEY_ID');
    expect(previewWorkflow).toContain('secrets.AWS_SECRET_ACCESS_KEY');
    expect(previewWorkflow).toContain('id: preview-dump-url');
    expect(previewWorkflow).toContain('aws s3 presign "$PREVIEW_DB_DUMP_S3_URI"');
    expect(previewWorkflow).toContain('echo "::add-mask::$dump_url"');
    expect(previewWorkflow).toContain('steps.preview-dump-url.outputs.url');
  });

  test('preview deploy polls health quickly once containers are starting', () => {
    const deployScript = readRepoFile('scripts/preview-forge/deploy.sh');

    expect(deployScript).toContain('curl -fsS --connect-timeout 1 --max-time 2 "$health_url"');
    expect(deployScript).toContain('sleep 1');
    expect(deployScript).not.toContain('--max-time 5 "$health_url"');
    expect(deployScript).not.toContain('sleep 2');
  });

  test('preview deploy verifies login before reporting the preview URL', () => {
    const deployScript = readRepoFile('scripts/preview-forge/deploy.sh');
    const loginSmokeIndex = deployScript.indexOf('smoke-login.mjs');
    const previewUrlIndex = deployScript.indexOf('echo "PREVIEW_URL=$URL"');

    expect(loginSmokeIndex).toBeGreaterThan(-1);
    expect(previewUrlIndex).toBeGreaterThan(-1);
    expect(loginSmokeIndex).toBeLessThan(previewUrlIndex);
  });

  test('preview deploy restarts the web container after source syncs', () => {
    const deployScript = readRepoFile('scripts/preview-forge/deploy.sh');
    const stopIndex = deployScript.indexOf('"${compose[@]}" stop web');
    const toolboxIndex = deployScript.indexOf('"${compose[@]}" run --rm toolbox');

    expect(stopIndex).toBeGreaterThan(-1);
    expect(toolboxIndex).toBeGreaterThan(-1);
    expect(stopIndex).toBeLessThan(toolboxIndex);
    expect(deployScript).toContain('"${compose[@]}" up -d --force-recreate web');
  });

  test('preview source sync excludes generated container output', () => {
    const previewWorkflow = readRepoFile('.github/workflows/preview-environments.yml');

    expect(previewWorkflow).toContain("--exclude 'services/web-app/.react-router'");
    expect(previewWorkflow).toContain("--exclude 'services/web-app/.vite'");
  });

  test('preview host bootstrap installs AWS CLI for production dump restores', () => {
    const bootstrapScript = readRepoFile('scripts/preview-forge/bootstrap-host.sh');

    expect(bootstrapScript).toContain('awscli');
  });

  test('preview GitHub config can publish dump location and login smoke secrets', () => {
    const configScript = readRepoFile('scripts/github-preview-config.sh');

    expect(configScript).toContain('gh_var PREVIEW_DB_DUMP_S3_URI');
    expect(configScript).toContain('gh_sec PREVIEW_LOGIN_EMAIL');
    expect(configScript).toContain('gh_sec PREVIEW_LOGIN_PASSWORD');
  });

  test('preview comment describes production data and login smoke', () => {
    const previewWorkflow = readRepoFile('.github/workflows/preview-environments.yml');

    expect(previewWorkflow).toContain(
      '- **Data:** production database dump restored into an isolated Postgres volume',
    );
    expect(previewWorkflow).toContain('- **Smoke:** healthcheck + login');
    expect(previewWorkflow).not.toContain('seed overlay');
  });
});
