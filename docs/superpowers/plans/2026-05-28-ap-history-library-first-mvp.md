# AP History Library-First MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a clean APUSH DBQ/LEQ library-first MVP on top of the existing Assignments rollout.

**Architecture:** AP History is a canonical `AssignmentType`; curated DBQ/LEQ prompts live in AP library tables; teacher creation copies a versioned immutable `Assignment.apHistorySnapshot`; student display, tutor input, and GA input read that same snapshot. The current AP PR stack is prototype/reference material only, not the implementation base.

**Tech Stack:** Bun, React Router, Prisma/Postgres, Zod, existing FeatureAccessTarget feature flags, existing Assignment/Document/Submission/Tutor flows.

---

## Execution Setup

Use an isolated worktree/branch at execution time:

```bash
git switch main
git pull --ff-only
git switch -c codex/ap-history-library-first-mvp
```

Do not merge or cherry-pick the current PR #148/#149/#150 stack. Inspect it only with `git show` or a detached worktree when useful.

Run focused tests after each task, then run the broader verification set at the end:

```bash
bun test services/web-app/app/domain/ap-history
bun test services/web-app/app/utils/feature-flags.server.test.ts
bun test services/web-app/app/routes/api.assignments.create/route.test.ts
bun test services/web-app/app/routes/app.assignment-types.\$id/route.test.ts
bun test services/web-app/app/routes/app_.documents_.\$id/route.test.ts
bun test services/web-app/app/routes/api.domain.grade-essay-ai/route.test.ts
bun web-app:typecheck
```

## File Structure

Create:

- `packages/prisma/migrations/20260528170000_ap_history_library_first_mvp/migration.sql` - additive schema migration.
- `packages/prisma/scripts/ap-history-library-data.ts` - small curated APUSH DBQ/LEQ seed corpus with stable keys.
- `packages/prisma/scripts/seed-ap-history-library.ts` - idempotent internal seed/import script.
- `packages/prisma/scripts/seed-ap-history-library.test.ts` - unit tests for seed idempotency and stable-key upserts.
- `services/web-app/app/domain/ap-history/schema.ts` - AP History constants, Zod snapshot validation, rubric definitions.
- `services/web-app/app/domain/ap-history/library.server.ts` - DB reads and assignment snapshot creation helpers.
- `services/web-app/app/domain/ap-history/library.server.test.ts` - tests for immutable snapshot creation.
- `services/web-app/app/routes/app.assignment-types.$id/ap-history-library.tsx` - teacher-facing AP library list.
- `services/web-app/app/routes/app_.documents_.$id/ap-history-assignment-panel.tsx` - student-facing AP prompt/source panel.
- `services/web-app/e2e/tests/ap-history-library-first.spec.ts` - preview proof path.

Modify:

- `packages/prisma/schema.prisma` - add `AssignmentType.systemKey`, `Assignment.apHistorySnapshot`, AP library models.
- `packages/prisma/package.json` - add seed script.
- `services/web-app/app/utils/feature-flags.server.ts` - add `ap_history_essay` pilot key and context helper.
- `services/web-app/app/utils/feature-flags.server.test.ts` - AP access tests.
- `services/web-app/app/routes/app.admin.feature-flags/route.tsx` - expose AP History in the pilot feature table.
- `services/web-app/app/routes/app.admin.feature-flags/route.test.ts` - admin AP pilot row test.
- `services/web-app/app/routes/api.assignments.create/route.ts` - library-entry assignment creation and AP access enforcement.
- `services/web-app/app/routes/api.assignments.create/route.test.ts` - library-only assignment tests.
- `services/web-app/app/routes/app.assignment-types.$id/route.tsx` - load/render AP library for enabled teachers.
- `services/web-app/app/routes/app.assignment-types.$id/create-assignment-sheet.tsx` - library-only AP creation mode.
- `services/web-app/app/routes/app.assignment-types.$id/route.test.ts` - AP library visibility tests.
- `services/web-app/app/routes/app_.documents_.$id/route.tsx` - select/render AP snapshot.
- `services/web-app/app/routes/app_.documents_.$id/route.test.ts` - AP snapshot document tests.
- `services/web-app/app/routes/api.domain.grade-essay-ai/route.ts` - AP rubric branch.
- `services/web-app/app/routes/api.domain.grade-essay-ai/route.test.ts` - AP GA prompt/schema tests.
- `services/web-app/e2e/db-helpers.ts` - AP feature target helper.
- `services/web-app/e2e/seed-e2e.ts` - AP demo type/library seed for preview/e2e.

## Task 1: Add AP History Schema Foundation

**Files:**
- Modify: `packages/prisma/schema.prisma`
- Create: `packages/prisma/migrations/20260528170000_ap_history_library_first_mvp/migration.sql`
- Verify: `bun prisma:generate && bun web-app:typecheck`

- [ ] **Step 1: Add additive Prisma fields and models**

In `packages/prisma/schema.prisma`, add `systemKey` to `AssignmentType`, `apHistorySnapshot` to `Assignment`, and the two AP library models.

```prisma
model AssignmentType {
  id                      String                       @id @default(cuid())
  createdAt               DateTime                     @default(now()) @db.Timestamptz(6)
  updatedAt               DateTime                     @default(now()) @db.Timestamptz(6)
  title                   String
  description             String?
  position                Int
  systemKey               String?                      @unique
  archivedAt              DateTime?                    @db.Timestamptz(6)
  ownerOrgId              String?
  ownerOrg                Organization?                @relation(fields: [ownerOrgId], references: [id], onDelete: Cascade)
  ownerTeacherId          String?
  ownerTeacher            Profile?                     @relation("AssignmentTypeOwner", fields: [ownerTeacherId], references: [id], onDelete: Cascade)
  image                   AssignmentTypeImage?
  organizationAssignments OrganizationAssignmentType[]
  assignmentModules       AssignmentModule[]
  assignments             Assignment[]
  documents               Document[]
  apHistoryLibraryEntries ApHistoryPromptLibraryEntry[]

  @@index([ownerOrgId])
  @@index([ownerTeacherId])
  @@index([archivedAt])
  @@index([systemKey])
}

model Assignment {
  id               String         @id @default(cuid())
  createdAt        DateTime       @default(now()) @db.Timestamptz(6)
  updatedAt        DateTime       @default(now()) @db.Timestamptz(6)
  classId          String
  class            Class          @relation(fields: [classId], references: [id], onDelete: Cascade)
  assignmentTypeId String
  assignmentType   AssignmentType @relation(fields: [assignmentTypeId], references: [id], onDelete: Cascade)
  title            String?
  prompt           String
  tutorContext     String?
  dueDate          DateTime?      @db.Timestamptz(6)
  apHistorySnapshot Json?
  documents        Document[]

  @@index([classId, createdAt(sort: Desc)])
  @@index([assignmentTypeId])
  @@index([dueDate])
}

model ApHistoryPromptLibraryEntry {
  id                     String                         @id @default(cuid())
  createdAt              DateTime                       @default(now()) @db.Timestamptz(6)
  updatedAt              DateTime                       @default(now()) @updatedAt @db.Timestamptz(6)
  externalKey            String                         @unique
  assignmentTypeId       String
  assignmentType         AssignmentType                 @relation(fields: [assignmentTypeId], references: [id], onDelete: Cascade)
  course                 String
  essayType              String
  title                  String
  prompt                 String
  period                 String
  periodNumber           Int
  reasoningSkill         String
  difficulty             String
  skillEmphasis          String?
  defaultTimeMode        String                         @default("untimed")
  defaultDurationMinutes Int
  provenanceUrl          String?
  archivedAt             DateTime?                      @db.Timestamptz(6)
  sources                ApHistoryPromptLibrarySource[]

  @@index([assignmentTypeId, essayType])
  @@index([course, periodNumber])
  @@index([archivedAt])
}

model ApHistoryPromptLibrarySource {
  id                   String                      @id @default(cuid())
  createdAt            DateTime                    @default(now()) @db.Timestamptz(6)
  updatedAt            DateTime                    @default(now()) @updatedAt @db.Timestamptz(6)
  externalKey          String                      @unique
  promptLibraryEntryId String
  promptLibraryEntry   ApHistoryPromptLibraryEntry @relation(fields: [promptLibraryEntryId], references: [id], onDelete: Cascade)
  position             Int
  title                String
  attribution          String
  body                 String
  caption              String?
  mediaType            String                      @default("text")
  imageUrl             String?
  imageAlt             String?
  provenanceUrl        String?

  @@index([promptLibraryEntryId, position])
}
```

- [ ] **Step 2: Add the SQL migration**

Create `packages/prisma/migrations/20260528170000_ap_history_library_first_mvp/migration.sql`.

```sql
ALTER TABLE "AssignmentType" ADD COLUMN "systemKey" TEXT;
ALTER TABLE "Assignment" ADD COLUMN "apHistorySnapshot" JSONB;

CREATE UNIQUE INDEX "AssignmentType_systemKey_key" ON "AssignmentType"("systemKey");
CREATE INDEX "AssignmentType_systemKey_idx" ON "AssignmentType"("systemKey");

CREATE TABLE "ApHistoryPromptLibraryEntry" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "externalKey" TEXT NOT NULL,
    "assignmentTypeId" TEXT NOT NULL,
    "course" TEXT NOT NULL,
    "essayType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "periodNumber" INTEGER NOT NULL,
    "reasoningSkill" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "skillEmphasis" TEXT,
    "defaultTimeMode" TEXT NOT NULL DEFAULT 'untimed',
    "defaultDurationMinutes" INTEGER NOT NULL,
    "provenanceUrl" TEXT,
    "archivedAt" TIMESTAMPTZ(6),
    CONSTRAINT "ApHistoryPromptLibraryEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ApHistoryPromptLibraryEntry_assignmentTypeId_fkey"
      FOREIGN KEY ("assignmentTypeId") REFERENCES "AssignmentType"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ApHistoryPromptLibrarySource" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "externalKey" TEXT NOT NULL,
    "promptLibraryEntryId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "attribution" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "caption" TEXT,
    "mediaType" TEXT NOT NULL DEFAULT 'text',
    "imageUrl" TEXT,
    "imageAlt" TEXT,
    "provenanceUrl" TEXT,
    CONSTRAINT "ApHistoryPromptLibrarySource_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ApHistoryPromptLibrarySource_promptLibraryEntryId_fkey"
      FOREIGN KEY ("promptLibraryEntryId") REFERENCES "ApHistoryPromptLibraryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ApHistoryPromptLibraryEntry_externalKey_key"
    ON "ApHistoryPromptLibraryEntry"("externalKey");
CREATE INDEX "ApHistoryPromptLibraryEntry_assignmentTypeId_essayType_idx"
    ON "ApHistoryPromptLibraryEntry"("assignmentTypeId", "essayType");
CREATE INDEX "ApHistoryPromptLibraryEntry_course_periodNumber_idx"
    ON "ApHistoryPromptLibraryEntry"("course", "periodNumber");
CREATE INDEX "ApHistoryPromptLibraryEntry_archivedAt_idx"
    ON "ApHistoryPromptLibraryEntry"("archivedAt");

CREATE UNIQUE INDEX "ApHistoryPromptLibrarySource_externalKey_key"
    ON "ApHistoryPromptLibrarySource"("externalKey");
CREATE INDEX "ApHistoryPromptLibrarySource_promptLibraryEntryId_position_idx"
    ON "ApHistoryPromptLibrarySource"("promptLibraryEntryId", "position");
```

- [ ] **Step 3: Generate Prisma client**

Run:

```bash
bun prisma:generate
```

Expected: Prisma client generation succeeds with no schema validation errors.

- [ ] **Step 4: Commit**

```bash
git add packages/prisma/schema.prisma packages/prisma/migrations/20260528170000_ap_history_library_first_mvp/migration.sql
git commit -m "feat: add AP History library schema"
```

## Task 2: Add AP History Domain Schema and Snapshot Builder

**Files:**
- Create: `services/web-app/app/domain/ap-history/schema.ts`
- Create: `services/web-app/app/domain/ap-history/library.server.ts`
- Create: `services/web-app/app/domain/ap-history/library.server.test.ts`

- [ ] **Step 1: Write failing snapshot tests**

Create `services/web-app/app/domain/ap-history/library.server.test.ts`.

```ts
import { describe, expect, test } from 'bun:test';
import {
  AP_HISTORY_ASSIGNMENT_TYPE_KEY,
  buildApHistorySnapshot,
  parseApHistorySnapshot,
} from './schema';

const dbqEntry = {
  externalKey: 'apush-dbq-new-deal-federal-power',
  course: 'apush',
  essayType: 'dbq',
  title: 'New Deal and Federal Power DBQ',
  prompt: 'Evaluate the extent to which the New Deal changed the role of the federal government.',
  period: '1932-1980',
  periodNumber: 7,
  reasoningSkill: 'causation',
  difficulty: 'exam-ready',
  skillEmphasis: 'evidence',
  defaultTimeMode: 'untimed',
  defaultDurationMinutes: 60,
  provenanceUrl: 'https://example.test/new-deal-dbq',
  sources: [
    {
      externalKey: 'apush-dbq-new-deal-federal-power-doc-1',
      position: 1,
      title: 'Document 1',
      attribution: 'Franklin D. Roosevelt, fireside chat, 1933',
      body: 'The only thing we have to fear is fear itself.',
      caption: 'FDR addresses the banking crisis.',
      mediaType: 'text',
      imageUrl: null,
      imageAlt: null,
      provenanceUrl: 'https://example.test/doc-1',
    },
  ],
};

describe('AP History snapshot schema', () => {
  test('exports the canonical assignment type key', () => {
    expect(AP_HISTORY_ASSIGNMENT_TYPE_KEY).toBe('ap_history_essay');
  });

  test('builds a versioned immutable DBQ snapshot from a library row', () => {
    const snapshot = buildApHistorySnapshot(dbqEntry);
    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      libraryEntryId: 'apush-dbq-new-deal-federal-power',
      course: 'apush',
      essayType: 'dbq',
      prompt: dbqEntry.prompt,
      rubric: { rubricId: 'ap-history-dbq-2026', totalPoints: 7 },
      timing: { mode: 'untimed', durationMinutes: 60 },
    });
    expect(snapshot.sources).toHaveLength(1);

    dbqEntry.sources[0].body = 'Library row changed after assignment creation.';
    expect(snapshot.sources[0].body).toBe(
      'The only thing we have to fear is fear itself.'
    );
  });

  test('accepts LEQ snapshots with no sources', () => {
    const snapshot = buildApHistorySnapshot({
      ...dbqEntry,
      externalKey: 'apush-leq-market-revolution',
      essayType: 'leq',
      defaultDurationMinutes: 40,
      sources: [],
    });

    expect(parseApHistorySnapshot(snapshot)).toMatchObject({
      essayType: 'leq',
      rubric: { rubricId: 'ap-history-leq-2026', totalPoints: 6 },
      sources: [],
    });
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
bun test services/web-app/app/domain/ap-history/library.server.test.ts
```

Expected: FAIL because `./schema` does not exist.

- [ ] **Step 3: Add AP History schema code**

Create `services/web-app/app/domain/ap-history/schema.ts`.

```ts
import { z } from 'zod';

export const AP_HISTORY_ASSIGNMENT_TYPE_KEY = 'ap_history_essay' as const;
export const AP_HISTORY_SNAPSHOT_VERSION = 1 as const;

const EssayTypeSchema = z.enum(['dbq', 'leq']);
const TimeModeSchema = z.enum(['untimed', 'timed']);

export const ApHistorySourceSnapshotSchema = z.object({
  externalKey: z.string().min(1),
  position: z.number().int().positive(),
  title: z.string().min(1),
  attribution: z.string().min(1),
  body: z.string().min(1),
  caption: z.string().nullable().optional(),
  mediaType: z.enum(['text', 'image']),
  imageUrl: z.string().nullable().optional(),
  imageAlt: z.string().nullable().optional(),
  provenanceUrl: z.string().nullable().optional(),
});

export const ApHistorySnapshotSchema = z.object({
  schemaVersion: z.literal(AP_HISTORY_SNAPSHOT_VERSION),
  libraryEntryId: z.string().min(1),
  course: z.literal('apush'),
  essayType: EssayTypeSchema,
  prompt: z.string().min(1),
  period: z.string().min(1),
  periodNumber: z.number().int().positive(),
  reasoningSkill: z.string().min(1),
  sources: z.array(ApHistorySourceSnapshotSchema),
  rubric: z.object({
    rubricId: z.enum(['ap-history-dbq-2026', 'ap-history-leq-2026']),
    totalPoints: z.union([z.literal(7), z.literal(6)]),
  }),
  timing: z.object({
    mode: TimeModeSchema,
    durationMinutes: z.number().int().positive(),
  }),
});

export type ApHistorySnapshot = z.infer<typeof ApHistorySnapshotSchema>;

type LibraryEntryForSnapshot = {
  externalKey: string;
  course: string;
  essayType: string;
  prompt: string;
  period: string;
  periodNumber: number;
  reasoningSkill: string;
  defaultTimeMode: string;
  defaultDurationMinutes: number;
  sources: Array<z.input<typeof ApHistorySourceSnapshotSchema>>;
};

export function parseApHistorySnapshot(value: unknown): ApHistorySnapshot {
  return ApHistorySnapshotSchema.parse(value);
}

export function isApHistorySnapshot(value: unknown): value is ApHistorySnapshot {
  return ApHistorySnapshotSchema.safeParse(value).success;
}

export function buildApHistorySnapshot(
  entry: LibraryEntryForSnapshot
): ApHistorySnapshot {
  const essayType = EssayTypeSchema.parse(entry.essayType);
  const rubric =
    essayType === 'dbq'
      ? { rubricId: 'ap-history-dbq-2026' as const, totalPoints: 7 as const }
      : { rubricId: 'ap-history-leq-2026' as const, totalPoints: 6 as const };

  const snapshot = {
    schemaVersion: AP_HISTORY_SNAPSHOT_VERSION,
    libraryEntryId: entry.externalKey,
    course: 'apush' as const,
    essayType,
    prompt: entry.prompt,
    period: entry.period,
    periodNumber: entry.periodNumber,
    reasoningSkill: entry.reasoningSkill,
    sources: entry.sources.map((source) => ({ ...source })),
    rubric,
    timing: {
      mode: TimeModeSchema.parse(entry.defaultTimeMode),
      durationMinutes: entry.defaultDurationMinutes,
    },
  };

  return ApHistorySnapshotSchema.parse(snapshot);
}
```

- [ ] **Step 4: Add server library helpers**

Create `services/web-app/app/domain/ap-history/library.server.ts`.

```ts
import type { Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import {
  AP_HISTORY_ASSIGNMENT_TYPE_KEY,
  buildApHistorySnapshot,
} from './schema';

export async function findApHistoryAssignmentTypeForOrg(organizationId: string) {
  return prisma.assignmentType.findFirst({
    where: {
      systemKey: AP_HISTORY_ASSIGNMENT_TYPE_KEY,
      archivedAt: null,
      organizationAssignments: { some: { organizationId } },
    },
    select: { id: true, title: true, systemKey: true },
  });
}

export async function listApHistoryLibraryEntries(assignmentTypeId: string) {
  return prisma.apHistoryPromptLibraryEntry.findMany({
    where: { assignmentTypeId, archivedAt: null, course: 'apush' },
    orderBy: [{ essayType: 'asc' }, { periodNumber: 'asc' }, { title: 'asc' }],
    include: { sources: { orderBy: { position: 'asc' } } },
  });
}

export async function getApHistoryLibraryEntryForSnapshot(params: {
  assignmentTypeId: string;
  externalKey: string;
}) {
  return prisma.apHistoryPromptLibraryEntry.findFirst({
    where: {
      assignmentTypeId: params.assignmentTypeId,
      externalKey: params.externalKey,
      archivedAt: null,
      course: 'apush',
    },
    include: { sources: { orderBy: { position: 'asc' } } },
  });
}

export function buildAssignmentCreateInputFromApHistoryEntry(params: {
  classId: string;
  assignmentTypeId: string;
  title: string | null;
  dueDate: Date | null;
  entry: NonNullable<
    Awaited<ReturnType<typeof getApHistoryLibraryEntryForSnapshot>>
  >;
}): Prisma.AssignmentCreateManyInput {
  const snapshot = buildApHistorySnapshot(params.entry);
  return {
    classId: params.classId,
    assignmentTypeId: params.assignmentTypeId,
    title: params.title ?? params.entry.title,
    prompt: snapshot.prompt,
    tutorContext: null,
    dueDate: params.dueDate,
    apHistorySnapshot: snapshot as Prisma.InputJsonValue,
  };
}
```

- [ ] **Step 5: Run tests and commit**

Run:

```bash
bun test services/web-app/app/domain/ap-history/library.server.test.ts
```

Expected: PASS.

Commit:

```bash
git add services/web-app/app/domain/ap-history
git commit -m "feat: add AP History snapshot contract"
```

## Task 3: Add AP History Feature Access

**Files:**
- Modify: `services/web-app/app/utils/feature-flags.server.ts`
- Modify: `services/web-app/app/utils/feature-flags.server.test.ts`
- Modify: `services/web-app/app/routes/app.admin.feature-flags/route.tsx`
- Modify: `services/web-app/app/routes/app.admin.feature-flags/route.test.ts`
- Modify: `services/web-app/e2e/db-helpers.ts`

- [ ] **Step 1: Add failing AP access tests**

Append tests to `services/web-app/app/utils/feature-flags.server.test.ts`.

```ts
describe('isApHistoryEssayEnabledForContext', () => {
  beforeEach(() => {
    prisma.setting.findUnique.mockReset();
    prisma.setting.upsert.mockReset();
    prisma.featureAccessTarget.findFirst.mockReset();
  });

  test('allows AP History by organization target', async () => {
    prisma.featureAccessTarget.findFirst.mockImplementation(async ({ where }) =>
      where.OR.some(
        (target: { targetKind: string; targetId: { in: string[] } }) =>
          target.targetKind === 'organization' &&
          target.targetId.in.includes('org-1')
      )
        ? { id: 'fat-org-1' }
        : null
    );

    const result = await isApHistoryEssayEnabledForContext({
      organizationId: 'org-1',
      schoolIds: ['school-1'],
      teacherProfileIds: ['teacher-1'],
      classIds: ['class-1'],
    });

    expect(result).toBe(true);
    expect(prisma.featureAccessTarget.findFirst).toHaveBeenCalledWith({
      where: {
        featureKey: 'ap_history_essay',
        enabled: true,
        OR: [
          { targetKind: 'organization', targetId: { in: ['org-1'] } },
          { targetKind: 'school', targetId: { in: ['school-1'] } },
          { targetKind: 'teacher', targetId: { in: ['teacher-1'] } },
          { targetKind: 'class', targetId: { in: ['class-1'] } },
        ],
        AND: [
          {
            OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
          },
        ],
      },
      select: { id: true },
    });
  });

  test('returns false when no AP History target matches', async () => {
    prisma.featureAccessTarget.findFirst.mockResolvedValue(null);

    const result = await isApHistoryEssayEnabledForContext({
      organizationId: 'org-1',
      schoolIds: ['school-1'],
      teacherProfileIds: ['teacher-1'],
      classIds: ['class-1'],
    });

    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
bun test services/web-app/app/utils/feature-flags.server.test.ts
```

Expected: FAIL because `isApHistoryEssayEnabledForContext` is not exported.

- [ ] **Step 3: Implement AP feature access helper**

In `services/web-app/app/utils/feature-flags.server.ts`, update the pilot keys and target kinds:

```ts
export const PILOT_FEATURE_KEYS = {
  ASSIGNMENTS: 'assignments',
  DOCUMENT_SUBMISSION_GRADING: 'document_submission_grading',
  AP_HISTORY_ESSAY: 'ap_history_essay',
} as const;

type FeatureAccessTargetKind = 'organization' | 'school' | 'teacher' | 'class';
```

Add this exported helper near the other feature helpers:

```ts
export async function isApHistoryEssayEnabledForContext({
  organizationId,
  schoolIds,
  teacherProfileId,
  teacherProfileIds,
  classIds,
}: {
  organizationId?: string | null;
  schoolIds?: Array<string | null | undefined>;
  teacherProfileId?: string | null;
  teacherProfileIds?: Array<string | null | undefined>;
  classIds?: Array<string | null | undefined>;
}): Promise<boolean> {
  return isPilotFeatureEnabledForTargets(PILOT_FEATURE_KEYS.AP_HISTORY_ESSAY, [
    { kind: 'organization', ids: [organizationId] },
    { kind: 'school', ids: schoolIds ?? [] },
    {
      kind: 'teacher',
      ids: [teacherProfileId, ...(teacherProfileIds ?? [])],
    },
    { kind: 'class', ids: classIds ?? [] },
  ]);
}
```

- [ ] **Step 4: Add AP History to admin pilot feature UI**

In `services/web-app/app/routes/app.admin.feature-flags/route.tsx`, extend the pilot feature key union and list:

```ts
type PilotFeatureKey =
  | 'assignments'
  | 'document_submission_grading'
  | 'ap_history_essay';
```

Add this row wherever the file defines the pilot feature metadata:

```ts
{
  key: 'ap_history_essay',
  label: 'AP History Essay',
  description: 'Curated APUSH DBQ/LEQ assignment type pilot access',
}
```

- [ ] **Step 5: Update e2e helper feature-key type**

In `services/web-app/e2e/db-helpers.ts`, add AP History to `PILOT_FEATURE_KEYS`:

```ts
const PILOT_FEATURE_KEYS = [
  'assignments',
  'document_submission_grading',
  'ap_history_essay',
] as const;
```

- [ ] **Step 6: Run tests and commit**

Run:

```bash
bun test services/web-app/app/utils/feature-flags.server.test.ts
bun test services/web-app/app/routes/app.admin.feature-flags/route.test.ts
```

Expected: PASS.

Commit:

```bash
git add services/web-app/app/utils/feature-flags.server.ts services/web-app/app/utils/feature-flags.server.test.ts services/web-app/app/routes/app.admin.feature-flags/route.tsx services/web-app/app/routes/app.admin.feature-flags/route.test.ts services/web-app/e2e/db-helpers.ts
git commit -m "feat: add AP History feature access"
```

## Task 4: Add Internal AP Library Seed

**Files:**
- Create: `packages/prisma/scripts/ap-history-library-data.ts`
- Create: `packages/prisma/scripts/seed-ap-history-library.ts`
- Create: `packages/prisma/scripts/seed-ap-history-library.test.ts`
- Modify: `packages/prisma/package.json`

- [ ] **Step 1: Write seed data**

Create `packages/prisma/scripts/ap-history-library-data.ts`.

```ts
export const AP_HISTORY_LIBRARY_ENTRIES = [
  {
    externalKey: 'apush-dbq-new-deal-federal-power',
    course: 'apush',
    essayType: 'dbq',
    title: 'New Deal and Federal Power DBQ',
    prompt:
      'Evaluate the extent to which the New Deal changed the role of the federal government in the United States.',
    period: '1932-1980',
    periodNumber: 7,
    reasoningSkill: 'causation',
    difficulty: 'exam-ready',
    skillEmphasis: 'evidence',
    defaultTimeMode: 'untimed',
    defaultDurationMinutes: 60,
    provenanceUrl: 'https://apcentral.collegeboard.org/',
    sources: [
      {
        externalKey: 'apush-dbq-new-deal-federal-power-doc-1',
        position: 1,
        title: 'Document 1',
        attribution: 'Franklin D. Roosevelt, first inaugural address, 1933',
        body:
          'This Nation asks for action, and action now. Our greatest primary task is to put people to work.',
        caption: 'Roosevelt outlines federal response to economic crisis.',
        mediaType: 'text',
        imageUrl: null,
        imageAlt: null,
        provenanceUrl: 'https://apcentral.collegeboard.org/',
      },
      {
        externalKey: 'apush-dbq-new-deal-federal-power-doc-2',
        position: 2,
        title: 'Document 2',
        attribution: 'Social Security Act summary, 1935',
        body:
          'The Act created old-age benefits and unemployment insurance funded through payroll taxes.',
        caption: 'Federal welfare-state expansion during the New Deal.',
        mediaType: 'text',
        imageUrl: null,
        imageAlt: null,
        provenanceUrl: 'https://apcentral.collegeboard.org/',
      },
    ],
  },
  {
    externalKey: 'apush-leq-market-revolution',
    course: 'apush',
    essayType: 'leq',
    title: 'Market Revolution LEQ',
    prompt:
      'Evaluate the extent to which the Market Revolution transformed United States society in the period from 1815 to 1848.',
    period: '1815-1848',
    periodNumber: 4,
    reasoningSkill: 'causation',
    difficulty: 'intro',
    skillEmphasis: 'outside-evidence',
    defaultTimeMode: 'untimed',
    defaultDurationMinutes: 40,
    provenanceUrl: 'https://apcentral.collegeboard.org/',
    sources: [],
  },
] as const;
```

- [ ] **Step 2: Write seed unit test**

Create `packages/prisma/scripts/seed-ap-history-library.test.ts`.

```ts
import { describe, expect, test } from 'bun:test';
import { AP_HISTORY_LIBRARY_ENTRIES } from './ap-history-library-data';

describe('AP History library seed data', () => {
  test('has stable unique entry and source keys', () => {
    const entryKeys = new Set<string>();
    const sourceKeys = new Set<string>();

    for (const entry of AP_HISTORY_LIBRARY_ENTRIES) {
      expect(entry.externalKey).toMatch(/^apush-(dbq|leq)-/);
      expect(entryKeys.has(entry.externalKey)).toBe(false);
      entryKeys.add(entry.externalKey);

      if (entry.essayType === 'dbq') {
        expect(entry.sources.length).toBeGreaterThan(0);
      }
      if (entry.essayType === 'leq') {
        expect(entry.sources).toHaveLength(0);
      }

      for (const source of entry.sources) {
        expect(source.externalKey.startsWith(`${entry.externalKey}-doc-`)).toBe(true);
        expect(sourceKeys.has(source.externalKey)).toBe(false);
        sourceKeys.add(source.externalKey);
      }
    }
  });
});
```

- [ ] **Step 3: Run test and verify it passes**

Run:

```bash
bun test packages/prisma/scripts/seed-ap-history-library.test.ts
```

Expected: PASS.

- [ ] **Step 4: Add idempotent seed script**

Create `packages/prisma/scripts/seed-ap-history-library.ts`.

```ts
/* eslint-disable no-console */
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { AP_HISTORY_LIBRARY_ENTRIES } from './ap-history-library-data';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL environment variable is not set');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString, ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false } }),
});

const AP_HISTORY_ASSIGNMENT_TYPE_KEY = 'ap_history_essay';

async function main() {
  const organization = await prisma.organization.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!organization) throw new Error('No organization exists for AP History seed');

  const assignmentType = await prisma.assignmentType.upsert({
    where: { systemKey: AP_HISTORY_ASSIGNMENT_TYPE_KEY },
    create: {
      systemKey: AP_HISTORY_ASSIGNMENT_TYPE_KEY,
      title: 'AP History Essay',
      description: 'Curated APUSH DBQ and LEQ practice with AP rubric coaching.',
      position: 50,
      ownerOrgId: organization.id,
      organizationAssignments: { create: { organizationId: organization.id } },
      assignmentModules: {
        create: [
          {
            title: 'AP History Essay',
            position: 1,
            description: 'Write an APUSH DBQ or LEQ with AP-specific coaching.',
            instructions: {
              create: [
                {
                  title: 'Write',
                  prompt: 'Use the prompt and AP History coach to draft your response.',
                  position: 1,
                  showChatButton: true,
                },
              ],
            },
          },
        ],
      },
    },
    update: {
      title: 'AP History Essay',
      description: 'Curated APUSH DBQ and LEQ practice with AP rubric coaching.',
      archivedAt: null,
    },
    select: { id: true },
  });

  await prisma.organizationAssignmentType.upsert({
    where: {
      organizationId_assignmentTypeId: {
        organizationId: organization.id,
        assignmentTypeId: assignmentType.id,
      },
    },
    create: {
      organizationId: organization.id,
      assignmentTypeId: assignmentType.id,
    },
    update: {},
  });

  for (const entry of AP_HISTORY_LIBRARY_ENTRIES) {
    const savedEntry = await prisma.apHistoryPromptLibraryEntry.upsert({
      where: { externalKey: entry.externalKey },
      create: {
        ...entry,
        assignmentTypeId: assignmentType.id,
        sources: { create: entry.sources },
      },
      update: {
        assignmentTypeId: assignmentType.id,
        course: entry.course,
        essayType: entry.essayType,
        title: entry.title,
        prompt: entry.prompt,
        period: entry.period,
        periodNumber: entry.periodNumber,
        reasoningSkill: entry.reasoningSkill,
        difficulty: entry.difficulty,
        skillEmphasis: entry.skillEmphasis,
        defaultTimeMode: entry.defaultTimeMode,
        defaultDurationMinutes: entry.defaultDurationMinutes,
        provenanceUrl: entry.provenanceUrl,
        archivedAt: null,
      },
      select: { id: true },
    });

    for (const source of entry.sources) {
      await prisma.apHistoryPromptLibrarySource.upsert({
        where: { externalKey: source.externalKey },
        create: { ...source, promptLibraryEntryId: savedEntry.id },
        update: { ...source, promptLibraryEntryId: savedEntry.id },
      });
    }
  }

  console.log(`Seeded ${AP_HISTORY_LIBRARY_ENTRIES.length} AP History library entries.`);
}

main()
  .finally(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    process.exit(1);
  });
```

- [ ] **Step 5: Add package script**

In `packages/prisma/package.json`, add:

```json
"seed-ap-history-library": "bun run scripts/seed-ap-history-library.ts"
```

- [ ] **Step 6: Run tests and commit**

Run:

```bash
bun test packages/prisma/scripts/seed-ap-history-library.test.ts
bun run --cwd packages/prisma build
```

Expected: PASS.

Commit:

```bash
git add packages/prisma/scripts/ap-history-library-data.ts packages/prisma/scripts/seed-ap-history-library.ts packages/prisma/scripts/seed-ap-history-library.test.ts packages/prisma/package.json
git commit -m "feat: seed AP History library content"
```

## Task 5: Create Library-Only AP Assignments

**Files:**
- Modify: `services/web-app/app/routes/api.assignments.create/route.ts`
- Modify: `services/web-app/app/routes/api.assignments.create/route.test.ts`
- Use: `services/web-app/app/domain/ap-history/library.server.ts`

- [ ] **Step 1: Add failing assignment creation tests**

In `services/web-app/app/routes/api.assignments.create/route.test.ts`, extend the mocks:

```ts
const isApHistoryEssayEnabledForContext = mock();

mock.module('~/utils/feature-flags.server', () => ({
  isAssignmentsEnabledForContext,
  isApHistoryEssayEnabledForContext,
}));
```

Add AP library model mocks:

```ts
const prisma = {
  class: { findMany: mock() },
  assignmentType: { findFirst: mock() },
  apHistoryPromptLibraryEntry: { findFirst: mock() },
  assignment: { createMany: mock() },
};
```

Add this test:

```ts
test('creates AP History assignments from a curated library entry snapshot', async () => {
  isApHistoryEssayEnabledForContext.mockResolvedValue(true);
  prisma.assignmentType.findFirst.mockResolvedValue({
    id: 'ap-type-1',
    systemKey: 'ap_history_essay',
  });
  prisma.apHistoryPromptLibraryEntry.findFirst.mockResolvedValue({
    externalKey: 'apush-dbq-new-deal-federal-power',
    course: 'apush',
    essayType: 'dbq',
    title: 'New Deal and Federal Power DBQ',
    prompt: 'Evaluate the extent to which the New Deal changed federal power.',
    period: '1932-1980',
    periodNumber: 7,
    reasoningSkill: 'causation',
    difficulty: 'exam-ready',
    skillEmphasis: 'evidence',
    defaultTimeMode: 'untimed',
    defaultDurationMinutes: 60,
    provenanceUrl: 'https://example.test',
    sources: [
      {
        externalKey: 'apush-dbq-new-deal-federal-power-doc-1',
        position: 1,
        title: 'Document 1',
        attribution: 'FDR, 1933',
        body: 'Action now.',
        caption: null,
        mediaType: 'text',
        imageUrl: null,
        imageAlt: null,
        provenanceUrl: 'https://example.test/doc-1',
      },
    ],
  });

  const response = await action({
    request: requestFor({
      intent: 'create-assignment',
      assignmentTypeId: 'ap-type-1',
      classIds: ['class-1'],
      title: 'Friday DBQ',
      apHistoryLibraryEntryId: 'apush-dbq-new-deal-federal-power',
      dueDate: '2026-05-20',
    }),
    params: {},
  } as any);

  const body = await readBody(response);
  expect(body.success).toBe(true);
  expect(prisma.assignment.createMany).toHaveBeenCalledWith({
    data: [
      expect.objectContaining({
        classId: 'class-1',
        assignmentTypeId: 'ap-type-1',
        title: 'Friday DBQ',
        prompt: 'Evaluate the extent to which the New Deal changed federal power.',
        tutorContext: null,
        apHistorySnapshot: expect.objectContaining({
          schemaVersion: 1,
          libraryEntryId: 'apush-dbq-new-deal-federal-power',
          essayType: 'dbq',
          sources: [expect.objectContaining({ body: 'Action now.' })],
        }),
      }),
    ],
  });
});
```

Add the denial test:

```ts
test('rejects AP History assignment creation when AP access is disabled', async () => {
  isApHistoryEssayEnabledForContext.mockResolvedValue(false);
  prisma.assignmentType.findFirst.mockResolvedValue({
    id: 'ap-type-1',
    systemKey: 'ap_history_essay',
  });

  const response = await action({
    request: requestFor({
      intent: 'create-assignment',
      assignmentTypeId: 'ap-type-1',
      classIds: ['class-1'],
      apHistoryLibraryEntryId: 'apush-dbq-new-deal-federal-power',
    }),
    params: {},
  } as any);

  const body = await readBody(response);
  expect(body.success).toBe(false);
  expect(responseStatus(response)).toBe(403);
  expect(body.message).toBe('AP History Essay is not enabled for one or more classes.');
  expect(prisma.assignment.createMany).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun test services/web-app/app/routes/api.assignments.create/route.test.ts
```

Expected: FAIL because the route does not read `apHistoryLibraryEntryId`.

- [ ] **Step 3: Implement AP library branch in assignment create route**

In `services/web-app/app/routes/api.assignments.create/route.ts`, import:

```ts
import {
  AP_HISTORY_ASSIGNMENT_TYPE_KEY,
} from '~/domain/ap-history/schema';
import {
  buildAssignmentCreateInputFromApHistoryEntry,
  getApHistoryLibraryEntryForSnapshot,
} from '~/domain/ap-history/library.server';
import { isApHistoryEssayEnabledForContext } from '~/utils/feature-flags.server';
```

Read the library entry id:

```ts
const apHistoryLibraryEntryId = formData
  .get('apHistoryLibraryEntryId')
  ?.toString()
  .trim();
```

Update `assignmentType.findFirst` select:

```ts
select: { id: true, systemKey: true },
```

After the `assignmentType` availability check and before generic prompt validation writes, add:

```ts
if (assignmentType.systemKey === AP_HISTORY_ASSIGNMENT_TYPE_KEY) {
  if (!apHistoryLibraryEntryId) {
    return dataResponse(
      { success: false, message: 'AP History library entry is required.' },
      { status: 400 }
    );
  }

  const apFlags = await Promise.all(
    classes.map((klass) =>
      isApHistoryEssayEnabledForContext({
        organizationId: klass.school.organizationId,
        teacherProfileId: profile.teacherProfile!.id,
        classIds: [klass.id],
      })
    )
  );
  if (apFlags.some((enabled) => !enabled)) {
    return dataResponse(
      {
        success: false,
        message: 'AP History Essay is not enabled for one or more classes.',
      },
      { status: 403 }
    );
  }

  const entry = await getApHistoryLibraryEntryForSnapshot({
    assignmentTypeId: assignmentType.id,
    externalKey: apHistoryLibraryEntryId,
  });
  if (!entry) {
    return dataResponse(
      { success: false, message: 'AP History library entry is unavailable.' },
      { status: 400 }
    );
  }

  await prisma.assignment.createMany({
    data: classes.map((klass) =>
      buildAssignmentCreateInputFromApHistoryEntry({
        classId: klass.id,
        assignmentTypeId: assignmentType.id,
        title,
        dueDate,
        entry,
      })
    ),
  });

  return dataResponse({
    success: true,
    message: 'Assignments created successfully.',
  });
}
```

Keep the existing generic prompt-required path for non-AP assignment types.

- [ ] **Step 4: Run tests and commit**

Run:

```bash
bun test services/web-app/app/routes/api.assignments.create/route.test.ts
```

Expected: PASS.

Commit:

```bash
git add services/web-app/app/routes/api.assignments.create/route.ts services/web-app/app/routes/api.assignments.create/route.test.ts
git commit -m "feat: create AP History assignments from library snapshots"
```

## Task 6: Add Teacher AP Library UI

**Files:**
- Create: `services/web-app/app/routes/app.assignment-types.$id/ap-history-library.tsx`
- Modify: `services/web-app/app/routes/app.assignment-types.$id/create-assignment-sheet.tsx`
- Modify: `services/web-app/app/routes/app.assignment-types.$id/route.tsx`
- Modify: `services/web-app/app/routes/app.assignment-types.$id/route.test.ts`

- [ ] **Step 1: Add failing loader visibility tests**

In `services/web-app/app/routes/app.assignment-types.$id/route.test.ts`, add mocks:

```ts
const isAssignmentsEnabledForContext = mock();
const isApHistoryEssayEnabledForContext = mock();

mock.module('~/utils/feature-flags.server', () => ({
  isAssignmentsEnabledForContext,
  isApHistoryEssayEnabledForContext,
}));
```

Extend `prisma` mock:

```ts
apHistoryPromptLibraryEntry: { findMany: mock() },
```

Add test:

```ts
test('provides AP History library only for enabled teachers viewing AP History type', async () => {
  prisma.assignmentType.findFirst.mockResolvedValue(
    makeAssignmentType({
      title: 'AP History Essay',
      systemKey: 'ap_history_essay',
    })
  );
  isAssignmentsEnabledForContext.mockResolvedValue(true);
  isApHistoryEssayEnabledForContext.mockResolvedValue(true);
  prisma.apHistoryPromptLibraryEntry.findMany.mockResolvedValue([
    {
      externalKey: 'apush-leq-market-revolution',
      essayType: 'leq',
      title: 'Market Revolution LEQ',
      prompt: 'Evaluate the extent to which the Market Revolution transformed society.',
      period: '1815-1848',
      periodNumber: 4,
      reasoningSkill: 'causation',
      difficulty: 'intro',
      sources: [],
    },
  ]);

  const response = (await loader({
    request: new Request('https://example.test/app/assignment-types/at-1'),
    params: { id: 'at-1' },
  } as never)) as any;

  expect(response.data.apHistoryLibrary.entries).toHaveLength(1);
  expect(response.data.promptLibrary).toBeNull();
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
bun test services/web-app/app/routes/app.assignment-types.\$id/route.test.ts
```

Expected: FAIL because `apHistoryLibrary` is not returned.

- [ ] **Step 3: Load AP library in route loader**

In `services/web-app/app/routes/app.assignment-types.$id/route.tsx`, import:

```ts
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
import { listApHistoryLibraryEntries } from '~/domain/ap-history/library.server';
import {
  isAssignmentsEnabledForContext,
  isApHistoryEssayEnabledForContext,
} from '~/utils/feature-flags.server';
```

Add `systemKey` to assignment type select/include if missing.

After `promptLibrary` is built, add:

```ts
const isApHistory =
  assignmentType.systemKey === AP_HISTORY_ASSIGNMENT_TYPE_KEY;
const apHistoryEnabled =
  profile.teacherProfile && isApHistory
    ? await isApHistoryEssayEnabledForContext({
        organizationId: profile.organization.id,
        teacherProfileId: profile.teacherProfile.id,
        classIds: teacherClasses.map((klass) => klass.id),
      })
    : false;
const assignmentsEnabledForTeacher =
  profile.teacherProfile && isApHistory
    ? await isAssignmentsEnabledForContext({
        organizationId: profile.organization.id,
        teacherProfileId: profile.teacherProfile.id,
        classIds: teacherClasses.map((klass) => klass.id),
      })
    : false;
const apHistoryLibrary =
  profile.teacherProfile &&
  isApHistory &&
  apHistoryEnabled &&
  assignmentsEnabledForTeacher
    ? { entries: await listApHistoryLibraryEntries(assignmentType.id) }
    : null;
```

Return `apHistoryLibrary` in `dataResponse`.

- [ ] **Step 4: Create AP library component**

Create `services/web-app/app/routes/app.assignment-types.$id/ap-history-library.tsx`.

```tsx
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';

type ApHistoryLibraryEntry = {
  externalKey: string;
  essayType: string;
  title: string;
  prompt: string;
  period: string;
  periodNumber: number;
  reasoningSkill: string;
  difficulty: string;
  sources: Array<{ id: string; position: number }>;
};

export function ApHistoryLibrary({
  entries,
  onSelectEntry,
}: {
  entries: ApHistoryLibraryEntry[];
  onSelectEntry: (entry: ApHistoryLibraryEntry) => void;
}) {
  return (
    <section className="space-y-3 pb-6">
      <div>
        <h2 className="text-lg font-semibold">APUSH Prompt Library</h2>
        <p className="text-sm text-muted-foreground">
          Choose a curated DBQ or LEQ. Prompt and source content are locked for
          the assignment.
        </p>
      </div>
      <div className="space-y-3">
        {entries.map((entry) => (
          <button
            key={entry.externalKey}
            type="button"
            className="w-full rounded-md border bg-background p-4 text-left hover:bg-muted/50"
            onClick={() => onSelectEntry(entry)}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{entry.essayType.toUpperCase()}</Badge>
              <Badge variant="outline">Period {entry.periodNumber}</Badge>
              <Badge variant="outline">{entry.reasoningSkill}</Badge>
              <Badge variant="outline">{entry.difficulty}</Badge>
              {entry.essayType === 'dbq' ? (
                <Badge variant="outline">{entry.sources.length} sources</Badge>
              ) : null}
            </div>
            <h3 className="font-medium">{entry.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{entry.prompt}</p>
          </button>
        ))}
      </div>
      {entries.length === 0 ? (
        <div className="rounded-md border p-4 text-sm text-muted-foreground">
          No APUSH prompts have been published yet.
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 5: Add AP mode to create sheet**

In `create-assignment-sheet.tsx`, extend props:

```ts
type ApHistoryInitialEntry = {
  externalKey: string;
  title: string;
  prompt: string;
  essayType: string;
};

type Props = {
  assignmentTypeId: string;
  teacherClasses: TeacherClass[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPrompt?: string;
  apHistoryEntry?: ApHistoryInitialEntry | null;
};
```

When `apHistoryEntry` is present:

```tsx
{apHistoryEntry ? (
  <input
    type="hidden"
    name="apHistoryLibraryEntryId"
    value={apHistoryEntry.externalKey}
  />
) : null}
```

Hide the prompt and tutor-context textareas for AP mode. Render read-only prompt text instead:

```tsx
{apHistoryEntry ? (
  <div className="rounded-md border bg-muted/30 p-3">
    <p className="text-sm font-medium">{apHistoryEntry.title}</p>
    <p className="mt-2 text-sm text-muted-foreground">{apHistoryEntry.prompt}</p>
  </div>
) : (
  <>
    {/* existing Prompt textarea */}
    {/* existing Tutor Context textarea */}
  </>
)}
```

Submit button disabled logic becomes:

```ts
disabled={
  isSaving ||
  !selectedClassId ||
  (!apHistoryEntry && !prompt.trim())
}
```

- [ ] **Step 6: Render AP library on assignment type page**

In `route.tsx`, import `ApHistoryLibrary`, add state:

```ts
const [apHistoryEntry, setApHistoryEntry] = useState(null);
```

Render:

```tsx
{data.apHistoryLibrary ? (
  <ApHistoryLibrary
    entries={data.apHistoryLibrary.entries}
    onSelectEntry={(entry) => {
      setLibraryPrompt(entry.prompt);
      setApHistoryEntry(entry);
      setIsAssignmentSheetOpen(true);
    }}
  />
) : null}
```

Pass `apHistoryEntry` to `CreateAssignmentSheet`.

When opening generic Assignment from the New menu, clear AP state:

```ts
setLibraryPrompt('');
setApHistoryEntry(null);
setIsAssignmentSheetOpen(true);
```

- [ ] **Step 7: Run tests and commit**

Run:

```bash
bun test services/web-app/app/routes/app.assignment-types.\$id/route.test.ts
bun web-app:typecheck
```

Expected: PASS.

Commit:

```bash
git add 'services/web-app/app/routes/app.assignment-types.$id/route.tsx' 'services/web-app/app/routes/app.assignment-types.$id/create-assignment-sheet.tsx' 'services/web-app/app/routes/app.assignment-types.$id/ap-history-library.tsx' 'services/web-app/app/routes/app.assignment-types.$id/route.test.ts'
git commit -m "feat: add AP History library assignment flow"
```

## Task 7: Add Student AP Assignment Runtime Panel

**Files:**
- Create: `services/web-app/app/routes/app_.documents_.$id/ap-history-assignment-panel.tsx`
- Modify: `services/web-app/app/routes/app_.documents_.$id/route.tsx`
- Modify: `services/web-app/app/routes/app_.documents_.$id/route.test.ts`

- [ ] **Step 1: Add failing route test**

In `services/web-app/app/routes/app_.documents_.$id/route.test.ts`, add or extend a loader test so the selected document includes:

```ts
assignment: {
  id: 'assignment-1',
  title: 'Friday DBQ',
  prompt: 'Fallback prompt',
  tutorContext: null,
  dueDate: null,
  apHistorySnapshot: {
    schemaVersion: 1,
    libraryEntryId: 'apush-dbq-new-deal-federal-power',
    course: 'apush',
    essayType: 'dbq',
    prompt: 'Evaluate the extent to which the New Deal changed federal power.',
    period: '1932-1980',
    periodNumber: 7,
    reasoningSkill: 'causation',
    sources: [
      {
        externalKey: 'apush-dbq-new-deal-federal-power-doc-1',
        position: 1,
        title: 'Document 1',
        attribution: 'FDR, 1933',
        body: 'Action now.',
        caption: null,
        mediaType: 'text',
        imageUrl: null,
        imageAlt: null,
        provenanceUrl: null,
      },
    ],
    rubric: { rubricId: 'ap-history-dbq-2026', totalPoints: 7 },
    timing: { mode: 'untimed', durationMinutes: 60 },
  },
  class: {
    id: 'class-1',
    schoolId: 'school-1',
    teachers: [{ id: 'teacher-1' }],
    school: { organizationId: 'org-1' },
  },
}
```

Assert:

```ts
expect(response.data.doc.assignment.apHistorySnapshot.prompt).toContain(
  'New Deal'
);
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
bun test services/web-app/app/routes/app_.documents_.\$id/route.test.ts
```

Expected: FAIL if `apHistorySnapshot` is not selected.

- [ ] **Step 3: Select AP snapshot in document loader**

In `services/web-app/app/routes/app_.documents_.$id/route.tsx`, update the assignment select:

```ts
assignment: {
  select: {
    id: true,
    title: true,
    prompt: true,
    tutorContext: true,
    dueDate: true,
    apHistorySnapshot: true,
    class: {
      select: {
        id: true,
        schoolId: true,
        teachers: { select: { id: true } },
        school: { select: { organizationId: true } },
      },
    },
  },
},
```

- [ ] **Step 4: Add AP panel component**

Create `services/web-app/app/routes/app_.documents_.$id/ap-history-assignment-panel.tsx`.

```tsx
import { Badge } from '~/components/ui/badge';
import { parseApHistorySnapshot } from '~/domain/ap-history/schema';

export function ApHistoryAssignmentPanel({ snapshot }: { snapshot: unknown }) {
  const parsed = parseApHistorySnapshot(snapshot);

  return (
    <aside className="border-b bg-muted/20 px-3 py-3">
      <div className="mx-auto max-w-screen-2xl space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{parsed.essayType.toUpperCase()}</Badge>
          <Badge variant="outline">APUSH Period {parsed.periodNumber}</Badge>
          <Badge variant="outline">{parsed.reasoningSkill}</Badge>
          <Badge variant="outline">{parsed.rubric.totalPoints} points</Badge>
        </div>
        <p className="text-sm font-medium">{parsed.prompt}</p>
        {parsed.sources.length > 0 ? (
          <details className="rounded-md border bg-background p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Sources ({parsed.sources.length})
            </summary>
            <div className="mt-3 space-y-3">
              {parsed.sources.map((source) => (
                <article key={source.externalKey} className="rounded border p-3">
                  <p className="text-sm font-medium">
                    Document {source.position}: {source.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {source.attribution}
                  </p>
                  <p className="mt-2 text-sm">{source.body}</p>
                  {source.caption ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {source.caption}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </aside>
  );
}
```

- [ ] **Step 5: Render panel in document route**

In `route.tsx`, import:

```ts
import { isApHistorySnapshot } from '~/domain/ap-history/schema';
import { ApHistoryAssignmentPanel } from './ap-history-assignment-panel';
```

Inside the main render, directly under `<main ...>` and before `<nav ...>`, add:

```tsx
{isApHistorySnapshot(data.doc.assignment?.apHistorySnapshot) ? (
  <ApHistoryAssignmentPanel
    snapshot={data.doc.assignment?.apHistorySnapshot}
  />
) : null}
```

- [ ] **Step 6: Run tests and commit**

Run:

```bash
bun test services/web-app/app/routes/app_.documents_.\$id/route.test.ts
bun web-app:typecheck
```

Expected: PASS.

Commit:

```bash
git add 'services/web-app/app/routes/app_.documents_.$id/route.tsx' 'services/web-app/app/routes/app_.documents_.$id/ap-history-assignment-panel.tsx' 'services/web-app/app/routes/app_.documents_.$id/route.test.ts'
git commit -m "feat: show AP History assignment snapshots to students"
```

## Task 8: Add AP Grading Assistant Contract

**Files:**
- Modify: `services/web-app/app/routes/api.domain.grade-essay-ai/route.ts`
- Modify: `services/web-app/app/routes/api.domain.grade-essay-ai/route.test.ts`
- Use: `services/web-app/app/domain/ap-history/schema.ts`

- [ ] **Step 1: Add failing AP GA test**

In `services/web-app/app/routes/api.domain.grade-essay-ai/route.test.ts`, add an AP submission fixture:

```ts
function mockApHistorySubmission() {
  return mockSubmission({
    id: 'ap-sub-1',
    text: 'The New Deal expanded federal authority because agencies regulated labor and welfare.',
    document: {
      id: 'ap-doc-1',
      profileId: 'student-profile-1',
      assignment: {
        apHistorySnapshot: {
          schemaVersion: 1,
          libraryEntryId: 'apush-dbq-new-deal-federal-power',
          course: 'apush',
          essayType: 'dbq',
          prompt: 'Evaluate the extent to which the New Deal changed federal power.',
          period: '1932-1980',
          periodNumber: 7,
          reasoningSkill: 'causation',
          sources: [],
          rubric: { rubricId: 'ap-history-dbq-2026', totalPoints: 7 },
          timing: { mode: 'untimed', durationMinutes: 60 },
        },
        class: { schoolId: 'school-1' },
      },
      studentProfile: { classes: [] },
      profile: { user: { name: 'Jordan Student' } },
    },
  });
}
```

Add test:

```ts
test('uses AP History rubric when submission has an AP snapshot', async () => {
  getLLMCompletion.mockReset();
  getLLMCompletion.mockResolvedValueOnce(
    JSON.stringify({
      rubricVersion: 'ap-history-dbq-2026',
      points: {
        thesis: { earned: true, comment: 'Defensible claim.' },
        contextualization: { earned: false, comment: 'Context is too brief.' },
        document_use_describes: { earned: true, comment: 'Describes documents.' },
        document_use_supports_argument: { earned: false, comment: 'Documents are summarized more than argued.' },
        outside_evidence: { earned: true, comment: 'Uses Social Security Act.' },
        sourcing: { earned: false, comment: 'HIPP relevance is missing.' },
        complexity: { earned: false, comment: 'No complexity move yet.' },
      },
      overallComment: 'Jordan, you have the basis for several points, but the documents need to do more argumentative work.',
    })
  );
  prisma.submission.findFirst.mockResolvedValue(mockApHistorySubmission());

  const form = new FormData();
  form.append('submissionId', 'ap-sub-1');

  const response = await action({
    request: new Request('https://example.com/api/domain/grade-essay-ai', {
      method: 'POST',
      body: form,
    }),
  } as any);
  const payload = (response as { data: Record<string, unknown> }).data;

  expect(payload.success).toBe(true);
  expect(payload.rubricScores).toMatchObject({
    schemaVersion: 1,
    rubricId: 'ap-history-dbq-2026',
    totalPoints: 7,
  });
  expect(getLLMCompletion.mock.calls[0]?.[0].messages[0].content).toContain(
    'APUSH DBQ'
  );
  expect(prisma.submission.update.mock.calls[0]?.[0].data.aiMeta).toMatchObject({
    rubricMode: 'ap_history',
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
bun test services/web-app/app/routes/api.domain.grade-essay-ai/route.test.ts
```

Expected: FAIL because the route ignores AP snapshots.

- [ ] **Step 3: Select AP snapshot for grading**

In `submissionSelect` in `route.ts`, include:

```ts
assignment: {
  select: {
    apHistorySnapshot: true,
    class: {
      select: {
        id: true,
        schoolId: true,
        teachers: { select: { id: true } },
      },
    },
  },
},
```

- [ ] **Step 4: Add AP grading branch**

Import:

```ts
import { isApHistorySnapshot, parseApHistorySnapshot } from '~/domain/ap-history/schema';
```

Before the existing generic rubric prompt branch, add:

```ts
const apHistorySnapshot = submission.document.assignment?.apHistorySnapshot;
if (isApHistorySnapshot(apHistorySnapshot)) {
  const snapshot = parseApHistorySnapshot(apHistorySnapshot);
  const apSystem = `You are the AP History grading assistant. Return ONLY valid JSON matching the requested schema. Grade additively. Do not penalize grammar or prose polish unless it obscures meaning. The teacher reviews and can override every point.`;
  const apUserPrompt = `Student first name: ${studentFirstName}

Assignment: APUSH ${snapshot.essayType.toUpperCase()}
Prompt: ${snapshot.prompt}
Period: ${snapshot.period}
Reasoning skill: ${snapshot.reasoningSkill}
Rubric: ${snapshot.rubric.rubricId}, ${snapshot.rubric.totalPoints} points

Return JSON:
{
  "rubricVersion": "${snapshot.rubric.rubricId}",
  "points": {
    "thesis": {"earned": boolean, "comment": string},
    "contextualization": {"earned": boolean, "comment": string},
    "document_use_describes": {"earned": boolean, "comment": string},
    "document_use_supports_argument": {"earned": boolean, "comment": string},
    "outside_evidence": {"earned": boolean, "comment": string},
    "sourcing": {"earned": boolean, "comment": string},
    "complexity": {"earned": boolean, "comment": string}
  },
  "overallComment": string
}

For LEQ, set DBQ-only points to earned false with comment "Not applicable to LEQ" and use the LEQ total point calculation.

DBQ sources:
${snapshot.sources
  .map((source) => `Document ${source.position}: ${source.title}
${source.attribution}
${source.body}`)
  .join('\n\n')}

Essay:
${submission.text}`;

  const apResponseText = await getLLMCompletion({
    model,
    system: apSystem,
    messages: [{ role: 'user', content: apUserPrompt }],
    maxTokens: 1200,
    temperature: 0.2,
    metadata: { feature: 'grading', kind: 'ap-history' },
  });

  const parsedAp = parseFirstJsonValue(apResponseText) as {
    rubricVersion?: string;
    points?: Record<string, { earned?: boolean; comment?: string }>;
    overallComment?: string;
  };
  const points = parsedAp.points ?? {};
  const earnedCount = Object.values(points).filter((point) => point.earned).length;
  const numericPercentage = Math.round((earnedCount / snapshot.rubric.totalPoints) * 100);
  const letterGrade = letterFromPercent(numericPercentage);
  const score = formatGrade(numericPercentage, letterGrade);
  const rubricScores = {
    schemaVersion: 1,
    rubricId: snapshot.rubric.rubricId,
    totalPoints: snapshot.rubric.totalPoints,
    earnedPoints: earnedCount,
    points,
  } satisfies Prisma.InputJsonValue;
  const now = new Date();

  await prisma.submission.update({
    where: { id: submission.id },
    data: {
      rubricScores,
      overallScore: earnedCount,
      overallComment: parsedAp.overallComment ?? '',
      numericPercentage,
      letterGrade,
      score,
      aiMeta: {
        model,
        rubricMode: 'ap_history',
        gradedAt: now.toISOString(),
      } satisfies Prisma.InputJsonValue,
      ...(!submission.gradedAt
        ? { gradedAt: now, gradedById: actor.profileId }
        : {}),
      updatedAt: now,
    },
  });

  return dataResponse({
    success: true,
    message: 'Grading Assistant suggestions generated.',
    rubricScores,
    overallScore: earnedCount,
    overallComment: parsedAp.overallComment ?? '',
    numericPercentage,
    letterGrade,
    score,
    grammarIssues: null,
  });
}
```

Keep the existing generic grading path unchanged for non-AP submissions.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
bun test services/web-app/app/routes/api.domain.grade-essay-ai/route.test.ts
```

Expected: PASS, including existing generic grading tests.

Commit:

```bash
git add services/web-app/app/routes/api.domain.grade-essay-ai/route.ts services/web-app/app/routes/api.domain.grade-essay-ai/route.test.ts
git commit -m "feat: grade AP History submissions with AP rubric"
```

## Task 9: Add E2E Preview Proof

**Files:**
- Modify: `services/web-app/e2e/seed-e2e.ts`
- Create: `services/web-app/e2e/tests/ap-history-library-first.spec.ts`

- [ ] **Step 1: Extend e2e context**

In `services/web-app/e2e/seed-e2e.ts`, add fields to `E2EContext`:

```ts
apHistoryAssignmentTypeId: string;
apHistoryDbqEntryKey: string;
apHistoryLeqEntryKey: string;
```

Import the seed entries near the top of `services/web-app/e2e/seed-e2e.ts`:

```ts
import { AP_HISTORY_LIBRARY_ENTRIES } from '../../../packages/prisma/scripts/ap-history-library-data';
```

Seed AP assignment type and two library entries after `dailyPagesAssignmentType`:

```ts
const apHistoryAssignmentType = await prisma.assignmentType.create({
  data: {
    title: 'AP History Essay',
    systemKey: 'ap_history_essay',
    description: 'Curated APUSH DBQ and LEQ practice.',
    position: 3,
    ownerOrgId: org.id,
    organizationAssignments: { create: { organizationId: org.id } },
    assignmentModules: {
      create: [
        {
          title: 'AP History Essay',
          position: 1,
          description: 'Draft your APUSH essay.',
          instructions: {
            create: [
              {
                title: 'Write',
                prompt: 'Use the AP History prompt and coach to draft your essay.',
                position: 1,
                showChatButton: true,
              },
            ],
          },
        },
      ],
    },
  },
  select: { id: true },
});
```

Create DBQ/LEQ entries from the shared seed data:

```ts
for (const entry of AP_HISTORY_LIBRARY_ENTRIES) {
  await prisma.apHistoryPromptLibraryEntry.create({
    data: {
      externalKey: entry.externalKey,
      course: entry.course,
      essayType: entry.essayType,
      title: entry.title,
      prompt: entry.prompt,
      period: entry.period,
      periodNumber: entry.periodNumber,
      reasoningSkill: entry.reasoningSkill,
      difficulty: entry.difficulty,
      skillEmphasis: entry.skillEmphasis,
      defaultTimeMode: entry.defaultTimeMode,
      defaultDurationMinutes: entry.defaultDurationMinutes,
      provenanceUrl: entry.provenanceUrl,
      assignmentTypeId: apHistoryAssignmentType.id,
      sources: { create: entry.sources },
    },
  });
}
```

Enable AP feature for the seeded teacher:

```ts
await prisma.featureAccessTarget.upsert({
  where: {
    featureKey_targetKind_targetId: {
      featureKey: 'ap_history_essay',
      targetKind: 'teacher',
      targetId: seededTeacherProfileId,
    },
  },
  create: {
    featureKey: 'ap_history_essay',
    targetKind: 'teacher',
    targetId: seededTeacherProfileId,
    enabled: true,
    note: 'E2E AP History teacher access',
  },
  update: { enabled: true, expiresAt: null, note: 'E2E AP History teacher access' },
});
```

- [ ] **Step 2: Write E2E test**

Create `services/web-app/e2e/tests/ap-history-library-first.spec.ts`.

```ts
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

test.describe.serial('AP History library-first MVP', () => {
  test('teacher creates a curated AP assignment and student sees snapshot prompt', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/assignment-types/${e2eContext.apHistoryAssignmentTypeId}`);
    await expect(page.getByRole('heading', { name: 'AP History Essay' })).toBeVisible();
    await expect(page.getByText('APUSH Prompt Library')).toBeVisible();
    await expect(page.getByText('Upload PDF')).toHaveCount(0);
    await expect(page.getByText('Tutor Context')).toHaveCount(0);

    await page.getByText('New Deal and Federal Power DBQ').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel(/Grade 9th .* Period 1st/).click();
    await page.getByLabel('Title (optional)').fill('E2E APUSH DBQ');
    await page.getByRole('button', { name: 'Create Assignment' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const prisma = createE2EPrismaClient();
    let assignmentId = '';
    try {
      const assignment = await prisma.assignment.findFirstOrThrow({
        where: {
          classId: e2eContext.classId,
          assignmentTypeId: e2eContext.apHistoryAssignmentTypeId,
          title: 'E2E APUSH DBQ',
        },
        select: { id: true, apHistorySnapshot: true },
      });
      assignmentId = assignment.id;
      expect(assignment.apHistorySnapshot).toMatchObject({
        schemaVersion: 1,
        essayType: 'dbq',
      });
    } finally {
      await prisma.$disconnect();
    }

    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app?tab=assignments');
    await page.getByText('E2E APUSH DBQ').click();
    await page.waitForURL(/\/app\/documents\//);
    await expect(page.getByText('APUSH Period')).toBeVisible();
    await expect(page.getByText('Sources (')).toBeVisible();
    expect(assignmentId.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run E2E test**

Run:

```bash
bun web-app:test:e2e:prepare
bun run --cwd services/web-app playwright test --project=chromium e2e/tests/ap-history-library-first.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add services/web-app/e2e/seed-e2e.ts services/web-app/e2e/tests/ap-history-library-first.spec.ts
git commit -m "test: cover AP History library-first flow"
```

## Task 10: Final Verification and Preview Handoff

**Files:**
- Update PR description / preview notes after branch push.

- [ ] **Step 1: Run focused unit tests**

```bash
bun test services/web-app/app/domain/ap-history
bun test services/web-app/app/utils/feature-flags.server.test.ts
bun test services/web-app/app/routes/api.assignments.create/route.test.ts
bun test services/web-app/app/routes/app.assignment-types.\$id/route.test.ts
bun test services/web-app/app/routes/app_.documents_.\$id/route.test.ts
bun test services/web-app/app/routes/api.domain.grade-essay-ai/route.test.ts
```

Expected: all pass.

- [ ] **Step 2: Run typecheck**

```bash
bun web-app:typecheck
```

Expected: typecheck passes.

- [ ] **Step 3: Run E2E AP path**

```bash
bun web-app:test:e2e:prepare
bun run --cwd services/web-app playwright test --project=chromium e2e/tests/ap-history-library-first.spec.ts
```

Expected: AP History e2e passes.

- [ ] **Step 4: Push branch**

```bash
git push -u origin codex/ap-history-library-first-mvp
```

Expected: branch pushed and GitHub preview workflow starts.

- [ ] **Step 5: Capture preview proof**

After preview deploy is available, record:

- AP History hidden when AP access is disabled.
- AP History visible when assignments and `ap_history_essay` access are enabled.
- Teacher creates curated DBQ assignment.
- Assignment row stores `apHistorySnapshot`.
- Student opens DBQ and sees prompt/source panel.
- Normal teacher UI does not show PDF upload, from-scratch builder, tutor prompt box, or GA prompt box for AP History.

Use `qa-video-capture` for screenshots/video if the preview is accessible.

## Review Checklist

Before asking Bryant to review the preview:

- AP History is an `AssignmentType` with `systemKey = ap_history_essay`.
- Curated DBQ/LEQ prompts live in AP library tables.
- AP assignment creation requires library entry selection.
- AP assignment creation writes `Assignment.apHistorySnapshot`.
- Runtime never reads live library rows for student display, tutor context, or GA context after assignment creation.
- Generic assignment creation still works.
- Normal AP users cannot upload PDFs, create prompts from scratch, or customize tutor/GA behavior.
- Existing Daily Pages prompt library still works.
- Existing generic GA tests still pass.
