import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const CONTAINER_NAME = 'yawp-e2e-postgres';
const E2E_DB_NAME = 'yop_e2e';

function run(
  cmd: string,
  opts: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    stdio?: 'inherit' | 'pipe' | 'ignore';
  } = {}
) {
  const { stdio = 'inherit', ...rest } = opts;
  execSync(cmd, { stdio, ...rest });
}

function shellEscape(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

export function getDockerPostgresReadyCommand(pgUser: string) {
  return `docker exec ${CONTAINER_NAME} pg_isready -h 127.0.0.1 -p 5432 -U ${shellEscape(pgUser)}`;
}

function dockerAvailable() {
  try {
    execSync('docker ps -q', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function containerRunning(name: string) {
  try {
    const out = execSync(
      `docker ps --filter name=^/${name}$ --format '{{.Names}}'`,
      { stdio: 'pipe' }
    )
      .toString()
      .trim();
    return out === name;
  } catch {
    return false;
  }
}

function startDockerPostgres(params: {
  pgUser: string;
  pgPassword: string;
  candidatePorts: number[];
}) {
  const { pgUser, pgPassword, candidatePorts } = params;
  for (const port of candidatePorts) {
    try {
      run(
        `docker run -d --rm --name ${CONTAINER_NAME} -e POSTGRES_USER=${shellEscape(pgUser)} -e POSTGRES_PASSWORD=${shellEscape(pgPassword)} -p ${port}:5432 postgres:16`
      );
      return port;
    } catch {
      // Try the next port.
    }
  }

  throw new Error(
    `Unable to start Postgres Docker container on ports ${candidatePorts.join(', ')}`
  );
}

async function waitForDockerPostgresReady(pgUser: string) {
  for (let i = 0; i < 60; i++) {
    try {
      run(getDockerPostgresReadyCommand(pgUser));
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error('Postgres did not become ready in time');
}

async function resetDatabase(databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!dbName) {
    throw new Error(`DATABASE_URL is missing a database name: ${databaseUrl}`);
  }

  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';

  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const escapedDbName = dbName.replace(/"/g, '""');
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName]
    );
    await client.query(`DROP DATABASE IF EXISTS "${escapedDbName}"`);
    await client.query(`CREATE DATABASE "${escapedDbName}"`);
  } finally {
    await client.end();
  }
}

type PreparedConnection = {
  databaseUrl: string;
  startedContainer: boolean;
};

async function prepareConnection(e2eDir: string): Promise<PreparedConnection> {
  const pgOwnedPath = path.join(e2eDir, '.pg-owned');
  const providedDbUrl =
    process.env.E2E_DATABASE_URL ||
    (process.env.CI ? process.env.DATABASE_URL : undefined);
  if (
    providedDbUrl?.startsWith('postgres://') ||
    providedDbUrl?.startsWith('postgresql://')
  ) {
    try {
      fs.unlinkSync(pgOwnedPath);
    } catch {}
    return { databaseUrl: providedDbUrl, startedContainer: false };
  }

  const pgUser = process.env.PGUSER || 'postgres';
  const pgPassword = process.env.PGPASSWORD || 'postgres';
  const candidatePorts = [54329, 54330, 54331, 54332];
  let startedContainer = false;
  let pgPort = Number(process.env.PGPORT || 5432);

  if (dockerAvailable()) {
    if (containerRunning(CONTAINER_NAME)) {
      try {
        run(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'ignore' });
      } catch {}
    }
    pgPort = startDockerPostgres({ pgUser, pgPassword, candidatePorts });
    startedContainer = true;
    fs.writeFileSync(pgOwnedPath, '1');
    await waitForDockerPostgresReady(pgUser);
  } else {
    try {
      fs.unlinkSync(pgOwnedPath);
    } catch {}
  }

  return {
    databaseUrl: `postgresql://${encodeURIComponent(pgUser)}:${encodeURIComponent(pgPassword)}@127.0.0.1:${pgPort}/${E2E_DB_NAME}`,
    startedContainer,
  };
}

function writeE2EEnv(e2eDir: string, databaseUrl: string) {
  const e2eEnvPath = path.join(e2eDir, '.env.e2e');
  const envVars: Record<string, string> = {
    NODE_ENV: 'development',
    DATABASE_PATH: path.join(e2eDir, '.e2e.sqlite'),
    CACHE_DATABASE_PATH: path.join(e2eDir, '.cache.sqlite'),
    DATABASE_URL: databaseUrl,
    E2E_DATABASE_URL: databaseUrl,
    SESSION_SECRET: process.env.SESSION_SECRET || 'dev-secret',
    INTERNAL_COMMAND_TOKEN: process.env.INTERNAL_COMMAND_TOKEN || 'dev-token',
    HONEYPOT_SECRET: process.env.HONEYPOT_SECRET || 'dev-honeypot',
    AWS_S3_BUCKET_FOR_VIDEOS:
      process.env.AWS_S3_BUCKET_FOR_VIDEOS || 'e2e-bucket',
    AWS_S3_REGION_FOR_VIDEOS:
      process.env.AWS_S3_REGION_FOR_VIDEOS || 'us-east-1',
    E2E: 'true',
    E2E_GRADE_ESSAY_AI_FIXTURE: 'true',
    E2E_ASSIGNMENT_INSIGHTS_FIXTURE: 'true',
    ANTHROPIC_API_KEY: '',
  };

  const lines = Object.entries(envVars).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(e2eEnvPath, `${lines.join('\n')}\n`);
  fs.writeFileSync(path.join(e2eDir, '.e2e-owned'), '1');
  for (const [key, value] of Object.entries(envVars)) {
    process.env[key] = value;
  }
}

export async function prepareE2E() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const rootDir = path.resolve(__dirname, '../../..');
  const prismaDir = path.join(rootDir, 'packages/prisma');
  const e2eDir = path.join(rootDir, 'services/web-app/e2e');
  const ctxPath = path.join(e2eDir, '.e2e-context.json');

  // 1. Prepare Postgres connection
  const { databaseUrl, startedContainer } = await prepareConnection(e2eDir);

  // 2. Drop and recreate database for clean state
  await resetDatabase(databaseUrl);
  writeE2EEnv(e2eDir, databaseUrl);

  const env = { ...process.env, DATABASE_URL: databaseUrl };

  // 3. Generate Prisma client + run migrations from production schema
  run('bun prisma generate', { cwd: prismaDir, env });
  run('bun prisma migrate deploy', { cwd: prismaDir, env });

  // 4. Seed deterministic test data
  const { seedE2E } = await import('./seed-e2e');
  const context = await seedE2E();
  fs.writeFileSync(ctxPath, JSON.stringify(context, null, 2));

  // eslint-disable-next-line no-console
  console.log('E2E prepare complete', {
    DATABASE_URL: databaseUrl,
    DOCKER_PG_STARTED: startedContainer,
  });
}
