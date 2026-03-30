# Production Dump for Preview & E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace synthetic seed data with a production database dump restored from S3 for both E2E tests and PR preview environments.

**Architecture:** S3 hosts a plain-SQL pg_dump. E2E downloads it once to a local cache and restores via `psql -f`. Preview environments stream it from S3 with `sed` schema remapping piped to `psql`. Both then run `prisma migrate deploy` and a shared overlay script that upserts test users.

**Tech Stack:** PostgreSQL, pg_dump plain SQL, AWS S3, Prisma, Playwright, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-03-26-production-dump-for-previews-and-e2e.md`

---

### Task 1: Add `.data/` to gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add the gitignore entry**

Append to the end of `.gitignore`:

```
services/web-app/e2e/.data/
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore e2e/.data/ for cached production dump"
```

---

### Task 2: Create the shared seed overlay script

This script upserts all test users and their required relationships on top of existing (production) data. It returns an `E2EContext` object. Both E2E and preview environments call it.

**Files:**
- Create: `packages/prisma/scripts/seed-overlay.ts`

- [ ] **Step 1: Create `seed-overlay.ts`**

```typescript
/* eslint-disable no-console */
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { createPassword } from './utils';

// --- Connection setup (same pattern as seed.ts) ---

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

function getSchemaFromDatabaseUrl(url: string): string | undefined {
  const match = url.match(/[?&]schema=([^&]+)/i);
  if (!match) return undefined;
  return decodeURIComponent(match[1]);
}

const schema =
  process.env.DATABASE_SCHEMA?.trim() ||
  getSchemaFromDatabaseUrl(connectionString);

const isLocal =
  connectionString.includes('localhost') ||
  connectionString.includes('127.0.0.1');

const isSimpleLocal =
  !schema &&
  (connectionString.includes('localhost') ||
    connectionString.includes('127.0.0.1'));

const adapter = isSimpleLocal
  ? new PrismaPg({ connectionString, ssl: false })
  : new PrismaPg(
      {
        connectionString,
        ssl: isLocal ? false : { rejectUnauthorized: false },
      },
      schema ? { schema } : undefined
    );

const prisma = new PrismaClient({ adapter });

// --- Constants ---

const ORG_ID = 'e2e-test-org';
const ORG_NAME = 'E2E Test Organization';
const SCHOOL_CODE = 'E2E-SCHOOL';
const CLASS_CODE = 'E2E-CLASS';

// --- Overlay logic ---

export type E2EContext = {
  organizationId: string;
  userId: string;
  userEmail: string;
  adminUserId: string;
  adminEmail: string;
  profileId: string;
  studentCourseId: string;
  documentId: string;
  classId: string;
  classCode: string;
  schoolId: string;
  teacherProfileId: string;
  teacherName: string;
  teacherEmail: string;
};

async function upsertUser(
  data: {
    email: string;
    name: string;
    password: string;
    isAdmin?: boolean;
  },
) {
  const existing = await prisma.user.findUnique({
    where: { email: data.email },
  });
  if (existing) {
    await prisma.password.upsert({
      where: { userId: existing.id },
      update: { hash: createPassword(data.password).hash },
      create: { userId: existing.id, hash: createPassword(data.password).hash },
    });
    if (data.isAdmin !== undefined) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { isAdmin: data.isAdmin },
      });
    }
    return existing;
  }
  return prisma.user.create({
    data: {
      email: data.email,
      name: data.name,
      isAdmin: data.isAdmin,
      password: { create: createPassword(data.password) },
    },
  });
}

export async function seedOverlay(): Promise<E2EContext> {
  console.log('🌱 Running seed overlay (test users on top of production data)...');

  // 1. Organization
  const org = await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: { name: ORG_NAME },
    create: { id: ORG_ID, name: ORG_NAME },
  });

  // 2. School
  let school = await prisma.school.findFirst({
    where: { code: SCHOOL_CODE, organizationId: org.id },
  });
  if (!school) {
    school = await prisma.school.create({
      data: { name: 'E2E High', code: SCHOOL_CODE, organizationId: org.id },
    });
  }

  // 3. Teacher user + profile
  const teacherEmail = 'teacher.e2e@yawp.test';
  const teacherName = 'Mrs Test Teacher';
  const teacherUser = await upsertUser({
    email: teacherEmail,
    name: teacherName,
    password: 'teacher-e2e-password',
  });
  let teacherProfile = await prisma.profile.findFirst({
    where: { userId: teacherUser.id, organizationId: org.id },
    include: { teacherProfile: true },
  });
  if (!teacherProfile) {
    teacherProfile = await prisma.profile.create({
      data: {
        userId: teacherUser.id,
        organizationId: org.id,
        isOwner: true,
        teacherProfile: { create: {} },
      },
      include: { teacherProfile: true },
    });
  }
  if (!teacherProfile.teacherProfile) {
    await prisma.teacherProfile.create({ data: { profileId: teacherProfile.id } });
    teacherProfile = await prisma.profile.findUniqueOrThrow({
      where: { id: teacherProfile.id },
      include: { teacherProfile: true },
    });
  }
  const teacherProfileId = teacherProfile.teacherProfile!.id;
  // Link teacher to school
  await prisma.teacherProfile.update({
    where: { id: teacherProfileId },
    data: { schools: { connect: { id: school.id } } },
  });

  // 4. Class
  let klass = await prisma.class.findFirst({
    where: { code: CLASS_CODE, schoolId: school.id },
  });
  if (!klass) {
    klass = await prisma.class.create({
      data: {
        code: CLASS_CODE,
        schoolYear: '2024-2025',
        period: '1st',
        grade: '9th',
        schoolId: school.id,
        teachers: { connect: { id: teacherProfileId } },
      },
    });
  }

  // 5. Student user
  const studentUser = await upsertUser({
    email: 'jdoe@brock.software',
    name: 'John Doe',
    password: 'johndoe',
  });
  let studentProfileRecord = await prisma.profile.findFirst({
    where: { userId: studentUser.id, organizationId: org.id },
    include: { studentProfile: true },
  });
  if (!studentProfileRecord) {
    studentProfileRecord = await prisma.profile.create({
      data: {
        userId: studentUser.id,
        organizationId: org.id,
        isOwner: false,
      },
      include: { studentProfile: true },
    });
  }
  if (!studentProfileRecord.studentProfile) {
    await prisma.studentProfile.create({
      data: {
        profileId: studentProfileRecord.id,
        classes: { connect: { id: klass.id } },
      },
    });
    studentProfileRecord = await prisma.profile.findUniqueOrThrow({
      where: { id: studentProfileRecord.id },
      include: { studentProfile: true },
    });
  }

  // 6. Admin user
  const adminUser = await upsertUser({
    email: 'admin.e2e@yawp.test',
    name: 'Admin E2E',
    password: 'admin-e2e-password',
    isAdmin: true,
  });
  let adminProfile = await prisma.profile.findFirst({
    where: { userId: adminUser.id, organizationId: org.id },
  });
  if (!adminProfile) {
    adminProfile = await prisma.profile.create({
      data: {
        userId: adminUser.id,
        organizationId: org.id,
        isOwner: true,
      },
    });
  }

  // 7. Smoke test users (for preview environments)
  for (const u of [
    { email: 'teacher@fake.test', name: 'Teacher User', password: 'teacher123' },
    { email: 'admin@fake.test', name: 'Admin User', password: 'admin123', isAdmin: true },
    { email: 'student@fake.test', name: 'Student User', password: 'student123' },
  ]) {
    await upsertUser(u);
  }

  // 8. Student course with modules + instructions
  let studentCourse = await prisma.studentCourse.findFirst({
    where: { title: 'E2E Course' },
    select: { id: true, studentCourseModules: { select: { id: true, position: true } } },
  });
  if (!studentCourse) {
    studentCourse = await prisma.studentCourse.create({
      data: {
        title: 'E2E Course',
        position: 1,
        studentCourseModules: {
          create: [1, 2, 3].map((moduleIndex) => ({
            title: `E2E Module ${moduleIndex}`,
            position: moduleIndex,
            instructions: {
              create: [1, 2, 3].map((instructionIndex) => ({
                title: `Instruction ${moduleIndex}.${instructionIndex}`,
                prompt: `Prompt for instruction ${moduleIndex}.${instructionIndex}`,
                position: instructionIndex,
                showChatButton: true,
              })),
            },
          })),
        },
      },
      select: {
        id: true,
        studentCourseModules: { select: { id: true, position: true } },
      },
    });
  }

  // 9. Link class to student course
  const existingLink = await prisma.classStudentCourse.findFirst({
    where: { classId: klass.id, studentCourseId: studentCourse.id },
  });
  if (!existingLink) {
    await prisma.classStudentCourse.create({
      data: { classId: klass.id, studentCourseId: studentCourse.id },
    });
  }

  // 10. Document
  let document = await prisma.document.findFirst({
    where: { profileId: studentProfileRecord.id, title: 'E2E Doc' },
    select: { id: true },
  });
  if (!document) {
    document = await prisma.document.create({
      data: {
        title: 'E2E Doc',
        text: 'This are a practice essay with grammar mistake. I went to the store, I buyed milk and bread. The students was excited for writing.',
        html: '<p>This are a practice essay with grammar mistake. I went to the store, I buyed milk and bread. The students was excited for writing.</p>',
        profileId: studentProfileRecord.id,
        classId: klass.id,
      },
      select: { id: true },
    });
  }

  // 11. Course module session
  const firstModuleId = studentCourse.studentCourseModules.sort(
    (a, b) => a.position - b.position
  )[0].id;
  const existingSession = await prisma.studentCourseModuleSession.findFirst({
    where: {
      documentId: document.id,
      studentCourseModuleId: firstModuleId,
    },
  });
  if (!existingSession) {
    await prisma.studentCourseModuleSession.create({
      data: {
        studentCourseModuleId: firstModuleId,
        studentProfileId: studentProfileRecord.studentProfile!.id,
        documentId: document.id,
        title: 'E2E Doc Session',
        instructionsCompleted: 0,
      },
    });
  }

  const context: E2EContext = {
    organizationId: org.id,
    userId: studentUser.id,
    userEmail: studentUser.email,
    adminUserId: adminUser.id,
    adminEmail: adminUser.email,
    profileId: studentProfileRecord.id,
    studentCourseId: studentCourse.id,
    documentId: document.id,
    classId: klass.id,
    classCode: CLASS_CODE,
    schoolId: school.id,
    teacherProfileId,
    teacherName,
    teacherEmail,
  };

  console.log('🌱 Seed overlay complete.');
  return context;
}

// When run as a standalone script, execute and print context
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('seed-overlay.ts')) {
  seedOverlay()
    .then((ctx) => {
      console.log(JSON.stringify(ctx, null, 2));
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/prisma/scripts/seed-overlay.ts
git commit -m "feat: add shared seed overlay script for test users on production data"
```

---

### Task 3: Update `prepare-e2e.ts` to use production dump + overlay

**Files:**
- Modify: `services/web-app/e2e/prepare-e2e.ts`

- [ ] **Step 1: Replace the prepare flow**

Replace the `ensureDatabaseExists` function with a `resetDatabase` function that drops and recreates the DB for a clean restore. Add a `downloadDump` function. Replace the `seedE2E()` call with dump restore + migrate + overlay.

The full updated `prepare-e2e.ts`:

```typescript
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error `pg` types are not installed in the web-app package.
import { Client } from 'pg';

const CONTAINER_NAME = 'yawp-e2e-postgres';
const E2E_DB_NAME = 'yop_e2e';
const DUMP_S3_URI =
  's3://yawp-production-database-exports/Mar03260636.dump';

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
      run(`docker exec ${CONTAINER_NAME} pg_isready -U ${shellEscape(pgUser)}`);
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
    // Terminate existing connections
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

function downloadDump(e2eDir: string) {
  const dataDir = path.join(e2eDir, '.data');
  const dumpPath = path.join(dataDir, 'production.dump');

  if (fs.existsSync(dumpPath)) {
    // eslint-disable-next-line no-console
    console.log('Using cached dump at', dumpPath);
    return dumpPath;
  }

  fs.mkdirSync(dataDir, { recursive: true });
  // eslint-disable-next-line no-console
  console.log('Downloading production dump from S3...');
  run(`aws s3 cp ${DUMP_S3_URI} ${shellEscape(dumpPath)} --profile yawp`);
  return dumpPath;
}

function restoreDump(dumpPath: string, databaseUrl: string) {
  // eslint-disable-next-line no-console
  console.log('Restoring production dump...');
  run(`psql -f ${shellEscape(dumpPath)} ${shellEscape(databaseUrl)}`, {
    stdio: 'pipe',
  });
}

type PreparedConnection = {
  databaseUrl: string;
  startedContainer: boolean;
};

async function prepareConnection(e2eDir: string): Promise<PreparedConnection> {
  const pgOwnedPath = path.join(e2eDir, '.pg-owned');
  const providedDbUrl = process.env.E2E_DATABASE_URL || undefined;
  if (providedDbUrl?.startsWith('postgres://') || providedDbUrl?.startsWith('postgresql://')) {
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
    AWS_S3_BUCKET_FOR_VIDEOS: process.env.AWS_S3_BUCKET_FOR_VIDEOS || 'e2e-bucket',
    AWS_S3_REGION_FOR_VIDEOS: process.env.AWS_S3_REGION_FOR_VIDEOS || 'us-east-1',
    E2E: 'true',
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

  // 2. Drop and recreate database for clean restore
  await resetDatabase(databaseUrl);
  writeE2EEnv(e2eDir, databaseUrl);

  // 3. Download production dump (cached locally)
  const dumpPath = downloadDump(e2eDir);

  // 4. Restore dump into fresh database
  restoreDump(dumpPath, databaseUrl);

  // 5. Run any newer migrations
  const env = { ...process.env, DATABASE_URL: databaseUrl };
  run('bun prisma generate', { cwd: prismaDir, env });
  run('bun prisma migrate deploy', { cwd: prismaDir, env });

  // 6. Overlay test users
  run('bun run packages/prisma/scripts/seed-overlay.ts', {
    cwd: rootDir,
    env,
  });

  // 7. Read context from overlay output (run again to capture JSON)
  const ctxOutput = execSync(
    'bun run packages/prisma/scripts/seed-overlay.ts',
    { cwd: rootDir, env: { ...env }, stdio: 'pipe' }
  ).toString();

  // The overlay prints the context JSON as its last output
  const jsonMatch = ctxOutput.match(/\{[\s\S]*\}$/m);
  if (!jsonMatch) {
    throw new Error('seed-overlay did not produce valid JSON context');
  }
  fs.writeFileSync(ctxPath, jsonMatch[0]);

  // eslint-disable-next-line no-console
  console.log('E2E prepare complete', {
    DATABASE_URL: databaseUrl,
    DOCKER_PG_STARTED: startedContainer,
  });
}
```

- [ ] **Step 2: Run E2E prepare to verify it works**

```bash
cd services/web-app && bun run test:e2e:prepare
```

Expected: Downloads dump from S3 (first time), restores it, runs migrations, runs overlay, produces `.e2e-context.json`.

- [ ] **Step 3: Run E2E smoke tests to verify tests still pass**

```bash
cd services/web-app && bun run test:e2e:smoke
```

Expected: All smoke tests pass using production data + overlay users.

- [ ] **Step 4: Commit**

```bash
git add services/web-app/e2e/prepare-e2e.ts
git commit -m "feat: E2E prepare uses production dump from S3 instead of synthetic seed"
```

---

### Task 4: Update the GitHub Actions workflow for preview environments

**Files:**
- Modify: `.github/workflows/preview-environments.yml`

- [ ] **Step 1: Replace the "Create PR schema and migrate" step**

Replace lines 107-124 of the workflow with:

```yaml
      - name: Create PR schema, restore dump, and migrate
        env:
          NODE_TLS_REJECT_UNAUTHORIZED: "0"
        run: |
          set -euo pipefail
          SCHEMA="pr_${PR_NUMBER}"
          export DATABASE_URL="$BASE_DATABASE_URL"

          # Create schema
          echo "CREATE SCHEMA IF NOT EXISTS ${SCHEMA};" | (cd packages/prisma && bunx prisma db execute --stdin)

          # Build schema-qualified URL
          if [[ "$BASE_DATABASE_URL" == *\?* ]]; then
            MIGRATE_URL="${BASE_DATABASE_URL}&schema=${SCHEMA}"
          else
            MIGRATE_URL="${BASE_DATABASE_URL}?schema=${SCHEMA}"
          fi
          echo "::add-mask::$MIGRATE_URL"

          # Restore production dump with schema remapping
          echo "Restoring production dump into schema ${SCHEMA}..."
          aws s3 cp s3://yawp-production-database-exports/Mar03260636.dump - \
            | sed "s/public\./${SCHEMA}./g; s/search_path = public/search_path = ${SCHEMA}/g" \
            | psql "$MIGRATE_URL"

          # Apply any newer migrations
          (cd packages/prisma && DATABASE_URL="$MIGRATE_URL" bunx prisma migrate deploy)
          bun run prisma:generate

          # Overlay test users (for smoke tests)
          DATABASE_SSL_REJECT_UNAUTHORIZED=false DATABASE_URL="$MIGRATE_URL" bun run packages/prisma/scripts/seed-overlay.ts
```

- [ ] **Step 2: Update the PR comment to reflect new data source**

Replace the seed reference in the `Comment preview URL on PR` step (line 209):

From:
```
- **Seed:** `packages/prisma/scripts/seed.ts` (test users e.g. `teacher@fake.test` / `teacher123`)
```

To:
```
- **Data:** Production dump + test overlay (e.g. `teacher@fake.test` / `teacher123`)
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/preview-environments.yml
git commit -m "feat: preview environments restore production dump from S3 instead of synthetic seed"
```

---

### Task 5: Clean up the e2e test file from earlier debugging

**Files:**
- Remove: `services/web-app/e2e/tests/tutor-response-save-bug.spec.ts` (created during debugging, not needed)

- [ ] **Step 1: Remove the file**

```bash
rm -f services/web-app/e2e/tests/tutor-response-save-bug.spec.ts
```

- [ ] **Step 2: Commit**

```bash
git add -A services/web-app/e2e/tests/tutor-response-save-bug.spec.ts
git commit -m "chore: remove temporary test file from debugging session"
```

---

### Task 6: End-to-end verification

- [ ] **Step 1: Run full E2E test suite locally**

```bash
cd services/web-app && bun run test:e2e:full
```

Expected: All tests pass against production data.

- [ ] **Step 2: Verify the dump cache works on second run**

```bash
cd services/web-app && bun run test:e2e:prepare
```

Expected: Says "Using cached dump at ..." (no S3 download). Restores and completes quickly.
