import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function run(
  cmd: string,
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
) {
  execSync(cmd, { stdio: 'inherit', ...opts });
}

function dockerAvailable() {
  try {
    execSync('docker ps -q', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function containerRunning(name: string): boolean {
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

function ensureE2EEnv() {
  const rootDir = path.resolve(__dirname, '../../..');
  const webAppDir = path.join(rootDir, 'services/web-app');
  const prismaDir = path.join(rootDir, 'packages/prisma');
  const e2eDir = path.join(webAppDir, 'e2e');
  const e2ePrismaDir = path.join(e2eDir, 'prisma');
  const e2eSchemaPath = path.join(e2ePrismaDir, 'schema.prisma');
  const pgOwnedPath = path.join(e2eDir, '.pg-owned');
  const e2eEnvPath = path.join(e2eDir, '.env.e2e');

  fs.mkdirSync(e2ePrismaDir, { recursive: true });

  // Copy production prisma schema to e2e
  try {
    const prodSchemaPath = path.join(prismaDir, 'schema.prisma');
    fs.copyFileSync(prodSchemaPath, e2eSchemaPath);
  } catch {}

  // Inject client output so @app/prisma resolves correctly
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
        const injected = `${before}\n  output = "${absoluteClientOutput}"${after}`;
        fs.writeFileSync(e2eSchemaPath, injected);
      }
    }
  } catch {}

  // If .env.e2e exists and is postgres, keep it; otherwise recreate
  if (fs.existsSync(e2eEnvPath)) {
    try {
      const current = fs.readFileSync(e2eEnvPath, 'utf8');
      const envVars = Object.fromEntries(
        current
          .split('\n')
          .filter(Boolean)
          .map((l) => l.split('='))
      ) as Record<string, string>;
      if (envVars.DATABASE_URL?.startsWith('postgres')) {
        for (const [k, v] of Object.entries(envVars)) process.env[k] = v;
      } else {
        fs.unlinkSync(e2eEnvPath);
      }
    } catch {}
  }

  const containerName = 'yawp-e2e-postgres';
  const desiredDbName = 'yop_e2e';
  const pgUser = process.env.PGUSER || 'postgres';
  const pgPassword = process.env.PGPASSWORD || 'postgres';
  const candidatePorts = [54329, 54330, 54331, 54332];

  function tryStartDockerPg(): number {
    for (const port of candidatePorts) {
      try {
        run(
          `docker run -d --rm -e POSTGRES_PASSWORD=${pgPassword} -e POSTGRES_USER=${pgUser} -p ${port}:5432 --name ${containerName} postgres:16`
        );
        return port;
      } catch {}
    }
    throw new Error('Unable to start Postgres Docker container');
  }

  function waitForPgReady() {
    for (let i = 0; i < 60; i++) {
      try {
        execSync(`docker exec ${containerName} pg_isready -U ${pgUser}`, {
          stdio: 'ignore',
        });
        return;
      } catch {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
      }
    }
    throw new Error('Postgres did not become ready in time');
  }

  let pgPort = 54329;
  let startedContainer = false;
  if (dockerAvailable()) {
    if (!containerRunning(containerName)) {
      pgPort = tryStartDockerPg();
      startedContainer = true;
      try {
        fs.writeFileSync(pgOwnedPath, '1');
      } catch {}
      waitForPgReady();
    } else {
      try {
        const inspect = execSync(
          `docker inspect ${containerName} --format='{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}'`,
          { stdio: 'pipe' }
        )
          .toString()
          .trim();
        if (inspect) pgPort = Number(inspect);
      } catch {}
      waitForPgReady();
    }
  } else {
    pgPort = Number(process.env.PGPORT || 5432);
  }

  const databaseUrl = `postgres://${pgUser}:${pgPassword}@127.0.0.1:${pgPort}/${desiredDbName}`;

  // Ensure DB exists
  try {
    if (dockerAvailable()) {
      const exists = execSync(
        `docker exec -u ${pgUser} ${containerName} psql -U ${pgUser} -tAc "SELECT 1 FROM pg_database WHERE datname='${desiredDbName}';"`,
        { stdio: 'pipe' }
      )
        .toString()
        .trim();
      if (exists !== '1') {
        run(
          `docker exec -u ${pgUser} ${containerName} psql -U ${pgUser} -c "CREATE DATABASE \"${desiredDbName}\";"`
        );
      }
    } else {
      try {
        execSync(
          `psql -U ${pgUser} -h 127.0.0.1 -p ${pgPort} -tAc "SELECT 1 FROM pg_database WHERE datname='${desiredDbName}';"`,
          { stdio: 'pipe' }
        );
      } catch {
        try {
          run(
            `psql -U ${pgUser} -h 127.0.0.1 -p ${pgPort} -c "CREATE DATABASE \"${desiredDbName}\";"`
          );
        } catch {}
      }
    }
  } catch {}

  // Write env file
  const content = [
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
  fs.writeFileSync(e2eEnvPath, `${content}\n`);

  // Export to current process for child processes
  for (const line of content.split('\n')) {
    const [k, ...rest] = line.split('=');
    const v = rest.join('=');
    if (k) process.env[k] = v;
  }

  // Generate client and push schema
  run(
    `bash -c 'bun prisma generate --schema ${e2eSchemaPath} && bun prisma db push --schema ${e2eSchemaPath}'`,
    {
      cwd: prismaDir,
      env: { ...process.env },
    }
  );

  // Log minimal confirmation
  // eslint-disable-next-line no-console
  console.log('ensure-e2e-env complete', {
    DATABASE_URL: process.env.DATABASE_URL,
    DOCKER: dockerAvailable(),
    STARTED: startedContainer,
  });
}

ensureE2EEnv();
