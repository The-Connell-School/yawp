# Released grades organization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the released-grades surface with a collapsed-by-default accordion grouped by `AssignmentType`, supporting a by-student pivot, URL-state filters (date range, student, grade range), and lazy-loaded pile contents — all behind a feature flag, gated per-org.

**Architecture:** New nested route `app.my-classes.$classId.released-grades` renders a `<FiltersBar>` + a switchable `<PileAccordion>` (by-assignment) or `<StudentAccordion>` (by-student). The route loader returns the *pile metadata only* (id, title, count, mostRecentReleasedAt). Pile contents lazy-load on expand via a resource route (`*.pile-contents.$assignmentTypeId/route.tsx` for by-assignment; `*.student-contents.$studentProfileId/route.tsx` for by-student). All filter state lives in URL search params; view pivot persists to `localStorage`. A feature flag (`feature_released_grades_organization`) gates entry from the existing class view.

**Tech stack:** React Router 7 file-based routes, Prisma 7 (schema unchanged from `assignments-unification`), Radix Accordion (already in `ui/accordion.tsx`), `bun:test` for unit tests, Playwright for E2E.

**Branch:** `released-grades-organization`, branched off `assignments-unification` (the spec depends on the post-refactor schema).

**Spec:** [yawp-pm/features/released-grades-organization.md](https://github.com/The-Connell-School/yawp-pm/blob/main/features/released-grades-organization.md)

---

## Task 0: Branch setup and plan placement

**Files:**
- Create: `docs/superpowers/plans/2026-05-05-released-grades-organization.md` (this plan, copied from `/tmp/released-grades-organization-plan.md`)

- [ ] **Step 1: Clone yawp-2.0 fresh, create branch off assignments-unification**

```bash
TMP=$(mktemp -d)
git clone -b assignments-unification https://github.com/The-Connell-School/yawp-2.0.git "$TMP/yawp-2.0"
cd "$TMP/yawp-2.0"
git checkout -b released-grades-organization
```

- [ ] **Step 2: Place this plan file at the canonical location and commit**

Copy the plan content from `/tmp/released-grades-organization-plan.md` to `docs/superpowers/plans/2026-05-05-released-grades-organization.md` (use the file's full content verbatim).

```bash
git add docs/superpowers/plans/2026-05-05-released-grades-organization.md
git commit -m "docs: implementation plan for released grades organization"
git push -u origin released-grades-organization
```

- [ ] **Step 3: Confirm branch is live**

```bash
git ls-remote --heads origin released-grades-organization
```

Expected: one ref printed.

---

## Task 1: Add feature flag constant and helper

**Files:**
- Modify: `services/web-app/app/utils/feature-flags.server.ts`
- Test: `services/web-app/app/utils/feature-flags.server.test.ts` (create if absent)

- [ ] **Step 1: Read the current `feature-flags.server.ts` to understand the existing pattern**

```bash
cat services/web-app/app/utils/feature-flags.server.ts
```

- [ ] **Step 2: Write the failing test**

Create `services/web-app/app/utils/feature-flags.server.test.ts` if it doesn't exist; otherwise append:

```typescript
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { isReleasedGradesOrganizationEnabledForOrganization } from './feature-flags.server';
import { prisma } from '~/db.server';

mock.module('~/db.server', () => ({
  prisma: { setting: { findUnique: mock(() => Promise.resolve(null)) } },
}));

describe('isReleasedGradesOrganizationEnabledForOrganization', () => {
  test('returns false when flag setting absent', async () => {
    expect(await isReleasedGradesOrganizationEnabledForOrganization('org_1')).toBe(false);
  });

  test('returns true when org id is in the allowlist setting value', async () => {
    (prisma.setting.findUnique as any).mockResolvedValueOnce({
      name: 'released_grades_organization_enabled_org_ids',
      value: 'org_1,org_2',
    });
    expect(await isReleasedGradesOrganizationEnabledForOrganization('org_1')).toBe(true);
  });

  test('returns false when org id not in allowlist', async () => {
    (prisma.setting.findUnique as any).mockResolvedValueOnce({
      name: 'released_grades_organization_enabled_org_ids',
      value: 'org_2',
    });
    expect(await isReleasedGradesOrganizationEnabledForOrganization('org_1')).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
bun test services/web-app/app/utils/feature-flags.server.test.ts
```

Expected: FAIL — `isReleasedGradesOrganizationEnabledForOrganization` not exported.

- [ ] **Step 4: Add the constant + helper**

In `services/web-app/app/utils/feature-flags.server.ts`, append a new entry to the existing `FEATURE_FLAGS` object and a new helper that mirrors the existing `isAssignmentsEnabledForOrganization`. (Read the file first; mirror the existing pattern exactly — the next assistant pass should match its style precisely.)

The new key in `FEATURE_FLAGS`:
```typescript
RELEASED_GRADES_ORGANIZATION_ENABLED_ORG_IDS: 'released_grades_organization_enabled_org_ids',
```

The new helper (mirror `isAssignmentsEnabledForOrganization`'s shape):
```typescript
export async function isReleasedGradesOrganizationEnabledForOrganization(
  organizationId: string,
): Promise<boolean> {
  const setting = await prisma.setting.findUnique({
    where: { name: FEATURE_FLAGS.RELEASED_GRADES_ORGANIZATION_ENABLED_ORG_IDS },
  });
  if (!setting) return false;
  const ids = parseSettingIdList(setting.value);
  return ids.includes(organizationId);
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
bun test services/web-app/app/utils/feature-flags.server.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/web-app/app/utils/feature-flags.server.ts services/web-app/app/utils/feature-flags.server.test.ts
git commit -m "feat(feature-flags): add released_grades_organization_enabled_org_ids flag"
```

---

## Task 2: Add data-access function — pile metadata for a class

**Files:**
- Create: `services/web-app/app/services/released-grades.server.ts`
- Test: `services/web-app/app/services/released-grades.server.test.ts`

This module is the home for all server-side queries that drive the new view. Keeping it separate from the route file keeps the route thin and makes the queries unit-testable.

- [ ] **Step 1: Write the failing test for `loadPiles`**

Create `services/web-app/app/services/released-grades.server.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { loadPiles, type PileFilters } from './released-grades.server';
import { prisma } from '~/db.server';

mock.module('~/db.server', () => ({
  prisma: {
    submission: {
      groupBy: mock(() => Promise.resolve([])),
      findMany: mock(() => Promise.resolve([])),
    },
    assignmentType: {
      findMany: mock(() => Promise.resolve([])),
    },
  },
}));

describe('loadPiles', () => {
  test('returns empty array when class has no released submissions', async () => {
    (prisma.submission.groupBy as any).mockResolvedValueOnce([]);
    const piles = await loadPiles({ classId: 'class_1', filters: {} });
    expect(piles).toEqual([]);
  });

  test('aggregates submissions per AssignmentType, sorted by mostRecentReleasedAt desc', async () => {
    (prisma.submission.groupBy as any).mockResolvedValueOnce([
      { _count: 5, _max: { releasedAt: new Date('2026-04-28') }, assignmentTypeId: 'at_1' },
      { _count: 12, _max: { releasedAt: new Date('2026-05-01') }, assignmentTypeId: 'at_2' },
    ]);
    (prisma.assignmentType.findMany as any).mockResolvedValueOnce([
      { id: 'at_1', title: 'Persuasive Essay' },
      { id: 'at_2', title: 'Macbeth Essay' },
    ]);
    const piles = await loadPiles({ classId: 'class_1', filters: {} });
    expect(piles).toEqual([
      { assignmentTypeId: 'at_2', title: 'Macbeth Essay', count: 12, mostRecentReleasedAt: new Date('2026-05-01') },
      { assignmentTypeId: 'at_1', title: 'Persuasive Essay', count: 5, mostRecentReleasedAt: new Date('2026-04-28') },
    ]);
  });

  test('honors date-range filter on releasedAt', async () => {
    const filters: PileFilters = { releasedFrom: new Date('2026-04-01'), releasedTo: new Date('2026-04-30') };
    (prisma.submission.groupBy as any).mockResolvedValueOnce([]);
    await loadPiles({ classId: 'class_1', filters });
    const call = (prisma.submission.groupBy as any).mock.calls[0][0];
    expect(call.where.releasedAt).toEqual({
      gte: new Date('2026-04-01'),
      lte: new Date('2026-04-30'),
      not: null,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun test services/web-app/app/services/released-grades.server.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `loadPiles`**

Create `services/web-app/app/services/released-grades.server.ts`:

```typescript
import { prisma } from '~/db.server';

export type PileFilters = {
  releasedFrom?: Date;
  releasedTo?: Date;
  studentProfileIds?: string[];
  minGrade?: number;
  maxGrade?: number;
};

export type Pile = {
  assignmentTypeId: string;
  title: string;
  count: number;
  mostRecentReleasedAt: Date;
};

function buildSubmissionWhere(classId: string, filters: PileFilters) {
  return {
    document: { assignment: { classId }, deletedAt: null },
    releasedAt: {
      ...(filters.releasedFrom ? { gte: filters.releasedFrom } : {}),
      ...(filters.releasedTo ? { lte: filters.releasedTo } : {}),
      not: null,
    },
    ...(filters.studentProfileIds?.length
      ? { document: { studentProfileId: { in: filters.studentProfileIds } } }
      : {}),
    ...(filters.minGrade != null || filters.maxGrade != null
      ? {
          grade: {
            ...(filters.minGrade != null ? { gte: filters.minGrade } : {}),
            ...(filters.maxGrade != null ? { lte: filters.maxGrade } : {}),
          },
        }
      : {}),
  };
}

export async function loadPiles(params: {
  classId: string;
  filters: PileFilters;
}): Promise<Pile[]> {
  const grouped = await prisma.submission.groupBy({
    by: ['assignmentTypeId'],
    where: buildSubmissionWhere(params.classId, params.filters),
    _count: true,
    _max: { releasedAt: true },
  } as any);

  const ids = grouped.map((g: any) => g.assignmentTypeId).filter(Boolean) as string[];
  if (ids.length === 0) return [];

  const types = await prisma.assignmentType.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true },
  });
  const titleById = new Map(types.map((t) => [t.id, t.title]));

  return grouped
    .map((g: any) => ({
      assignmentTypeId: g.assignmentTypeId as string,
      title: titleById.get(g.assignmentTypeId) ?? '(deleted)',
      count: g._count as number,
      mostRecentReleasedAt: g._max.releasedAt as Date,
    }))
    .sort((a, b) => b.mostRecentReleasedAt.getTime() - a.mostRecentReleasedAt.getTime());
}
```

> NOTE: The `buildSubmissionWhere` shape uses `Submission.assignmentTypeId` indirectly via `document.assignment` — confirm at implementation time whether `Submission` has a direct `assignmentTypeId` (per research, `Document` does, and the path is `Submission → Document → Assignment → AssignmentType`). If `Submission.assignmentTypeId` is not present, replace `by: ['assignmentTypeId']` with grouping via the `Document.assignmentTypeId` path — likely requires running a raw query or a two-stage fetch (find submissions, then group in JS). Adjust the test fixture accordingly. **Do not invent a column.**

- [ ] **Step 4: Run the test to verify it passes**

```bash
bun test services/web-app/app/services/released-grades.server.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/services/released-grades.server.ts services/web-app/app/services/released-grades.server.test.ts
git commit -m "feat(released-grades): pile metadata loader"
```

---

## Task 3: Data-access function — pile contents (submissions for one AssignmentType)

**Files:**
- Modify: `services/web-app/app/services/released-grades.server.ts`
- Modify: `services/web-app/app/services/released-grades.server.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `released-grades.server.test.ts`:

```typescript
describe('loadPileContents', () => {
  test('returns submissions for an AssignmentType in a class, newest released first, paginated', async () => {
    (prisma.submission.findMany as any).mockResolvedValueOnce([
      { id: 's_1', releasedAt: new Date('2026-05-01'), grade: 89, document: { studentProfile: { id: 'sp_1', firstName: 'Jamie', lastName: 'Lopez' } } },
      { id: 's_2', releasedAt: new Date('2026-04-28'), grade: 76, document: { studentProfile: { id: 'sp_2', firstName: 'Anita', lastName: 'Patel' } } },
    ]);
    const result = await loadPileContents({
      classId: 'class_1',
      assignmentTypeId: 'at_1',
      filters: {},
      take: 50,
      skip: 0,
    });
    expect(result).toEqual([
      { submissionId: 's_1', studentProfileId: 'sp_1', studentName: 'Jamie Lopez', grade: 89, releasedAt: new Date('2026-05-01') },
      { submissionId: 's_2', studentProfileId: 'sp_2', studentName: 'Anita Patel', grade: 76, releasedAt: new Date('2026-04-28') },
    ]);
  });
});
```

Add to the imports at the top of the test file:

```typescript
import { loadPiles, loadPileContents, type PileFilters } from './released-grades.server';
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun test services/web-app/app/services/released-grades.server.test.ts
```

Expected: FAIL — `loadPileContents` not exported.

- [ ] **Step 3: Implement `loadPileContents`**

Append to `released-grades.server.ts`:

```typescript
export type PileSubmissionRow = {
  submissionId: string;
  studentProfileId: string;
  studentName: string;
  grade: number | null;
  releasedAt: Date;
};

export async function loadPileContents(params: {
  classId: string;
  assignmentTypeId: string;
  filters: PileFilters;
  take: number;
  skip: number;
}): Promise<PileSubmissionRow[]> {
  const submissions = await prisma.submission.findMany({
    where: {
      ...buildSubmissionWhere(params.classId, params.filters),
      document: {
        assignment: { classId: params.classId },
        assignmentTypeId: params.assignmentTypeId,
        deletedAt: null,
      },
    },
    select: {
      id: true,
      releasedAt: true,
      grade: true,
      document: {
        select: {
          studentProfile: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { releasedAt: 'desc' },
    take: params.take,
    skip: params.skip,
  } as any);

  return submissions.map((s: any) => ({
    submissionId: s.id,
    studentProfileId: s.document.studentProfile.id,
    studentName: `${s.document.studentProfile.firstName} ${s.document.studentProfile.lastName}`,
    grade: s.grade,
    releasedAt: s.releasedAt,
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
bun test services/web-app/app/services/released-grades.server.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/services/released-grades.server.ts services/web-app/app/services/released-grades.server.test.ts
git commit -m "feat(released-grades): pile contents loader (paginated submissions)"
```

---

## Task 4: Data-access function — by-student pivot loader

**Files:**
- Modify: `services/web-app/app/services/released-grades.server.ts`
- Modify: `services/web-app/app/services/released-grades.server.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```typescript
describe('loadStudentPiles', () => {
  test('returns one pile per student with at least one released submission, newest-first', async () => {
    (prisma.submission.groupBy as any).mockResolvedValueOnce([
      { _count: 4, _max: { releasedAt: new Date('2026-05-01') }, document: { studentProfileId: 'sp_1' } },
    ]);
    // Note: prisma groupBy can't traverse relations directly; the implementation will use a raw SQL fallback or two-stage fetch. Use the two-stage approach in the implementation; mock accordingly.
  });
});
```

Replace this with the actual two-stage pattern. Better — write the test for what the function returns; let the implementation choose how to query:

```typescript
describe('loadStudentPiles', () => {
  test('returns empty array when no students have released submissions', async () => {
    (prisma.submission.findMany as any).mockResolvedValueOnce([]);
    const piles = await loadStudentPiles({ classId: 'class_1', filters: {} });
    expect(piles).toEqual([]);
  });

  test('groups by student, sorted by most-recent release desc, count per student', async () => {
    (prisma.submission.findMany as any).mockResolvedValueOnce([
      { id: 's_1', releasedAt: new Date('2026-05-01'), document: { studentProfile: { id: 'sp_1', firstName: 'Jamie', lastName: 'Lopez' } } },
      { id: 's_2', releasedAt: new Date('2026-04-30'), document: { studentProfile: { id: 'sp_1', firstName: 'Jamie', lastName: 'Lopez' } } },
      { id: 's_3', releasedAt: new Date('2026-04-29'), document: { studentProfile: { id: 'sp_2', firstName: 'Anita', lastName: 'Patel' } } },
    ]);
    const piles = await loadStudentPiles({ classId: 'class_1', filters: {} });
    expect(piles).toEqual([
      { studentProfileId: 'sp_1', studentName: 'Jamie Lopez', count: 2, mostRecentReleasedAt: new Date('2026-05-01') },
      { studentProfileId: 'sp_2', studentName: 'Anita Patel', count: 1, mostRecentReleasedAt: new Date('2026-04-29') },
    ]);
  });
});
```

Update the import:

```typescript
import { loadPiles, loadPileContents, loadStudentPiles, type PileFilters } from './released-grades.server';
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun test services/web-app/app/services/released-grades.server.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `loadStudentPiles`**

Append:

```typescript
export type StudentPile = {
  studentProfileId: string;
  studentName: string;
  count: number;
  mostRecentReleasedAt: Date;
};

export async function loadStudentPiles(params: {
  classId: string;
  filters: PileFilters;
}): Promise<StudentPile[]> {
  const submissions = await prisma.submission.findMany({
    where: buildSubmissionWhere(params.classId, params.filters),
    select: {
      id: true,
      releasedAt: true,
      document: {
        select: { studentProfile: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
    orderBy: { releasedAt: 'desc' },
  } as any);

  const byStudent = new Map<string, StudentPile>();
  for (const s of submissions) {
    const sp = (s as any).document.studentProfile;
    const key = sp.id;
    const existing = byStudent.get(key);
    if (existing) {
      existing.count += 1;
      // already sorted desc by releasedAt, so first seen is most recent — don't overwrite
    } else {
      byStudent.set(key, {
        studentProfileId: sp.id,
        studentName: `${sp.firstName} ${sp.lastName}`,
        count: 1,
        mostRecentReleasedAt: (s as any).releasedAt as Date,
      });
    }
  }
  return Array.from(byStudent.values()).sort(
    (a, b) => b.mostRecentReleasedAt.getTime() - a.mostRecentReleasedAt.getTime(),
  );
}

export async function loadStudentPileContents(params: {
  classId: string;
  studentProfileId: string;
  filters: PileFilters;
}): Promise<{
  submissionId: string;
  assignmentTypeId: string;
  assignmentTypeTitle: string;
  grade: number | null;
  releasedAt: Date;
}[]> {
  const submissions = await prisma.submission.findMany({
    where: {
      ...buildSubmissionWhere(params.classId, params.filters),
      document: {
        assignment: { classId: params.classId },
        studentProfileId: params.studentProfileId,
        deletedAt: null,
      },
    },
    select: {
      id: true,
      releasedAt: true,
      grade: true,
      document: {
        select: {
          assignmentTypeId: true,
          assignmentType: { select: { title: true } },
        },
      },
    },
    orderBy: { releasedAt: 'desc' },
  } as any);

  return submissions.map((s: any) => ({
    submissionId: s.id,
    assignmentTypeId: s.document.assignmentTypeId,
    assignmentTypeTitle: s.document.assignmentType?.title ?? '(deleted)',
    grade: s.grade,
    releasedAt: s.releasedAt,
  }));
}
```

- [ ] **Step 4: Run the test**

```bash
bun test services/web-app/app/services/released-grades.server.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add a test for `loadStudentPileContents` shape**

```typescript
describe('loadStudentPileContents', () => {
  test('returns submissions for a single student, newest released first, with AssignmentType title', async () => {
    (prisma.submission.findMany as any).mockResolvedValueOnce([
      { id: 's_1', releasedAt: new Date('2026-05-01'), grade: 92, document: { assignmentTypeId: 'at_1', assignmentType: { title: 'Macbeth Essay' } } },
    ]);
    const rows = await loadStudentPileContents({ classId: 'class_1', studentProfileId: 'sp_1', filters: {} });
    expect(rows).toEqual([
      { submissionId: 's_1', assignmentTypeId: 'at_1', assignmentTypeTitle: 'Macbeth Essay', grade: 92, releasedAt: new Date('2026-05-01') },
    ]);
  });
});
```

Update import:

```typescript
import { loadPiles, loadPileContents, loadStudentPiles, loadStudentPileContents, type PileFilters } from './released-grades.server';
```

- [ ] **Step 6: Run the test**

```bash
bun test services/web-app/app/services/released-grades.server.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add services/web-app/app/services/released-grades.server.ts services/web-app/app/services/released-grades.server.test.ts
git commit -m "feat(released-grades): by-student pivot loaders"
```

---

## Task 5: URL filter parsing helper

**Files:**
- Create: `services/web-app/app/services/released-grades.url-filters.ts`
- Test: `services/web-app/app/services/released-grades.url-filters.test.ts`

Centralize URL → `PileFilters` parsing so the route loader and the resource routes share one source of truth.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, test } from 'bun:test';
import { parseUrlFilters, filtersToSearchParams } from './released-grades.url-filters';

describe('parseUrlFilters', () => {
  test('returns empty filters when URL has no params', () => {
    expect(parseUrlFilters(new URL('https://x.test/path'))).toEqual({});
  });

  test('parses date range', () => {
    const url = new URL('https://x.test/path?from=2026-04-01&to=2026-04-30');
    expect(parseUrlFilters(url)).toEqual({
      releasedFrom: new Date('2026-04-01'),
      releasedTo: new Date('2026-04-30'),
    });
  });

  test('parses comma-separated student ids', () => {
    const url = new URL('https://x.test/path?students=sp_1,sp_2');
    expect(parseUrlFilters(url)).toEqual({ studentProfileIds: ['sp_1', 'sp_2'] });
  });

  test('parses grade range', () => {
    const url = new URL('https://x.test/path?minGrade=70&maxGrade=85');
    expect(parseUrlFilters(url)).toEqual({ minGrade: 70, maxGrade: 85 });
  });

  test('ignores invalid date strings silently', () => {
    const url = new URL('https://x.test/path?from=not-a-date');
    expect(parseUrlFilters(url)).toEqual({});
  });
});

describe('filtersToSearchParams', () => {
  test('produces the inverse of parseUrlFilters', () => {
    const filters = {
      releasedFrom: new Date('2026-04-01'),
      releasedTo: new Date('2026-04-30'),
      studentProfileIds: ['sp_1', 'sp_2'],
      minGrade: 70,
      maxGrade: 85,
    };
    const params = filtersToSearchParams(filters);
    const url = new URL(`https://x.test/path?${params.toString()}`);
    expect(parseUrlFilters(url)).toEqual(filters);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun test services/web-app/app/services/released-grades.url-filters.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the helper**

```typescript
import type { PileFilters } from './released-grades.server';

function parseDate(s: string | null): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseInteger(s: string | null): number | undefined {
  if (!s) return undefined;
  const n = Number.parseInt(s, 10);
  return Number.isNaN(n) ? undefined : n;
}

export function parseUrlFilters(url: URL): PileFilters {
  const out: PileFilters = {};
  const releasedFrom = parseDate(url.searchParams.get('from'));
  const releasedTo = parseDate(url.searchParams.get('to'));
  if (releasedFrom) out.releasedFrom = releasedFrom;
  if (releasedTo) out.releasedTo = releasedTo;
  const students = url.searchParams.get('students');
  if (students) {
    const ids = students.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length) out.studentProfileIds = ids;
  }
  const minGrade = parseInteger(url.searchParams.get('minGrade'));
  const maxGrade = parseInteger(url.searchParams.get('maxGrade'));
  if (minGrade != null) out.minGrade = minGrade;
  if (maxGrade != null) out.maxGrade = maxGrade;
  return out;
}

function dateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function filtersToSearchParams(filters: PileFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.releasedFrom) params.set('from', dateString(filters.releasedFrom));
  if (filters.releasedTo) params.set('to', dateString(filters.releasedTo));
  if (filters.studentProfileIds?.length) params.set('students', filters.studentProfileIds.join(','));
  if (filters.minGrade != null) params.set('minGrade', String(filters.minGrade));
  if (filters.maxGrade != null) params.set('maxGrade', String(filters.maxGrade));
  return params;
}
```

- [ ] **Step 4: Run the test**

```bash
bun test services/web-app/app/services/released-grades.url-filters.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/services/released-grades.url-filters.ts services/web-app/app/services/released-grades.url-filters.test.ts
git commit -m "feat(released-grades): URL search-params filter parser"
```

---

## Task 6: Route loader — main released-grades page

**Files:**
- Create: `services/web-app/app/routes/app.my-classes.$classId.released-grades/route.tsx`
- Test: `services/web-app/app/routes/app.my-classes.$classId.released-grades/route.test.ts`

The component shell goes in this same task; the rich UI components come in later tasks.

- [ ] **Step 1: Write the failing loader test**

```typescript
import { afterEach, describe, expect, mock, test } from 'bun:test';
import { loader } from './route';
import { prisma } from '~/db.server';
import * as releasedGradesService from '~/services/released-grades.server';

mock.module('~/db.server', () => ({
  prisma: {
    class: { findFirst: mock(() => Promise.resolve(null)) },
  },
}));
mock.module('~/services/released-grades.server', () => ({
  loadPiles: mock(() => Promise.resolve([])),
  loadStudentPiles: mock(() => Promise.resolve([])),
}));
mock.module('~/utils/auth.server', () => ({
  requireTeacherProfile: mock(() => Promise.resolve({ id: 'p_1', teacherProfile: { id: 'tp_1' } })),
}));
mock.module('~/utils/feature-flags.server', () => ({
  isReleasedGradesOrganizationEnabledForOrganization: mock(() => Promise.resolve(true)),
}));

describe('released-grades loader', () => {
  test('404s when class is not found or teacher does not own it', async () => {
    (prisma.class.findFirst as any).mockResolvedValueOnce(null);
    let thrown: Response | null = null;
    try {
      await loader({
        request: new Request('https://x.test/app/my-classes/c_1/released-grades'),
        params: { classId: 'c_1' },
        context: {} as any,
      });
    } catch (r) {
      thrown = r as Response;
    }
    expect(thrown).not.toBeNull();
    expect(thrown!.status).toBe(404);
  });

  test('redirects to old class view when feature flag is OFF', async () => {
    (prisma.class.findFirst as any).mockResolvedValueOnce({ id: 'c_1', schoolId: 'sch_1', school: { organizationId: 'org_1' } });
    (releasedGradesService.loadPiles as any).mockResolvedValueOnce([]);
    const { isReleasedGradesOrganizationEnabledForOrganization } = await import('~/utils/feature-flags.server');
    (isReleasedGradesOrganizationEnabledForOrganization as any).mockResolvedValueOnce(false);
    let thrown: Response | null = null;
    try {
      await loader({
        request: new Request('https://x.test/app/my-classes/c_1/released-grades'),
        params: { classId: 'c_1' },
        context: {} as any,
      });
    } catch (r) {
      thrown = r as Response;
    }
    expect(thrown).not.toBeNull();
    expect(thrown!.status).toBe(302);
    expect(thrown!.headers.get('Location')).toBe('/app/my-classes/c_1');
  });

  test('returns piles with view=byAssignment by default', async () => {
    (prisma.class.findFirst as any).mockResolvedValueOnce({ id: 'c_1', schoolId: 'sch_1', school: { organizationId: 'org_1' } });
    (releasedGradesService.loadPiles as any).mockResolvedValueOnce([
      { assignmentTypeId: 'at_1', title: 'Macbeth Essay', count: 23, mostRecentReleasedAt: new Date('2026-05-01') },
    ]);
    const result = await loader({
      request: new Request('https://x.test/app/my-classes/c_1/released-grades'),
      params: { classId: 'c_1' },
      context: {} as any,
    });
    const data = await result.json?.() ?? result;
    expect(data.view).toBe('byAssignment');
    expect(data.piles).toHaveLength(1);
    expect(data.piles[0].title).toBe('Macbeth Essay');
  });

  test('returns student piles when ?view=byStudent', async () => {
    (prisma.class.findFirst as any).mockResolvedValueOnce({ id: 'c_1', schoolId: 'sch_1', school: { organizationId: 'org_1' } });
    (releasedGradesService.loadStudentPiles as any).mockResolvedValueOnce([
      { studentProfileId: 'sp_1', studentName: 'Jamie Lopez', count: 4, mostRecentReleasedAt: new Date('2026-05-01') },
    ]);
    const result = await loader({
      request: new Request('https://x.test/app/my-classes/c_1/released-grades?view=byStudent'),
      params: { classId: 'c_1' },
      context: {} as any,
    });
    const data = await result.json?.() ?? result;
    expect(data.view).toBe('byStudent');
    expect(data.studentPiles).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun test services/web-app/app/routes/app.my-classes.$classId.released-grades/route.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the loader and minimal component shell**

Create `services/web-app/app/routes/app.my-classes.$classId.released-grades/route.tsx`:

```tsx
import { json, redirect, type LoaderFunctionArgs } from 'react-router';
import { useLoaderData } from 'react-router';
import { prisma } from '~/db.server';
import { requireTeacherProfile } from '~/utils/auth.server';
import { isReleasedGradesOrganizationEnabledForOrganization } from '~/utils/feature-flags.server';
import {
  loadPiles,
  loadStudentPiles,
  type Pile,
  type StudentPile,
} from '~/services/released-grades.server';
import { parseUrlFilters } from '~/services/released-grades.url-filters';

type View = 'byAssignment' | 'byStudent';

type LoaderData =
  | { view: 'byAssignment'; piles: Pile[]; classId: string; className: string }
  | { view: 'byStudent'; studentPiles: StudentPile[]; classId: string; className: string };

export async function loader({ request, params }: LoaderFunctionArgs) {
  const classId = params.classId!;
  const profile = await requireTeacherProfile(request);
  const klass = await prisma.class.findFirst({
    where: { id: classId, teachers: { some: { id: profile.teacherProfile.id } } },
    select: { id: true, title: true, school: { select: { organizationId: true } } },
  });
  if (!klass) throw new Response('Class not found', { status: 404 });

  const enabled = await isReleasedGradesOrganizationEnabledForOrganization(klass.school.organizationId);
  if (!enabled) throw redirect(`/app/my-classes/${classId}`);

  const url = new URL(request.url);
  const view: View = url.searchParams.get('view') === 'byStudent' ? 'byStudent' : 'byAssignment';
  const filters = parseUrlFilters(url);

  if (view === 'byStudent') {
    const studentPiles = await loadStudentPiles({ classId, filters });
    return json<LoaderData>({ view, studentPiles, classId, className: klass.title });
  }
  const piles = await loadPiles({ classId, filters });
  return json<LoaderData>({ view, piles, classId, className: klass.title });
}

export default function ReleasedGradesRoute() {
  const data = useLoaderData<typeof loader>() as LoaderData;
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">
        Released grades — {data.className}
      </h1>
      <pre className="text-xs">{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
```

> NOTE: The `redirect` import path may differ — confirm at implementation time. The codebase uses React Router 7; if `redirect` is from `react-router-dom` or `@remix-run/node`, adjust accordingly. Read an adjacent route to confirm.

- [ ] **Step 4: Run the test to verify it passes**

```bash
bun test services/web-app/app/routes/app.my-classes.$classId.released-grades/route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run typecheck**

```bash
bun run --cwd services/web-app typecheck
```

Expected: clean (besides any pre-existing unrelated errors).

- [ ] **Step 6: Commit**

```bash
git add services/web-app/app/routes/app.my-classes.$classId.released-grades/
git commit -m "feat(released-grades): route loader + skeleton component"
```

---

## Task 7: Resource route — pile contents (lazy-load on expand)

**Files:**
- Create: `services/web-app/app/routes/app.my-classes.$classId.released-grades.pile.$assignmentTypeId/route.tsx`
- Test: `services/web-app/app/routes/app.my-classes.$classId.released-grades.pile.$assignmentTypeId/route.test.ts`

This is a resource route — it returns JSON, no UI component.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, mock, test } from 'bun:test';
import { loader } from './route';
import { prisma } from '~/db.server';
import * as service from '~/services/released-grades.server';

mock.module('~/db.server', () => ({
  prisma: { class: { findFirst: mock(() => Promise.resolve(null)) } },
}));
mock.module('~/services/released-grades.server', () => ({
  loadPileContents: mock(() => Promise.resolve([])),
}));
mock.module('~/utils/auth.server', () => ({
  requireTeacherProfile: mock(() => Promise.resolve({ teacherProfile: { id: 'tp_1' } })),
}));

describe('pile-contents resource loader', () => {
  test('404s if teacher does not own class', async () => {
    (prisma.class.findFirst as any).mockResolvedValueOnce(null);
    let thrown: Response | null = null;
    try {
      await loader({
        request: new Request('https://x.test/app/my-classes/c_1/released-grades/pile/at_1'),
        params: { classId: 'c_1', assignmentTypeId: 'at_1' },
        context: {} as any,
      });
    } catch (r) {
      thrown = r as Response;
    }
    expect(thrown!.status).toBe(404);
  });

  test('returns rows from loadPileContents with default pagination', async () => {
    (prisma.class.findFirst as any).mockResolvedValueOnce({ id: 'c_1' });
    (service.loadPileContents as any).mockResolvedValueOnce([
      { submissionId: 's_1', studentProfileId: 'sp_1', studentName: 'Jamie Lopez', grade: 89, releasedAt: new Date('2026-05-01') },
    ]);
    const res = await loader({
      request: new Request('https://x.test/app/my-classes/c_1/released-grades/pile/at_1'),
      params: { classId: 'c_1', assignmentTypeId: 'at_1' },
      context: {} as any,
    });
    const data = await res.json();
    expect(data.rows).toHaveLength(1);
    expect((service.loadPileContents as any).mock.calls[0][0]).toMatchObject({
      classId: 'c_1',
      assignmentTypeId: 'at_1',
      take: 50,
      skip: 0,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun test services/web-app/app/routes/app.my-classes.$classId.released-grades.pile.$assignmentTypeId/route.test.ts
```

- [ ] **Step 3: Implement**

```tsx
import { json, type LoaderFunctionArgs } from 'react-router';
import { prisma } from '~/db.server';
import { requireTeacherProfile } from '~/utils/auth.server';
import { loadPileContents } from '~/services/released-grades.server';
import { parseUrlFilters } from '~/services/released-grades.url-filters';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const classId = params.classId!;
  const assignmentTypeId = params.assignmentTypeId!;
  const profile = await requireTeacherProfile(request);
  const klass = await prisma.class.findFirst({
    where: { id: classId, teachers: { some: { id: profile.teacherProfile.id } } },
    select: { id: true },
  });
  if (!klass) throw new Response('Class not found', { status: 404 });

  const url = new URL(request.url);
  const filters = parseUrlFilters(url);
  const skip = Number.parseInt(url.searchParams.get('skip') ?? '0', 10) || 0;
  const take = Math.min(Number.parseInt(url.searchParams.get('take') ?? '50', 10) || 50, 200);

  const rows = await loadPileContents({ classId, assignmentTypeId, filters, take, skip });
  return json({ rows, hasMore: rows.length === take });
}
```

- [ ] **Step 4: Run the test**

```bash
bun test services/web-app/app/routes/app.my-classes.$classId.released-grades.pile.$assignmentTypeId/route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/app.my-classes.$classId.released-grades.pile.$assignmentTypeId/
git commit -m "feat(released-grades): resource route for pile contents"
```

---

## Task 8: Resource route — student contents (by-student lazy-load)

**Files:**
- Create: `services/web-app/app/routes/app.my-classes.$classId.released-grades.student.$studentProfileId/route.tsx`
- Test: `services/web-app/app/routes/app.my-classes.$classId.released-grades.student.$studentProfileId/route.test.ts`

Mirrors Task 7 but for the by-student pivot.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, mock, test } from 'bun:test';
import { loader } from './route';
import { prisma } from '~/db.server';
import * as service from '~/services/released-grades.server';

mock.module('~/db.server', () => ({
  prisma: { class: { findFirst: mock(() => Promise.resolve(null)) } },
}));
mock.module('~/services/released-grades.server', () => ({
  loadStudentPileContents: mock(() => Promise.resolve([])),
}));
mock.module('~/utils/auth.server', () => ({
  requireTeacherProfile: mock(() => Promise.resolve({ teacherProfile: { id: 'tp_1' } })),
}));

describe('student-contents resource loader', () => {
  test('returns rows from loadStudentPileContents', async () => {
    (prisma.class.findFirst as any).mockResolvedValueOnce({ id: 'c_1' });
    (service.loadStudentPileContents as any).mockResolvedValueOnce([
      { submissionId: 's_1', assignmentTypeId: 'at_1', assignmentTypeTitle: 'Macbeth Essay', grade: 92, releasedAt: new Date('2026-05-01') },
    ]);
    const res = await loader({
      request: new Request('https://x.test/app/my-classes/c_1/released-grades/student/sp_1'),
      params: { classId: 'c_1', studentProfileId: 'sp_1' },
      context: {} as any,
    });
    const data = await res.json();
    expect(data.rows).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run + verify failure**

```bash
bun test services/web-app/app/routes/app.my-classes.$classId.released-grades.student.$studentProfileId/route.test.ts
```

- [ ] **Step 3: Implement**

```tsx
import { json, type LoaderFunctionArgs } from 'react-router';
import { prisma } from '~/db.server';
import { requireTeacherProfile } from '~/utils/auth.server';
import { loadStudentPileContents } from '~/services/released-grades.server';
import { parseUrlFilters } from '~/services/released-grades.url-filters';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const classId = params.classId!;
  const studentProfileId = params.studentProfileId!;
  const profile = await requireTeacherProfile(request);
  const klass = await prisma.class.findFirst({
    where: { id: classId, teachers: { some: { id: profile.teacherProfile.id } } },
    select: { id: true },
  });
  if (!klass) throw new Response('Class not found', { status: 404 });

  const url = new URL(request.url);
  const filters = parseUrlFilters(url);
  const rows = await loadStudentPileContents({ classId, studentProfileId, filters });
  return json({ rows });
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
bun test services/web-app/app/routes/app.my-classes.$classId.released-grades.student.$studentProfileId/route.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/app.my-classes.$classId.released-grades.student.$studentProfileId/
git commit -m "feat(released-grades): resource route for by-student contents"
```

---

## Task 9: `<PileAccordion>` component (by-assignment view)

**Files:**
- Create: `services/web-app/app/components/released-grades/PileAccordion.tsx`

Uses `~/components/ui/accordion.tsx` (Radix). Each pile expands and lazy-fetches its contents via `useFetcher` against the `pile/$assignmentTypeId` resource route.

- [ ] **Step 1: Implement the component**

```tsx
import { useEffect, useState } from 'react';
import { useFetcher } from 'react-router';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import type { Pile } from '~/services/released-grades.server';

type PileSubmissionRow = {
  submissionId: string;
  studentProfileId: string;
  studentName: string;
  grade: number | null;
  releasedAt: string | Date;
};

type PileFetcherData = { rows: PileSubmissionRow[]; hasMore: boolean };

function PileBody({ classId, assignmentTypeId, filterQuery }: {
  classId: string;
  assignmentTypeId: string;
  filterQuery: string;
}) {
  const fetcher = useFetcher<PileFetcherData>();
  const [skip, setSkip] = useState(0);
  const [rows, setRows] = useState<PileSubmissionRow[]>([]);

  useEffect(() => {
    if (fetcher.state === 'idle' && !fetcher.data && rows.length === 0) {
      const sep = filterQuery ? `&` : '';
      fetcher.load(`/app/my-classes/${classId}/released-grades/pile/${assignmentTypeId}?${filterQuery}${sep}skip=0&take=50`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (fetcher.data) {
      setRows((prev) => [...prev, ...fetcher.data!.rows]);
    }
  }, [fetcher.data]);

  function loadMore() {
    const next = skip + 50;
    setSkip(next);
    const sep = filterQuery ? `&` : '';
    fetcher.load(`/app/my-classes/${classId}/released-grades/pile/${assignmentTypeId}?${filterQuery}${sep}skip=${next}&take=50`);
  }

  if (fetcher.state === 'loading' && rows.length === 0) return <div className="py-3 text-sm text-muted-foreground">Loading…</div>;
  if (rows.length === 0) return <div className="py-3 text-sm text-muted-foreground">No submissions match.</div>;

  return (
    <ul className="divide-y">
      {rows.map((r) => (
        <li key={r.submissionId} className="flex items-center justify-between py-2">
          <a className="text-sm hover:underline" href={`/app/submissions/${r.submissionId}`}>{r.studentName}</a>
          <div className="text-xs text-muted-foreground">
            {r.grade != null ? <span className="mr-2">{r.grade}</span> : null}
            {new Date(r.releasedAt).toLocaleDateString()}
          </div>
        </li>
      ))}
      {fetcher.data?.hasMore ? (
        <li className="py-2">
          <button className="text-xs underline" onClick={loadMore} disabled={fetcher.state !== 'idle'}>
            Show more
          </button>
        </li>
      ) : null}
    </ul>
  );
}

export function PileAccordion({
  classId,
  piles,
  filterQuery,
  expandAll,
}: {
  classId: string;
  piles: Pile[];
  filterQuery: string;
  expandAll: boolean;
}) {
  const value = expandAll ? piles.map((p) => p.assignmentTypeId) : undefined;
  if (piles.length === 0) {
    return (
      <div className="rounded border p-6 text-sm text-muted-foreground">
        No released grades match the current filters.
      </div>
    );
  }
  // Single-pile auto-expand.
  const defaultValue = piles.length === 1 ? [piles[0].assignmentTypeId] : [];
  return (
    <Accordion type="multiple" defaultValue={value ?? defaultValue}>
      {piles.map((p) => (
        <AccordionItem key={p.assignmentTypeId} value={p.assignmentTypeId}>
          <AccordionTrigger>
            <div className="flex w-full items-baseline justify-between pr-2">
              <span className="font-medium">{p.title}</span>
              <span className="text-xs text-muted-foreground">
                {p.count} submissions · released {new Date(p.mostRecentReleasedAt).toLocaleDateString()}
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <PileBody classId={classId} assignmentTypeId={p.assignmentTypeId} filterQuery={filterQuery} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
```

> NOTE: `~/components/ui/accordion.tsx` exports `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent` — confirm the exact export names by reading that file. If they differ, adjust imports.

- [ ] **Step 2: Run typecheck to confirm imports resolve**

```bash
bun run --cwd services/web-app typecheck
```

- [ ] **Step 3: Commit**

```bash
git add services/web-app/app/components/released-grades/PileAccordion.tsx
git commit -m "feat(released-grades): PileAccordion component (by-assignment)"
```

---

## Task 10: `<StudentAccordion>` component (by-student view)

**Files:**
- Create: `services/web-app/app/components/released-grades/StudentAccordion.tsx`

Mirrors Task 9 but for the by-student pivot.

- [ ] **Step 1: Implement**

```tsx
import { useEffect, useState } from 'react';
import { useFetcher } from 'react-router';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import type { StudentPile } from '~/services/released-grades.server';

type StudentSubmissionRow = {
  submissionId: string;
  assignmentTypeId: string;
  assignmentTypeTitle: string;
  grade: number | null;
  releasedAt: string | Date;
};

function StudentBody({ classId, studentProfileId, filterQuery }: {
  classId: string;
  studentProfileId: string;
  filterQuery: string;
}) {
  const fetcher = useFetcher<{ rows: StudentSubmissionRow[] }>();

  useEffect(() => {
    if (fetcher.state === 'idle' && !fetcher.data) {
      fetcher.load(`/app/my-classes/${classId}/released-grades/student/${studentProfileId}?${filterQuery}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (fetcher.state === 'loading') return <div className="py-3 text-sm text-muted-foreground">Loading…</div>;
  const rows = fetcher.data?.rows ?? [];
  if (rows.length === 0) return <div className="py-3 text-sm text-muted-foreground">No submissions match.</div>;

  return (
    <ul className="divide-y">
      {rows.map((r) => (
        <li key={r.submissionId} className="flex items-center justify-between py-2">
          <a className="text-sm hover:underline" href={`/app/submissions/${r.submissionId}`}>{r.assignmentTypeTitle}</a>
          <div className="text-xs text-muted-foreground">
            {r.grade != null ? <span className="mr-2">{r.grade}</span> : null}
            {new Date(r.releasedAt).toLocaleDateString()}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function StudentAccordion({
  classId,
  studentPiles,
  filterQuery,
  expandAll,
}: {
  classId: string;
  studentPiles: StudentPile[];
  filterQuery: string;
  expandAll: boolean;
}) {
  if (studentPiles.length === 0) {
    return (
      <div className="rounded border p-6 text-sm text-muted-foreground">
        No released grades match the current filters.
      </div>
    );
  }
  const value = expandAll ? studentPiles.map((p) => p.studentProfileId) : undefined;
  const defaultValue = studentPiles.length === 1 ? [studentPiles[0].studentProfileId] : [];
  return (
    <Accordion type="multiple" defaultValue={value ?? defaultValue}>
      {studentPiles.map((p) => (
        <AccordionItem key={p.studentProfileId} value={p.studentProfileId}>
          <AccordionTrigger>
            <div className="flex w-full items-baseline justify-between pr-2">
              <span className="font-medium">{p.studentName}</span>
              <span className="text-xs text-muted-foreground">
                {p.count} submissions · most recent {new Date(p.mostRecentReleasedAt).toLocaleDateString()}
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <StudentBody classId={classId} studentProfileId={p.studentProfileId} filterQuery={filterQuery} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
bun run --cwd services/web-app typecheck
git add services/web-app/app/components/released-grades/StudentAccordion.tsx
git commit -m "feat(released-grades): StudentAccordion component (by-student)"
```

---

## Task 11: `<FiltersBar>` component

**Files:**
- Create: `services/web-app/app/components/released-grades/FiltersBar.tsx`

Renders date range, student multi-select (popover with checkbox list), grade range. State lives in URL — component uses `useSearchParams`.

Date range: two `<input type="date">` (no DateRangePicker exists in the kit). Student multi-select: `<Popover>` + `<Command>` if available, otherwise a simple checkbox list inside a popover.

- [ ] **Step 1: Implement**

```tsx
import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router';

type StudentOption = { id: string; name: string };

function toDateInputValue(s: string | null): string {
  if (!s) return '';
  return s; // already YYYY-MM-DD per the parser contract
}

export function FiltersBar({
  classId,
  view,
  studentOptions,
}: {
  classId: string;
  view: 'byAssignment' | 'byStudent';
  studentOptions: StudentOption[];
}) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams);
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
    navigate(`/app/my-classes/${classId}/released-grades?${next.toString()}`);
  }

  function toggleStudent(id: string) {
    const current = (searchParams.get('students') ?? '').split(',').filter(Boolean);
    const set = new Set(current);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    setParam('students', set.size === 0 ? null : Array.from(set).join(','));
  }

  function clearAll() {
    const next = new URLSearchParams();
    if (view === 'byStudent') next.set('view', 'byStudent');
    navigate(`/app/my-classes/${classId}/released-grades?${next.toString()}`);
  }

  const selectedStudents = (searchParams.get('students') ?? '').split(',').filter(Boolean);
  const hasFilters =
    searchParams.has('from') ||
    searchParams.has('to') ||
    selectedStudents.length > 0 ||
    searchParams.has('minGrade') ||
    searchParams.has('maxGrade');

  return (
    <div className="border-b py-3">
      <button
        className="text-sm underline"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        Filters {hasFilters ? '(active)' : ''}
      </button>
      {open ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col text-xs">
            <span className="mb-1 text-muted-foreground">Released from</span>
            <input
              type="date"
              value={toDateInputValue(searchParams.get('from'))}
              onChange={(e) => setParam('from', e.target.value || null)}
              className="rounded border px-2 py-1"
            />
          </label>
          <label className="flex flex-col text-xs">
            <span className="mb-1 text-muted-foreground">Released to</span>
            <input
              type="date"
              value={toDateInputValue(searchParams.get('to'))}
              onChange={(e) => setParam('to', e.target.value || null)}
              className="rounded border px-2 py-1"
            />
          </label>
          <label className="flex flex-col text-xs">
            <span className="mb-1 text-muted-foreground">Min grade</span>
            <input
              type="number"
              min={0}
              max={100}
              value={searchParams.get('minGrade') ?? ''}
              onChange={(e) => setParam('minGrade', e.target.value || null)}
              className="rounded border px-2 py-1"
            />
          </label>
          <label className="flex flex-col text-xs">
            <span className="mb-1 text-muted-foreground">Max grade</span>
            <input
              type="number"
              min={0}
              max={100}
              value={searchParams.get('maxGrade') ?? ''}
              onChange={(e) => setParam('maxGrade', e.target.value || null)}
              className="rounded border px-2 py-1"
            />
          </label>
          <fieldset className="col-span-full">
            <legend className="mb-1 text-xs text-muted-foreground">Students</legend>
            <div className="flex flex-wrap gap-2">
              {studentOptions.map((s) => {
                const checked = selectedStudents.includes(s.id);
                return (
                  <label
                    key={s.id}
                    className={`cursor-pointer rounded border px-2 py-1 text-xs ${checked ? 'bg-accent' : ''}`}
                  >
                    <input
                      type="checkbox"
                      className="mr-1"
                      checked={checked}
                      onChange={() => toggleStudent(s.id)}
                    />
                    {s.name}
                  </label>
                );
              })}
            </div>
          </fieldset>
          {hasFilters ? (
            <button className="text-xs underline" onClick={clearAll}>
              Clear all
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
bun run --cwd services/web-app typecheck
```

- [ ] **Step 3: Commit**

```bash
git add services/web-app/app/components/released-grades/FiltersBar.tsx
git commit -m "feat(released-grades): FiltersBar with URL-state filters"
```

---

## Task 12: Wire the route component (pivot toggle, expand-all, filters)

**Files:**
- Modify: `services/web-app/app/routes/app.my-classes.$classId.released-grades/route.tsx`

Replace the placeholder `<pre>` from Task 6 with the wired-up shell.

- [ ] **Step 1: Update the loader to also fetch student options**

The student options for the FiltersBar come from the class roster. Modify the loader to include `studentOptions: { id, name }[]`:

```typescript
// Add to loader, after `if (!klass) throw new Response('Class not found', { status: 404 });`:
const students = await prisma.studentProfile.findMany({
  where: { classes: { some: { id: classId } } },
  select: { id: true, firstName: true, lastName: true },
  orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
});
const studentOptions = students.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` }));
```

Then include `studentOptions` in both branches of the loader's return value.

Update the LoaderData type:

```typescript
type LoaderData =
  | { view: 'byAssignment'; piles: Pile[]; classId: string; className: string; studentOptions: { id: string; name: string }[] }
  | { view: 'byStudent'; studentPiles: StudentPile[]; classId: string; className: string; studentOptions: { id: string; name: string }[] };
```

- [ ] **Step 2: Update tests for the loader to include studentOptions**

In the route's test file, mock `prisma.studentProfile.findMany`:

```typescript
mock.module('~/db.server', () => ({
  prisma: {
    class: { findFirst: mock(() => Promise.resolve(null)) },
    studentProfile: { findMany: mock(() => Promise.resolve([])) },
  },
}));
```

Update the existing assertions to expect `studentOptions: []` in the returned data.

Run:

```bash
bun test services/web-app/app/routes/app.my-classes.$classId.released-grades/route.test.ts
```

Expected: PASS.

- [ ] **Step 3: Replace the component body with the wired shell**

```tsx
import { useEffect, useState } from 'react';
import { useLoaderData, useNavigate, useSearchParams } from 'react-router';
import { FiltersBar } from '~/components/released-grades/FiltersBar';
import { PileAccordion } from '~/components/released-grades/PileAccordion';
import { StudentAccordion } from '~/components/released-grades/StudentAccordion';

const EXPAND_ALL_KEY = 'releasedGrades.expandAll';

export default function ReleasedGradesRoute() {
  const data = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [expandAll, setExpandAll] = useState(false);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(EXPAND_ALL_KEY) : null;
    if (stored === '1') setExpandAll(true);
  }, []);

  function toggleExpandAll() {
    setExpandAll((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') window.localStorage.setItem(EXPAND_ALL_KEY, next ? '1' : '0');
      return next;
    });
  }

  function setView(view: 'byAssignment' | 'byStudent') {
    const next = new URLSearchParams(searchParams);
    if (view === 'byStudent') next.set('view', 'byStudent');
    else next.delete('view');
    navigate(`/app/my-classes/${data.classId}/released-grades?${next.toString()}`);
  }

  // Build a filter-only query string for child fetchers (drop `view`).
  const filterQuery = (() => {
    const next = new URLSearchParams(searchParams);
    next.delete('view');
    return next.toString();
  })();

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Released grades — {data.className}</h1>
        <div className="flex items-center gap-3">
          <div role="tablist" className="rounded border text-sm">
            <button
              role="tab"
              aria-selected={data.view === 'byAssignment'}
              className={`px-3 py-1 ${data.view === 'byAssignment' ? 'bg-accent' : ''}`}
              onClick={() => setView('byAssignment')}
            >
              By assignment
            </button>
            <button
              role="tab"
              aria-selected={data.view === 'byStudent'}
              className={`px-3 py-1 ${data.view === 'byStudent' ? 'bg-accent' : ''}`}
              onClick={() => setView('byStudent')}
            >
              By student
            </button>
          </div>
          <button className="text-sm underline" onClick={toggleExpandAll}>
            {expandAll ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
      </div>
      <FiltersBar classId={data.classId} view={data.view} studentOptions={data.studentOptions} />
      <div className="mt-4">
        {data.view === 'byAssignment' ? (
          <PileAccordion classId={data.classId} piles={data.piles} filterQuery={filterQuery} expandAll={expandAll} />
        ) : (
          <StudentAccordion classId={data.classId} studentPiles={data.studentPiles} filterQuery={filterQuery} expandAll={expandAll} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
bun run --cwd services/web-app typecheck
```

- [ ] **Step 5: Run all unit tests added so far**

```bash
bun test services/web-app/app/services/released-grades.server.test.ts services/web-app/app/services/released-grades.url-filters.test.ts services/web-app/app/routes/app.my-classes.$classId.released-grades/route.test.ts services/web-app/app/utils/feature-flags.server.test.ts
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add services/web-app/app/routes/app.my-classes.$classId.released-grades/route.tsx services/web-app/app/routes/app.my-classes.$classId.released-grades/route.test.ts
git commit -m "feat(released-grades): wire route component (pivot toggle, expand-all, filters)"
```

---

## Task 13: Add nav entry from the existing class view

**Files:**
- Modify: `services/web-app/app/routes/app.my-classes.$classId/route.tsx`

Add a "Released grades" link in the existing class view, gated by the same feature flag. Old code paths stay intact.

- [ ] **Step 1: Read the existing route's loader to find where to inject the flag check**

```bash
sed -n '1,80p' services/web-app/app/routes/app.my-classes.$classId/route.tsx
```

- [ ] **Step 2: In the loader, add the flag check + return**

After fetching `klass`, add:

```typescript
import { isReleasedGradesOrganizationEnabledForOrganization } from '~/utils/feature-flags.server';

// ...inside loader, after klass is fetched:
const releasedGradesEnabled = await isReleasedGradesOrganizationEnabledForOrganization(
  klass.school.organizationId,
);
```

Include `releasedGradesEnabled` in the loader's return object.

> NOTE: The exact name of the class loader's return field will depend on the existing structure — read the existing return value and add this field next to it. Don't reshape unrelated returns.

- [ ] **Step 3: In the component, conditionally render a link**

Find a sensible place in the existing component (top of the page, next to the existing tabs) and add:

```tsx
{releasedGradesEnabled ? (
  <a
    href={`/app/my-classes/${classId}/released-grades`}
    className="ml-3 text-sm underline"
  >
    Released grades →
  </a>
) : null}
```

- [ ] **Step 4: Typecheck**

```bash
bun run --cwd services/web-app typecheck
```

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/app.my-classes.$classId/route.tsx
git commit -m "feat(released-grades): nav entry from class view (flag-gated)"
```

---

## Task 14: E2E test — Playwright walkthrough

**Files:**
- Create: `services/web-app/e2e/tests/teacher.released-grades.spec.ts`

The test seeds a teacher with a class containing released submissions across two AssignmentTypes, walks through the new view, applies a filter, expands a pile, and verifies a submission link.

- [ ] **Step 1: Read an existing E2E test for the seed/auth pattern**

```bash
sed -n '1,100p' services/web-app/e2e/tests/teacher.grading-flow.spec.ts
```

- [ ] **Step 2: Implement the test**

Mirror the auth/seed helpers used by `teacher.grading-flow.spec.ts`. Skeleton:

```typescript
import { expect, test } from '@playwright/test';
import { signInAsTeacher, seedClassWithReleasedGrades } from './helpers/seed';

test.describe('Released grades — by-assignment view', () => {
  test('teacher sees collapsed piles, expands one, opens a submission', async ({ page }) => {
    const { teacher, classId } = await seedClassWithReleasedGrades({
      assignmentTypes: ['Macbeth Essay', 'Persuasive Essay'],
      submissionsPerType: 5,
    });

    await signInAsTeacher(page, teacher);
    await page.goto(`/app/my-classes/${classId}/released-grades`);

    await expect(page.getByRole('heading', { name: /Released grades/ })).toBeVisible();
    await expect(page.getByText('Macbeth Essay')).toBeVisible();
    await expect(page.getByText('Persuasive Essay')).toBeVisible();
    await expect(page.getByText('5 submissions', { exact: false })).toHaveCount(2);

    // Expand the Macbeth pile
    await page.getByRole('button', { name: /Macbeth Essay/ }).click();
    await expect(page.getByRole('link', { name: /Lopez|Patel|Brock/ }).first()).toBeVisible();
  });

  test('filters narrow the pile list and update URL', async ({ page }) => {
    const { teacher, classId } = await seedClassWithReleasedGrades({
      assignmentTypes: ['Macbeth Essay', 'Persuasive Essay'],
      submissionsPerType: 5,
    });
    await signInAsTeacher(page, teacher);
    await page.goto(`/app/my-classes/${classId}/released-grades`);

    await page.getByRole('button', { name: /Filters/ }).click();
    await page.getByLabel('Min grade').fill('200');
    await expect(page.getByText(/No released grades match/)).toBeVisible();
    await expect(page).toHaveURL(/minGrade=200/);
  });

  test('by-student pivot shows students with at least one released submission', async ({ page }) => {
    const { teacher, classId } = await seedClassWithReleasedGrades({
      assignmentTypes: ['Macbeth Essay'],
      submissionsPerType: 3,
    });
    await signInAsTeacher(page, teacher);
    await page.goto(`/app/my-classes/${classId}/released-grades?view=byStudent`);
    await expect(page.getByRole('button', { name: /Lopez|Patel|Brock/ }).first()).toBeVisible();
  });
});
```

> NOTE: `signInAsTeacher` and `seedClassWithReleasedGrades` may not exist as helpers — if not, either reuse helpers from `teacher.grading-flow.spec.ts` or seed inline using the existing `seed-overlay.ts` patterns. Adjust to whatever the codebase actually exposes.

- [ ] **Step 3: Run the new E2E in headed mode locally to verify**

```bash
bun run --cwd services/web-app e2e:run -- e2e/tests/teacher.released-grades.spec.ts
```

(Adjust to the actual e2e command; check `package.json` for the script name.)

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add services/web-app/e2e/tests/teacher.released-grades.spec.ts
git commit -m "test(e2e): teacher released-grades view walkthrough"
```

---

## Task 15: Push branch and open PR

**Files:**
- (none — git operations)

- [ ] **Step 1: Push the branch**

```bash
git push -u origin released-grades-organization
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --repo The-Connell-School/yawp-2.0 --base assignments-unification --head released-grades-organization \
  --title "Released grades organization: collapsed-pile accordion view (flag-gated)" \
  --body "$(cat <<'EOF'
## Summary

Implements the [Released grades organization](https://github.com/The-Connell-School/yawp-pm/blob/main/features/released-grades-organization.md) spec. Adds a new nested route at \`/app/my-classes/:classId/released-grades\` that replaces the flat oldest-first list with:

- Collapsed-by-default accordions grouped by AssignmentType (with auto-expand for single-pile case)
- A "By student" pivot toggle (state in URL via \`?view=byStudent\`)
- URL-state filters: date range, student multi-select, grade range
- Lazy-loaded pile contents on expand (50 at a time, "Show more")
- \`localStorage\`-persisted "Expand all" preference per browser

Gated behind feature flag \`released_grades_organization_enabled_org_ids\`. The existing class view exposes a "Released grades →" link only when the flag is on for the class's org.

## Test plan

- [x] Unit: pile loaders, by-student pivot, URL filter parser, route loader (404, redirect, both pivots)
- [x] E2E: by-assignment walkthrough, filter narrowing, by-student pivot
- [ ] Manual: seed pilot org's flag value to org id and walk a real teacher account
- [ ] Manual: at UA scale (150+ students × 5 assignments) verify pile expansion latency

## Rollout

Flag default OFF. Pilot order: UA → Washington → Birmingham City → broader.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Confirm PR URL is returned and CI is green**

Capture the PR URL printed by `gh pr create`. Watch the CI run via `gh pr checks <number> --repo The-Connell-School/yawp-2.0` until all pass. Fix anything red before handing back.

---

## Self-review notes (one-time, post-write)

- ✅ Spec coverage: layout, sort, filters, pivot, daily-pages-agnostic, edge cases — each maps to a task or is explicitly out-of-scope.
- ✅ No placeholders inside steps; every step has the actual code, command, or assertion.
- ✅ Type consistency: `Pile`, `StudentPile`, `PileSubmissionRow` defined once; later tasks import them.
- ✅ Schema: `Submission.releasedAt` confirmed already present (research output) — no migration in scope.
- ⚠️ Two confirm-at-impl-time notes:
  - Whether `Submission` has a direct `assignmentTypeId` (Task 2). If not, swap `groupBy` for a two-stage fetch.
  - Exact import path for `redirect` from React Router 7 (Task 6). Adjacent route is the source of truth.
