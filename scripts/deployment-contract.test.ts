import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const repoRoot = join(import.meta.dir, '..');
const deprecatedPreviewBrand = ['Preview', String.fromCharCode(70, 111, 114, 103, 101)].join(' ');
const deprecatedPreviewSlug = ['preview', String.fromCharCode(102, 111, 114, 103, 101)].join('-');
const deprecatedPreviewEnvPrefix = ['PREVIEW', String.fromCharCode(70, 79, 82, 71, 69)].join('_');
const deprecatedPreviewRoot = ['yawp', 'preview', String.fromCharCode(102, 111, 114, 103, 101)].join('-');
const deprecatedPreviewFunction = ['buildPreview', String.fromCharCode(70, 111, 114, 103, 101)].join('');
const deprecatedPreviewSnake = ['preview', String.fromCharCode(102, 111, 114, 103, 101)].join('_');

function readRepoFile(path: string) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

function listRepoFiles(path: string): string[] {
  const abs = join(repoRoot, path);
  const stat = statSync(abs);
  if (stat.isFile()) return [path];
  return readdirSync(abs).flatMap((entry) => listRepoFiles(join(path, entry)));
}

function listTrackedRepoFiles(): string[] {
  return execFileSync('git', ['ls-files'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim().split('\n').filter(Boolean);
}

describe('production deployment contract', () => {
  test('container startup does not run Prisma migrations', () => {
    const startScript = readRepoFile('services/web-app/start.sh');

    expect(startScript).toContain('set -euo pipefail');
    expect(startScript).not.toContain('bun prisma migrate deploy');
  });

  test('CI has a dedicated migration validation job against Postgres', () => {
    const ciWorkflow = readRepoFile('.github/workflows/ci.yml');
    const generateIndex = ciWorkflow.indexOf('bun prisma generate');
    const migrateIndex = ciWorkflow.indexOf('bun prisma migrate deploy');
    const backfillIndex = ciWorkflow.indexOf('backfill-class-art-key');
    const releaseGateIndex = ciWorkflow.indexOf('assignment-type-release-gate');

    expect(ciWorkflow).toContain('validate-prisma-migrations');
    expect(ciWorkflow).toContain('bun test ./scripts/deployment-contract.test.ts');
    expect(ciWorkflow).toContain('teacher-training-assignment-migration.test.ts');
    expect(ciWorkflow).toContain('bun prisma generate');
    expect(ciWorkflow).toContain('bun prisma migrate deploy');
    expect(ciWorkflow).toContain('backfill-class-art-key');
    expect(ciWorkflow).toContain('assignment-type-release-gate');
    expect(ciWorkflow).toContain('postgres:16');
    expect(generateIndex).toBeGreaterThan(-1);
    expect(migrateIndex).toBeGreaterThan(-1);
    expect(generateIndex).toBeLessThan(migrateIndex);
    expect(backfillIndex).toBeGreaterThan(migrateIndex);
    expect(releaseGateIndex).toBeGreaterThan(backfillIndex);
  });

  test('Prisma package keeps both migration release gates available', () => {
    const prismaPackage = JSON.parse(readRepoFile('packages/prisma/package.json'));

    expect(prismaPackage.scripts['assignment-type-release-gate']).toBe(
      'bun run scripts/assignment-type-release-gate.ts'
    );
    expect(prismaPackage.scripts['backfill-class-art-key']).toBe(
      'bun run scripts/backfill-class-art-key.ts'
    );
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
    const migrateRemoteScript = readRepoFile('packages/prisma/scripts/migrate-remote.ts');
    const deployGenerateIndex = deployWorkflow.indexOf('bun prisma generate');
    const deployValidateMigrateIndex = deployWorkflow.indexOf('bun prisma migrate deploy');
    const deployTrainingMigrationTestIndex = deployWorkflow.indexOf(
      'teacher-training-assignment-migration.test.ts'
    );
    const deployValidateBackfillIndex = deployWorkflow.indexOf('backfill-class-art-key');
    const migrateIndex = deployWorkflow.indexOf('bun prisma:migrate-remote production');
    const pushIndex = deployWorkflow.indexOf('bun web-app:docker:production:push');
    const remoteMigrateIndex = migrateRemoteScript.indexOf("['prisma', 'migrate', 'deploy']");
    const remoteBackfillIndex = migrateRemoteScript.indexOf('backfill-class-art-key.ts');
    const remoteReleaseGateIndex = migrateRemoteScript.indexOf('assignment-type-release-gate.ts');

    expect(deployWorkflow).toContain('validate-prisma-migrations');
    expect(deployWorkflow).toContain('needs: [validate-prisma-migrations]');
    expect(deployWorkflow).toContain('bun prisma generate');
    expect(deployWorkflow).toContain('teacher-training-assignment-migration.test.ts');
    expect(deployWorkflow).toContain('backfill-class-art-key');
    expect(deployWorkflow).toContain('PROD_SSH_PRIVATE_KEY');
    expect(deployWorkflow).toContain('PROD_SSH_KEY_PATH');
    expect(deployWorkflow).toContain('PROD_DB_HOST');
    expect(deployWorkflow).toContain('PROD_DB_NAME');
    expect(deployWorkflow).toContain('PROD_DB_USER');
    expect(deployWorkflow).toContain('PROD_DB_PASSWORD');
    expect(deployGenerateIndex).toBeGreaterThan(-1);
    expect(deployValidateMigrateIndex).toBeGreaterThan(deployGenerateIndex);
    expect(deployTrainingMigrationTestIndex).toBeGreaterThan(-1);
    expect(deployTrainingMigrationTestIndex).toBeLessThan(deployValidateMigrateIndex);
    expect(deployValidateBackfillIndex).toBeGreaterThan(deployValidateMigrateIndex);
    expect(migrateIndex).toBeGreaterThan(-1);
    expect(pushIndex).toBeGreaterThan(-1);
    expect(migrateIndex).toBeLessThan(pushIndex);
    expect(migrateRemoteScript).toContain('--require-data');
    expect(migrateRemoteScript).toContain('20260703195500_realign_teacher_training_assignments');
    expect(migrateRemoteScript).toContain("['prisma', 'migrate', 'resolve', '--rolled-back'");
    expect(migrateRemoteScript).toContain('rejectUnauthorized: false');
    expect(migrateRemoteScript).toContain("REMOTE_MIGRATE_TUNNEL: '1'");
    expect(remoteMigrateIndex).toBeGreaterThan(-1);
    expect(remoteBackfillIndex).toBeGreaterThan(remoteMigrateIndex);
    expect(remoteReleaseGateIndex).toBeGreaterThan(remoteBackfillIndex);
  });
});

describe('worktree local setup contract', () => {
  test('root dev command loads the isolated worktree app port before starting React Router', () => {
    const rootPackage = JSON.parse(readRepoFile('package.json'));

    expect(rootPackage.scripts.dev).toContain('scripts/worktree-local-setup.sh --no-dev');
    expect(rootPackage.scripts.dev).toContain('source .worktree-local/config.env');
    expect(rootPackage.scripts.dev).toContain('PORT="$DEV_PORT"');
  });

  test('Vite dev server honors the configured app port and fails instead of falling back', () => {
    const viteConfig = readRepoFile('services/web-app/vite.config.ts');

    expect(viteConfig).toContain('Number(process.env.PORT ?? 5176)');
    expect(viteConfig).toContain('strictPort: true');
  });

  test('worktree setup backfills class art keys before local seed verification', () => {
    const setupScript = readRepoFile('scripts/worktree-local-setup.sh');
    const migrateIndex = setupScript.indexOf('prisma migrate deploy');
    const backfillIndex = setupScript.indexOf('backfill-class-art-key');
    const seedIndex = setupScript.indexOf('db:seed-local-dev');

    expect(migrateIndex).toBeGreaterThan(-1);
    expect(backfillIndex).toBeGreaterThan(migrateIndex);
    expect(seedIndex).toBeGreaterThan(backfillIndex);
  });
});

describe('PR preview deployment contract', () => {
  test('preview workflow deploys every same-repo pull request through preview environments', () => {
    const previewWorkflow = readRepoFile('.github/workflows/preview-environments.yml');

    expect(previewWorkflow).toContain('name: PR preview');
    expect(previewWorkflow).toContain('pull_request');
    expect(previewWorkflow).toContain('types: [opened, synchronize, reopened, closed]');
    expect(previewWorkflow).toContain("github.event.pull_request.head.repo.full_name == github.repository");
    expect(previewWorkflow).toContain('scripts/preview/deploy.sh');
    expect(previewWorkflow).toContain('scripts/preview/destroy.sh');
    expect(previewWorkflow).not.toContain(deprecatedPreviewBrand);
    expect(previewWorkflow).not.toContain(`${deprecatedPreviewEnvPrefix}_`);
    expect(previewWorkflow).not.toContain(deprecatedPreviewSlug);
  });

  test('preview workflow no longer uses App Runner, Terraform, ECR pushes, or slash-command previews', () => {
    const previewWorkflow = readRepoFile('.github/workflows/preview-environments.yml').toLowerCase();

    expect(previewWorkflow).not.toContain('apprunner');
    expect(previewWorkflow).not.toContain('infra-pr');
    expect(previewWorkflow).not.toContain('terraform');
    expect(previewWorkflow).not.toContain('docker push');
    expect(previewWorkflow).not.toMatch(/(^|\s)\/preview(\s|$)/);
  });

  test('preview deploy resets per-PR databases and seeds local dev data by default', () => {
    const deployScript = readRepoFile('scripts/preview/deploy.sh');
    const resetIndex = deployScript.indexOf('reset_seed_preview_database');
    const dropIndex = deployScript.indexOf('dropdb -U postgres --force --if-exists "$DATABASE_NAME"');
    const generateIndex = deployScript.indexOf('bun prisma generate');
    const migrateIndex = deployScript.indexOf('bun prisma migrate deploy');
    const backfillIndex = deployScript.indexOf('bun run scripts/backfill-class-art-key.ts');
    const seedIndex = deployScript.indexOf('bun run seed-local-dev');
    const releaseGateIndex = deployScript.indexOf('bun run scripts/assignment-type-release-gate.ts --require-data');
    const webStartIndex = deployScript.indexOf('start_or_refresh_web');

    expect(deployScript).toContain('PREVIEW_DATA_MODE');
    expect(deployScript).toContain('DATA_MODE');
    expect(deployScript).toContain('reset_seed_preview_database');
    expect(deployScript).toContain('dropdb -U postgres --force --if-exists "$DATABASE_NAME"');
    expect(deployScript).toContain('createdb -U postgres "$DATABASE_NAME"');
    expect(deployScript).toContain('bun run seed-local-dev');
    expect(deployScript).toContain('PREVIEW_DEV_LOGIN_EMAIL');
    expect(deployScript).toContain('backfill-class-art-key.ts');
    expect(deployScript).toContain('assignment-type-release-gate.ts --require-data');
    expect(deployScript).not.toContain('seed-overlay.ts');
    expect(resetIndex).toBeGreaterThan(-1);
    expect(dropIndex).toBeGreaterThan(resetIndex);
    expect(generateIndex).toBeGreaterThan(-1);
    expect(migrateIndex).toBeGreaterThan(generateIndex);
    expect(backfillIndex).toBeGreaterThan(migrateIndex);
    expect(seedIndex).toBeGreaterThan(backfillIndex);
    expect(releaseGateIndex).toBeGreaterThan(seedIndex);
    expect(webStartIndex).toBeGreaterThan(releaseGateIndex);
  });

  test('preview deploy still supports opt-in production dump template clones', () => {
    const deployScript = readRepoFile('scripts/preview/deploy.sh');

    expect(deployScript).toContain('PREVIEW_DB_DUMP_S3_URI');
    expect(deployScript).toContain('stream_preview_dump()');
    expect(deployScript).toContain('aws sts get-caller-identity');
    expect(deployScript).toContain('aws s3 cp "$DUMP_URI" -');
    expect(deployScript).toContain('PREVIEW_DB_TEMPLATE_DB');
    expect(deployScript).toContain('yawp-preview-db');
    expect(deployScript).toContain('preview-postgres');
    expect(deployScript).toContain('Restoring production dump into template database');
    expect(deployScript).toContain('DATABASE_NAME="yawp_pr_${PR_NUMBER}"');
    expect(deployScript).toContain('Preview database $DATABASE_NAME already exists; skipping clone.');
    expect(deployScript).toContain('production-dump)');
    expect(deployScript).toContain('createdb -U postgres -T "$TEMPLATE_DB" "$DATABASE_NAME"');
  });

  test('preview deploy caches tooling work but still refreshes web containers', () => {
    const deployScript = readRepoFile('scripts/preview/deploy.sh');

    expect(deployScript).toContain('compute_tooling_fingerprint()');
    expect(deployScript).toContain('TOOLING_FINGERPRINT_FILE="$PREVIEW_DIR/tooling.sha256"');
    expect(deployScript).toContain('packages/prisma/scripts/assignment-type-release-gate.ts');
    expect(deployScript).toContain('packages/prisma/scripts/backfill-class-art-key.ts');
    expect(deployScript).toContain('scripts/preview/deploy.sh');
    expect(deployScript).toContain('Tooling fingerprint unchanged and database already existed; skipping install/generate/migrate.');
    expect(deployScript).toContain('"${compose[@]}" up -d --force-recreate web');
    expect(deployScript).not.toContain('Web container already running; relying on bind-mounted source update.');
  });

  test('preview containers cannot use EC2 metadata credentials', () => {
    const compose = readRepoFile('scripts/preview/render-compose.mjs');

    expect(compose).toContain('AWS_EC2_METADATA_DISABLED: "true"');
  });

  test('preview cleanup removes closed PR resources and is scheduled', () => {
    const cleanupScript = readRepoFile('scripts/preview/cleanup.sh');
    const previewWorkflow = readRepoFile('.github/workflows/preview-environments.yml');

    expect(cleanupScript).toContain('OPEN_PR_NUMBERS');
    expect(cleanupScript).toContain('PREVIEW_TTL_HOURS');
    expect(cleanupScript).toContain('dropdb -U postgres --if-exists "$database_name"');
    expect(cleanupScript).toContain('docker volume rm "${project}_${project}-postgres-data"');
    expect(previewWorkflow).toContain('schedule:');
    expect(previewWorkflow).toContain('bash -s < scripts/preview/cleanup.sh');
  });

  test('preview workflow passes seeded preview mode to remote deploy', () => {
    const previewWorkflow = readRepoFile('.github/workflows/preview-environments.yml');

    expect(previewWorkflow).toContain("PREVIEW_DATA_MODE: ${{ vars.PREVIEW_DATA_MODE || 'seed' }}");
    expect(previewWorkflow).toContain("PREVIEW_DEV_LOGIN_EMAIL: ${{ vars.PREVIEW_DEV_LOGIN_EMAIL || 'dev.teacher@yawp.local' }}");
    expect(previewWorkflow).toContain("PREVIEW_AI_MODEL: ${{ vars.PREVIEW_AI_MODEL || 'claude-sonnet-4-6' }}");
    expect(previewWorkflow).toContain('PREVIEW_ANTHROPIC_API_KEY: ${{ secrets.PREVIEW_ANTHROPIC_API_KEY || secrets.ANTHROPIC_API_KEY }}');
    expect(previewWorkflow).toContain('PREVIEW_DB_DUMP_S3_URI');
    expect(previewWorkflow).toContain('PREVIEW_DB_PASSWORD: ${{ secrets.PREVIEW_DB_PASSWORD }}');
    expect(previewWorkflow).toContain('shell_quote()');
    expect(previewWorkflow).toContain('PREVIEW_DATA_MODE=$(shell_quote "$PREVIEW_DATA_MODE")');
    expect(previewWorkflow).toContain('PREVIEW_DEV_LOGIN_EMAIL=$(shell_quote "$PREVIEW_DEV_LOGIN_EMAIL")');
    expect(previewWorkflow).toContain('PREVIEW_AI_MODEL=$(shell_quote "$PREVIEW_AI_MODEL")');
    expect(previewWorkflow).toContain('PREVIEW_ANTHROPIC_API_KEY=$(shell_quote "$PREVIEW_ANTHROPIC_API_KEY")');
    expect(previewWorkflow).toContain('PREVIEW_DB_DUMP_S3_URI=$(shell_quote "$PREVIEW_DB_DUMP_S3_URI")');
    expect(previewWorkflow).toContain('PREVIEW_DB_PASSWORD=$(shell_quote "$PREVIEW_DB_PASSWORD")');
    expect(previewWorkflow).toContain('test -n "$PREVIEW_ANTHROPIC_API_KEY"');
    expect(previewWorkflow).not.toContain('test -n "$PREVIEW_LOGIN_EMAIL"');
    expect(previewWorkflow).not.toContain('test -n "$PREVIEW_LOGIN_PASSWORD"');
  });

  test('preview workflow does not require runner AWS credentials for dump restores', () => {
    const previewWorkflow = readRepoFile('.github/workflows/preview-environments.yml');

    expect(previewWorkflow).not.toContain('aws-actions/configure-aws-credentials');
    expect(previewWorkflow).not.toContain('secrets.AWS_ACCESS_KEY_ID');
    expect(previewWorkflow).not.toContain('secrets.AWS_SECRET_ACCESS_KEY');
    expect(previewWorkflow).not.toContain('aws s3 presign');
  });

  test('preview deploy polls health quickly once containers are starting', () => {
    const deployScript = readRepoFile('scripts/preview/deploy.sh');

    expect(deployScript).toContain('curl -fsS --connect-timeout 1 --max-time 2 "$health_url"');
    expect(deployScript).toContain('sleep 1');
    expect(deployScript).not.toContain('--max-time 5 "$health_url"');
    expect(deployScript).not.toContain('sleep 2');
  });

  test('preview deploy verifies login before reporting the preview URL', () => {
    const deployScript = readRepoFile('scripts/preview/deploy.sh');
    const loginSmokeIndex = deployScript.indexOf('smoke-login.mjs');
    const previewUrlIndex = deployScript.indexOf('echo "PREVIEW_URL=$URL"');

    expect(loginSmokeIndex).toBeGreaterThan(-1);
    expect(previewUrlIndex).toBeGreaterThan(-1);
    expect(loginSmokeIndex).toBeLessThan(previewUrlIndex);
  });

  test('preview deploy resets the configured production-dump login password before smoke', () => {
    const deployScript = readRepoFile('scripts/preview/deploy.sh');
    const migrateIndex = deployScript.indexOf('bun prisma migrate deploy');
    const resetIndex = deployScript.indexOf(
      'bun run packages/prisma/scripts/preview-login-password-reset.ts',
    );
    const webStartIndex = deployScript.indexOf('start_or_refresh_web');
    const smokeIndex = deployScript.indexOf('smoke-login.mjs');

    expect(deployScript).toContain('PREVIEW_LOGIN_EMAIL');
    expect(deployScript).toContain('PREVIEW_LOGIN_PASSWORD');
    expect(deployScript).toContain('if [[ "$DATA_MODE" != "production-dump" ]]; then');
    expect(deployScript).toContain('Skipping preview login password reset for seeded preview data.');
    expect(resetIndex).toBeGreaterThan(-1);
    expect(migrateIndex).toBeGreaterThan(-1);
    expect(webStartIndex).toBeGreaterThan(-1);
    expect(smokeIndex).toBeGreaterThan(-1);
    expect(migrateIndex).toBeLessThan(resetIndex);
    expect(resetIndex).toBeLessThan(webStartIndex);
    expect(resetIndex).toBeLessThan(smokeIndex);
  });

  test('preview deploy restarts the web container after source syncs', () => {
    const deployScript = readRepoFile('scripts/preview/deploy.sh');
    const toolboxIndex = deployScript.indexOf('run_tooling_if_needed');
    const webStartIndex = deployScript.indexOf('start_or_refresh_web');

    expect(toolboxIndex).toBeGreaterThan(-1);
    expect(webStartIndex).toBeGreaterThan(-1);
    expect(toolboxIndex).toBeLessThan(webStartIndex);
    expect(deployScript).toContain('"${compose[@]}" up -d --force-recreate web');
  });

  test('preview source sync excludes generated container output', () => {
    const previewWorkflow = readRepoFile('.github/workflows/preview-environments.yml');

    expect(previewWorkflow).toContain("--exclude 'services/web-app/.react-router'");
    expect(previewWorkflow).toContain("--exclude 'services/web-app/.vite'");
  });

  test('preview host bootstrap installs AWS CLI for production dump restores', () => {
    const bootstrapScript = readRepoFile('scripts/preview/bootstrap-host.sh');

    expect(bootstrapScript).toContain('awscli');
  });

  test('preview host bootstrap blocks container access to instance metadata', () => {
    const bootstrapScript = readRepoFile('scripts/preview/bootstrap-host.sh');

    expect(bootstrapScript).toContain('DOCKER-USER');
    expect(bootstrapScript).toContain('169.254.169.254/32');
    expect(bootstrapScript).toContain('169.254.170.2/32');
  });

  test('preview host bootstrap uses the same shared Postgres compose project as deploy', () => {
    const bootstrapScript = readRepoFile('scripts/preview/bootstrap-host.sh');
    const deployScript = readRepoFile('scripts/preview/deploy.sh');

    expect(bootstrapScript).toContain('POSTGRES_PROJECT="${PREVIEW_POSTGRES_PROJECT:-yawp-preview-db}"');
    expect(deployScript).toContain('POSTGRES_PROJECT="${PREVIEW_POSTGRES_PROJECT:-yawp-preview-db}"');
    expect(bootstrapScript).toContain('docker compose -p "$POSTGRES_PROJECT" -f "$ROOT/postgres/docker-compose.yml" up -d');
  });

  test('preview host migration keeps shared services attached to the preview network', () => {
    const bootstrapScript = readRepoFile('scripts/preview/bootstrap-host.sh');
    const deployScript = readRepoFile('scripts/preview/deploy.sh');

    expect(deployScript).toContain('docker network connect preview "$POSTGRES_CONTAINER"');
    expect(bootstrapScript).toContain('docker network connect preview "$container"');
    expect(bootstrapScript).toContain('connect_container_to_preview_network preview-postgres');
    expect(bootstrapScript).toContain('connect_container_to_preview_network traefik-traefik-1');
  });

  test('preview GitHub config can publish dump location and login smoke secrets', () => {
    const configScript = readRepoFile('scripts/github-preview-config.sh');

    expect(configScript).toContain('PREVIEW_HOST');
    expect(configScript).toContain('PREVIEW_DOMAIN');
    expect(configScript).toContain('PREVIEW_ROOT');
    expect(configScript).toContain('PREVIEW_DATA_MODE');
    expect(configScript).toContain('PREVIEW_DEV_LOGIN_EMAIL');
    expect(configScript).toContain('PREVIEW_AI_MODEL');
    expect(configScript).toContain('PREVIEW_SSH_PRIVATE_KEY');
    expect(configScript).toContain('PREVIEW_ANTHROPIC_API_KEY');
    expect(configScript).not.toContain(`${deprecatedPreviewEnvPrefix}_`);
    expect(configScript).toContain('gh_var PREVIEW_DATA_MODE');
    expect(configScript).toContain('gh_var PREVIEW_DEV_LOGIN_EMAIL');
    expect(configScript).toContain('gh_var PREVIEW_AI_MODEL');
    expect(configScript).toContain('gh_var PREVIEW_DB_DUMP_S3_URI');
    expect(configScript).toContain('gh_sec PREVIEW_ANTHROPIC_API_KEY');
    expect(configScript).toContain('gh_sec PREVIEW_DB_PASSWORD');
    expect(configScript).toContain('gh_sec PREVIEW_LOGIN_EMAIL');
    expect(configScript).toContain('gh_sec PREVIEW_LOGIN_PASSWORD');
  });

  test('preview implementation does not expose deprecated preview naming', () => {
    const checkedPaths = [
      '.github/workflows/preview-environments.yml',
      'docs/runbooks/preview.md',
      'scripts/github-preview-config.sh',
      'scripts/preview',
      'services/web-app/scripts/smoke-pr-preview.mjs',
      'packages/prisma/scripts/seed-overlay.test.ts',
    ];

    for (const file of checkedPaths.flatMap(listRepoFiles)) {
      const contents = readRepoFile(file);
      expect(contents).not.toContain(deprecatedPreviewBrand);
      expect(contents).not.toContain(deprecatedPreviewSlug);
      expect(contents).not.toContain(deprecatedPreviewEnvPrefix);
      expect(contents).not.toContain(deprecatedPreviewRoot);
      expect(contents).not.toContain(deprecatedPreviewFunction);
      expect(contents).not.toContain(deprecatedPreviewSnake);
    }

    for (const file of listTrackedRepoFiles()) {
      expect(file).not.toContain(deprecatedPreviewSlug);
      expect(file).not.toContain(deprecatedPreviewSnake);
    }
  });

  test('preview comment describes seeded data and dev-login smoke', () => {
    const previewWorkflow = readRepoFile('.github/workflows/preview-environments.yml');

    expect(previewWorkflow).toContain(
      '- **Data:** seeded local-dev data in an isolated PR database',
    );
    expect(previewWorkflow).toContain('- **Smoke:** healthcheck + dev login');
    expect(previewWorkflow).not.toContain('seed overlay');
  });
});
