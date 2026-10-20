import { describe, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

describe('private preview sign-in code deployment contract', () => {
  test('rendered PR configurations permit private capture; demo and production return 404 with the same secret', async () => {
    const { renderPreviewCompose } = await import('./preview/render-compose.mjs');
    const secret = 'fixture-access-secret-32-characters';
    const options = {
      prNumber: '565', domain: 'example.test', sourceDir: repoRoot,
      accessSeats: JSON.stringify([{ code: 'fixture-otter-4193', organizationId: 'local-dev-org', label: 'Master' }]),
      sessionSecret: 'fixture-session-secret-32-characters', accessSecret: secret,
      databasePassword: 'fixture-database-password-00010001',
    };
    const program = `
      const { previewCodeCaptureEnabled } = await import('./app/domain/unified-signon/preview-code.server');
      const { action, loader } = await import('./app/routes/api.preview.qa.signon-code/route');
      const request = new Request('https://example.test/api/preview/qa/signon-code', {
        method: 'POST', headers: {'content-type': 'application/json', authorization: 'Bearer ' + process.env.PREVIEW_ACCESS_SECRET},
        body: JSON.stringify({email: 'fixture@example.invalid'})
      });
      process.stdout.write(JSON.stringify({enabled: previewCodeCaptureEnabled(), status: (await action({request})).status, get: (await loader()).status}));
    `;
    for (const runtime of ['fast', 'production']) {
      const preview = (Bun.YAML.parse(renderPreviewCompose({ ...options, runtime })) as any).services.web.environment;
      const demo = (Bun.YAML.parse(renderPreviewCompose({ ...options, prNumber: undefined, slug: 'demo', runtime })) as any).services.web.environment;
      for (const [configuration, expected] of [
        [preview, { enabled: true, status: 404, get: 404 }], // No challenge yet.
        [{ ...preview, DATABASE_URL: `${preview.DATABASE_URL}?schema=public&sslmode=require` }, { enabled: true, status: 404, get: 404 }],
        [{ ...preview, DATABASE_URL: `${preview.DATABASE_URL}?host=127.0.0.1` }, { enabled: false, status: 404, get: 404 }],
        [{ ...preview, DATABASE_URL: `${preview.DATABASE_URL}?host=%2Fvar%2Frun%2Fpostgresql` }, { enabled: false, status: 404, get: 404 }],
        [demo, { enabled: false, status: 404, get: 404 }], // Shared renderer says preview; isolated DB gate rejects demo.
        [{ ...preview, YAWP_ENVIRONMENT: 'demo' }, { enabled: false, status: 404, get: 404 }],
        [{ ...preview, YAWP_ENVIRONMENT: 'production' }, { enabled: false, status: 404, get: 404 }],
        [{ ...preview, DATABASE_URL: '' }, { enabled: false, status: 404, get: 404 }],
        [{ ...preview, PREVIEW_ACCESS_SECRET: '' }, { enabled: false, status: 404, get: 404 }],
      ] as const) {
        const child = spawnSync(process.execPath, ['-e', program], {
          cwd: join(repoRoot, 'services/web-app'), encoding: 'utf8', timeout: 10000,
          env: { ...process.env, ...configuration },
        });
        expect(child.status).toBe(0);
        expect(JSON.parse(child.stdout)).toEqual(expected);
      }
      expect(preview.PREVIEW_ACCESS_SECRET === secret).toBe(true);
      expect(preview.SIGNON_MAIL_CAPTURE_DIR).toBeUndefined();
    }
    // No new provider/capture configuration is introduced to deployed targets.
    const capture = readRepoFile('services/web-app/app/domain/unified-signon/preview-code.server.ts');
    expect(capture).not.toMatch(/console\.|writeFile|sendEmail/);
    const mail = readRepoFile('services/web-app/app/domain/unified-signon/mail.server.ts');
    expect(mail.indexOf('capturePreviewCode(email, code)')).toBeLessThan(mail.indexOf('const db = new URL'));
  });
});

describe('optional Google OAuth deployment credentials', () => {
  test('production adoption is default-off, protected, and uses only existing secret ARNs', () => {
    const variables = readRepoFile('infra/variables.tf');
    const adoption = readRepoFile('infra/google-oauth.tf');
    const main = readRepoFile('infra/main.tf');
    expect(variables).toMatch(/variable "google_oauth_credentials_configured"\s*\{[^}]*default\s*= false/s);
    expect(adoption).toContain('var.google_oauth_credentials_configured && var.env == "production"');
    for (const key of ['client_id', 'client_secret']) {
      expect(adoption).toContain(`name        = "yawp-production-google-oauth-${key.replace('_', '-')}"`);
      expect(adoption).toContain(`to       = aws_secretsmanager_secret.google_oauth_${key}[each.key]`);
      expect(adoption).toContain(`id       = var.google_oauth_secret_arns.${key}`);
      expect(main).toContain(`aws_secretsmanager_secret.google_oauth_${key}["production"].arn`);
    }
    expect(adoption.match(/prevent_destroy = true/g)?.length).toBe(2);
    expect(adoption.match(/for_each\s*= local.google_oauth_adoption/g)?.length).toBe(4);
    expect(adoption).not.toMatch(/secret_version|secret_string|data\s+"aws_secretsmanager/);
    expect(variables).toContain('arn:aws:secretsmanager:us-east-1:422348803522:secret:yawp-production-google-oauth-');
    expect(main).toMatch(/local.google_oauth_enabled \? \[\s*aws_secretsmanager_secret.google_oauth_client_id\["production"\].arn,\s*aws_secretsmanager_secret.google_oauth_client_secret\["production"\].arn\s*\] : \[\]/);
    expect(main).toMatch(/local.google_oauth_enabled \? \{\s*GOOGLE_OAUTH_CLIENT_ID\s*= aws_secretsmanager_secret.google_oauth_client_id\["production"\].arn\s*GOOGLE_OAUTH_CLIENT_SECRET\s*= aws_secretsmanager_secret.google_oauth_client_secret\["production"\].arn\s*\} : \{\}/);
  });

  for (const target of ['demo', 'preview']) {
    const path = `.github/workflows/${target === 'demo' ? 'demo-environment' : 'preview-environments'}.yml`;
    test(`${target} masks optional credentials before transport and forwards them into the web container`, () => {
      const workflow = readRepoFile(path);
      const parsed = Bun.YAML.parse(workflow) as any;
      const job = Object.values(parsed.jobs).find((job: any) => job.env?.PREVIEW_GOOGLE_OAUTH_CLIENT_ID) as any;
      expect(job).toBeDefined();
      const mask = job.steps[0].run;
      expect(execFileSync('bash', ['-c', mask], { encoding: 'utf8', env: {
        ...process.env, PREVIEW_GOOGLE_OAUTH_CLIENT_ID: '', PREVIEW_GOOGLE_OAUTH_CLIENT_SECRET: '',
      } })).toBe('');
      const assignments: string[] = [];
      for (const key of ['CLIENT_ID', 'CLIENT_SECRET']) {
        const name = `PREVIEW_GOOGLE_OAUTH_${key}`;
        expect(job.env[name]).toBe(`\u0024{{ secrets.${target.toUpperCase()}_GOOGLE_OAUTH_${key} }}`);
        assignments.push(workflow.split('\n').find(line => line.includes(`"${name}=$(shell_quote`))!.trim());
        expect(workflow).not.toMatch(new RegExp(`test -n "\\$${name}"`));
      }
      const synthetic = "fixture oauth $value 'quoted' \\ tail";
      const env = {
        ...process.env,
        PREVIEW_GOOGLE_OAUTH_CLIENT_ID: synthetic,
        PREVIEW_GOOGLE_OAUTH_CLIENT_SECRET: `${synthetic}\nsecond line%`,
      };
      const masked = execFileSync('bash', ['-c', mask], { env, encoding: 'utf8' });
      const masks = masked.trim().split('\n').map(line => {
        expect(line.startsWith('::add-mask::')).toBe(true);
        return line.slice('::add-mask::'.length).replaceAll('%0A', '\n').replaceAll('%0D', '\r').replaceAll('%25', '%');
      });
      for (const value of [env.PREVIEW_GOOGLE_OAUTH_CLIENT_ID, env.PREVIEW_GOOGLE_OAUTH_CLIENT_SECRET]) {
        expect(masks.includes(value)).toBe(true);
        const quoted = execFileSync('bash', ['-c', 'printf "%q" "$VALUE"'], { env: { ...process.env, VALUE: value }, encoding: 'utf8' });
        expect(masks.includes(quoted)).toBe(true);
      }
      // Execute the workflow's actual shell-quoted assignments and the renderer
      // reached by deploy.sh, without contacting a host or running a container.
      const render = `shell_quote() { printf '%q' "$1"; }; remote_env=(\n${assignments.join('\n')}\n); eval "\u0024{remote_env[*]} node scripts/preview/render-compose.mjs"`;
      const fixture = {
        ...process.env, PR_NUMBER: target === 'preview' ? '142' : '', PREVIEW_SLUG: target === 'demo' ? 'demo' : '',
        PREVIEW_DOMAIN: 'example.test', PREVIEW_ROOT: process.env.TMPDIR!, SOURCE_DIR: repoRoot,
        PREVIEW_RUNTIME: 'production', PREVIEW_AI_MODE: 'disabled', PREVIEW_UA_STUDENT_BILLING_ENABLED: 'false',
        PREVIEW_ACCESS_SEATS: JSON.stringify([{ code: 'fixture-otter-4193', organizationId: 'local-dev-org', label: 'Master' }]),
        PREVIEW_ACCESS_SECRET: 'fixture-access-secret-32-characters', PREVIEW_SESSION_SECRET: 'fixture-session-secret-32-characters',
        PREVIEW_DB_PASSWORD: 'fixture-database-password-00010001', DEMO_INTERNAL_API_KEYS: '',
      };
      for (const configured of [false, true]) {
        const result = execFileSync('bash', ['-c', render], { cwd: repoRoot, encoding: 'utf8', env: {
          ...fixture,
          PREVIEW_GOOGLE_OAUTH_CLIENT_ID: configured ? env.PREVIEW_GOOGLE_OAUTH_CLIENT_ID : '',
          PREVIEW_GOOGLE_OAUTH_CLIENT_SECRET: configured ? env.PREVIEW_GOOGLE_OAUTH_CLIENT_SECRET : '',
        } });
        const compose = Bun.YAML.parse(result) as any;
        for (const key of ['CLIENT_ID', 'CLIENT_SECRET']) {
          const expected = configured ? env[`PREVIEW_GOOGLE_OAUTH_${key}` as keyof typeof env] : '';
          // Compose decodes $$ into a literal $ when starting the container.
          expect(compose.services.web.environment[`GOOGLE_OAUTH_${key}`].replaceAll('$$', '$') === expected).toBe(true);
          expect(compose.services.toolbox.environment[`GOOGLE_OAUTH_${key}`]).toBeUndefined();
        }
        expect(compose.services.web.environment.PREVIEW_UNIFIED_SIGN_ON).toBeUndefined();
        expect(compose.services.web.environment.UNIFIED_SIGN_ON).toBeUndefined();
      }
      expect(readRepoFile('scripts/preview/deploy.sh')).toContain('node "$SCRIPT_DIR/render-compose.mjs" > "$PREVIEW_DIR/docker-compose.yml"');
    });
  }

  test('failure log redaction hides host and runtime assignments including shell quoting', () => {
    const script = readRepoFile('scripts/preview/run-host-deploy-detached.sh');
    const mask = script.match(/mask_deploy_log\(\) \{[\s\S]*?\n\}/)?.[0];
    expect(mask).toBeDefined();
    const synthetic = "fixture oauth $value 'quoted' \\ tail";
    const quoted = execFileSync('bash', ['-c', 'printf "%q" "$VALUE"'], { env: { ...process.env, VALUE: `${synthetic}\nsecond-line` }, encoding: 'utf8' });
    for (const prefix of ['', 'PREVIEW_']) {
      for (const key of ['CLIENT_ID', 'CLIENT_SECRET']) {
        for (const value of [synthetic, quoted, JSON.stringify(synthetic)]) {
          for (const separator of ['=', ': ']) {
            const input = `before\n${prefix}GOOGLE_OAUTH_${key}${separator}${value}\nafter\n`;
            const output = execFileSync('bash', ['-c', `${mask}\nmask_deploy_log`], { input, encoding: 'utf8' });
            expect(output).toContain('[REDACTED]');
            expect(output.includes('fixture')).toBe(false);
            expect(output.includes('quoted')).toBe(false);
            expect(output.includes('tail')).toBe(false);
            expect(output).toContain('before\n');
            expect(output).toContain('\nafter\n');
          }
        }
      }
    }
  });
});

describe('production deployment contract', () => {
  test('CI isolates free-tier Prisma module mocks from the combined real-DB suite', () => {
    const workflow = readRepoFile('.github/workflows/ci.yml');
    const selection = workflow.match(/\$\((find \.\/services\/web-app\/app\/domain\/free-tier[^)]+)\)/)?.[1];
    expect(selection).toBeDefined();
    const selected = execFileSync('bash', ['-c', selection!], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim().split('\n');
    const mockFiles = listRepoFiles('services/web-app/app/domain/free-tier')
      .filter(file => file.endsWith('.test.ts') && /mock\.module\(['"]~\/utils\/db\.server['"]/.test(readRepoFile(file)));
    expect(mockFiles.length).toBeGreaterThan(0);
    for (const file of mockFiles) {
      expect(selected).not.toContain(`./${file}`);
      // Excluded tests must still run, each in a separate Bun process.
      expect(workflow).toContain(`run: bun test ./${file}\n`);
    }
  });

  test('E2E launcher never starts Vite after fixture preparation fails', () => {
    const command = readRepoFile('services/web-app/playwright.config.ts').match(/"bash -c '([^']+)'"/)?.[1];
    expect(command).toBeDefined();
    const directory = mkdtempSync(join(tmpdir(), 'yawp-e2e-launch-'));
    try {
      const bin = join(directory, 'bin');
      mkdirSync(bin);
      const trace = join(directory, 'trace');
      writeFileSync(join(bin, 'bun'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$E2E_LAUNCH_PROBE"\nexit 23\n', { mode: 0o755 });
      const result = spawnSync('bash', ['-c', command!], { cwd: directory, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, E2E_LAUNCH_PROBE: trace } });
      expect(result.status).toBe(23);
      expect(readFileSync(trace, 'utf8').trim().split('\n')).toEqual(['./e2e/ensure-e2e-env.ts']);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  test('root build context excludes local credentials and host dependencies', () => {
    const patterns = readRepoFile('.dockerignore').split(/\r?\n/).map(line => line.trim());
    for (const required of ['.git', '**/.env', '**/.env.*', '**/node_modules', '**/build']) {
      expect(patterns).toContain(required);
    }
  });

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

  test('CI includes scripts/** in the code path filter', () => {
    const ciWorkflow = readRepoFile('.github/workflows/ci.yml');
    // Guard against regressing the path filter that triggers Prisma contract tests.
    expect(ciWorkflow).toContain("- 'scripts/**'");
  });

  test('Prisma package keeps both migration release gates available', () => {
    const prismaPackage = JSON.parse(
      readRepoFile('packages/prisma/package.json')
    );

    expect(prismaPackage.scripts.prisma).toBe('prisma');
    expect(prismaPackage.scripts['assignment-type-release-gate']).toBe(
      'bun run scripts/assignment-type-release-gate.ts'
    );
    expect(prismaPackage.scripts['backfill-class-art-key']).toBe(
      'bun run scripts/backfill-class-art-key.ts'
    );
  });

  test('Docker build uses the Bun version that wrote the lockfile', () => {
    const dockerfile = readRepoFile('services/web-app/Dockerfile');

    expect(dockerfile).toContain('FROM oven/bun:1.4.3 AS base');
  });

  test('Docker image build does not bake preview database credentials into the image', () => {
    const dockerfile = readRepoFile('services/web-app/Dockerfile');
    const renderCompose = readRepoFile('scripts/preview/render-compose.mjs');

    expect(dockerfile).not.toMatch(/^\s*ARG DATABASE_URL/m);
    expect(dockerfile).not.toMatch(/^\s*ENV DATABASE_URL/m);
    expect(dockerfile).toContain(
      'DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build bun prisma generate'
    );
    expect(renderCompose).not.toMatch(/build:[\s\S]*args:[\s\S]*DATABASE_URL/);
  });

  test('Dockerfile exposes a dependency target for preview migration tooling', () => {
    const dockerfile = readRepoFile('services/web-app/Dockerfile');

    expect(dockerfile).toContain('FROM base AS deps');
    expect(dockerfile).toContain('FROM deps AS build');
  });

  test('Docker runtime image resolves web app serve binaries when Bun hoists deps', () => {
    const dockerfile = readRepoFile('services/web-app/Dockerfile');
    const startScript = readRepoFile('services/web-app/start.sh');

    expect(dockerfile).toContain('mkdir -p services/web-app/node_modules');
    expect(startScript).toContain(
      '../../node_modules/@react-router/serve/bin.js'
    );
  });

  test('Docker runtime image exposes client assets for root-level serve commands', () => {
    const dockerfile = readRepoFile('services/web-app/Dockerfile');

    expect(dockerfile).toContain(
      'COPY --from=build /app/services/web-app/build/client ./build/client'
    );
  });

  test('Docker image ships preview free-tier seed guard for prisma preview seeds', () => {
    const dockerfile = readRepoFile('services/web-app/Dockerfile');
    const workflow = readRepoFile('.github/workflows/ci.yml');

    expect(dockerfile).toContain(
      'COPY scripts/preview/free-tier-ship-review-seed-guard.mjs ./scripts/preview/free-tier-ship-review-seed-guard.mjs'
    );
    expect(dockerfile).toContain(
      'COPY --from=build /app/scripts/preview ./scripts/preview'
    );
    expect(workflow).toContain('Verify production image resolves preview seed imports');
    expect(workflow).toContain('seed-free-tier-feature-flag.ts');
    expect(workflow).toContain('free-tier-ship-review-seed-guard.mjs');
  });

  test('container startup runs React Router serve with Bun instead of requiring Node', () => {
    const startScript = readRepoFile('services/web-app/start.sh');

    expect(startScript).toContain('cd "$(dirname "$0")"');
    expect(startScript).toContain('@react-router/serve/bin.js');
    expect(startScript).toContain('exec bun "$serve_bin"');
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
    const deployBundleSeedIndex = deployWorkflow.indexOf(
      'seed-free-tier-bundle-assignment-types'
    );
    const deployValidateBackfillIndex = deployWorkflow.indexOf(
      'backfill-class-art-key'
    );
    const migrateIndex = deployWorkflow.indexOf(
      'bun prisma:migrate-remote production'
    );
    const fingerprintCheckIndex = deployWorkflow.indexOf(
      '"${observed_fingerprint}" != "${PROD_SSH_HOST_FINGERPRINT}"'
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
    const remoteBundleSeedIndex = migrateRemoteScript.indexOf(
      'seed-free-tier-bundle-assignment-types'
    );

    expect(deployWorkflow).toContain("bun-version: '1.4.3'");
    expect(deployWorkflow).toContain('validate-prisma-migrations');
    expect(deployWorkflow).toContain('needs: [validate-prisma-migrations]');
    expect(deployWorkflow).toContain('bun prisma generate');
    expect(deployWorkflow).toContain(
      'teacher-training-assignment-migration.test.ts'
    );
    expect(deployWorkflow).toContain('backfill-class-art-key');
    expect(deployWorkflow).toContain('PROD_SSH_PRIVATE_KEY');
    expect(deployWorkflow).toContain('PROD_SSH_KEY_PATH');
    expect(deployWorkflow).toContain('PROD_SSH_HOST_FINGERPRINT');
    expect(deployWorkflow).toContain('PROD_SSH_KNOWN_HOSTS_PATH');
    expect(deployWorkflow).not.toContain(
      'ssh-keyscan -H "${PROD_SSH_HOST}" >> ~/.ssh/known_hosts'
    );
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
    expect(deployBundleSeedIndex).toBeGreaterThan(deployValidateMigrateIndex);
    expect(deployValidateBackfillIndex).toBeGreaterThan(deployBundleSeedIndex);
    expect(migrateIndex).toBeGreaterThan(-1);
    expect(fingerprintCheckIndex).toBeGreaterThan(-1);
    expect(fingerprintCheckIndex).toBeLessThan(migrateIndex);
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
    expect(migrateRemoteScript).toContain("'StrictHostKeyChecking=yes'");
    expect(migrateRemoteScript).toContain('UserKnownHostsFile=');
    expect(migrateRemoteScript).toContain('PROD_SSH_KNOWN_HOSTS_PATH');
    expect(remoteMigrateIndex).toBeGreaterThan(-1);
    expect(remoteBackfillIndex).toBeGreaterThan(remoteMigrateIndex);
    expect(remoteReleaseGateIndex).toBeGreaterThan(remoteBackfillIndex);
    expect(remoteBundleSeedIndex).toBeGreaterThan(remoteReleaseGateIndex);
  });

  test('production QA pins and verifies the bastion host key before opening a tunnel', () => {
    const productionQaWorkflow = readRepoFile(
      '.github/workflows/production-qa-profile.yml'
    );

    expect(productionQaWorkflow).toContain('PROD_SSH_HOST_FINGERPRINT');
    expect(productionQaWorkflow).toContain('observed_fingerprint');
    expect(productionQaWorkflow).toContain(
      '"${observed_fingerprint}" != "${PROD_SSH_HOST_FINGERPRINT}"'
    );
    expect(productionQaWorkflow).not.toContain(
      'ssh-keyscan -H "${PROD_SSH_HOST}" >> ~/.ssh/known_hosts'
    );
  });

  test('production QA captures responsive evidence and verifies the database post-state', () => {
    const productionQaWorkflow = readRepoFile(
      '.github/workflows/production-qa-profile.yml'
    );
    const browserProof = readRepoFile(
      'services/web-app/scripts/production-qa-released-grade.ts'
    );

    expect(productionQaWorkflow).toContain(
      'production-qa-profile-remote production-postcheck'
    );
    expect(productionQaWorkflow).toContain(
      'services/web-app/test-results/production-*'
    );
    expect(browserProof).toContain(
      'production-released-grade-activity-mobile.png'
    );
    expect(browserProof).toContain(
      'production-released-grade-student-mobile.png'
    );
    expect(browserProof).toContain(
      'production-released-grade-walkthrough.webm'
    );
  });
});

describe('worktree local setup contract', () => {
  test('worktree setup isolates generated resources by workspace instance', () => {
    const setupScript = readRepoFile('scripts/worktree-local-setup.sh');

    expect(setupScript).toContain(
      'hashlib.sha256(p.encode()).hexdigest()[:12]'
    );
    expect(setupScript).toContain('SLUG="$WORKTREE_NAME"');
    expect(setupScript).not.toContain('WORKTREE_NAME="$(basename "$(dirname "$ROOT")")"');
    expect(setupScript).toContain('CONTAINER_NAME="yawp-${SLUG}-postgres"');
    expect(setupScript).toContain('VOLUME_NAME="yawp-${SLUG}-postgres-data"');
  });

  test('worktree setup installs dependencies before any Prisma generation', () => {
    const setupScript = readRepoFile('scripts/worktree-local-setup.sh');

    const install = setupScript.indexOf('  bun install --frozen-lockfile');
    expect(install).toBeGreaterThan(0);
    expect(install).toBeLessThan(setupScript.lastIndexOf('\nensure_config'));
    expect(install).toBeLessThan(setupScript.lastIndexOf('\nensure_postgres'));
    expect(install).toBeLessThan(setupScript.lastIndexOf('\nwrite_env_files'));
  });

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

  test('worktree setup writes a Blackboard LTI mock URL and bun script', () => {
    const setupScript = readRepoFile('scripts/worktree-local-setup.sh');
    const rootPackage = JSON.parse(readRepoFile('package.json'));

    expect(setupScript).toContain('BLACKBOARD_LTI_MOCK_URL=');
    expect(setupScript).toContain('LTI_MOCK_PORT');
    expect(rootPackage.scripts['blackboard-lti-mock']).toContain(
      'BLACKBOARD_LTI_MOCK_ENABLED=true'
    );
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

  test('Cloud Agent setup refreshes preview-seat flags for retained databases', () => {
    const installScript = readRepoFile('.cursor/install.sh');
    const seedGuardIndex = installScript.indexOf('if ! database_seeded');
    const previewSeatIndex = installScript.indexOf(
      'bun run --cwd packages/prisma seed-preview-seats'
    );

    expect(seedGuardIndex).toBeGreaterThan(-1);
    expect(previewSeatIndex).toBeGreaterThan(seedGuardIndex);
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
    expect(infra).toContain(
      'distinct([var.production_domain_name, var.ua_partner_hostname])'
    );
    expect(infra).toContain('domain_name = local.apprunner_origin_domain');
    expect(infra).toContain('origin_protocol_policy = "https-only"');
    expect(infra).toContain('"Managed-AllViewer"');
    expect(infra).toContain(
      'resource "aws_apprunner_custom_domain_association" "ua_partner"'
    );
    expect(infra).toContain(
      'resource "aws_route53_record" "ua_apprunner_cert_validation"'
    );
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
    const generateIndex = deployScript.indexOf(
      'scripts/preview/prisma-cli.sh generate'
    );
    const migrateIndex = deployScript.indexOf(
      'scripts/preview/prisma-cli.sh migrate deploy'
    );
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
    expect(deployScript).toContain('oven/bun:1.4.3');
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

  test('preview deploy seeds the Class Starter assignment type', () => {
    const deployScript = readRepoFile('scripts/preview/deploy.sh');

    const seedIndex = deployScript.indexOf('bun run seed-local-dev');
    const syncIndex = deployScript.indexOf(
      'bun run sync-prod-fidelity-fixtures'
    );
    const classStarterIndex = deployScript.indexOf(
      'bun run seed-class-starter-assignment-type'
    );
    const releaseGateIndex = deployScript.indexOf(
      'bun run scripts/assignment-type-release-gate.ts --require-data'
    );

    expect(classStarterIndex).toBeGreaterThan(-1);
    // The seed needs an organization to attach to, so it has to run after
    // whichever of the two data paths created one, and before the gate that
    // validates assignment type data.
    expect(classStarterIndex).toBeGreaterThan(seedIndex);
    expect(classStarterIndex).toBeGreaterThan(syncIndex);
    expect(classStarterIndex).toBeLessThan(releaseGateIndex);

    expect(deployScript).toContain(
      '-f "$SOURCE_DIR/packages/prisma/scripts/seed-class-starter-assignment-type.ts"'
    );
  });

  /**
   * Tooling is skipped wholesale when the fingerprint matches, so a preview
   * whose database already exists would never run a newly added seed unless
   * that seed's files are part of the fingerprint.
   */
  test('the Class Starter seed and its artwork are in the tooling fingerprint', () => {
    const deployScript = readRepoFile('scripts/preview/deploy.sh');
    const fingerprintFunction = deployScript.slice(
      deployScript.indexOf('compute_tooling_fingerprint()'),
      deployScript.indexOf('run_tooling_if_needed()')
    );

    expect(fingerprintFunction).toContain(
      'packages/prisma/scripts/seed-class-starter-assignment-type.ts'
    );
    expect(fingerprintFunction).toContain(
      'packages/prisma/scripts/assets/class-starter.jpg'
    );
  });

  /**
   * The graded Daily Pages class set is what makes the split visible in a
   * preview. Both of its files are outside the paths the fingerprint already
   * covered, so without this a preview with an existing database would keep
   * showing an empty Daily Pages assignment — and keep grading it on the
   * fixture's old rubric, which the seed is what resets.
   */
  test('the Daily Pages sample entries are in the tooling fingerprint', () => {
    const deployScript = readRepoFile('scripts/preview/deploy.sh');
    const fingerprintFunction = deployScript.slice(
      deployScript.indexOf('compute_tooling_fingerprint()'),
      deployScript.indexOf('run_tooling_if_needed()')
    );

    expect(fingerprintFunction).toContain(
      'packages/prisma/scripts/local-dev/seed-daily-pages-samples.ts'
    );
    expect(fingerprintFunction).toContain(
      'services/web-app/app/domain/assignment-types/daily-pages-sample-entries.ts'
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
      'build_or_pull_production_images web toolbox'
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
      'export const middleware = [internalImpersonationMiddleware, previewAccessMiddleware, uaPartnerMiddleware]'
    );
    expect(gate).toContain("process.env.PREVIEW_ACCESS_GATE === 'on'");
    expect(gate).toContain('isDemoEnvironment');
    expect(gate).toContain("'/api/healthcheck'");
    expect(compose).toContain('PREVIEW_ACCESS_GATE: "on"');
    expect(compose).toContain('requirePreviewAccessSeats(accessSeats)');
    expect(compose).toContain('requirePreviewAccessSecret(accessSecret)');
    expect(compose).toContain('requirePreviewSessionSecret(sessionSecret)');
  });

  test('production CloudFront preserves the live 120-second origin timeout', () => {
    const terraform = readRepoFile('infra/main.tf');
    expect(terraform).toMatch(/origin_read_timeout\s*=\s*120/);
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
    // Accept either direct docker or parameterized $DOCKER invocation.
    expect(cleanupScript).toMatch(
      /(?:"?\$DOCKER"?|docker) volume rm "\$\{project\}_\$\{project\}-postgres-data"/
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
    expect(previewWorkflow).toContain('types: [opened, synchronize, reopened, ready_for_review, labeled, unlabeled, closed]');
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
    expect(bootstrapWorkflow).toContain('install-host-metrics.sh');
    expect(bootstrap).toContain('install-host-metrics.sh');
    expect(bootstrap).toContain('HOST_METRICS_SERVICE=yawp-preview-metrics');
    expect(readRepoFile('scripts/preview/install-host-metrics.sh')).toContain(
      '${METRICS_SERVICE}.timer'
    );
    expect(readRepoFile('scripts/preview/install-host-metrics.sh')).toContain(
      'OnUnitActiveSec=60'
    );
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

  test('preview bootstrap installs custom TLS ingress with an authorized first-request wake path', () => {
    const workflow = readRepoFile(
      '.github/workflows/preview-host-bootstrap.yml'
    );
    const bootstrap = readRepoFile('scripts/preview/bootstrap-host.sh');
    const wakeServer = readRepoFile('scripts/preview/wake-server.mjs');
    const ingressServer = readRepoFile('scripts/preview/ingress-server.mjs');
    const certificateManager = readRepoFile(
      'scripts/preview/certificate-manager.mjs'
    );
    const wakeScript = readRepoFile('scripts/preview/wake-preview.sh');
    const wakeProof = readRepoFile('scripts/preview/prove-wake.sh');

    expect(workflow).toContain('scripts/preview/wake-server.mjs');
    expect(workflow).toContain('scripts/preview/ingress-server.mjs');
    expect(workflow).toContain('scripts/preview/certificate-manager.mjs');
    expect(workflow).toContain('scripts/preview/wake-preview.sh');
    expect(workflow).toContain('PREVIEW_MAX_RUNNING');
    expect(workflow).toContain('PREVIEW_DOMAIN');
    expect(bootstrap).toContain('yawp-preview-ingress.service');
    expect(bootstrap).toContain('AmbientCapabilities=CAP_NET_BIND_SERVICE');
    expect(bootstrap).toContain('yawp-preview-certificate-renewal.timer');
    expect(bootstrap).not.toContain('image: traefik');
    expect(bootstrap).not.toContain(
      '/var/run/docker.sock:/var/run/docker.sock:rw'
    );
    expect(wakeServer).toContain('parsePreviewHost');
    expect(ingressServer).toContain("service === 'blackboard'");
    expect(ingressServer).toContain('yawp-pr-${pr}-blackboard-lti-mock-1');
    expect(ingressServer).toContain('createWebSocketUpgradeHandler');
    expect(ingressServer).toContain(
      'authorizeWake(parsed.pr, request.url, request)'
    );
    expect(ingressServer).toContain(
      "isHumanActivity(request)"
    );
    expect(bootstrap).toContain('node "$certificate_manager" --wildcard');
    expect(bootstrap).toContain(
      '$ROOT/ingress/current/certificate-manager.mjs --wildcard'
    );
    expect(certificateManager).toContain('ensureWildcardCertificate');
    expect(certificateManager).toContain("challengeType: 'dns-01'");
    expect(certificateManager).toContain('resolveZeroSslEabCredentials');
    expect(certificateManager).toContain(
      'isLetsEncryptRateLimit(error)'
    );
    expect(certificateManager).toContain("challengeType: 'http-01'");
    expect(wakeScript).toContain('docker compose');
    expect(wakeScript).toContain(' start');
    expect(wakeScript).not.toContain(' up ');
    expect(wakeScript).not.toContain(' down ');
    expect(wakeProof).toContain('PROOF_RESULT=pass');
    expect(wakeProof).toContain('PROOF_CONTAINER_BEFORE');
    expect(wakeProof).toContain('PROOF_CONTAINER_AFTER');
  });

  test('preview idle defaults are 48 hours and comments promise browser plain URL wake', () => {
    const workflow = readRepoFile('.github/workflows/preview-environments.yml');
    const bootstrapWorkflow = readRepoFile(
      '.github/workflows/preview-host-bootstrap.yml'
    );
    const bootstrapScript = readRepoFile('scripts/preview/bootstrap-host.sh');
    const enforceCap = readRepoFile('scripts/preview/enforce-cap.sh');
    const wakePreview = readRepoFile('scripts/preview/wake-preview.sh');
    const wakeServer = readRepoFile('scripts/preview/wake-server.mjs');

    expect(workflow.match(/PREVIEW_IDLE_SLEEP_HOURS: \$\{\{ vars\.PREVIEW_IDLE_SLEEP_HOURS \|\| '48' \}\}/g)).toHaveLength(2);
    expect(
      workflow.match(
        /PREVIEW_SLEEP_ENABLED: \$\{\{ vars\.PREVIEW_SLEEP_ENABLED \|\| 'true' \}\}/g
      )
    ).toHaveLength(2);
    expect(
      workflow.match(
        /PREVIEW_MAX_RUNNING: \$\{\{ vars\.PREVIEW_MAX_RUNNING \|\| '4' \}\}/g
      ) ?? []
    ).toHaveLength(0);
    expect(
      workflow.match(
        /PREVIEW_MAX_RUNNING: \$\{\{ vars\.PREVIEW_MAX_RUNNING \|\| '8' \}\}/g
      )
    ).toHaveLength(2);
    expect(bootstrapWorkflow).toContain(
      "PREVIEW_MAX_RUNNING: ${{ vars.PREVIEW_MAX_RUNNING || '8' }}"
    );
    expect(bootstrapScript).toContain(
      'RUNNING_CAP="${PREVIEW_MAX_RUNNING:-8}"'
    );
    expect(enforceCap).toContain('RUNNING_CAP="${PREVIEW_MAX_RUNNING:-8}"');
    expect(enforceCap).toContain(
      'SLEEP_ENABLED="${PREVIEW_SLEEP_ENABLED:-true}"'
    );
    expect(wakePreview).toContain('RUNNING_CAP="${PREVIEW_MAX_RUNNING:-8}"');
    expect(wakePreview).toContain(
      'INFLIGHT_TTL_SECONDS="${PREVIEW_INFLIGHT_TTL_SECONDS:-3600}"'
    );
    expect(bootstrapWorkflow).toContain(
      "PREVIEW_INFLIGHT_TTL_SECONDS: ${{ vars.PREVIEW_INFLIGHT_TTL_SECONDS || '3600' }}"
    );
    expect(wakeServer).toContain("process.env.PREVIEW_MAX_RUNNING || '8'");
    expect(workflow).toContain('Preview slept after its human idle deadline or to free running capacity');
    expect(workflow).toContain(
      'Open its plain URL in a browser to wake it; app access and login still apply.'
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

  test('preview and production deployments have complete UA Stripe configuration paths', () => {
    const previewWorkflow = readRepoFile(
      '.github/workflows/preview-environments.yml'
    );
    const infra = readRepoFile('infra/main.tf');
    const variables = readRepoFile('infra/variables.tf');
    const runbook = readRepoFile('docs/runbooks/ua-student-billing.md');

    for (const name of [
      'PREVIEW_UA_STUDENT_BILLING_ENABLED',
      'PREVIEW_UA_ORGANIZATION_ID',
      'PREVIEW_UA_PARTNER_CODE',
      'PREVIEW_STRIPE_SECRET_KEY',
      'PREVIEW_STRIPE_WEBHOOK_SECRET',
      'PREVIEW_STRIPE_UA_2026_PRICE_ID',
    ]) {
      expect(previewWorkflow).toContain(name);
    }

    for (const name of [
      'ua_student_billing_enabled',
      'ua_stripe_credentials_configured',
      'ua_organization_id',
      'ua_partner_code',
      'ua_partner_hostname',
      'stripe_secret_key',
      'stripe_webhook_secret',
      'stripe_ua_2026_price_id',
    ]) {
      expect(variables).toContain(`variable "${name}"`);
    }
    expect(infra).toContain('runtime_environment_secrets = merge({');
    expect(infra).toContain('STRIPE_SECRET_KEY');
    expect(infra).toContain('STRIPE_WEBHOOK_SECRET');
    expect(infra).toContain('UA_STUDENT_BILLING_ENABLED');
    expect(infra).toContain('UA_PARTNER_CODE');
    expect(infra).toContain('UA_PARTNER_HOSTNAME');
    expect(infra).toContain('YAWP_APP_ORIGIN');
    expect(infra).toContain('subject_alternative_names');
    expect(infra).toContain(
      'count = var.ua_stripe_credentials_configured ? 1 : 0'
    );
    expect(infra).toContain(
      'var.ua_student_billing_enabled ? var.ua_stripe_credentials_configured : true'
    );
    expect(runbook).toContain('ua_stripe_credentials_configured=true');
    expect(runbook).toContain('ua_partner_code=<student-facing-code>');
    expect(runbook).toContain('ua_student_billing_enabled=false');
    expect(runbook).toContain('ua_student_billing_enabled=true');
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
    const ingressScript = readRepoFile('scripts/preview/ingress-server.mjs');

    expect(deployScript).toContain(
      'docker network connect preview "$POSTGRES_CONTAINER"'
    );
    expect(bootstrapScript).toContain(
      'docker network connect preview "$container"'
    );
    expect(bootstrapScript).toContain(
      'connect_container_to_preview_network preview-postgres'
    );
    expect(ingressScript).toContain(
      'NetworkSettings?.Networks?.preview?.IPAddress'
    );
    expect(ingressScript).toContain("socketPath = '/var/run/docker.sock'");
    expect(bootstrapScript).not.toContain(
      'connect_container_to_preview_network traefik'
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

  test('preview compose starts the Blackboard LTI mock as a sibling service', () => {
    const compose = readRepoFile('scripts/preview/render-compose.mjs');
    const deploy = readRepoFile('scripts/preview/deploy.sh');
    const dockerfile = readRepoFile('services/web-app/Dockerfile');

    expect(compose).toContain('blackboard-lti-mock:');
    expect(compose).toContain('BLACKBOARD_LTI_MOCK_ENABLED: "true"');
    expect(compose).toContain(
      'BLACKBOARD_LTI_MOCK_URL: "http://blackboard-lti-mock:9473"'
    );
    expect(deploy).toContain('start_blackboard_lti_mock_if_present');
    expect(deploy).toContain('blackboard-lti-mock:');
    expect(deploy).toContain('BLACKBOARD_HOSTNAME');
    expect(deploy).toContain('BLACKBOARD_URL');
    expect(dockerfile).not.toContain('blackboard-lti-mock');
    expect(dockerfile).not.toContain('blackboard-lti-mock');
    expect(dockerfile).toContain('CMD ["bash", "services/web-app/start.sh"]');
  });

  test('preview comment describes selected data and dev-login smoke', () => {
    const previewWorkflow = readRepoFile(
      '.github/workflows/preview-environments.yml'
    );

    expect(previewWorkflow).toContain(
      '- **Data:** `${{ env.PREVIEW_DATA_MODE }}` in an isolated PR database'
    );
    expect(previewWorkflow).toContain(
      '- **Blackboard:** ${{ steps.deploy.outputs.blackboard_url }}'
    );
    expect(previewWorkflow).not.toContain('seed overlay');
  });
});

describe('demo environment deployment contract', () => {
  test('demo images build on GitHub-hosted runners with on-host build fallback', () => {
    const workflow = readRepoFile('.github/workflows/demo-environment.yml');
    const deployScript = readRepoFile('scripts/preview/deploy.sh');
    const buildJob = workflow.slice(
      workflow.indexOf('  build-demo-images:'),
      workflow.indexOf('  demo-deploy:')
    );
    const deployStep = workflow.slice(
      workflow.indexOf('- name: Deploy demo'),
      workflow.indexOf('- name: Verify the demo actually serves')
    );

    expect(workflow).toContain('build-demo-images');
    expect(workflow).toContain('id-token: write');
    expect(buildJob).toContain('images-fallback');
    expect(buildJob).toContain('skip_web');
    expect(buildJob).toContain('skip_toolbox');
    expect(deployStep).toContain('if [[ -n "$demo_web_image" && -n "$demo_toolbox_image" ]]; then');
    expect(deployStep).not.toMatch(
      /DEMO_WEB_IMAGE: \$\{\{ needs\.build-demo-images/
    );
    expect(deployStep).toContain('DEPLOY_TIMEOUT_SECONDS="$deploy_timeout_seconds"');
    expect(deployStep).toContain('deploy_timeout_seconds=1200');
    expect(deployStep).toContain('deploy_timeout_seconds=3600');
    expect(deployScript).toContain('demo_registry_images_configured');
    expect(existsSync(join(repoRoot, 'infra/demo-image-registry/main.tf'))).toBe(
      true
    );
  });

  test('demo capacity cleanup protects all container images before the build', () => {
    const workflow = readRepoFile('.github/workflows/demo-environment.yml');
    const prepare = workflow.slice(
      workflow.indexOf('- name: Prepare demo host capacity'),
      workflow.indexOf('- name: Deploy demo')
    );
    expect(prepare).toContain('remote_control="${PREVIEW_ROOT}/control/demo"');
    expect(prepare).toContain('${remote_control}/scripts/preview/reclaim-demo-disk.sh');
    expect(prepare).toContain('ensure-host-swap.sh');
    expect(prepare).toContain('install-host-metrics.sh');
    expect(workflow.indexOf('Checkout reviewed demo control plane')).toBeLessThan(
      workflow.indexOf('- name: Prepare demo host capacity')
    );

    const cleanup = readRepoFile('scripts/preview/reclaim-demo-disk.sh');
    expect(cleanup).toContain('docker ps -a --quiet --no-trunc');
    expect(cleanup).toContain("docker container inspect --format '{{.Image}}'");
    expect(cleanup).toContain("docker image inspect --format '{{.Id}}'");
    expect(cleanup).toContain('protected_images[');
    expect(cleanup).toContain('docker image rm "$image_id"');
    expect(cleanup).toContain('docker builder prune -af --keep-storage 2GB');
    expect(cleanup).toContain('Demo disk free before cleanup');
    expect(cleanup).toContain('Demo disk free after cleanup');
    for (const source of [prepare, cleanup]) {
      expect(source).not.toMatch(/docker\s+(?:system\s+prune|container\s+(?:prune|rm)|volume\s+(?:prune|rm)|rm\b|compose\s+down)/);
      expect(source).not.toMatch(/docker\s+image\s+(?:prune|rm[^\n]*(?:--force|\s-[a-z]*f))/);
    }
  });

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

  test('demo deploys forward the optional Rubric Catalog management key; PR previews never do', () => {
    const workflow = readRepoFile('.github/workflows/demo-environment.yml');
    const previewWorkflow = readRepoFile(
      '.github/workflows/preview-environments.yml'
    );

    expect(workflow).toContain(
      'PREVIEW_MANAGEMENT_SERVICE_KEY: ${{ secrets.DEMO_MANAGEMENT_SERVICE_KEY }}'
    );
    expect(workflow).toContain(
      '"PREVIEW_MANAGEMENT_SERVICE_KEY=$(shell_quote "$PREVIEW_MANAGEMENT_SERVICE_KEY")"'
    );
    expect(workflow).not.toMatch(/echo[^\n]*\$PREVIEW_MANAGEMENT_SERVICE_KEY/);
    expect(previewWorkflow).not.toContain('MANAGEMENT_SERVICE_KEY');
  });

  test('demo deploys can enable the UA Stripe sandbox without changing demo data', () => {
    const workflow = readRepoFile('.github/workflows/demo-environment.yml');

    for (const name of [
      'PREVIEW_UA_STUDENT_BILLING_ENABLED',
      'PREVIEW_UA_ORGANIZATION_ID',
      'PREVIEW_UA_PARTNER_CODE',
      'PREVIEW_STRIPE_SECRET_KEY',
      'PREVIEW_STRIPE_WEBHOOK_SECRET',
      'PREVIEW_STRIPE_UA_2026_PRICE_ID',
      'PREVIEW_RESEND_FROM_EMAIL',
      'PREVIEW_RESEND_API_KEY',
    ]) {
      expect(workflow).toContain(name);
    }
    expect(workflow).toContain(
      'UA demo host did not render the partner landing'
    );
    expect(workflow).toContain('reset_data:');
    expect(workflow).toContain('default: false');
  });

  test('the demo deploy keeps browsing public while dev-login stays code-gated', () => {
    const workflow = readRepoFile('.github/workflows/demo-environment.yml');

    expect(workflow).toContain(
      'Demo homepage still renders the site-wide preview access screen'
    );
    expect(workflow).toContain('/free/admin/approve');
    expect(workflow).toContain(
      'POST /auth/dev-login without an access cookie returned HTTP $blocked, expected 401'
    );
    expect(workflow).toContain('/auth/dev-login/options');
    expect(workflow).toContain('POST /lti/launch without an access cookie');
    expect(workflow).toContain('/auth/dev-login/options');
    expect(workflow).toContain('POST /lti/launch without an access cookie');
    expect(workflow).toContain('--data-urlencode "code=$access_code"');
    expect(workflow).not.toContain(deprecatedPreviewBasicAuth);
    expect(workflow).not.toContain('curl --user');
  });

  test('demo deploys share the host mutation lock with PR preview deploys', () => {
    const workflow = readRepoFile('.github/workflows/demo-environment.yml');
    const detached = readRepoFile(
      'scripts/preview/run-host-deploy-detached.sh'
    );

    expect(workflow).toContain('lock_file="${PREVIEW_ROOT}/preview-host.lock"');
    expect(detached).toContain('flock -w 1800');
    expect(detached).toContain('LOCK_FILE');
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

  test('demo deploy runs detached from the GitHub Actions SSH session', () => {
    const workflow = readRepoFile('.github/workflows/demo-environment.yml');
    const detached = readRepoFile(
      'scripts/preview/run-host-deploy-detached.sh'
    );

    expect(workflow).toContain('Prepare demo host capacity');
    expect(workflow).toContain('ensure-host-swap.sh');
    expect(workflow).toContain('install-host-metrics.sh');
    expect(workflow).toContain('run-host-deploy-detached.sh');
    expect(detached).toContain('FAILURE_LOG_LINES="${FAILURE_LOG_LINES:-120}"');
    expect(detached).toContain('emit_failure_log_tail');
    expect(detached).toContain('mask_deploy_log');
    expect(detached).toContain('PREVIEW_ACCESS_CODE=');
    expect(detached).toContain('[REDACTED]');
    expect(workflow).not.toContain(
      'flock -w 1800 $(shell_quote "$lock_file") bash -lc $(shell_quote "$deploy_command")'
    );
  });

  test('demo host monitoring provisions alarms and verifies metrics', () => {
    const workflow = readRepoFile('.github/workflows/demo-host-monitoring.yml');
    const provision = readRepoFile('scripts/preview/provision-host-alarms.sh');
    const verify = readRepoFile('scripts/preview/verify-host-alarms.sh');

    expect(workflow).toContain('provision-host-alarms.sh');
    expect(workflow).toContain('yawp-demo-host');
    expect(workflow).toContain('verify-host-alarms.sh');
    expect(provision).toContain('MemoryUsedPercent');
    expect(provision).toContain('DiskUsedPercent');
    expect(verify).toContain('yawp-demo-host-memory-warning');
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
  test('workflow verification is anonymous and retains preview gate assertions', () => {
    const previewWorkflow = readRepoFile('.github/workflows/preview-environments.yml');
    const demoWorkflow = readRepoFile('.github/workflows/demo-environment.yml');

    for (const workflow of [previewWorkflow, demoWorkflow]) {
      expect(workflow).not.toContain(deprecatedPreviewBasicAuth);
      expect(workflow).not.toContain('curl --user');
      expect(workflow).toContain(
        'POST /auth/dev-login without an access cookie returned HTTP $blocked, expected 401'
      );
    }
    expect(previewWorkflow).toContain('data-preview-access-screen');
    expect(demoWorkflow).toContain(
      'Demo homepage still renders the site-wide preview access screen'
    );
  });
});

describe('Internal preview database classification', () => {
  test('recognizes the dedicated local Docker host without disabling production TLS', async () => {
    const { isLocalDatabaseUrl } = await import('../packages/prisma/scripts/local-dev/database-url');
    expect(isLocalDatabaseUrl('postgresql://fixture:fixture@yawp-internal-preview-postgres:5432/yawp_fixture')).toBe(true);
    expect(isLocalDatabaseUrl('postgresql://fixture:fixture@preview-postgres:5432/yawp_fixture')).toBe(true);
    expect(isLocalDatabaseUrl('postgresql://fixture:fixture@db.cafmse4qcmw7.us-east-1.rds.amazonaws.com:5432/yawp')).toBe(false);
  });
});

describe('isolated preview unified sign-on label deployment contract', () => {
  test('exact label addition/removal follows the gated, shell-quoted detached transport', () => {
    const workflow = readRepoFile('.github/workflows/preview-environments.yml');
    expect(workflow).toContain('ready_for_review, labeled, unlabeled, closed]');
    expect(workflow).toContain("PREVIEW_UNIFIED_SIGN_ON: ${{ needs.preview-policy.outputs.unified_sign_on }}");
    expect(workflow).toContain('"PREVIEW_UNIFIED_SIGN_ON=$(shell_quote "$PREVIEW_UNIFIED_SIGN_ON")"');
    expect(workflow).toContain('REMOTE_COMMAND=');
    expect(workflow).toContain('run-host-deploy-detached.sh');
    expect(workflow).toContain("needs.preview-policy.outputs.should_deploy == 'true'");
    expect(workflow).toContain("startsWith(github.event.pull_request.body || '', '[skip preview]') == false");
    expect(workflow).toContain('bash scripts/preview/check-skip-preview.sh');
    expect(readRepoFile('.github/workflows/demo-environment.yml')).not.toContain('PREVIEW_UNIFIED_SIGN_ON');
  });
  test('reviewed updater is available in both toolbox runtimes after all seeds and before traffic', () => {
    const compose = readRepoFile('scripts/preview/render-compose.mjs');
    const deploy = readRepoFile('scripts/preview/deploy.sh');
    expect(compose).toContain('PREVIEW_UNIFIED_SIGN_ON:');
    expect(compose).toContain('/preview-control:ro');
    expect(deploy).toContain('export PREVIEW_CONTROL_DIR="$SCRIPT_DIR"');
    expect(deploy).toContain('bun /preview-control/unified-signon-flag.mjs');
    const order = deploy.slice(deploy.indexOf('\nrun_tooling_if_needed\n'));
    expect(order.indexOf('\napply_preview_signon_flag\n')).toBeGreaterThan(order.indexOf('\nensure_preview_seats\n'));
    expect(order.indexOf('\napply_preview_signon_flag\n')).toBeLessThan(order.indexOf('\nstart_or_refresh_web\n'));
    expect(deploy).toContain('[[ "$SLUG" =~ ^pr-[1-9][0-9]*$ ]] || return 0');
  });
});
