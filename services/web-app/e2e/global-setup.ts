import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedE2E } from './seed-e2e';

function run(
  cmd: string,
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
) {
  execSync(cmd, { stdio: 'inherit', ...opts });
}

export default async function globalSetup() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const rootDir = path.resolve(__dirname, '../../..');
  const webAppDir = path.join(rootDir, 'services/web-app');
  const prismaDir = path.join(rootDir, 'packages/prisma');
  const e2eDir = path.join(webAppDir, 'e2e');
  const e2ePrismaDir = path.join(e2eDir, 'prisma');
  const e2eSchemaPath = path.join(e2ePrismaDir, 'schema.prisma');
  const pgOwnedPath = path.join(e2eDir, '.pg-owned');
  const ctxPath = path.join(e2eDir, '.e2e-context.json');

  // Ensure e2e directories exist
  fs.mkdirSync(e2ePrismaDir, { recursive: true });

  // Always copy the current production Prisma schema into e2e for reference/sync
  const prodSchemaPath = path.join(prismaDir, 'schema.prisma');
  const copiedProdSchemaPath = path.join(e2ePrismaDir, 'schema.prisma');
  try {
    fs.copyFileSync(prodSchemaPath, copiedProdSchemaPath);
  } catch {}

  // Ensure our e2e schema path points at the copied production schema
  try {
    fs.copyFileSync(copiedProdSchemaPath, e2eSchemaPath);
  } catch {}

  // Inject Prisma Client output path to ensure @app/prisma resolves the correct client
  try {
    const schemaText = fs.readFileSync(e2eSchemaPath, 'utf8');
    const absoluteClientOutput = path.join(
      prismaDir,
      'node_modules/@prisma/client'
    );
    const genIdx = schemaText.indexOf('generator client');
    if (genIdx !== -1) {
      const braceIdx = schemaText.indexOf('{', genIdx);
      if (braceIdx !== -1) {
        const before = schemaText.slice(0, braceIdx + 1);
        const after = schemaText.slice(braceIdx + 1);
        const injected = `${before}\n  output = \"${absoluteClientOutput}\"${after}`;
        fs.writeFileSync(e2eSchemaPath, injected);
      }
    }
  } catch {}

  const e2eEnvPath = path.join(e2eDir, '.env.e2e');

  // If an app-local .env.e2e already exists and is Postgres, just source it; otherwise recreate for Postgres
  if (fs.existsSync(e2eEnvPath)) {
    const e2eEnv = fs.readFileSync(e2eEnvPath, 'utf8');
    const entries = e2eEnv
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split('=')) as [string, string][];
    const envVars = Object.fromEntries(entries) as Record<string, string>;
    if (envVars.DATABASE_URL?.startsWith('postgres')) {
      for (const [k, v] of Object.entries(envVars)) process.env[k] = v;
    }
    // Existing env is not Postgres; remove it to proceed with Postgres provisioning
    try {
      fs.unlinkSync(e2eEnvPath);
    } catch {}
  }

  // Provision Postgres via Docker if needed and create database `yop_e2e`
  const containerName = 'yawp-e2e-postgres';
  const desiredDbName = 'yop_e2e';
  const pgUser = process.env.PGUSER || 'postgres';
  const pgPassword = process.env.PGPASSWORD || 'postgres';
  const candidatePorts = [54329, 54330, 54331, 54332];

  function dockerAvailable() {
    try {
      execSync('docker ps -q', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  function tryStartDockerPg(): number {
    for (const port of candidatePorts) {
      try {
        run(
          `docker run -d --rm -e POSTGRES_PASSWORD=${pgPassword} -e POSTGRES_USER=${pgUser} -p ${port}:5432 --name ${containerName} postgres:16`
        );
        return port;
      } catch {
        // try next port
      }
    }
    throw new Error(
      'Unable to start Postgres Docker container on any candidate port'
    );
  }

  async function waitForPgReady() {
    for (let i = 0; i < 60; i++) {
      try {
        run(`docker exec ${containerName} pg_isready -U ${pgUser}`);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    throw new Error('Postgres did not become ready in time');
  }

  function containerRunning(): boolean {
    try {
      const out = execSync(
        `docker ps --filter name=^/${containerName}$ --format '{{.Names}}'`,
        {
          stdio: 'pipe',
        }
      )
        .toString()
        .trim();
      return out === containerName;
    } catch {
      return false;
    }
  }

  // Start or reuse Postgres
  let pgPort = 54329;
  let startedContainer = false;
  if (dockerAvailable()) {
    if (!containerRunning()) {
      pgPort = tryStartDockerPg();
      startedContainer = true;
      // mark ownership so teardown can clean up
      fs.writeFileSync(pgOwnedPath, '1');
    } else {
      // Find the published host port for the running container
      try {
        const inspect = execSync(
          `docker inspect ${containerName} --format='{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}'`,
          { stdio: 'pipe' }
        )
          .toString()
          .trim();
        if (inspect) pgPort = Number(inspect);
      } catch {}
    }
    await waitForPgReady();
  } else {
    // No Docker available; assume local Postgres at 127.0.0.1:5432
    pgPort = Number(process.env.PGPORT || 5432);
  }

  const databaseUrl = `postgres://${pgUser}:${pgPassword}@127.0.0.1:${pgPort}/${desiredDbName}`;

  // Ensure database exists (only when Docker-managed or local psql available)
  try {
    if (dockerAvailable()) {
      const result = execSync(
        `docker exec -u ${pgUser} ${containerName} psql -U ${pgUser} -tAc "SELECT 1 FROM pg_database WHERE datname='${desiredDbName}';"`,
        { stdio: 'pipe' }
      )
        .toString()
        .trim();
      if (result !== '1') {
        run(
          `docker exec -u ${pgUser} ${containerName} psql -U ${pgUser} -c "CREATE DATABASE \"${desiredDbName}\";"`
        );
      }
    } else {
      // best-effort using local psql if present
      try {
        execSync(
          `psql -U ${pgUser} -h 127.0.0.1 -p ${pgPort} -tAc "SELECT 1 FROM pg_database WHERE datname='${desiredDbName}';"`,
          { stdio: 'pipe' }
        )
          .toString()
          .trim();
      } catch {
        try {
          run(
            `psql -U ${pgUser} -h 127.0.0.1 -p ${pgPort} -c "CREATE DATABASE \"${desiredDbName}\";"`
          );
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('Could not ensure Postgres database exists:', err);
        }
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error ensuring Postgres database:', err);
  }

  // Write env file pointing at Postgres (always overwrite to ensure consistency)
  const dummyEnv = [
    `NODE_ENV=development`,
    `DATABASE_PATH=${path.join(e2eDir, '.e2e.sqlite')}`,
    `CACHE_DATABASE_PATH=${path.join(e2eDir, '.cache.sqlite')}`,
    `DATABASE_URL=${databaseUrl}`,
    `SESSION_SECRET=${process.env.SESSION_SECRET || 'dev-secret'}`,
    `INTERNAL_COMMAND_TOKEN=${process.env.INTERNAL_COMMAND_TOKEN || 'dev-token'}`,
    `HONEYPOT_SECRET=${process.env.HONEYPOT_SECRET || 'dev-honeypot'}`,
    `AWS_S3_BUCKET_FOR_VIDEOS=${process.env.AWS_S3_BUCKET_FOR_VIDEOS || 'e2e-bucket'}`,
    `AWS_S3_REGION_FOR_VIDEOS=${process.env.AWS_S3_REGION_FOR_VIDEOS || 'us-east-1'}`,
    `E2E=true`,
  ].join('\n');
  fs.writeFileSync(e2eEnvPath, `${dummyEnv}\n`);
  // mark ownership so teardown can clean up e2e artifacts
  try {
    fs.writeFileSync(path.join(e2eDir, '.e2e-owned'), '1');
  } catch {}

  // Generate a Prisma client compatible with this schema and push schema to Postgres
  const e2eEnv = fs.readFileSync(e2eEnvPath, 'utf8');
  const entries = e2eEnv
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('=')) as [string, string][];
  const envVars = Object.fromEntries(entries) as Record<string, string>;
  for (const [k, v] of Object.entries(envVars)) process.env[k] = v;
  run(
    `bash -c 'bun prisma generate --schema ${e2eSchemaPath} && bun prisma db push --schema ${e2eSchemaPath}'`,
    { cwd: prismaDir, env: { ...process.env } }
  );
  // eslint-disable-next-line no-console
  console.log('E2E ENV set for global setup:', {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    DOCKER_PG_STARTED: startedContainer,
  });
  const context = await seedE2E();
  fs.writeFileSync(ctxPath, JSON.stringify(context, null, 2));
}
