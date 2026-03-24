# Save Log Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Save Log" tab to the document history sheet that surfaces `DocumentWriteJournal` records with preview and restore capability.

**Architecture:** Extend the existing versions API with a `mode=journal` branch, add a third tab to the `DocumentVersions` component with badge-annotated entries, and add a journal-entry fallback to the restore endpoint.

**Tech Stack:** React Router, Prisma, Bun test runner, Playwright (e2e), shadcn Badge component

**Spec:** `docs/superpowers/specs/2026-03-24-save-log-tab-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `services/web-app/app/routes/api.model.document.$id.versions/route.ts` | Add `mode=journal` query branch |
| Create | `services/web-app/app/routes/api.model.document.$id.versions/route.test.ts` | Unit test for journal mode |
| Modify | `services/web-app/app/routes/api.domain.restore-document-version/route.ts` | Add journal entry fallback lookup |
| Modify | `services/web-app/app/routes/api.domain.restore-document-version/route.test.ts` | Add journal restore tests |
| Create | `services/web-app/e2e/tests/student.document-save-log.spec.ts` | E2E test for Save Log tab |
| Modify | `services/web-app/app/routes/app_.documents_.$id/_components/document-versions.tsx` | Add Save Log tab, badges, fix stale closure |

---

### Task 1: Add journal restore unit tests and implementation to restore endpoint

**Files:**
- Test: `services/web-app/app/routes/api.domain.restore-document-version/route.test.ts`
- Modify: `services/web-app/app/routes/api.domain.restore-document-version/route.ts`

- [ ] **Step 1: Add `findFirst` mock for `documentWriteJournal` in test setup**

In the `prisma` mock object at the top of the test file, add `findFirst` to `documentWriteJournal`:

```typescript
documentWriteJournal: {
  findFirst: mock(),
  create: mock(),
  update: mock(),
},
```

In the `beforeEach`, add the reset:

```typescript
prisma.documentWriteJournal.findFirst.mockReset();
```

And set default to return null (so existing tests still pass):

```typescript
prisma.documentWriteJournal.findFirst.mockResolvedValue(null);
```

- [ ] **Step 2: Write failing tests — restore from journal entry, not-found, and backup**

Add these tests inside the existing `describe` block:

```typescript
test('restores from a journal entry when no version or snapshot matches', async () => {
  prisma.documentVersion.findFirst.mockResolvedValue(null);
  prisma.documentSnapshot.findFirst.mockResolvedValue(null);
  prisma.documentWriteJournal.findFirst.mockResolvedValue({
    id: 'journal-entry-1',
    documentId: 'doc-1',
    html: '<p>Journal content</p>',
    text: 'Journal content',
    document: {
      id: 'doc-1',
      title: 'Essay',
      html: '<p>Current draft</p>',
      text: 'Current draft',
      revision: 5,
    },
  });

  const form = new FormData();
  form.append('versionId', 'journal-entry-1');

  const response = (await action({
    request: new Request(
      'https://example.com/api/domain/restore-document-version',
      { method: 'POST', body: form }
    ),
  } as any)) as { data: { doc: { id: string; revision: number } } };

  expect(response.data.doc).toMatchObject({ id: 'doc-1', revision: 9 });
  expect(prisma.document.update).toHaveBeenCalledWith({
    where: { id: 'doc-1' },
    data: {
      html: '<p>Journal content</p>',
      text: 'Journal content',
      revision: { increment: 1 },
    },
  });
  // Verify pre-restore backup was created
  expect(prisma.documentVersion.create).toHaveBeenCalledWith({
    data: {
      documentId: 'doc-1',
      html: '<p>Current draft</p>',
      text: 'Current draft',
    },
  });
  // Verify journal metadata uses 'journal' type
  expect(prisma.documentWriteJournal.create.mock.calls[0]?.[0]).toMatchObject({
    data: {
      eventType: 'document.restore',
      metadata: expect.objectContaining({
        restoredFromType: 'journal',
      }),
    },
  });
});

test('returns error when no version, snapshot, or journal entry matches', async () => {
  prisma.documentVersion.findFirst.mockResolvedValue(null);
  prisma.documentSnapshot.findFirst.mockResolvedValue(null);
  prisma.documentWriteJournal.findFirst.mockResolvedValue(null);

  const form = new FormData();
  form.append('versionId', 'nonexistent-id');

  const response = await action({
    request: new Request(
      'https://example.com/api/domain/restore-document-version',
      { method: 'POST', body: form }
    ),
  } as any);

  expect(response.status).toBe(302);
  const body = await response.json();
  expect(body.payload).toMatchObject({
    description: 'Document version not found.',
    type: 'error',
  });
});

test('creates pre-restore DocumentVersion backup before restoring from journal', async () => {
  prisma.documentVersion.findFirst.mockResolvedValue(null);
  prisma.documentSnapshot.findFirst.mockResolvedValue(null);
  prisma.documentWriteJournal.findFirst.mockResolvedValue({
    id: 'journal-entry-2',
    documentId: 'doc-1',
    html: '<p>Journal v2</p>',
    text: 'Journal v2',
    document: {
      id: 'doc-1',
      title: 'Essay',
      html: '<p>Before restore</p>',
      text: 'Before restore',
      revision: 3,
    },
  });

  const form = new FormData();
  form.append('versionId', 'journal-entry-2');

  await action({
    request: new Request(
      'https://example.com/api/domain/restore-document-version',
      { method: 'POST', body: form }
    ),
  } as any);

  // Pre-restore backup captures the document's CURRENT content, not the journal's
  expect(prisma.documentVersion.create).toHaveBeenCalledWith({
    data: {
      documentId: 'doc-1',
      html: '<p>Before restore</p>',
      text: 'Before restore',
    },
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd services/web-app && bun test app/routes/api.domain.restore-document-version/route.test.ts`

Expected: FAIL — the restore endpoint currently redirects with error when no version/snapshot found.

- [ ] **Step 4: Implement journal fallback in restore endpoint**

In `services/web-app/app/routes/api.domain.restore-document-version/route.ts`, make these changes:

After the `snapshot` lookup (around line 32), add the journal fallback:

```typescript
const journalEntry =
  version || snapshot
    ? null
    : await prisma.documentWriteJournal.findFirst({
        where: { id: data.versionId, document: { profile: { userId } } },
        include: { document: true },
      });
```

Update the guard clause (replace `if (!version && !snapshot)`):

```typescript
if (!version && !snapshot && !journalEntry) {
  return redirectWithToast('/app', {
    description: 'Document version not found.',
    type: 'error',
  });
}
```

Update the `sourceRecord` assignment:

```typescript
const sourceRecord = version ?? snapshot ?? journalEntry;
```

Update the pre-restore backup condition (replace the existing `if` block around line 72-84):

```typescript
if (
  sourceRecord &&
  sourceRecord.document.html &&
  sourceRecord.document.text
) {
  await prisma.documentVersion.create({
    data: {
      documentId: sourceRecord!.documentId,
      html: sourceRecord!.document.html,
      text: sourceRecord!.document.text,
    },
  });
}
```

Update the `restoredFromType` in the journal create metadata (around line 65):

```typescript
metadata: {
  method: request.method,
  restoredFromId: data.versionId,
  restoredFromType: version ? 'version' : snapshot ? 'snapshot' : 'journal',
},
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd services/web-app && bun test app/routes/api.domain.restore-document-version/route.test.ts`

Expected: ALL tests PASS (both existing and new).

- [ ] **Step 6: Commit**

```bash
git add services/web-app/app/routes/api.domain.restore-document-version/route.ts services/web-app/app/routes/api.domain.restore-document-version/route.test.ts
git commit -m "feat: support restoring from DocumentWriteJournal entries"
```

---

### Task 2: Add `mode=journal` to versions API

**Files:**
- Modify: `services/web-app/app/routes/api.model.document.$id.versions/route.ts`
- Create: `services/web-app/app/routes/api.model.document.$id.versions/route.test.ts`

- [ ] **Step 1: Write failing unit test for journal mode**

Create `services/web-app/app/routes/api.model.document.$id.versions/route.test.ts`:

```typescript
import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  documentSnapshot: { findMany: mock() },
  documentVersion: { findMany: mock() },
  documentWriteJournal: { findMany: mock() },
};

const requireUserId = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId }));
mock.module('~/utils/audit.server', () => ({
  auditLoader: (handler: any) => handler,
}));

const { loader } = await import('./route');

describe('api.model.document.$id.versions', () => {
  beforeEach(() => {
    prisma.documentSnapshot.findMany.mockReset();
    prisma.documentVersion.findMany.mockReset();
    prisma.documentWriteJournal.findMany.mockReset();
    requireUserId.mockReset();
    requireUserId.mockResolvedValue('user-1');
  });

  test('returns journal entries when mode=journal', async () => {
    const journalEntries = [
      {
        id: 'j1',
        createdAt: new Date(),
        eventType: 'document.save',
        status: 'accepted',
        failureReason: null,
        title: 'My Essay',
        html: '<p>Content</p>',
        text: 'Content',
      },
    ];
    prisma.documentWriteJournal.findMany.mockResolvedValue(journalEntries);

    const response = await loader({
      request: new Request(
        'https://example.com/api/model/document/doc-1/versions?mode=journal&page=1&limit=5'
      ),
      params: { id: 'doc-1' },
    } as any);

    const data = await response.json();
    expect(data).toHaveLength(1);
    expect(data[0].eventType).toBe('document.save');
    expect(prisma.documentWriteJournal.findMany).toHaveBeenCalledWith({
      where: { documentId: 'doc-1' },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 5,
      select: {
        id: true,
        createdAt: true,
        eventType: true,
        status: true,
        failureReason: true,
        title: true,
        html: true,
        text: true,
      },
    });
    // Verify other models were NOT queried
    expect(prisma.documentSnapshot.findMany).not.toHaveBeenCalled();
    expect(prisma.documentVersion.findMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/web-app && bun test app/routes/api.model.document.\$id.versions/route.test.ts`

Expected: FAIL — the loader currently only handles `snapshots` and `versions` modes.

- [ ] **Step 3: Add journal branch to the loader**

The existing loader uses a ternary `mode === 'snapshots' ? ... : ...`. Replace with an if/else chain:

```typescript
let versions;

if (mode === 'snapshots') {
  versions = await prisma.documentSnapshot.findMany({
    where: { documentId: params.id },
    orderBy: { createdAt: 'desc' },
    skip,
    take: limit,
  });
} else if (mode === 'journal') {
  versions = await prisma.documentWriteJournal.findMany({
    where: { documentId: params.id },
    orderBy: { createdAt: 'desc' },
    skip,
    take: limit,
    select: {
      id: true,
      createdAt: true,
      eventType: true,
      status: true,
      failureReason: true,
      title: true,
      html: true,
      text: true,
    },
  });
} else {
  versions = await prisma.documentVersion.findMany({
    where: { documentId: params.id },
    orderBy: { createdAt: 'desc' },
    skip,
    take: limit,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd services/web-app && bun test app/routes/api.model.document.\$id.versions/route.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/api.model.document.\$id.versions/route.ts services/web-app/app/routes/api.model.document.\$id.versions/route.test.ts
git commit -m "feat: add mode=journal to document versions API"
```

---

### Task 3: Write failing e2e test for Save Log tab

**Files:**
- Create: `services/web-app/e2e/tests/student.document-save-log.spec.ts`

Per AGENTS.md: "If it's a ui change or flow, add the e2e first and then write the correct e2e tests before implementing the change."

- [ ] **Step 1: Check existing e2e test setup and patterns**

Read `services/web-app/e2e/test-setup.ts` and an existing spec like `student.document-submission-flow.spec.ts` to understand fixtures, login helpers, and database seeding patterns used in this project.

- [ ] **Step 2: Write e2e test**

Create `services/web-app/e2e/tests/student.document-save-log.spec.ts` following the project's existing e2e patterns. The test should:

1. Sign in as a student
2. Navigate to a document
3. Type content to trigger autosaves (which create journal entries)
4. Open the history sheet (click the HistoryIcon)
5. Click the "Save Log" tab
6. Verify that journal entries appear with event type and status badges
7. Click an entry to verify the preview panel shows HTML content
8. Click "Restore and Reload" and verify the document content is restored
9. Test pagination: create >5 journal entries, verify "Load More" loads additional entries

Adapt the exact fixture setup and selectors based on patterns found in step 1. The key assertions are:
- The "Save Log" button is visible and clickable
- Journal entries appear with badges
- Preview shows HTML content
- Restore works end-to-end
- Pagination loads more entries

- [ ] **Step 3: Run e2e test to verify it fails**

Run: `cd services/web-app && npx playwright test e2e/tests/student.document-save-log.spec.ts`

Expected: FAIL — the "Save Log" button does not exist yet.

- [ ] **Step 4: Commit**

```bash
git add services/web-app/e2e/tests/student.document-save-log.spec.ts
git commit -m "test: add failing e2e test for Save Log tab"
```

---

### Task 4: Implement Save Log tab in DocumentVersions component

**Files:**
- Modify: `services/web-app/app/routes/app_.documents_.$id/_components/document-versions.tsx`

- [ ] **Step 1: Update types and imports**

Add `Badge` import at the top:

```typescript
import { Badge } from '~/components/ui/badge';
```

Update the `VersionLike` type to accommodate journal fields:

```typescript
type VersionLike = (DocumentVersion | DocumentSnapshot) & {
  createdAt: string;
  eventType?: string;
  status?: string;
  failureReason?: string | null;
  title?: string;
};
```

Update the `mode` state type:

```typescript
const [mode, setMode] = useState<'versions' | 'snapshots' | 'journal'>('snapshots');
```

- [ ] **Step 2: Fix stale closure in mode-switch buttons**

Replace both mode-switch button `onClick` handlers. Instead of calling `setMode` + manually resetting state + calling `loadVersions`, just call `setMode`. The existing `useEffect` on `[open, mode]` already handles the reload.

Snapshots button:

```typescript
<Button
  variant={mode === 'snapshots' ? 'default' : 'outline'}
  size="sm"
  onClick={() => setMode('snapshots')}
>
  Snapshots
</Button>
```

Autosaves button:

```typescript
<Button
  variant={mode === 'versions' ? 'default' : 'outline'}
  size="sm"
  onClick={() => setMode('versions')}
>
  Autosaves
</Button>
```

- [ ] **Step 3: Add Save Log button**

Add a third button after the Autosaves button:

```typescript
<Button
  variant={mode === 'journal' ? 'default' : 'outline'}
  size="sm"
  onClick={() => setMode('journal')}
>
  Save Log
</Button>
```

- [ ] **Step 4: Add event type display mapping helper**

Add this mapping above the component:

```typescript
const EVENT_TYPE_LABELS: Record<string, string> = {
  'document.save': 'Save',
  'document.title_update': 'Title Update',
  'document.restore': 'Restore',
  'document.submit': 'Submit',
};

const STATUS_VARIANTS: Record<string, 'success' | 'destructive' | 'info-outlined'> = {
  accepted: 'success',
  rejected: 'destructive',
  pending: 'info-outlined',
};
```

- [ ] **Step 5: Update list item rendering for journal entries**

Replace the content inside the `allVersions.map` callback to show badges for journal entries:

```typescript
{allVersions.map((v) => (
  <div key={v.id} className="flex">
    <button
      onClick={() => setVersion(v)}
      className={cn(
        'h-fit grow rounded px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/70 sm:text-base',
        {
          'bg-muted text-foreground hover:bg-muted':
            v.id === version?.id,
        }
      )}
    >
      <div>{new Date(v.createdAt).toLocaleString()}</div>
      {mode === 'journal' && v.eventType && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Badge variant="secondary" size="sm">
            {EVENT_TYPE_LABELS[v.eventType] ?? v.eventType}
          </Badge>
          {v.status && (
            <Badge
              variant={STATUS_VARIANTS[v.status] ?? 'outline'}
              size="sm"
            >
              {v.status}
            </Badge>
          )}
        </div>
      )}
      {mode === 'journal' &&
        v.eventType === 'document.title_update' &&
        v.title && (
          <div className="mt-1 truncate text-xs text-muted-foreground">
            Title: {v.title}
          </div>
        )}
      {mode === 'journal' && v.failureReason && (
        <div className="mt-1 text-xs text-destructive">
          {v.failureReason}
        </div>
      )}
    </button>
  </div>
))}
```

- [ ] **Step 6: Run typecheck**

Run: `cd services/web-app && bun run typecheck`

Expected: No type errors.

- [ ] **Step 7: Run e2e test to verify it passes**

Run: `cd services/web-app && npx playwright test e2e/tests/student.document-save-log.spec.ts`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add services/web-app/app/routes/app_.documents_.$id/_components/document-versions.tsx
git commit -m "feat: add Save Log tab to document history sheet"
```
