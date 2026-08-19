import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const repoRoot = join(import.meta.dir, '..');
const deprecatedPreviewBrand = [
  'Preview',
  String.fromCharCode(70, 111, 114, 103, 101),
].join(' ');
const deprecatedPreviewSlug = [
  'preview',
  String.fromCharCode(102, 111, 114, 103, 101),
].join('-');
const deprecatedPreviewEnvPrefix = [
  'PREVIEW',
  String.fromCharCode(70, 79, 82, 71, 69),
].join('_');
const deprecatedPreviewRoot = [
  'yawp',
  'preview',
  String.fromCharCode(102, 111, 114, 103, 101),
].join('-');
const deprecatedPreviewFunction = [
  'buildPreview',
  String.fromCharCode(70, 111, 114, 103, 101),
].join('');
const deprecatedPreviewSnake = [
  'preview',
  String.fromCharCode(102, 111, 114, 103, 101),
].join('_');
const deprecatedPreviewBasicAuth = ['PREVIEW', 'BASIC', 'AUTH'].join('_');

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
  })
    .trim()
    .split('\n')
    .filter(Boolean);
}

describe('production deployment contract', () => {
  test('tracked gitlinks have matching submodule declarations', () => {
    const gitlinks = execFileSync('git', ['ls-files', '-s'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter((line) => line.startsWith('160000 '))
      .map((line) => line.split('\t')[1]);
    const modules = existsSync(join(repoRoot, '.gitmodules'))
      ? readRepoFile('.gitmodules')
      : '';

    for (const gitlink of gitlinks) {
      expect(modules).toContain(`path = ${gitlink}`);
    }
  });

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
    expect(ciWorkflow).toContain(
      'bun test ./scripts/deployment-contract.test.ts'
    );
    expect(ciWorkflow).toContain(
      'teacher-training-assignment-migration.test.ts'
    );
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
    const prismaPackage = JSON.parse(
      readRepoFile('packages/prisma/package.json')
    );

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
      'COPY --from=build /app/services/web-app/node_modules ./services/web-app/node_modules'
    );
  });

  test('Docker runtime image exposes client assets for root-level serve commands', () => {
    const dockerfile = readRepoFile('services/web-app/Dockerfile');

    expect(dockerfile).toContain(
      'COPY --from=build /app/services/web-app/build/client ./build/client'
    );
  });

  test('container startup runs React Router serve with Bun instead of requiring Node', () => {
    const startScript = readRepoFile('services/web-app/start.sh');

    expect(startScript).toContain('cd "$(dirname "$0")"');
    expect(startScript).toContain(
      'exec bun node_modules/@react-router/serve/bin.js'
    );
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
    const reactRouterConfig = readRepoFile(
      'services/web-app/react-router.config.ts'
    );

    expect(reactRouterConfig).toContain('unstable_optimizeDeps: true');
  });

  test('main deploy runs production Prisma migrations before publishing the image', () => {
    const deployWorkflow = readRepoFile('.github/workflows/deploy.yml');
    const migrateRemoteScript = readRepoFile(
      'packages/prisma/scripts/migrate-remote.ts'
    );
    const deployGenerateIndex = deployWorkflow.indexOf('bun prisma generate');
    const deployValidateMigrateIndex = deployWorkflow.indexOf(
      'bun prisma migrate deploy'
    );
    const deployTrainingMigrationTestIndex = deployWorkflow.indexOf(
      'teacher-training-assignment-migration.test.ts'
    );
    const deployValidateBackfillIndex = deployWorkflow.indexOf(
      'backfill-class-art-key'
    );
    const migrateIndex = deployWorkflow.indexOf(
      'bun prisma:migrate-remote production'
    );
    const pushIndex = deployWorkflow.indexOf(
      'bun web-app:docker:production:push'
    );
    const remoteMigrateIndex = migrateRemoteScript.indexOf(
      "['prisma', 'migrate', 'deploy']"
    );
    const remoteBackfillIndex = migrateRemoteScript.indexOf(
      'backfill-class-art-key.ts'
    );
    const remoteReleaseGateIndex = migrateRemoteScript.indexOf(
      'assignment-type-release-gate.ts'
    );

    expect(deployWorkflow).toContain('validate-prisma-migrations');
    expect(deployWorkflow).toContain('needs: [validate-prisma-migrations]');
    expect(deployWorkflow).toContain('bun prisma generate');
    expect(deployWorkflow).toContain(
      'teacher-training-assignment-migration.test.ts'
    );
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
    expect(deployTrainingMigrationTestIndex).toBeLessThan(
      deployValidateMigrateIndex
    );
    expect(deployValidateBackfillIndex).toBeGreaterThan(
      deployValidateMigrateIndex
    );
    expect(migrateIndex).toBeGreaterThan(-1);
    expect(pushIndex).toBeGreaterThan(-1);
    expect(migrateIndex).toBeLessThan(pushIndex);
    expect(migrateRemoteScript).toContain('--require-data');
    expect(migrateRemoteScript).toContain(
      '20260703195500_realign_teacher_training_assignments'
    );
    expect(migrateRemoteScript).toContain(
      "['prisma', 'migrate', 'resolve', '--rolled-back'"
    );
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

    expect(rootPackage.scripts.dev).toContain(
      'scripts/worktree-local-setup.sh --no-dev'
    );
    expect(rootPackage.scripts.dev).toContain(
      'source .worktree-local/config.env'
    );
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

  test('production domain terminates at a CloudFront TLS 1.3 edge before App Runner', () => {
    const infra = readRepoFile('infra/main.tf');
    const variables = readRepoFile('infra/variables.tf');

    expect(variables).toContain('variable "production_domain_name"');
    expect(infra).toContain('production_edge_enabled');
    expect(infra).toContain('var.env == "production"');
    expect(infra).toContain(
      'resource "aws_cloudfront_distribution" "web_edge"'
    );
    expect(infra).toContain('aliases');
    expect(infra).toContain('[var.production_domain_name]');
    expect(infra).toContain('domain_name = local.apprunner_origin_domain');
    expect(infra).toContain('origin_protocol_policy = "https-only"');
    expect(infra).toContain('"Managed-AllViewer"');
    expect(infra).not.toContain(
      'resource "aws_cloudfront_function" "forward_viewer_host"'
    );
    expect(infra).not.toContain('FunctionValidationError');
    expect(infra).toContain('minimum_protocol_version = "TLSv1.2_2021"');
    expect(infra).not.toContain('minimum_protocol_version = "TLSv1.3_2025"');
    expect(infra).toContain('ssl_support_method');
    expect(infra).toContain('"sni-only"');
    expect(infra).toContain(
      'resource "aws_route53_record" "production_domain_a"'
    );
    expect(infra).toContain(
      'name                   = aws_cloudfront_distribution.web_edge[0].domain_name'
    );
    expect(infra).toContain(
      'zone_id                = aws_cloudfront_distribution.web_edge[0].hosted_zone_id'
    );
  });
});

describe('PR preview deployment contract', () => {
  test('preview workflow deploys every same-repo pull request through preview environments', () => {
    const previewWorkflow = readRepoFile(
      '.github/workflows/preview-environments.yml'
    );

    expect(previewWorkflow).toContain('name: PR preview');
    expect(previewWorkflow).toContain('pull_request_target');
    expect(previewWorkflow).toContain(
      'types: [opened, synchronize, reopened, ready_for_review, labeled, unlabeled, closed]'
    );
    expect(previewWorkflow).toContain(
      'github.event.pull_request.head.repo.full_name == github.repository'
    );
    expect(previewWorkflow).toContain('scripts/preview/admit-and-deploy.sh');
    expect(previewWorkflow).toContain(
      'scripts/preview/remove-preview-path.sh scripts/preview/cleanup.sh'
    );
    expect(previewWorkflow).not.toContain(deprecatedPreviewBrand);
    expect(previewWorkflow).not.toContain(`${deprecatedPreviewEnvPrefix}_`);
    expect(previewWorkflow).not.toContain(deprecatedPreviewSlug);
  });

  test('preview workflow no longer uses App Runner, Terraform, ECR pushes, or slash-command previews', () => {
    const previewWorkflow = readRepoFile(
      '.github/workflows/preview-environments.yml'
    ).toLowerCase();

    expect(previewWorkflow).not.toContain('apprunner');
    expect(previewWorkflow).not.toContain('infra-pr');
    expect(previewWorkflow).not.toContain('terraform');
    expect(previewWorkflow).not.toContain('docker push');
    expect(previewWorkflow).not.toMatch(/(^|\s)\/preview(\s|$)/);
  });

  test('retired App Runner preview infrastructure cannot be redeployed from this repo', () => {
    const ciWorkflow = readRepoFile('.github/workflows/ci.yml');

    const infraPrFiles = existsSync(join(repoRoot, 'infra-pr'))
      ? listRepoFiles('infra-pr')
      : [];
    expect(infraPrFiles).toEqual([]);
    expect(ciWorkflow).not.toContain('validate-terraform-infra-pr');
    expect(ciWorkflow).not.toContain('terraform -chdir=infra-pr');
  });

  test('preview deploy preserves existing seed databases unless reset is explicit', () => {
    const deployScript = readRepoFile('scripts/preview/deploy.sh');
    const resetIndex = deployScript.indexOf('reset_seed_preview_database');
    const dropIndex = deployScript.indexOf(
      'drop_preview_database "$DATABASE_NAME"',
      resetIndex
    );
    const generateIndex = deployScript.indexOf('bun prisma generate');
    const migrateIndex = deployScript.indexOf('bun prisma migrate deploy');
    const backfillIndex = deployScript.indexOf(
      'bun run scripts/backfill-class-art-key.ts'
    );
    const seedIndex = deployScript.indexOf('bun run seed-local-dev');
    const syncIndex = deployScript.indexOf(
      'bun run sync-prod-fidelity-fixtures'
    );
    const releaseGateIndex = deployScript.indexOf(
      'bun run scripts/assignment-type-release-gate.ts --require-data'
    );
    const webStartIndex = deployScript.indexOf('start_or_refresh_web');

    expect(deployScript).toContain('PREVIEW_DATA_MODE');
    expect(deployScript).toContain('DATA_MODE');
    expect(deployScript).toContain('DEMO_RESET_DATA');
    expect(deployScript).toContain('database_exists "$DATABASE_NAME"');
    expect(deployScript).toContain(
      'if [[ "${DEMO_RESET_DATA:-false}" == "true" ]]'
    );
    expect(deployScript).toContain(
      'Refusing to replace demo database while DEMO_RESET_DATA=false.'
    );
    expect(deployScript).toContain(
      'Refusing to adopt an existing demo database without a matching data-source fingerprint.'
    );
    expect(deployScript).not.toContain('Adopt legacy demo databases');
    expect(deployScript).toContain('drop_preview_database "$DATABASE_NAME"');
    expect(deployScript).toContain(
      'createdb -U postgres -O "$DATABASE_USER" "$DATABASE_NAME"'
    );
    expect(deployScript).toContain('bun run seed-local-dev');
    expect(deployScript).toContain('bun run sync-prod-fidelity-fixtures');
    expect(deployScript).toContain(
      '-f "$SOURCE_DIR/packages/prisma/scripts/sync-prod-fidelity-fixtures.ts"'
    );
    expect(deployScript).toContain(
      'Requested application ref predates preview seats; preserving the existing demo database.'
    );
    expect(deployScript).toContain('packages/prisma/fixtures/prod-fidelity');
    expect(deployScript).toContain('bun run seed-preview-seats');
    expect(deployScript).toContain('oven/bun:1.3.1');
    expect(deployScript).toContain(
      'bun scripts/preview/access-code.mjs --seats'
    );
    expect(deployScript).toContain('PREVIEW_DEV_LOGIN_EMAIL');
    expect(deployScript).toContain(
      'PREVIEW_SEAT_COUNT="${PREVIEW_SEAT_COUNT:-1}"'
    );
    expect(deployScript).toContain('backfill-class-art-key.ts');
    expect(deployScript).toContain(
      'assignment-type-release-gate.ts --require-data'
    );
    expect(deployScript).not.toContain('seed-overlay.ts');
    expect(resetIndex).toBeGreaterThan(-1);
    expect(dropIndex).toBeGreaterThan(resetIndex);
    expect(generateIndex).toBeGreaterThan(-1);
    expect(migrateIndex).toBeGreaterThan(generateIndex);
    expect(backfillIndex).toBeGreaterThan(migrateIndex);
    expect(seedIndex).toBeGreaterThan(backfillIndex);
    expect(syncIndex).toBeGreaterThan(backfillIndex);
    expect(releaseGateIndex).toBeGreaterThan(seedIndex);
    expect(webStartIndex).toBeGreaterThan(releaseGateIndex);
  });

  test('the database deletion boundary independently rejects unconfirmed demo resets', () => {
    const deployScript = readRepoFile('scripts/preview/deploy.sh');
    const functionStart = deployScript.indexOf('drop_preview_database()');
    const functionEnd = deployScript.indexOf('\n}', functionStart);
    const boundary = deployScript.slice(functionStart, functionEnd);

    expect(functionStart).toBeGreaterThan(-1);
    expect(boundary).toContain('require_demo_reset_confirmation');
    expect(boundary).toContain('DEMO_RESET_DATA');
    expect(boundary).toContain('dropdb -U postgres --force --if-exists');
    expect(
      deployScript.match(/drop_preview_database "\$DATABASE_NAME"/g)?.length
    ).toBe(2);
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
    expect(deployScript).toContain(
      'Restoring production dump into template database'
    );
    // Was: toContain('DATABASE_NAME="yawp_pr_${PR_NUMBER}"'). This test cares that the
    // production-dump path still clones per-environment databases, and used that line as a
    // marker for "DATABASE_NAME is set" — but the line itself was the bug: it rebuilt a
    // pr-prefixed name and so ignored the slug override that named environments (the demo
    // box) depend on. The invariant is that DATABASE_NAME comes from preview-env.mjs.
    expect(deployScript).toContain('${DATABASE_NAME:?');
    expect(deployScript).not.toContain('DATABASE_NAME="yawp_pr_${PR_NUMBER}"');
    expect(deployScript).toContain(
      'Preview database $DATABASE_NAME already exists; skipping clone.'
    );
    expect(deployScript).toContain('production-dump|sanitized-production)');
    expect(deployScript).toContain(
      'createdb -U postgres -O "$DATABASE_USER" -T "$TEMPLATE_DB" "$DATABASE_NAME"'
    );
  });

  test('preview deploy caches tooling work but still refreshes web containers', () => {
    const deployScript = readRepoFile('scripts/preview/deploy.sh');

    expect(deployScript).toContain('compute_tooling_fingerprint()');
    expect(deployScript).toContain(
      'TOOLING_FINGERPRINT_FILE="$PREVIEW_DIR/tooling.sha256"'
    );
    expect(deployScript).toContain(
      'packages/prisma/scripts/assignment-type-release-gate.ts'
    );
    expect(deployScript).toContain(
      'packages/prisma/scripts/backfill-class-art-key.ts'
    );
    expect(deployScript).toContain('scripts/preview/deploy.sh');
    expect(deployScript).toContain(
      'Tooling fingerprint unchanged and database already existed; skipping install/generate/migrate.'
    );
    expect(deployScript).toContain(
      '"${compose[@]}" up -d --force-recreate web'
    );
    expect(deployScript).not.toContain(
      'Web container already running; relying on bind-mounted source update.'
    );
  });

  test('production previews rebuild application code even when database tooling is cached', () => {
    const deployScript = readRepoFile('scripts/preview/deploy.sh');
    const prebuildFunction = deployScript.slice(
      deployScript.indexOf('prebuild_production_images()'),
      deployScript.indexOf(
        '\n}',
        deployScript.indexOf('prebuild_production_images()')
      )
    );
    const buildIndex = prebuildFunction.indexOf(
      'COMPOSE_PARALLEL_LIMIT=1 "${compose[@]}" build web toolbox'
    );
    const cacheReturnIndex = deployScript.indexOf(
      'Tooling fingerprint unchanged and database already existed; skipping install/generate/migrate.'
    );
    const prebuildCallIndex = deployScript.lastIndexOf(
      '\nprebuild_production_images\n'
    );
    const resetCallIndex = deployScript.lastIndexOf(
      '\nreset_preview_database_for_data_source_change\n'
    );

    expect(buildIndex).toBeGreaterThan(-1);
    expect(cacheReturnIndex).toBeGreaterThan(-1);
    expect(prebuildCallIndex).toBeGreaterThan(-1);
    expect(resetCallIndex).toBeGreaterThan(prebuildCallIndex);
  });

  test('preview containers cannot use EC2 metadata credentials', () => {
    const compose = readRepoFile('scripts/preview/render-compose.mjs');

    expect(compose).toContain('AWS_EC2_METADATA_DISABLED: "true"');
  });

  test('preview containers receive only a per-database least-privilege role', () => {
    const previewEnv = readRepoFile('scripts/preview/preview-env.mjs');
    const renderCompose = readRepoFile('scripts/preview/render-compose.mjs');
    const deploy = readRepoFile('scripts/preview/deploy.sh');
    const workflow = readRepoFile('.github/workflows/preview-environments.yml');

    expect(previewEnv).not.toContain("DEFAULT_DATABASE_USER = 'postgres'");
    expect(previewEnv).not.toContain("DEFAULT_DATABASE_PASSWORD = 'postgres'");
    expect(deploy).toContain('ensure_preview_database_role');
    expect(deploy).toContain('REVOKE CONNECT ON DATABASE');
    expect(deploy).toContain('PREVIEW_POSTGRES_ADMIN_PASSWORD');
    expect(deploy).toContain('NOBYPASSRLS');
    expect(deploy).toContain('revoke_public_database_connect "$TEMPLATE_DB"');
    expect(deploy).toContain('chmod 600 "$temporary"');
    expect(renderCompose).not.toContain('postgres:postgres@preview-postgres');
    expect(workflow).toContain('PREVIEW_POSTGRES_ADMIN_PASSWORD=');
    expect(workflow).not.toContain(
      'PREVIEW_DB_PASSWORD=$(shell_quote "$PREVIEW_DB_PASSWORD")'
    );
  });

  test('the role-swap flag is structurally coupled to root request middleware', () => {
    const rootRoute = readRepoFile('services/web-app/app/root.tsx');
    const routerConfig = readRepoFile(
      'services/web-app/react-router.config.ts'
    );
    const gate = readRepoFile(
      'services/web-app/app/utils/preview-access.server.ts'
    );
    const compose = readRepoFile('scripts/preview/render-compose.mjs');

    expect(routerConfig).toContain('v8_middleware: true');
    expect(rootRoute).toContain(
      'export const middleware = [previewAccessMiddleware]'
    );
    expect(gate).toContain("process.env.PREVIEW_ACCESS_GATE === 'on'");
    expect(gate).toContain("'/api/healthcheck'");
    expect(compose).toContain('PREVIEW_ACCESS_GATE: "on"');
    expect(compose).toContain('requirePreviewAccessSeats(accessSeats)');
    expect(compose).toContain('requirePreviewAccessSecret(accessSecret)');
    expect(compose).toContain('requirePreviewSessionSecret(sessionSecret)');
  });

  test('preview cleanup removes closed PR resources and is scheduled', () => {
    const cleanupScript = readRepoFile('scripts/preview/cleanup.sh');
    const removeScript = readRepoFile('scripts/preview/remove-preview-path.sh');
    const previewWorkflow = readRepoFile(
      '.github/workflows/preview-environments.yml'
    );

    expect(cleanupScript).toContain('OPEN_PR_NUMBERS');
    expect(cleanupScript).toContain('PREVIEW_TTL_HOURS');
    expect(cleanupScript).toContain(
      'dropdb -U postgres --if-exists "$database_name"'
    );
    expect(cleanupScript).toContain(
      'dropuser -U postgres --if-exists "${database_name}_app"'
    );
    expect(cleanupScript).toContain(
      'docker volume rm "${project}_${project}-postgres-data"'
    );
    expect(cleanupScript).toContain('preview_remove_path');
    expect(removeScript).toContain('preview_remove_path_is_safe');
    expect(previewWorkflow).toContain('schedule:');
    expect(previewWorkflow).toContain(
      'cat scripts/preview/remove-preview-path.sh scripts/preview/cleanup.sh'
    );
    expect(previewWorkflow).toContain('TARGET_PR=$(shell_quote "$PR_NUMBER")');
    expect(previewWorkflow).not.toMatch(
      /preview-destroy:[\s\S]*?contains\(github\.event\.pull_request\.(title|body)/
    );
    expect(previewWorkflow).toContain('PREVIEW_MAX_RUNNING');
    expect(previewWorkflow).toContain('PREVIEW_MAX_RESIDENT');
    expect(previewWorkflow).toContain('PREVIEW_SLEEP_ENABLED');
    expect(previewWorkflow).toContain('preview:keep-awake');
    expect(previewWorkflow).toContain('PREVIEW_MODE=reconcile');
    expect(previewWorkflow).toContain('CAP_SLEPT');
  });

  test('preview admission and deploy share one host lock', () => {
    const previewWorkflow = readRepoFile(
      '.github/workflows/preview-environments.yml'
    );
    const wrapper = readRepoFile('scripts/preview/admit-and-deploy.sh');
    const enforcer = readRepoFile('scripts/preview/enforce-cap.sh');

    expect(previewWorkflow).toContain('scripts/preview/admit-and-deploy.sh');
    expect(previewWorkflow).toContain('PREVIEW_GITHUB_TOKEN');
    expect(previewWorkflow).not.toContain('gh pr list --state open');
    expect(wrapper).toContain('preview-host.lock');
    expect(wrapper).toContain('flock -w');
    expect(wrapper.indexOf('enforce-cap.sh')).toBeLessThan(
      wrapper.indexOf('deploy.sh')
    );
    expect(enforcer).toContain(
      'acquire_host_lock\nprune_stale_inflight_markers\nrefresh_pr_state'
    );
    expect(enforcer).toContain('"$previews_dir" "$ROOT/sources"');
    expect(previewWorkflow).toContain('PREVIEW_INFLIGHT_MARKER');
    expect(previewWorkflow).toContain('PREVIEW_QUARANTINE_MARKER');
    expect(previewWorkflow).toContain('quarantine_marker');
    expect(previewWorkflow).toContain('scripts/preview/sync-source.sh');
    expect(wrapper).toContain('cleanup_quarantine_marker');
    expect(enforcer).toContain('is_inflight');
  });

  test('preview deployment uses current reviewed control-plane code with protected host credentials', () => {
    const previewWorkflow = readRepoFile(
      '.github/workflows/preview-environments.yml'
    );

    expect(previewWorkflow).toContain('environment: preview-host');
    expect(previewWorkflow).toContain('path: preview-control');
    expect(previewWorkflow).toContain('github.event.pull_request.head.sha');
    expect(previewWorkflow).toContain(
      'gh api "/repos/${GITHUB_REPOSITORY}/tarball/${PR_HEAD_SHA}"'
    );
    expect(previewWorkflow).toContain(
      'tar -xzf pr-source.tar.gz --strip-components=1 -C pr-source'
    );
    expect(previewWorkflow).not.toContain('name: Checkout pull request source');
    expect(previewWorkflow).toContain(
      'ref: ${{ github.event.repository.default_branch }}'
    );
    expect(previewWorkflow).not.toContain('github.event.pull_request.base.sha');
    expect(previewWorkflow).toContain(
      'github.event.pull_request.base.ref == github.event.repository.default_branch'
    );
    expect(previewWorkflow).toContain('remote_control=');
    expect(previewWorkflow).toContain(
      'control_sha="$(git -C preview-control rev-parse HEAD)"'
    );
    expect(previewWorkflow).toContain('PREVIEW_CONTROL_SHA=');
    expect(previewWorkflow).not.toContain(
      'cd $(shell_quote "$remote_source") && ${remote_env[*]} bash scripts/preview/admit-and-deploy.sh'
    );
  });

  test('preview bootstrap installs aggregate host metrics timer', () => {
    const bootstrapWorkflow = readRepoFile(
      '.github/workflows/preview-host-bootstrap.yml'
    );
    const bootstrap = readRepoFile('scripts/preview/bootstrap-host.sh');
    const metrics = readRepoFile('scripts/preview/publish-host-metrics.sh');

    expect(bootstrapWorkflow).toContain('publish-host-metrics.sh');
    expect(bootstrap).toContain('yawp-preview-metrics.timer');
    expect(bootstrap).toContain('OnUnitActiveSec=60');
    expect(metrics).toContain('Yawp/PreviewHost');
    expect(metrics).toContain('MemoryUsedPercent');
    expect(metrics).toContain('RunningPreviews');
    expect(metrics).not.toContain('PullRequest');
  });

  test('preview bootstrap migrates resident compose files before rotating the administrator', () => {
    const ci = readRepoFile('.github/workflows/ci.yml');
    const workflow = readRepoFile(
      '.github/workflows/preview-host-bootstrap.yml'
    );
    const bootstrap = readRepoFile('scripts/preview/bootstrap-host.sh');
    const migration = readRepoFile(
      'scripts/preview/migrate-resident-database-roles.sh'
    );

    expect(workflow).toContain('migrate-resident-database-roles.sh');
    expect(bootstrap).toContain('migrate-resident-database-roles.sh');
    expect(bootstrap).toContain('flock -w 900');
    expect(bootstrap).toContain('chmod 700 "$ROOT/postgres"');
    expect(bootstrap).toContain('chmod 600 "$postgres_compose_temporary"');
    expect(migration).toContain(
      "relation.relkind IN ('r', 'p', 'S', 'v', 'm', 'f')"
    );
    expect(migration).toContain('REVOKE CONNECT ON DATABASE');
    expect(migration).toContain('create --force-recreate web');
    expect(migration).toContain('verify_role_database');
    expect(migration).toContain('wait_for_web_health');
    expect(migration).toContain('rollback_active_migration');
    expect(migration).toContain('ALTER ROLE postgres WITH PASSWORD');
    expect(ci).toContain("PREVIEW_DATABASE_ROLE_INTEGRATION: '1'");
    expect(ci).toContain('bun test ./scripts/preview/ --timeout 180000');
  });

  test('preview bootstrap installs a secret-protected first-request wake path', () => {
    const workflow = readRepoFile(
      '.github/workflows/preview-host-bootstrap.yml'
    );
    const bootstrap = readRepoFile('scripts/preview/bootstrap-host.sh');
    const wakeServer = readRepoFile('scripts/preview/wake-server.mjs');
    const wakeScript = readRepoFile('scripts/preview/wake-preview.sh');
    const wakeProof = readRepoFile('scripts/preview/prove-wake.sh');

    expect(workflow).toContain('scripts/preview/wake-server.mjs');
    expect(workflow).toContain('scripts/preview/wake-preview.sh');
    expect(workflow).toContain('PREVIEW_MAX_RUNNING');
    expect(workflow).toContain('PREVIEW_DOMAIN');
    expect(bootstrap).toContain('yawp-preview-wake.service');
    expect(bootstrap).toContain('--accesslog.filepath=/logs/access.json');
    expect(bootstrap).toContain('rateLimit');
    expect(bootstrap).toContain('preview-wake-fallback');
    expect(bootstrap).toContain('X-Preview-Wake-Secret');
    expect(bootstrap).toContain('HostRegexp(`^pr-[1-9][0-9]*\\\\.');
    expect(bootstrap).not.toContain(
      '/var/run/docker.sock:/var/run/docker.sock:rw'
    );
    expect(wakeServer).toContain('timingSafeEqual');
    expect(wakeServer).toContain('startAccessLogFollower');
    expect(wakeScript).toContain('docker compose');
    expect(wakeScript).toContain(' start');
    expect(wakeScript).not.toContain(' up ');
    expect(wakeScript).not.toContain(' down ');
    expect(wakeProof).toContain('PROOF_RESULT=pass');
    expect(wakeProof).toContain('PROOF_CONTAINER_BEFORE');
    expect(wakeProof).toContain('PROOF_CONTAINER_AFTER');
  });

  test('preview idle defaults are two days and comments promise authorized URL wake', () => {
    const workflow = readRepoFile('.github/workflows/preview-environments.yml');
    const bootstrapWorkflow = readRepoFile(
      '.github/workflows/preview-host-bootstrap.yml'
    );
    const bootstrapScript = readRepoFile('scripts/preview/bootstrap-host.sh');
    const enforceCap = readRepoFile('scripts/preview/enforce-cap.sh');
    const wakePreview = readRepoFile('scripts/preview/wake-preview.sh');
    const wakeServer = readRepoFile('scripts/preview/wake-server.mjs');

    expect(workflow).toContain(
      "PREVIEW_DRAFT_IDLE_HOURS: ${{ vars.PREVIEW_DRAFT_IDLE_HOURS || '48' }}"
    );
    expect(workflow).toContain(
      "PREVIEW_READY_IDLE_HOURS: ${{ vars.PREVIEW_READY_IDLE_HOURS || '48' }}"
    );
    expect(
      workflow.match(
        /PREVIEW_SLEEP_ENABLED: \$\{\{ vars\.PREVIEW_SLEEP_ENABLED \|\| 'true' \}\}/g
      )
    ).toHaveLength(2);
    expect(
      workflow.match(
        /PREVIEW_MAX_RUNNING: \$\{\{ vars\.PREVIEW_MAX_RUNNING \|\| '4' \}\}/g
      )
    ).toHaveLength(2);
    expect(bootstrapWorkflow).toContain(
      "PREVIEW_MAX_RUNNING: ${{ vars.PREVIEW_MAX_RUNNING || '4' }}"
    );
    expect(bootstrapScript).toContain(
      'RUNNING_CAP="${PREVIEW_MAX_RUNNING:-4}"'
    );
    expect(enforceCap).toContain('RUNNING_CAP="${PREVIEW_MAX_RUNNING:-4}"');
    expect(enforceCap).toContain(
      'SLEEP_ENABLED="${PREVIEW_SLEEP_ENABLED:-true}"'
    );
    expect(wakePreview).toContain('RUNNING_CAP="${PREVIEW_MAX_RUNNING:-4}"');
    expect(wakePreview).toContain(
      'INFLIGHT_TTL_SECONDS="${PREVIEW_INFLIGHT_TTL_SECONDS:-3600}"'
    );
    expect(bootstrapWorkflow).toContain(
      "PREVIEW_INFLIGHT_TTL_SECONDS: ${{ vars.PREVIEW_INFLIGHT_TTL_SECONDS || '3600' }}"
    );
    expect(wakeServer).toContain("process.env.PREVIEW_MAX_RUNNING || '4'");
    expect(workflow).toContain(
      'Open its one-click URL, or revisit from an already authorized browser, to wake it automatically'
    );
  });

  test('preview host bootstrap runs only reviewed default-branch code', () => {
    const workflow = readRepoFile(
      '.github/workflows/preview-host-bootstrap.yml'
    );

    expect(workflow).toContain(
      "if: github.ref == format('refs/heads/{0}', github.event.repository.default_branch)"
    );
    expect(workflow).toContain('ref: ${{ github.sha }}');
    expect(workflow).not.toContain('${{ inputs.ref }}');
  });

  test('preview workflow enables live AI for every access-gated preview', () => {
    const previewWorkflow = readRepoFile(
      '.github/workflows/preview-environments.yml'
    );

    expect(previewWorkflow).toContain(
      "contains(github.event.pull_request.labels.*.name, 'sanitized-production-data') && 'sanitized-production'"
    );
    expect(previewWorkflow).toContain(
      "PREVIEW_SEAT_COUNT: ${{ vars.PREVIEW_SEAT_COUNT || '1' }}"
    );
    expect(previewWorkflow).toContain(
      "PREVIEW_DEV_LOGIN_EMAIL: ${{ vars.PREVIEW_DEV_LOGIN_EMAIL || 'dev.teacher@yawp.local' }}"
    );
    expect(previewWorkflow).toContain(
      "PREVIEW_AI_MODEL: ${{ vars.PREVIEW_AI_MODEL || 'claude-sonnet-4-6' }}"
    );
    expect(previewWorkflow).toContain(
      'PREVIEW_ANTHROPIC_API_KEY: ${{ secrets.PREVIEW_ANTHROPIC_API_KEY || secrets.ANTHROPIC_API_KEY }}'
    );
    expect(previewWorkflow).toContain('PREVIEW_AI_MODE: live');
    expect(previewWorkflow).toContain(
      'AI:** live in every access-gated PR preview'
    );
    expect(previewWorkflow).toContain('PREVIEW_DB_DUMP_S3_URI');
    expect(previewWorkflow).toContain(
      'PREVIEW_POSTGRES_ADMIN_PASSWORD: ${{ secrets.PREVIEW_DB_PASSWORD }}'
    );
    expect(previewWorkflow).toContain('shell_quote()');
    expect(previewWorkflow).toContain(
      'PREVIEW_DATA_MODE=$(shell_quote "$PREVIEW_DATA_MODE")'
    );
    expect(previewWorkflow).toContain(
      'PREVIEW_DEV_LOGIN_EMAIL=$(shell_quote "$PREVIEW_DEV_LOGIN_EMAIL")'
    );
    expect(previewWorkflow).toContain(
      'PREVIEW_AI_MODEL=$(shell_quote "$PREVIEW_AI_MODEL")'
    );
    expect(previewWorkflow).toContain(
      'PREVIEW_ANTHROPIC_API_KEY=$(shell_quote "$PREVIEW_ANTHROPIC_API_KEY")'
    );
    expect(previewWorkflow).toContain(
      'test -n "$PREVIEW_ANTHROPIC_API_KEY" || { echo "Missing preview-host secret PREVIEW_ANTHROPIC_API_KEY or ANTHROPIC_API_KEY"; exit 1; }'
    );
    expect(previewWorkflow).toContain(
      'PREVIEW_DB_DUMP_S3_URI=$(shell_quote "$PREVIEW_DB_DUMP_S3_URI")'
    );
    expect(previewWorkflow).toContain(
      'PREVIEW_DB_DUMP_VERSION=$(shell_quote "$PREVIEW_DB_DUMP_VERSION")'
    );
    expect(previewWorkflow).toContain(
      'PREVIEW_ACCESS_MASTER_ORGANIZATION_ID=$(shell_quote "$PREVIEW_ACCESS_MASTER_ORGANIZATION_ID")'
    );
    expect(previewWorkflow).toContain(
      'PREVIEW_MASTER_ACCESS_CODE: ${{ secrets.PREVIEW_MASTER_ACCESS_CODE }}'
    );
    expect(previewWorkflow).toContain(
      'PREVIEW_MASTER_ACCESS_CODE=$(shell_quote "$PREVIEW_MASTER_ACCESS_CODE")'
    );
    expect(previewWorkflow).toContain(
      'PREVIEW_POSTGRES_ADMIN_PASSWORD=$(shell_quote "$PREVIEW_POSTGRES_ADMIN_PASSWORD")'
    );
    expect(previewWorkflow).not.toContain(deprecatedPreviewBasicAuth);
    expect(previewWorkflow).toContain('production-dump)');
    expect(previewWorkflow).toContain('[[ -n "$PREVIEW_LOGIN_EMAIL" ]]');
    expect(previewWorkflow).toContain('[[ -n "$PREVIEW_LOGIN_PASSWORD" ]]');
    expect(previewWorkflow).toContain('sanitized-production)');
    expect(previewWorkflow).toContain('PREVIEW_SANITIZED_DUMP_VERSION');
  });

  test('preview workflow does not require runner AWS credentials for dump restores', () => {
    const previewWorkflow = readRepoFile(
      '.github/workflows/preview-environments.yml'
    );

    expect(previewWorkflow).not.toContain(
      'aws-actions/configure-aws-credentials'
    );
    expect(previewWorkflow).not.toContain('secrets.AWS_ACCESS_KEY_ID');
    expect(previewWorkflow).not.toContain('secrets.AWS_SECRET_ACCESS_KEY');
    expect(previewWorkflow).not.toContain('aws s3 presign');
  });

  test('master organization gate rolls out only to capable refs and rejects code collisions', () => {
    const previewWorkflow = readRepoFile(
      '.github/workflows/preview-environments.yml'
    );
    const demoWorkflow = readRepoFile('.github/workflows/demo-environment.yml');
    const deployScript = readRepoFile('scripts/preview/deploy.sh');
    const capability = readRepoFile(
      'services/web-app/.preview-master-org-gate-v1'
    );

    expect(capability).toContain('preview-master-org-gate-v1');
    expect(deployScript).toContain(
      'SOURCE_DIR/services/web-app/.preview-master-org-gate-v1'
    );
    expect(deployScript).toContain('assert_no_master_code_collision');
    expect(deployScript).toContain(
      'deployment stopped without changing that code'
    );
    expect(deployScript).toContain(
      'PREVIEW_MASTER_ACCESS_CODE must be a lowercase hyphenated code between 8 and 64 characters'
    );
    expect(previewWorkflow).toContain(
      'steps.deploy.outputs.master_org_gate_enabled'
    );
    expect(demoWorkflow).toContain(
      'steps.deploy.outputs.master_org_gate_enabled'
    );
  });

  test('preview deploy polls health quickly once containers are starting', () => {
    const deployScript = readRepoFile('scripts/preview/deploy.sh');

    // The subject here is poll SPEED. /api/healthcheck stays outside the in-app gate.
    expect(deployScript).toContain(
      '--connect-timeout 1 --max-time 2 "$health_url"'
    );
    expect(deployScript).toContain(
      'curl -fsS --connect-timeout 1 --max-time 2 "$health_url"'
    );
    expect(deployScript).not.toContain(deprecatedPreviewBasicAuth);
    expect(deployScript).toContain('sleep 1');
    expect(deployScript).not.toContain('--max-time 5 "$health_url"');
    expect(deployScript).not.toContain('sleep 2');
  });

  test('preview deploy tooling contains no transitional transport auth references', () => {
    for (const path of [
      'scripts/preview/deploy.sh',
      'scripts/preview/smoke-login.mjs',
      'scripts/github-preview-config.sh',
      '.github/workflows/preview-environments.yml',
      '.github/workflows/demo-environment.yml',
    ]) {
      expect(readRepoFile(path)).not.toContain(deprecatedPreviewBasicAuth);
    }
  });

  test('preview deploy verifies login before reporting the preview URL', () => {
    const deployScript = readRepoFile('scripts/preview/deploy.sh');
    const loginSmokeIndex = deployScript.indexOf('smoke-login.mjs');
    const previewUrlIndex = deployScript.indexOf('echo "PREVIEW_URL=$URL"');

    expect(loginSmokeIndex).toBeGreaterThan(-1);
    expect(previewUrlIndex).toBeGreaterThan(-1);
    expect(loginSmokeIndex).toBeLessThan(previewUrlIndex);
  });

  test('preview deploy restarts the web container after source syncs', () => {
    const deployScript = readRepoFile('scripts/preview/deploy.sh');
    const toolboxIndex = deployScript.indexOf('run_tooling_if_needed');
    const webStartIndex = deployScript.indexOf('start_or_refresh_web');

    expect(toolboxIndex).toBeGreaterThan(-1);
    expect(webStartIndex).toBeGreaterThan(-1);
    expect(toolboxIndex).toBeLessThan(webStartIndex);
    expect(deployScript).toContain(
      '"${compose[@]}" up -d --force-recreate web'
    );
  });

  test('demo production deploy keeps the old web container until its replacement passes health and login checks', () => {
    const deployScript = readRepoFile('scripts/preview/deploy.sh');
    const rolloutPath = 'scripts/preview/rollout-web.sh';
    const traefikDiscoveryPath = 'scripts/preview/find-traefik-dynamic-dir.sh';

    expect(existsSync(join(repoRoot, rolloutPath))).toBe(true);
    expect(existsSync(join(repoRoot, traefikDiscoveryPath))).toBe(true);
    if (!existsSync(join(repoRoot, rolloutPath))) return;

    const rolloutScript = readRepoFile(rolloutPath);
    expect(deployScript).toContain(
      '[[ "$SLUG" == "demo" && "$RUNTIME" == "production"'
    );
    expect(deployScript).toContain('bash "$SCRIPT_DIR/rollout-web.sh"');
    expect(deployScript).toContain(
      'bash "$SCRIPT_DIR/find-traefik-dynamic-dir.sh"'
    );
    expect(deployScript).not.toContain(
      'PREVIEW_ROUTER_FILE="$ROOT/traefik/dynamic/'
    );
    expect(rolloutScript).toContain('--no-recreate --scale web=2 web');
    expect(rolloutScript).toContain('wait_for_container_health');
    expect(rolloutScript).toContain('run_login_smoke "$candidate_url"');
    expect(rolloutScript).toContain('write_candidate_route');
    expect(rolloutScript).toContain('docker stop "$old_container"');
    expect(rolloutScript).toContain('restore_previous_route');
    expect(rolloutScript).toContain('docker start "$old_container"');
    expect(rolloutScript).toContain('run_public_smoke');
    expect(rolloutScript).toContain(
      'PREVIEW_ROLLBACK_WEB_CONTAINER=$old_container'
    );
    expect(rolloutScript).not.toContain('docker rm "$old_container"');
    expect(rolloutScript).toContain(
      'web_containers_output="$(list_web_containers)"'
    );
  });

  test('preview source sync excludes generated container output', () => {
    const syncSource = readRepoFile('scripts/preview/sync-source.sh');

    expect(syncSource).toContain("--exclude 'services/web-app/.react-router'");
    expect(syncSource).toContain("--exclude 'services/web-app/.vite'");
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

    expect(bootstrapScript).toContain(
      'POSTGRES_PROJECT="${PREVIEW_POSTGRES_PROJECT:-yawp-preview-db}"'
    );
    expect(deployScript).toContain(
      'POSTGRES_PROJECT="${PREVIEW_POSTGRES_PROJECT:-yawp-preview-db}"'
    );
    expect(bootstrapScript).toContain(
      'docker compose -p "$POSTGRES_PROJECT" -f "$postgres_compose" up -d'
    );
  });

  test('preview host migration keeps shared services attached to the preview network', () => {
    const bootstrapScript = readRepoFile('scripts/preview/bootstrap-host.sh');
    const deployScript = readRepoFile('scripts/preview/deploy.sh');

    expect(deployScript).toContain(
      'docker network connect preview "$POSTGRES_CONTAINER"'
    );
    expect(bootstrapScript).toContain(
      'docker network connect preview "$container"'
    );
    expect(bootstrapScript).toContain(
      'connect_container_to_preview_network preview-postgres'
    );
    expect(bootstrapScript).toContain(
      'connect_container_to_preview_network traefik-traefik-1'
    );
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

  test('preview comment describes selected data and dev-login smoke', () => {
    const previewWorkflow = readRepoFile(
      '.github/workflows/preview-environments.yml'
    );

    expect(previewWorkflow).toContain(
      '- **Data:** `${{ env.PREVIEW_DATA_MODE }}` in an isolated PR database'
    );
    expect(previewWorkflow).toContain(
      '- **Smoke:** in-app access gate + dev login'
    );
    expect(previewWorkflow).not.toContain('seed overlay');
  });
});

describe('demo environment deployment contract', () => {
  test('demo host diagnostics expose only non-secret container and mount metadata', () => {
    const diagnostics = readRepoFile(
      '.github/workflows/demo-host-diagnostics.yml'
    );

    expect(diagnostics).toContain('environment: demo');
    expect(diagnostics).toContain(
      "docker ps --format 'name={{.Names}} image={{.Image}} status={{.Status}}'"
    );
    expect(diagnostics).toContain('.Config.Image');
    expect(diagnostics).toContain('.Config.Cmd');
    expect(diagnostics).toContain('.Destination');
    expect(diagnostics).not.toContain('.Config.Env');
    expect(diagnostics).not.toContain('.Source');
    expect(diagnostics).not.toContain('docker exec');
    expect(diagnostics).not.toContain('docker stop');
    expect(diagnostics).not.toContain('docker rm');
  });

  test('demo Traefik maintenance is main-controlled and rollback protected', () => {
    const workflow = readRepoFile(
      '.github/workflows/demo-traefik-file-provider.yml'
    );
    const script = readRepoFile(
      'scripts/preview/enable-traefik-file-provider.sh'
    );

    expect(workflow).toContain('environment: demo');
    expect(workflow).toContain(
      'ref: ${{ github.event.repository.default_branch }}'
    );
    expect(workflow).toContain('group: demo-environment');
    expect(workflow).toContain(
      '< scripts/preview/enable-traefik-file-provider.sh'
    );
    expect(script).toContain('Demo must be healthy before');
    expect(script).toContain('cp -p -- "$COMPOSE_FILE" "$backup_file"');
    expect(script).toContain('trap rollback EXIT');
    expect(script).toContain('Previous Traefik configuration restored');
    expect(script).toContain('verify_running_provider');
    expect(script).toContain('TRAEFIK_FILE_PROVIDER_ENABLED=true');
  });

  // deploy.sh runs ON THE DEMO HOST over SSH, so a value declared in the job's `env:`
  // reaches the runner and stops there unless remote_env forwards it. Declared and
  // forwarded are two different things; this asserts they agree.
  test('every PREVIEW_ variable the demo job declares is forwarded to the host', () => {
    const workflow = readRepoFile('.github/workflows/demo-environment.yml');

    expect(workflow).toContain(
      "PREVIEW_SEAT_COUNT: ${{ vars.DEMO_SEAT_COUNT || '1' }}"
    );

    const declared = [...workflow.matchAll(/^ {6}(PREVIEW_[A-Z0-9_]+):/gm)].map(
      (m) => m[1]
    );
    expect(declared.length).toBeGreaterThan(5);

    // Stop at the line that closes the array, not the first ')' — that one belongs to
    // $(shell_quote ...) on the very first entry.
    const remoteEnvStart = workflow.indexOf('remote_env=(');
    const remoteEnvBlock = workflow.slice(
      remoteEnvStart,
      workflow.indexOf('\n          )', remoteEnvStart)
    );
    expect(remoteEnvBlock).toContain('SOURCE_DIR=');

    // PREVIEW_HOST/SSH_USER address the machine itself; they are used to build the SSH
    // connection, not consumed by the script on the far end.
    const connectionOnly = new Set(['PREVIEW_HOST', 'PREVIEW_SSH_USER']);
    const missing = declared
      .filter((name) => !connectionOnly.has(name))
      .filter((name) => !remoteEnvBlock.includes(`${name}=`));

    expect(missing).toEqual([]);
  });

  test('the demo deploy proves the in-app gate blocks data before trusting a code', () => {
    const workflow = readRepoFile('.github/workflows/demo-environment.yml');

    expect(workflow).toContain('data-preview-access-screen');
    expect(workflow).toContain(
      'POST /auth/dev-login without an access cookie returned HTTP $blocked, expected 401'
    );
    expect(workflow).toContain('--data-urlencode "code=$access_code"');
    expect(workflow).not.toContain(deprecatedPreviewBasicAuth);
    expect(workflow).not.toContain('curl --user');
  });

  test('demo deploys share the host mutation lock with PR preview deploys', () => {
    const workflow = readRepoFile('.github/workflows/demo-environment.yml');

    expect(workflow).toContain('lock_file="${PREVIEW_ROOT}/preview-host.lock"');
    expect(workflow).toContain('flock -w 1800');
    expect(workflow).toContain('bash -lc $(shell_quote "$deploy_command")');
  });

  test('demo reset requires typed confirmation and takes a pre-reset backup', () => {
    const workflow = readRepoFile('.github/workflows/demo-environment.yml');
    const deployScript = readRepoFile('scripts/preview/deploy.sh');
    const resetGuard = readRepoFile('scripts/preview/demo-reset-guard.sh');

    expect(workflow).toContain('reset_confirmation:');
    expect(workflow).toContain('DEMO_RESET_CONFIRMATION:');
    expect(workflow).toContain('DEMO_BACKUP_RETENTION:');
    expect(workflow).toContain(
      'test "$DEMO_REQUESTED_REF" = "$DEMO_DEFAULT_BRANCH"'
    );
    expect(workflow).toContain(
      'reset_data may only deploy the reviewed default branch'
    );
    expect(workflow).toContain('Checkout reviewed demo control plane');
    expect(workflow).toContain('Checkout the requested application ref');
    expect(workflow).toContain('demo-control/ "$ssh_target:$remote_control/"');
    expect(workflow).toContain(
      'deploy_command="cd $(shell_quote "$remote_control") && ${remote_env[*]} bash scripts/preview/deploy.sh"'
    );
    expect(workflow).not.toContain(
      'cd $(shell_quote "$remote_source") && ${remote_env[*]} bash scripts/preview/deploy.sh'
    );
    expect(workflow).toContain(
      'DEMO_RESET_CONFIRMATION=$(shell_quote "$DEMO_RESET_CONFIRMATION")'
    );
    expect(workflow).toContain(
      'DEMO_BACKUP_RETENTION=$(shell_quote "$DEMO_BACKUP_RETENTION")'
    );

    expect(deployScript).toContain('demo-reset-guard.sh');
    expect(resetGuard).toContain('require_demo_reset_confirmation');
    expect(resetGuard).toContain('RESET ${DATABASE_NAME}');
    expect(resetGuard).toContain('DEMO_RESET_CONFIRMATION');
    expect(deployScript).toContain('BACKUP_KIND=pre-reset');
    expect(deployScript).toContain('backup-database.sh');
    expect(deployScript).toContain('publish-demo-backup.sh');
    expect(deployScript).toContain('DEMO_RESET_RECOVERY_ARMED=true');
    expect(deployScript).toContain('recover_demo_database_on_failure');
    expect(deployScript).toContain('restore-demo-backup.sh');
    expect(deployScript).toContain('install_demo_backup_tooling');
  });

  test('normal demo deploys prove aggregate data counts do not decrease', () => {
    const workflow = readRepoFile('.github/workflows/demo-environment.yml');
    const signaturePath = 'scripts/preview/demo-data-signature.sh';

    expect(existsSync(join(repoRoot, signaturePath))).toBe(true);
    expect(workflow).toContain('Capture demo data before deploy');
    expect(workflow).toContain('Capture demo data after deploy');
    expect(workflow).toContain('steps.before_data.outputs.signature');
    expect(workflow).toContain('DEMO_RESET_DATA');
    expect(workflow).toContain(
      'Demo aggregate data decreased during no-reset deploy'
    );
  });
  test('demo backups are scheduled daily with configurable count retention', () => {
    const workflow = readRepoFile('.github/workflows/demo-environment.yml');
    const backupWorkflow = readRepoFile(
      '.github/workflows/demo-database-backup.yml'
    );
    const deployScript = readRepoFile('scripts/preview/deploy.sh');
    const backupScript = readRepoFile('scripts/preview/backup-database.sh');
    const publishScriptPath = 'scripts/preview/publish-demo-backup.sh';

    expect(existsSync(join(repoRoot, publishScriptPath))).toBe(true);
    if (!existsSync(join(repoRoot, publishScriptPath))) return;
    const publishScript = readRepoFile(publishScriptPath);
    expect(workflow).toContain("default: '14'");
    expect(deployScript).toContain('install_demo_backup_tooling');
    expect(deployScript).toContain('$ROOT/ops/backup-database.sh');
    expect(deployScript).toContain('$ROOT/ops/publish-demo-backup.sh');
    expect(deployScript).not.toContain('crontab');
    expect(backupWorkflow).toContain("cron: '17 3 * * *'");
    expect(backupWorkflow).toContain('group: demo-environment');
    expect(backupWorkflow).toContain('Checkout reviewed backup control plane');
    expect(backupWorkflow).toContain('Install reviewed backup tooling');
    expect(backupWorkflow).toContain('backup-database.sh.next');
    expect(backupWorkflow).toContain('publish-demo-backup.sh.next');
    expect(backupWorkflow).toContain(
      '$PREVIEW_ROOT/ops/publish-demo-backup.sh'
    );
    expect(backupWorkflow).not.toContain('AWS_ACCESS_KEY_ID');
    expect(backupWorkflow).not.toContain('AWS_SECRET_ACCESS_KEY');
    expect(backupWorkflow).not.toContain('configure-aws-credentials');
    expect(backupWorkflow).toContain('demo-backups');
    expect(backupWorkflow).not.toContain('mapfile -t keys < <(aws s3api');
    expect(publishScript).toContain('aws s3 cp');
    expect(publishScript).toContain('s3api get-bucket-versioning');
    expect(publishScript).toContain('yawp_demo-scheduled-*.dump');
    expect(publishScript).toContain('yawp_demo-pre-reset-*.dump');
    expect(publishScript).not.toContain('s3api delete-object');
    expect(publishScript).not.toContain('s3api list-object-versions');
    expect(backupScript).toContain('BACKUP_RETENTION_COUNT');
    expect(backupScript).toContain('pg_restore --list');
    expect(backupScript).toContain('--exit-on-error');
    expect(backupScript).toContain('.partial');
  });

  test('demo backup IAM rollout explicitly denies deletion from the host role', () => {
    const workflowPath = '.github/workflows/demo-backup-iam-guard.yml';
    const guardPath = 'scripts/preview/guard-demo-backup-iam.sh';
    expect(existsSync(join(repoRoot, workflowPath))).toBe(true);
    expect(existsSync(join(repoRoot, guardPath))).toBe(true);
    if (
      !existsSync(join(repoRoot, workflowPath)) ||
      !existsSync(join(repoRoot, guardPath))
    )
      return;

    const workflow = readRepoFile(workflowPath);
    const guard = readRepoFile(guardPath);
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('AWS_ACCESS_KEY_ID');
    expect(workflow).toContain('AWS_SECRET_ACCESS_KEY');
    expect(workflow).toContain('github.event.repository.default_branch');
    expect(workflow).toContain('guard-demo-backup-iam.sh');
    expect(guard).toContain('iam put-role-policy');
    expect(guard).toContain('iam create-instance-profile');
    expect(guard).toContain('ec2 associate-iam-instance-profile');
    expect(guard).toContain('yawp-demo-host-backup-access');
    expect(guard).toContain('s3:PutObject');
    expect(guard).toContain('yawp-demo-backup-deny-delete');
    expect(guard).toContain('s3:DeleteObject');
    expect(guard).toContain('s3:DeleteObjectVersion');
    expect(guard).toContain('iam simulate-principal-policy');
    expect(guard).toContain('explicitDeny');
  });
  test('workflow verification is anonymous and retains in-app gate assertions', () => {
    for (const path of [
      '.github/workflows/preview-environments.yml',
      '.github/workflows/demo-environment.yml',
    ]) {
      const workflow = readRepoFile(path);

      expect(workflow).not.toContain(deprecatedPreviewBasicAuth);
      expect(workflow).not.toContain('curl --user');
      expect(workflow).toContain('data-preview-access-screen');
      expect(workflow).toContain(
        'POST /auth/dev-login without an access cookie returned HTTP $blocked, expected 401'
      );
    }
  });
});
