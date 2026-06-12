# Class Header Artwork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the procedurally-generated SVG class-art band (`app/components/class-art.tsx` + `app/utils/class-art.ts`) with a curated library of public-domain artwork, rendered full-bleed (treatment D) as a `background-image` `<div>`, selected deterministically per class id — used unchanged by `TeacherClassCard`'s art band and the class detail header strip.

**Architecture:** `app/utils/class-art.ts` becomes a small data module (`CLASS_ART_LIBRARY`: 5 artworks × 3 pre-curated crop positions each) plus a `generateClassArt(seed)` selector that reuses the existing `hashSeed` (FNV-1a) + `mulberry32` PRNG to pick (artwork, crop) from the class id — same approach as today, new output shape (`{ src, credit, backgroundPosition }`). `app/components/class-art.tsx` renders that as a single `<div role="img" aria-label/title={credit}>` with `background-image`/`background-position`/`bg-cover`, keeping the existing `data-testid="class-art"` contract and `h-full w-full` sizing so both call sites (`TeacherClassCard`, class detail header) need no changes. This is a decorative-only swap with no data-model impact, matching the precedent of the prior gradient→procedural-art change (no feature flag).

**Tech Stack:** React Router (Remix-style routes), TypeScript, Tailwind CSS, `bun:test`, Playwright e2e.

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

### Task 2: Curated artwork library and deterministic selection

**Files:**
- Modify (rewrite): `services/web-app/app/utils/class-art.test.ts`
- Modify (rewrite): `services/web-app/app/utils/class-art.ts`
- Create: `services/web-app/public/img/class-art/hokusai-red-fuji.jpg`
- Create: `services/web-app/public/img/class-art/hokusai-great-wave.jpg`
- Create: `services/web-app/public/img/class-art/van-gogh-wheat-field-cypresses.jpg`
- Create: `services/web-app/public/img/class-art/af-klint-ten-largest-youth.jpg`
- Create: `services/web-app/public/img/class-art/morris-strawberry-thief.jpg`

- [ ] **Step 1: Replace `app/utils/class-art.test.ts` with tests for the new library/selector**

Replace the entire contents of `services/web-app/app/utils/class-art.test.ts` with:

```ts
import { existsSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';
import { CLASS_ART_LIBRARY, generateClassArt } from './class-art';

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
```

- [ ] **Step 2: Run the test and confirm it fails**

From `services/web-app/`:

```bash
bun test app/utils/class-art.test.ts
```

Expected: FAIL — `class-art.ts` does not yet export `CLASS_ART_LIBRARY`, and `generateClassArt` does not yet return `{ src, credit, backgroundPosition }`.

- [ ] **Step 3: Rewrite `app/utils/class-art.ts`**

Replace the entire contents of `services/web-app/app/utils/class-art.ts` with:

```ts
// Curated public-domain artwork for class headers (TeacherClassCard's art
// band and the class detail header strip). Same seed (class id) always
// yields the same artwork and crop.

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

export type ClassArtSelection = {
  src: string;
  credit: string;
  backgroundPosition: string;
};

export function generateClassArt(seed: string): ClassArtSelection {
  const rng = mulberry32(hashSeed(seed));
  const entry =
    CLASS_ART_LIBRARY[Math.floor(rng() * CLASS_ART_LIBRARY.length)];
  const backgroundPosition =
    entry.positions[Math.floor(rng() * entry.positions.length)];

  return { src: entry.src, credit: entry.credit, backgroundPosition };
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

Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add services/web-app/app/utils/class-art.ts services/web-app/app/utils/class-art.test.ts services/web-app/public/img/class-art
git commit -m "feat: replace procedural class art with curated public-domain library"
```

---

### Task 3: Render the curated artwork as a full-bleed background

**Files:**
- Modify (rewrite): `services/web-app/app/components/class-art.tsx`

- [ ] **Step 1: Rewrite `app/components/class-art.tsx`**

Replace the entire contents of `services/web-app/app/components/class-art.tsx` with:

```tsx
import { useMemo } from 'react';
import { generateClassArt } from '~/utils/class-art';
import { cn } from '~/utils/misc';

export function ClassArt({
  seed,
  className,
}: {
  seed: string;
  className?: string;
}) {
  const art = useMemo(() => generateClassArt(seed), [seed]);

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

This keeps the existing contract both call sites rely on: `data-testid="class-art"`, `h-full w-full` sizing within their fixed-height containers (`TeacherClassCard`'s `h-32 w-full` band at `services/web-app/app/components/teacher-class-card.tsx:43-45`, and the class detail header's `h-16 w-24` thumb at `services/web-app/app/routes/app.my-classes.$classId/route.tsx:1834-1836`). Both containers already clip overflow via their own `overflow-hidden`/border styles, so `background-size: cover` fills each box edge-to-edge with no extra wrapper needed.

- [ ] **Step 2: Run the full unit test suite**

```bash
bun test app/
```

Expected: PASS — confirms no other test imports the removed `class-art.ts` exports (`CLASS_ART_WIDTH`, `CLASS_ART_HEIGHT`, `CLASS_ART_PALETTE`, `ClassArtSpec`, etc.).

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run the e2e specs from Task 1 and confirm they now pass**

```bash
bunx playwright test --project=chromium e2e/tests/teacher.class-cards.spec.ts e2e/tests/teacher.class-page-redesign.spec.ts
```

Expected: PASS — the `class-art` element now has `background-image: url(".../img/class-art/....jpg")`, matching `/\/img\/class-art\//`.

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/components/class-art.tsx
git commit -m "feat: render class header art as full-bleed curated artwork"
```

---

## Notes for the implementing engineer

- `poc/class-art/` (the throwaway HTML/CSS proof of concept and its source images) is intentionally left in place as a reference for the curated crops above — it is not part of the app build or test pipeline and needs no further changes.
- If a future task adds more artworks to `CLASS_ART_LIBRARY`, re-check each candidate against the no-nudity content guideline in `docs/superpowers/specs/2026-06-12-class-header-artwork-design.md` before adding it.
