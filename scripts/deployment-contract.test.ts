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

describe('Product Lab environment contract', () => {
  test('manual Product Lab workflow derives stable lab infra from yawp-pm manifests', () => {
    const workflow = readRepoFile('.github/workflows/product-lab-environments.yml');

    expect(workflow).toContain('workflow_dispatch');
    expect(workflow).toContain('The-Connell-School/yawp-pm');
    expect(workflow).toContain('bun scripts/product-lab-env.ts');
    expect(workflow).toContain('key=${terraformStateKey}');
    expect(workflow).toContain('PREVIEW_DB_DUMP_S3_URI');
    expect(workflow).toContain('Create or restore lab data checkpoint');
    expect(workflow).toContain('aws s3 ls "s3://${PREVIEW_AWS_S3_BUCKET}/${checkpointKey}"');
    expect(workflow).toContain('sed -e "/^CREATE SCHEMA ${databaseSchema};/d"');
    expect(workflow).toContain('Capture lab data checkpoint');
    expect(workflow).toContain('aws s3 cp - "s3://${PREVIEW_AWS_S3_BUCKET}/${checkpointKey}"');
    expect(workflow).toContain('TF_VAR_app_name="$appName"');
    expect(workflow).toContain('TF_VAR_env="$environment"');
    expect(workflow).toContain('TF_VAR_database_schema="$databaseSchema"');
    expect(workflow).toContain('bun scripts/product-lab-env.ts "$MANIFEST" "${{ inputs.initiative_id }}"');
    expect(workflow).toContain('cp scripts/product-lab-env.ts /tmp/product-lab-env.ts');
    expect(workflow).toContain('ref: ${{ env.engineeringBranch }}');
    expect(workflow).toContain('App branch: ${engineeringBranch}');
    expect(workflow).toContain("import { appendSchemaToDatabaseUrl } from '/tmp/product-lab-env.ts'");
    expect(workflow).toContain('DATABASE_URL="$labDatabaseUrl" bun prisma migrate deploy');
    expect(workflow).toContain('pg_dump "$PSQL_URL" --schema="$databaseSchema" --format=plain --no-owner --no-acl');
    expect(workflow).toContain('actions/upload-artifact@v4');
    expect(workflow).toContain('product-lab-${{ inputs.initiative_id }}-checkpoint');
    expect(workflow).toContain('Publish lab environment summary');
    expect(workflow).toContain('terraform -chdir=infra-pr output -raw apprunner_service_url');
    expect(workflow).toContain('Product Lab URL');
    expect(workflow).toContain('Checkpoint state');
    expect(workflow).toContain('Checkpoint key');
    expect(workflow).toContain('bin/record-product-lab-run ${{ inputs.initiative_id }}');
    expect(workflow).toContain('--preview-url \\"https://${LAB_URL}\\"');
    expect(workflow).toContain('--checkpoint-state \\"${checkpointState}\\"');
    expect(workflow).toContain('--checkpoint-artifact \\"product-lab-${{ inputs.initiative_id }}-checkpoint\\"');
    expect(workflow).not.toContain('branches:\n      - main');
    expect(workflow).not.toContain('bun web-app:docker:production:push');
  });
});

describe('PR preview deployment contract', () => {
  test('preview workflow deploys every same-repo pull request through preview forge', () => {
    const previewWorkflow = readRepoFile('.github/workflows/preview-environments.yml');

    expect(previewWorkflow).toContain('pull_request');
    expect(previewWorkflow).toContain('types: [opened, synchronize, reopened, closed]');
    expect(previewWorkflow).toContain("github.event.pull_request.head.repo.full_name == github.repository");
    expect(previewWorkflow).toContain('scripts/preview-forge/deploy.sh');
    expect(previewWorkflow).toContain('scripts/preview-forge/destroy.sh');
  });

  test('preview workflow no longer uses App Runner, Terraform, ECR pushes, or slash-command previews', () => {
    const previewWorkflow = readRepoFile('.github/workflows/preview-environments.yml').toLowerCase();

    expect(previewWorkflow).not.toContain('apprunner');
    expect(previewWorkflow).not.toContain('infra-pr');
    expect(previewWorkflow).not.toContain('terraform');
    expect(previewWorkflow).not.toContain('docker push');
    expect(previewWorkflow).not.toMatch(/(^|\s)\/preview(\s|$)/);
  });

  test('preview forge polls health quickly once containers are starting', () => {
    const deployScript = readRepoFile('scripts/preview-forge/deploy.sh');

    expect(deployScript).toContain('curl -fsS --connect-timeout 1 --max-time 2 "$health_url"');
    expect(deployScript).toContain('sleep 1');
    expect(deployScript).not.toContain('--max-time 5 "$health_url"');
    expect(deployScript).not.toContain('sleep 2');
  });

  test('preview forge restarts the web container after source syncs', () => {
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
});
