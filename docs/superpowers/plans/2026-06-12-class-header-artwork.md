# Class Header Artwork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the procedurally-generated SVG class-art band (`app/components/class-art.tsx` + `app/utils/class-art.ts`) with a curated library of public-domain artwork, rendered full-bleed (treatment D) as a `background-image` `<div>`. Each class gets a **persisted** artwork/crop assignment (`Class.classArtIndex`) chosen so a teacher doesn't see the same artwork twice until all 15 curated combinations have been used; existing classes are backfilled by a one-time script.

**Architecture:**
- `app/utils/class-art.ts` becomes a small data module: `CLASS_ART_LIBRARY` (5 artworks × 3 pre-curated crop positions each, 15 combinations total) flattened into `CLASS_ART_POOL` (`ClassArtSelection[]`, length `CLASS_ART_POOL_SIZE` = 15), with `getClassArtByIndex(index)` for direct lookup, `generateClassArt(seed)` as a deterministic hash-based fallback (unchanged signature, same `{ src, credit, backgroundPosition }` shape), and a pure `pickNextClassArtIndex(recentIndices, random?)` that avoids recently-used indices until the pool is exhausted.
- `app/components/class-art.tsx` renders a single `<div role="img" aria-label/title={credit}>` with `background-image`/`background-position`/`bg-cover`. It accepts `classArtIndex: number | null`: when set, it uses `getClassArtByIndex(classArtIndex)`; when `null` (un-backfilled rows, e2e fixtures), it falls back to `generateClassArt(seed)`. This keeps the existing `data-testid="class-art"` contract and `h-full w-full` sizing — both call sites need no layout changes.
- `Class` gets a new nullable `classArtIndex Int?` column. At class-creation time, `pickClassArtIndexForTeachers(teacherIds)` (new `.server.ts`) looks at the most recent `classArtIndex` values across the creating teacher(s)' classes and picks an index that avoids all of them (falling back to the full pool once exhausted) — guaranteeing a teacher rotates through all 15 combinations before any repeat.
- A one-time backfill script (`packages/prisma/scripts/backfill-class-art-index.ts`, mirroring `backfill-class-card-gradients.ts`) walks existing classes in creation order and assigns each a `classArtIndex` using the same no-repeat-per-teacher logic, seeded from any classes that already have one.
- Nullable column + dual-read fallback means the migration and backfill script are independent of deploy ordering — no feature flag needed, matching the precedent of the prior gradient→procedural-art change.

**Tech Stack:** React Router (Remix-style routes), TypeScript, Prisma (Postgres), Tailwind CSS, `bun:test`, Playwright e2e.

---

### Task 1: Add failing e2e assertions that the class-art band renders real artwork

**Files:**
- Modify: `services/web-app/e2e/tests/teacher.class-cards.spec.ts:13-23`
- Modify: `services/web-app/e2e/tests/teacher.class-page-redesign.spec.ts:33-50`

- [ ] **Step 1: Add the assertion to the class-cards spec**

In `services/web-app/e2e/tests/teacher.class-cards.spec.ts`, the first test currently reads:

```ts
    const card = page
      .locator(`a[href="/app/my-classes/${e2eContext.classId}"]`)
      .first();
    await expect(card).toBeVisible();
    await expect(card.getByTestId('class-art')).toBeVisible();
    await expect(card.getByText(/Grade 9th .* Period 1st/)).toBeVisible();

    const gradientCount = await page
      .locator('[class*="bg-gradient-to-br"]')
      .count();
    expect(gradientCount).toBe(0);
```

Add a `background-image` assertion right after the existing `class-art` visibility check:

```ts
    const card = page
      .locator(`a[href="/app/my-classes/${e2eContext.classId}"]`)
      .first();
    await expect(card).toBeVisible();
    await expect(card.getByTestId('class-art')).toBeVisible();
    await expect(card.getByTestId('class-art')).toHaveCSS(
      'background-image',
      /\/img\/class-art\//
    );
    await expect(card.getByText(/Grade 9th .* Period 1st/)).toBeVisible();

    const gradientCount = await page
      .locator('[class*="bg-gradient-to-br"]')
      .count();
    expect(gradientCount).toBe(0);
```

- [ ] **Step 2: Add the assertion to the class-page-redesign spec**

In `services/web-app/e2e/tests/teacher.class-page-redesign.spec.ts`, the `'compact header shows class identity, counts, and actions'` test currently reads:

```ts
    await expect(header.getByTestId('class-art')).toBeVisible();
    await expect(
      page.getByRole('link', { name: /back to my classes/i })
    ).toBeVisible();
```

Add a `background-image` assertion right after the `class-art` visibility check:

```ts
    await expect(header.getByTestId('class-art')).toBeVisible();
    await expect(header.getByTestId('class-art')).toHaveCSS(
      'background-image',
      /\/img\/class-art\//
    );
    await expect(
      page.getByRole('link', { name: /back to my classes/i })
    ).toBeVisible();
```

- [ ] **Step 3: Run the e2e specs and confirm they fail**

From `services/web-app/`:

```bash
bunx playwright test --project=chromium e2e/tests/teacher.class-cards.spec.ts e2e/tests/teacher.class-page-redesign.spec.ts
```

Expected: both new assertions FAIL — the current `<svg data-testid="class-art">` has no `background-image`, so `getComputedStyle(...).backgroundImage` is `"none"`, which does not match `/\/img\/class-art\//`. (The `webServer` config in `playwright.config.ts` runs `ensure-e2e-env.ts` and starts the dev server automatically — no separate setup step needed.)

- [ ] **Step 4: Commit**

```bash
git add services/web-app/e2e/tests/teacher.class-cards.spec.ts services/web-app/e2e/tests/teacher.class-page-redesign.spec.ts
git commit -m "test: assert class header art renders curated artwork (red)"
```

---

### Task 2: Curated artwork library, pool, and no-repeat picker

**Files:**
- Modify (rewrite): `services/web-app/app/utils/class-art.test.ts`
- Modify (rewrite): `services/web-app/app/utils/class-art.ts`
- Create: `services/web-app/public/img/class-art/hokusai-red-fuji.jpg`
- Create: `services/web-app/public/img/class-art/hokusai-great-wave.jpg`
- Create: `services/web-app/public/img/class-art/van-gogh-wheat-field-cypresses.jpg`
- Create: `services/web-app/public/img/class-art/af-klint-ten-largest-youth.jpg`
- Create: `services/web-app/public/img/class-art/morris-strawberry-thief.jpg`

- [ ] **Step 1: Replace `app/utils/class-art.test.ts` with tests for the library, pool, and picker**

Replace the entire contents of `services/web-app/app/utils/class-art.test.ts` with:

```ts
import { existsSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';
import {
  CLASS_ART_LIBRARY,
  CLASS_ART_POOL,
  CLASS_ART_POOL_SIZE,
  generateClassArt,
  getClassArtByIndex,
  pickNextClassArtIndex,
} from './class-art';

describe('generateClassArt', () => {
  test('is deterministic for the same seed', () => {
    const a = generateClassArt('class-abc-123');
    const b = generateClassArt('class-abc-123');
    expect(b).toEqual(a);
  });

  test('different seeds can select different artworks', () => {
    const seeds = [
      'cls-1',
      'cls-2',
      'cls-3',
      'cls-4',
      'cls-5',
      'cls-6',
      'cls-7',
      'cls-8',
      'cls-9',
      'cls-10',
      'cls-11',
      'cls-12',
    ];
    const sources = seeds.map((seed) => generateClassArt(seed).src);
    expect(new Set(sources).size).toBeGreaterThan(1);
  });

  test('always selects a src/credit/position combination from the library', () => {
    const bySrc = new Map(
      CLASS_ART_LIBRARY.map((entry) => [entry.src, entry])
    );
    for (const seed of ['a', 'period-1', 'grade-9', 'zz-top', 'cls-42']) {
      const art = generateClassArt(seed);
      const entry = bySrc.get(art.src);
      expect(entry).toBeDefined();
      expect(art.credit).toBe(entry!.credit);
      expect(entry!.positions).toContain(art.backgroundPosition);
    }
  });

  test('library entries are unique and well-formed', () => {
    const seen = new Set<string>();
    for (const entry of CLASS_ART_LIBRARY) {
      expect(seen.has(entry.src)).toBe(false);
      seen.add(entry.src);
      expect(entry.src.startsWith('/img/class-art/')).toBe(true);
      expect(entry.credit.length).toBeGreaterThan(0);
      expect(entry.positions.length).toBeGreaterThan(0);
    }
  });

  test('every library image is bundled as a static asset', () => {
    for (const entry of CLASS_ART_LIBRARY) {
      expect(existsSync(`public${entry.src}`)).toBe(true);
    }
  });
});

describe('CLASS_ART_POOL', () => {
  test('flattens every library entry crop into one pool item each', () => {
    const expectedSize = CLASS_ART_LIBRARY.reduce(
      (sum, entry) => sum + entry.positions.length,
      0
    );
    expect(CLASS_ART_POOL_SIZE).toBe(expectedSize);
    expect(CLASS_ART_POOL).toHaveLength(expectedSize);
  });

  test('every pool entry matches a library entry crop', () => {
    const bySrc = new Map(
      CLASS_ART_LIBRARY.map((entry) => [entry.src, entry])
    );
    for (const selection of CLASS_ART_POOL) {
      const entry = bySrc.get(selection.src);
      expect(entry).toBeDefined();
      expect(entry!.positions).toContain(selection.backgroundPosition);
    }
  });
});

describe('getClassArtByIndex', () => {
  test('returns the matching pool entry for in-range indices', () => {
    expect(getClassArtByIndex(0)).toEqual(CLASS_ART_POOL[0]);
    expect(getClassArtByIndex(CLASS_ART_POOL_SIZE - 1)).toEqual(
      CLASS_ART_POOL[CLASS_ART_POOL_SIZE - 1]
    );
  });

  test('wraps out-of-range indices into bounds', () => {
    expect(getClassArtByIndex(CLASS_ART_POOL_SIZE)).toEqual(CLASS_ART_POOL[0]);
    expect(getClassArtByIndex(-1)).toEqual(
      CLASS_ART_POOL[CLASS_ART_POOL_SIZE - 1]
    );
  });
});

describe('pickNextClassArtIndex', () => {
  test('avoids every recently-used index when an unused one remains', () => {
    const recent = Array.from({ length: CLASS_ART_POOL_SIZE - 1 }, (_, i) => i);
    expect(pickNextClassArtIndex(recent, () => 0)).toBe(CLASS_ART_POOL_SIZE - 1);
  });

  test('falls back to the full pool once every index is recent', () => {
    const recent = Array.from({ length: CLASS_ART_POOL_SIZE }, (_, i) => i);
    expect(pickNextClassArtIndex(recent, () => 0)).toBe(0);
  });

  test('uses the provided random source to choose among the remaining indices', () => {
    const recent = [0, 1, 2];
    expect(pickNextClassArtIndex(recent, () => 0.999999)).toBe(
      CLASS_ART_POOL_SIZE - 1
    );
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

From `services/web-app/`:

```bash
bun test app/utils/class-art.test.ts
```

Expected: FAIL — `class-art.ts` does not yet export `CLASS_ART_POOL`, `CLASS_ART_POOL_SIZE`, `getClassArtByIndex`, or `pickNextClassArtIndex`, and `generateClassArt` does not yet return `{ src, credit, backgroundPosition }`.

- [ ] **Step 3: Rewrite `app/utils/class-art.ts`**

Replace the entire contents of `services/web-app/app/utils/class-art.ts` with:

```ts
// Curated public-domain artwork for class headers (TeacherClassCard's art
// band and the class detail header strip). Each (artwork, crop) combination
// is one entry in CLASS_ART_POOL, addressed by index via Class.classArtIndex.

export type ClassArtEntry = {
  src: string;
  credit: string;
  positions: readonly string[];
};

export const CLASS_ART_LIBRARY: readonly ClassArtEntry[] = [
  {
    src: '/img/class-art/hokusai-red-fuji.jpg',
    credit:
      'Katsushika Hokusai — Fine Wind, Clear Morning ("Red Fuji"), public domain',
    positions: ['center 10%', 'center 55%', 'center 95%'],
  },
  {
    src: '/img/class-art/hokusai-great-wave.jpg',
    credit: 'Katsushika Hokusai — The Great Wave off Kanagawa, public domain',
    positions: ['center 0%', 'center 50%', 'center 100%'],
  },
  {
    src: '/img/class-art/van-gogh-wheat-field-cypresses.jpg',
    credit: 'Vincent van Gogh — Wheat Field with Cypresses, public domain',
    positions: ['center 0%', 'center 50%', 'center 100%'],
  },
  {
    src: '/img/class-art/af-klint-ten-largest-youth.jpg',
    credit: 'Hilma af Klint — The Ten Largest, No. 3, Youth, public domain',
    positions: ['center 10%', 'center 40%', 'center 85%'],
  },
  {
    src: '/img/class-art/morris-strawberry-thief.jpg',
    credit: 'William Morris — Strawberry Thief, public domain',
    positions: ['center 0%', 'center 50%', 'center 100%'],
  },
] as const;

export type ClassArtSelection = {
  src: string;
  credit: string;
  backgroundPosition: string;
};

export const CLASS_ART_POOL: readonly ClassArtSelection[] = CLASS_ART_LIBRARY.flatMap(
  (entry) =>
    entry.positions.map((backgroundPosition) => ({
      src: entry.src,
      credit: entry.credit,
      backgroundPosition,
    }))
);

export const CLASS_ART_POOL_SIZE = CLASS_ART_POOL.length;

/** Looks up a pool entry by index, wrapping out-of-range values into bounds. */
export function getClassArtByIndex(index: number): ClassArtSelection {
  const normalized =
    ((index % CLASS_ART_POOL_SIZE) + CLASS_ART_POOL_SIZE) % CLASS_ART_POOL_SIZE;
  return CLASS_ART_POOL[normalized];
}

function hashSeed(seed: string): number {
  // FNV-1a 32-bit
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic fallback for classes without a persisted classArtIndex
 * (un-backfilled rows, e2e fixtures). Same seed always yields the same
 * artwork and crop.
 */
export function generateClassArt(seed: string): ClassArtSelection {
  const rng = mulberry32(hashSeed(seed));
  return getClassArtByIndex(Math.floor(rng() * CLASS_ART_POOL_SIZE));
}

/**
 * Picks the next pool index for a teacher, avoiding `recentIndices` so a
 * teacher rotates through every combination before any repeats. Falls back
 * to the full pool once every index has been recently used.
 */
export function pickNextClassArtIndex(
  recentIndices: readonly number[],
  random: () => number = Math.random
): number {
  const excluded = new Set(recentIndices);
  const available: number[] = [];
  for (let i = 0; i < CLASS_ART_POOL_SIZE; i++) {
    if (!excluded.has(i)) available.push(i);
  }
  const candidates =
    available.length > 0
      ? available
      : Array.from({ length: CLASS_ART_POOL_SIZE }, (_, i) => i);
  return candidates[Math.floor(random() * candidates.length)];
}
```

- [ ] **Step 4: Copy the curated images into the app's static assets**

These five files already exist (resized to ~1000px wide) from the POC at `poc/class-art/images/`. From the repo root:

```bash
mkdir -p services/web-app/public/img/class-art
cp poc/class-art/images/hokusai-red-fuji.jpg services/web-app/public/img/class-art/hokusai-red-fuji.jpg
cp poc/class-art/images/hokusai-great-wave.jpg services/web-app/public/img/class-art/hokusai-great-wave.jpg
cp poc/class-art/images/van-gogh-wheat-field-cypresses.jpg services/web-app/public/img/class-art/van-gogh-wheat-field-cypresses.jpg
cp poc/class-art/images/af-klint-ten-largest-youth.jpg services/web-app/public/img/class-art/af-klint-ten-largest-youth.jpg
cp poc/class-art/images/morris-strawberry-thief.jpg services/web-app/public/img/class-art/morris-strawberry-thief.jpg
```

- [ ] **Step 5: Run the test and confirm it passes**

```bash
bun test app/utils/class-art.test.ts
```

Expected: PASS (12 tests).

- [ ] **Step 6: Commit**

```bash
git add services/web-app/app/utils/class-art.ts services/web-app/app/utils/class-art.test.ts services/web-app/public/img/class-art
git commit -m "feat: replace procedural class art with curated public-domain pool"
```

---

### Task 3: Render the curated artwork as a full-bleed background

**Files:**
- Modify (rewrite): `services/web-app/app/components/class-art.tsx`

- [ ] **Step 1: Rewrite `app/components/class-art.tsx`**

Replace the entire contents of `services/web-app/app/components/class-art.tsx` with:

```tsx
import { useMemo } from 'react';
import { generateClassArt, getClassArtByIndex } from '~/utils/class-art';
import { cn } from '~/utils/misc';

export function ClassArt({
  seed,
  classArtIndex,
  className,
}: {
  seed: string;
  classArtIndex: number | null;
  className?: string;
}) {
  const art = useMemo(
    () =>
      classArtIndex == null
        ? generateClassArt(seed)
        : getClassArtByIndex(classArtIndex),
    [seed, classArtIndex]
  );

  return (
    <div
      data-testid="class-art"
      role="img"
      aria-label={art.credit}
      title={art.credit}
      className={cn('block h-full w-full bg-cover bg-no-repeat', className)}
      style={{
        backgroundImage: `url(${art.src})`,
        backgroundPosition: art.backgroundPosition,
      }}
    />
  );
}
```

This keeps the existing contract both call sites rely on: `data-testid="class-art"`, `h-full w-full` sizing within their fixed-height containers (`TeacherClassCard`'s `h-32 w-full` band at `services/web-app/app/components/teacher-class-card.tsx:43-45`, and the class detail header's `h-16 w-24` thumb at `services/web-app/app/routes/app.my-classes.$classId/route.tsx:1845-1847`). Both containers already clip overflow via their own `overflow-hidden`/border styles, so `background-size: cover` fills each box edge-to-edge with no extra wrapper needed.

`classArtIndex` is required (not optional) so both call sites must be updated — Task 7 wires this up. Until Task 7 lands, `bun run typecheck` will fail on the two existing `<ClassArt seed={...} />` call sites; that's expected and resolved by Task 7.

- [ ] **Step 2: Commit**

```bash
git add services/web-app/app/components/class-art.tsx
git commit -m "feat: render class header art as full-bleed curated artwork"
```

---

### Task 4: Add a persisted `classArtIndex` column to `Class`

**Files:**
- Modify: `packages/prisma/schema.prisma:10-29` (the `Class` model)
- Create: `packages/prisma/migrations/<timestamp>_add_class_art_index/migration.sql` (auto-generated)

- [ ] **Step 1: Add `classArtIndex` to the `Class` model**

In `packages/prisma/schema.prisma`, the `Class` model currently reads:

```prisma
model Class {
  id          String           @id @default(cuid())
  createdAt   DateTime         @default(now()) @db.Timestamptz(6)
  updatedAt   DateTime         @default(now()) @db.Timestamptz(6)
  code        String
  schoolYear  String           @default("2024-2025")
  period      String
  grade       String
  title           String?
  cardGradientKey String           @default("indigo-purple-pink")
  isArchived      Boolean          @default(false)
  students    StudentProfile[]
  teachers    TeacherProfile[]
  schoolId    String
  school      School           @relation(fields: [schoolId], references: [id])
  classAssignments ClassAssignment[]

  @@unique([schoolId, code])
  @@index([schoolId, schoolYear, period, grade])
}
```

Add `classArtIndex Int?` right after `cardGradientKey`:

```prisma
model Class {
  id          String           @id @default(cuid())
  createdAt   DateTime         @default(now()) @db.Timestamptz(6)
  updatedAt   DateTime         @default(now()) @db.Timestamptz(6)
  code        String
  schoolYear  String           @default("2024-2025")
  period      String
  grade       String
  title           String?
  cardGradientKey String           @default("indigo-purple-pink")
  classArtIndex   Int?
  isArchived      Boolean          @default(false)
  students    StudentProfile[]
  teachers    TeacherProfile[]
  schoolId    String
  school      School           @relation(fields: [schoolId], references: [id])
  classAssignments ClassAssignment[]

  @@unique([schoolId, code])
  @@index([schoolId, schoolYear, period, grade])
}
```

- [ ] **Step 2: Generate and run the migration**

From the repo root:

```bash
bun run prisma migrate dev --name add_class_art_index
```

Expected: Prisma creates `packages/prisma/migrations/<timestamp>_add_class_art_index/migration.sql` containing a single statement:

```sql
ALTER TABLE "Class" ADD COLUMN "classArtIndex" INTEGER;
```

and regenerates the Prisma client (`packages/prisma/generated/prisma`, gitignored). No hand-written SQL is needed — the column is nullable, so there's no data to populate at migration time (the backfill script in Task 8 handles existing rows).

- [ ] **Step 3: Run typecheck**

From `services/web-app/`:

```bash
bun run typecheck
```

Expected: PASS — `prisma:generate` runs as part of the workspace's typecheck/build pipeline, or run `bun run prisma:generate` from the repo root first if the generated client is stale.

- [ ] **Step 4: Commit**

```bash
git add packages/prisma/schema.prisma packages/prisma/migrations
git commit -m "feat: add nullable classArtIndex column to Class"
```

---

### Task 5: Server-side picker for new classes

**Files:**
- Create: `services/web-app/app/utils/class-art-assignment.server.test.ts`
- Create: `services/web-app/app/utils/class-art-assignment.server.ts`

- [ ] **Step 1: Write the failing test**

Create `services/web-app/app/utils/class-art-assignment.server.test.ts`:

```ts
import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  class: { findMany: mock() },
};

mock.module('~/utils/db.server.js', () => ({ prisma }));
mock.module('~/utils/db.server', () => ({ prisma }));

const { pickClassArtIndexForTeachers } = await import(
  './class-art-assignment.server'
);
const { CLASS_ART_POOL_SIZE } = await import('./class-art');

describe('pickClassArtIndexForTeachers', () => {
  beforeEach(() => {
    prisma.class.findMany.mockReset();
  });

  test('avoids the indices most recently used by the given teachers', async () => {
    const recentIndices = Array.from(
      { length: CLASS_ART_POOL_SIZE - 1 },
      (_, i) => i
    );
    prisma.class.findMany.mockResolvedValue(
      recentIndices.map((classArtIndex) => ({ classArtIndex }))
    );

    const index = await pickClassArtIndexForTeachers(['teacher-1']);

    expect(index).toBe(CLASS_ART_POOL_SIZE - 1);
  });

  test('falls back to the full pool once every index is recent', async () => {
    const recentIndices = Array.from(
      { length: CLASS_ART_POOL_SIZE },
      (_, i) => i
    );
    prisma.class.findMany.mockResolvedValue(
      recentIndices.map((classArtIndex) => ({ classArtIndex }))
    );

    const index = await pickClassArtIndexForTeachers(['teacher-1']);

    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(CLASS_ART_POOL_SIZE);
  });

  test('queries classes for all of the given teachers, most recent first', async () => {
    prisma.class.findMany.mockResolvedValue([]);

    await pickClassArtIndexForTeachers(['teacher-1', 'teacher-2']);

    expect(prisma.class.findMany).toHaveBeenCalledWith({
      where: {
        teachers: { some: { id: { in: ['teacher-1', 'teacher-2'] } } },
        classArtIndex: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: CLASS_ART_POOL_SIZE - 1,
      select: { classArtIndex: true },
    });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

From `services/web-app/`:

```bash
bun test app/utils/class-art-assignment.server.test.ts
```

Expected: FAIL — `./class-art-assignment.server` does not exist yet.

- [ ] **Step 3: Implement `pickClassArtIndexForTeachers`**

Create `services/web-app/app/utils/class-art-assignment.server.ts`:

```ts
import { prisma } from '~/utils/db.server';
import { CLASS_ART_POOL_SIZE, pickNextClassArtIndex } from '~/utils/class-art';

/**
 * Picks a classArtIndex for a new class, avoiding the indices most recently
 * assigned to any of the given teachers' other classes so a teacher rotates
 * through the full pool before any artwork repeats.
 */
export async function pickClassArtIndexForTeachers(
  teacherIds: readonly string[]
): Promise<number> {
  const recent = await prisma.class.findMany({
    where: {
      teachers: { some: { id: { in: [...teacherIds] } } },
      classArtIndex: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    take: CLASS_ART_POOL_SIZE - 1,
    select: { classArtIndex: true },
  });

  return pickNextClassArtIndex(
    recent.map((klass) => klass.classArtIndex!)
  );
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
bun test app/utils/class-art-assignment.server.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/utils/class-art-assignment.server.ts services/web-app/app/utils/class-art-assignment.server.test.ts
git commit -m "feat: add server-side picker for new class artwork assignment"
```

---

### Task 6: Assign `classArtIndex` when a class is created

**Files:**
- Modify: `services/web-app/app/routes/app.my-classes._index/route.tsx:1-23,155-167`
- Modify: `services/web-app/app/routes/app.organization.classes/route.tsx:65-66,294-308`

- [ ] **Step 1: Wire the picker into `app.my-classes._index`'s create-class action**

In `services/web-app/app/routes/app.my-classes._index/route.tsx`, add the import alongside the existing utility imports (near line 24):

```ts
import { getTeacherClassCardStats } from '~/utils/teacher-class-card-stats.server';
import { pickClassArtIndexForTeachers } from '~/utils/class-art-assignment.server';
```

Then update the `prisma.class.create` call (currently at lines 156-167):

```ts
      await prisma.class.create({
        data: {
          schoolId,
          schoolYear,
          grade,
          period,
          title,
          code,
          cardGradientKey: generateClassCardGradientKey(code),
          classArtIndex: await pickClassArtIndexForTeachers([
            profile.teacherProfile.id,
          ]),
          teachers: { connect: [{ id: profile.teacherProfile.id }] },
        },
      });
```

- [ ] **Step 2: Wire the picker into `app.organization.classes`'s create-class action**

In `services/web-app/app/routes/app.organization.classes/route.tsx`, add the import alongside the existing `generateClassCardGradientKey` import (line 66):

```ts
import { generateClassCardGradientKey } from '~/utils/class-card-gradient';
import { pickClassArtIndexForTeachers } from '~/utils/class-art-assignment.server';
```

Then update the `prisma.class.create` call (currently at lines 295-308):

```ts
      await prisma.class.create({
        data: {
          schoolId,
          schoolYear,
          grade,
          period,
          title,
          code,
          cardGradientKey: generateClassCardGradientKey(code),
          classArtIndex: await pickClassArtIndexForTeachers(teacherIds),
          teachers: {
            connect: teacherIds.map((id) => ({ id })),
          },
        },
      });
```

- [ ] **Step 3: Run the full unit test suite**

From `services/web-app/`:

```bash
bun test
```

Expected: PASS. Neither route's existing test coverage asserts on the exact `data` payload of `prisma.class.create` (`app.organization.classes/route.test.ts` only asserts on `prisma.class.update`; `app.my-classes._index/route.tsx` has no `route.test.ts`), so no existing test needs updating. The new logic (`pickClassArtIndexForTeachers`) is already covered by Task 5's unit tests.

- [ ] **Step 4: Run typecheck**

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/app.my-classes._index/route.tsx services/web-app/app/routes/app.organization.classes/route.tsx
git commit -m "feat: assign classArtIndex when creating a class"
```

---

### Task 7: Thread `classArtIndex` through loaders to `<ClassArt>`

**Files:**
- Modify: `services/web-app/app/components/teacher-class-card.tsx:6-17,44`
- Modify: `services/web-app/app/routes/app._index/route.tsx:184-193,272-283`
- Modify: `services/web-app/app/routes/app.my-classes._index/route.tsx:50-60`
- Modify: `services/web-app/app/routes/app.my-classes.$classId/route.tsx:599-618,1846`

- [ ] **Step 1: Add `classArtIndex` to `TeacherClassCardData` and pass it to `<ClassArt>`**

In `services/web-app/app/components/teacher-class-card.tsx`, the type currently reads:

```ts
export type TeacherClassCardData = {
  id: string;
  grade: string;
  period: string;
  title: string | null;
  school: { id: string; name: string } | null;
  _count: { students: number; assignments: number };
  stats?: {
    ungradedCount: number;
    gradedUnreleasedCount: number;
  };
};
```

Add `classArtIndex`:

```ts
export type TeacherClassCardData = {
  id: string;
  grade: string;
  period: string;
  title: string | null;
  classArtIndex: number | null;
  school: { id: string; name: string } | null;
  _count: { students: number; assignments: number };
  stats?: {
    ungradedCount: number;
    gradedUnreleasedCount: number;
  };
};
```

Update the render (currently `<ClassArt seed={klass.id} />` at line 44):

```tsx
        <div className="h-32 w-full border-b border-black/5">
          <ClassArt seed={klass.id} classArtIndex={klass.classArtIndex} />
        </div>
```

- [ ] **Step 2: Add `classArtIndex` to the `app._index` teacher classes query and card mapping**

In `services/web-app/app/routes/app._index/route.tsx`, the teacher classes `select` currently reads (lines 184-193):

```ts
          select: {
            id: true,
            grade: true,
            period: true,
            title: true,
            school: { select: { id: true, name: true, organizationId: true } },
            _count: {
              select: { students: true, teachers: true, classAssignments: true },
            },
          },
```

Add `classArtIndex: true`:

```ts
          select: {
            id: true,
            grade: true,
            period: true,
            title: true,
            classArtIndex: true,
            school: { select: { id: true, name: true, organizationId: true } },
            _count: {
              select: { students: true, teachers: true, classAssignments: true },
            },
          },
```

Then in the `teacherClassCards` mapping (lines 269-285):

```ts
  const teacherClassCards: TeacherClassCardData[] = profile.teacherProfile
    ? teacherClassesOrdered.map((klass) => {
        const classStats = teacherClassStatsById.get(klass.id);
        return {
          id: klass.id,
          grade: klass.grade,
          period: klass.period,
          title: klass.title,
          school: klass.school,
          _count: {
            students: klass._count.students,
            assignments: klass._count.classAssignments,
          },
          stats: classStats?.stats,
        };
      })
    : [];
```

add `classArtIndex`:

```ts
  const teacherClassCards: TeacherClassCardData[] = profile.teacherProfile
    ? teacherClassesOrdered.map((klass) => {
        const classStats = teacherClassStatsById.get(klass.id);
        return {
          id: klass.id,
          grade: klass.grade,
          period: klass.period,
          title: klass.title,
          classArtIndex: klass.classArtIndex,
          school: klass.school,
          _count: {
            students: klass._count.students,
            assignments: klass._count.classAssignments,
          },
          stats: classStats?.stats,
        };
      })
    : [];
```

- [ ] **Step 3: Add `classArtIndex` to the `app.my-classes._index` classes query**

In `services/web-app/app/routes/app.my-classes._index/route.tsx`, the `classes` query `select` currently reads (lines 50-60):

```ts
      select: {
        id: true,
        schoolId: true,
        schoolYear: true,
        grade: true,
        period: true,
        title: true,
        code: true,
        school: { select: { id: true, name: true } },
        _count: { select: { students: true, classAssignments: true } },
      },
```

Add `classArtIndex: true`:

```ts
      select: {
        id: true,
        schoolId: true,
        schoolYear: true,
        grade: true,
        period: true,
        title: true,
        code: true,
        classArtIndex: true,
        school: { select: { id: true, name: true } },
        _count: { select: { students: true, classAssignments: true } },
      },
```

`classesWithStats` (lines 94-104) spreads `...klass`, so `classArtIndex` flows through to `ClassRow` (`TeacherClassCardData & ClassManageRow`) without further changes.

- [ ] **Step 4: Add `classArtIndex` to the class detail loader and pass it to `<ClassArt>`**

In `services/web-app/app/routes/app.my-classes.$classId/route.tsx`, the `klass` query `select` currently reads (lines 599-618):

```ts
    select: {
      id: true,
      schoolId: true,
      schoolYear: true,
      code: true,
      grade: true,
      period: true,
      title: true,
      school: { select: { id: true, name: true, organizationId: true } },
      students: {
        select: {
          id: true,
          profile: {
            select: { id: true, user: { select: { name: true, email: true } } },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
```

Add `classArtIndex: true`:

```ts
    select: {
      id: true,
      schoolId: true,
      schoolYear: true,
      code: true,
      grade: true,
      period: true,
      title: true,
      classArtIndex: true,
      school: { select: { id: true, name: true, organizationId: true } },
      students: {
        select: {
          id: true,
          profile: {
            select: { id: true, user: { select: { name: true, email: true } } },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
```

Update the render (currently `<ClassArt seed={data.klass.id} />` at line 1846):

```tsx
              <div className="hidden h-16 w-24 shrink-0 overflow-hidden rounded-md border sm:block">
                <ClassArt
                  seed={data.klass.id}
                  classArtIndex={data.klass.classArtIndex}
                />
              </div>
```

- [ ] **Step 5: Run the full unit test suite**

From `services/web-app/`:

```bash
bun test
```

Expected: PASS. Existing mocks for `prisma.class.findMany`/`findFirst` in `app._index/route.test.ts` and `app.my-classes.$classId/route.test.ts` use loosely-typed `mock()`/`mockImplementation(async (args: any) => ...)` returns, so they don't need `classArtIndex` added to their fixture data — and no test asserts an exact `toEqual` on the full `teacherClassCards`/`klass` objects (only `toMatchObject`/field-by-field checks).

- [ ] **Step 6: Run typecheck**

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add services/web-app/app/components/teacher-class-card.tsx services/web-app/app/routes/app._index/route.tsx services/web-app/app/routes/app.my-classes._index/route.tsx services/web-app/app/routes/app.my-classes.\$classId/route.tsx
git commit -m "feat: thread classArtIndex from loaders to ClassArt"
```

---

### Task 8: Backfill `classArtIndex` for existing classes

**Files:**
- Create: `packages/prisma/scripts/backfill-class-art-index.ts`

- [ ] **Step 1: Write the backfill script**

Create `packages/prisma/scripts/backfill-class-art-index.ts`:

```ts
import { PrismaClient } from '../generated/prisma';

// Mirrors CLASS_ART_POOL_SIZE in
// services/web-app/app/utils/class-art.ts (5 artworks x 3 crops each).
const CLASS_ART_POOL_SIZE = 15;

function pickNextClassArtIndex(recentIndices: number[]): number {
  const excluded = new Set(recentIndices);
  const available: number[] = [];
  for (let i = 0; i < CLASS_ART_POOL_SIZE; i++) {
    if (!excluded.has(i)) available.push(i);
  }
  const candidates =
    available.length > 0
      ? available
      : Array.from({ length: CLASS_ART_POOL_SIZE }, (_, i) => i);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

const prisma = new PrismaClient();

const assigned = await prisma.class.findMany({
  where: { classArtIndex: { not: null } },
  orderBy: { createdAt: 'desc' },
  select: { classArtIndex: true, teachers: { select: { id: true } } },
});

// Seed each teacher's rolling window of recently-assigned indices
// (most-recent-first) from classes that already have one.
const recentByTeacher = new Map<string, number[]>();
for (const klass of assigned) {
  for (const teacher of klass.teachers) {
    const recent = recentByTeacher.get(teacher.id) ?? [];
    if (recent.length < CLASS_ART_POOL_SIZE - 1) {
      recent.push(klass.classArtIndex!);
      recentByTeacher.set(teacher.id, recent);
    }
  }
}

const unassigned = await prisma.class.findMany({
  where: { classArtIndex: null },
  orderBy: { createdAt: 'asc' },
  select: { id: true, teachers: { select: { id: true } } },
});

let updated = 0;
for (const klass of unassigned) {
  const teacherIds = klass.teachers.map((teacher) => teacher.id);
  const recent = teacherIds.flatMap((id) => recentByTeacher.get(id) ?? []);
  const index = pickNextClassArtIndex(recent);

  await prisma.class.update({
    where: { id: klass.id },
    data: { classArtIndex: index },
  });

  for (const id of teacherIds) {
    const recentList = recentByTeacher.get(id) ?? [];
    recentList.unshift(index);
    if (recentList.length > CLASS_ART_POOL_SIZE - 1) recentList.pop();
    recentByTeacher.set(id, recentList);
  }

  updated += 1;
}

console.log(`Backfilled classArtIndex for ${updated} class(es).`);
await prisma.$disconnect();
```

This duplicates `CLASS_ART_POOL_SIZE` and `pickNextClassArtIndex` from `app/utils/class-art.ts`, matching the precedent set by `backfill-class-card-gradients.ts` duplicating `generateClassCardGradientKey` — standalone scripts in `packages/prisma/scripts/` don't import from `services/web-app`.

- [ ] **Step 2: Run the backfill against your local dev database**

From `packages/prisma/`:

```bash
bun run scripts/backfill-class-art-index.ts
```

Expected: prints `Backfilled classArtIndex for N class(es).` where N is the number of existing classes (0 if your dev database has none). Re-running it should print `Backfilled classArtIndex for 0 class(es).` since every class now has a non-null `classArtIndex`.

- [ ] **Step 3: Commit**

```bash
git add packages/prisma/scripts/backfill-class-art-index.ts
git commit -m "feat: backfill classArtIndex for existing classes"
```

---

### Task 9: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit test suite**

From `services/web-app/`:

```bash
bun test
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run the e2e specs from Task 1 and confirm they now pass**

```bash
bunx playwright test --project=chromium e2e/tests/teacher.class-cards.spec.ts e2e/tests/teacher.class-page-redesign.spec.ts
```

Expected: PASS — the `class-art` element now has `background-image: url(".../img/class-art/....jpg")`, matching `/\/img\/class-art\//`, for both the e2e fixture class (`classArtIndex` is `null`, falling back to `generateClassArt(seed)`) and any classes created via the app (which get a persisted `classArtIndex` from Task 6).

- [ ] **Step 4: Commit (if any fixes were needed)**

```bash
git add -A
git commit -m "test: verify class header artwork end-to-end"
```

---

## Notes for the implementing engineer

- `poc/class-art/` (the throwaway HTML/CSS proof of concept and its source images) is intentionally left in place as a reference for the curated crops above — it is not part of the app build or test pipeline and needs no further changes.
- If a future task adds more artworks to `CLASS_ART_LIBRARY`, `CLASS_ART_POOL_SIZE` grows automatically (it's derived), but the hardcoded `CLASS_ART_POOL_SIZE = 15` in `backfill-class-art-index.ts` (Task 8) must be updated to match. Re-check each new candidate against the no-nudity content guideline in `docs/superpowers/specs/2026-06-12-class-header-artwork-design.md` before adding it.
- `services/web-app/e2e/db-helpers.ts`'s `createTeacherClassPilotFixture` does not set `classArtIndex` (it stays `null`), which is intentional — `ClassArt` falls back to `generateClassArt(seed)` for these fixtures, satisfying the e2e assertions from Task 1 without any e2e helper changes.
- `app.my-classes._index/route.tsx`'s create-class action has no existing `route.test.ts`. Task 6 deliberately does not add one — the new logic it calls (`pickClassArtIndexForTeachers`) is fully unit-tested in Task 5, and adding test coverage for the rest of that action's pre-existing, untested behavior is out of scope for this feature.
