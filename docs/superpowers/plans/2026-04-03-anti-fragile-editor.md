# Anti-Fragile Document Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make document data loss structurally impossible by enforcing a one-directional data flow (editor -> IDB -> server) and preventing any server/React state from overwriting local content during an active session.

**Architecture:** Content flows DOWN only (ProseMirror -> IndexedDB -> Postgres). IndexedDB writes are version-gated so stale data is rejected regardless of source. Page load hydrates from the freshest source (IDB or server). All non-document interactions (tutor, comments) use plain fetch() instead of Remix fetchers, eliminating loader revalidation. Document submission flushes editor content to server before reading from DB.

**Tech Stack:** React Router v7 (Remix), TipTap/ProseMirror, IndexedDB via `idb`, Prisma, TypeScript, Playwright E2E

**Branch:** `anti-fragile-editor` (off `preview/local-first`)
**Repo:** ~/brocksoftware/yawp-2.0/

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `app/utils/document-store.ts` | Modify | Add version-gated writes |
| `app/utils/sync-service.ts` | Modify (minor) | No structural changes needed |
| `app/routes/app_.documents_.$id/route.tsx` | Modify | Add shouldRevalidate, IDB hydration, pass content to submit |
| `app/routes/app_.documents_.$id/editor/index.tsx` | Modify | Version counter on IDB writes, hydration-aware init |
| `app/routes/app_.documents_.$id/tutor/index.tsx` | Modify | Replace fetcher.submit with plain fetch |
| `app/routes/app_.documents_.$id/editor/bar.tsx` | Modify | Replace comment fetcher.submit with plain fetch |
| `app/routes/app_.documents_.$id/editor/comment.tsx` | Modify | Replace comment-response fetcher.submit with plain fetch |
| `app/routes/api.domain.submit-document/route.ts` | Modify | Accept html/text from request body instead of reading DB |
| `app/routes/api.document.$id.save/route.ts` | Modify (bugfix) | Fix revision creation to use new content |
| `e2e/tests/document-regression.spec.ts` | Create | E2E regression tests for data loss scenarios |

All paths relative to `services/web-app/`.

---

### Task 1: Version-Gate IndexedDB Writes

The foundation. Every IDB write gets a monotonically increasing version. Writes with a lower version than what's already stored are silently rejected. This makes it structurally impossible for stale data to overwrite fresh data, regardless of the source.

**Files:**
- Modify: `app/utils/document-store.ts`
- Modify: `app/routes/app_.documents_.$id/editor/index.tsx:546-562`

- [ ] **Step 1: Add `localVersion` to DocumentStoreEntry type**

In `app/utils/document-store.ts`, add `localVersion` to the type:

```typescript
// lines 7-17, add localVersion
export type DocumentStoreEntry = {
  docId: string;
  html: string;
  text: string;
  updatedAt: number;
  localVersion: number; // monotonically increasing, prevents stale overwrites
  serverRevision: number;
  syncStatus: 'synced' | 'pending' | 'failed';
  lastSyncedAt: number | null;
  lastSyncError: string | null;
  contentHash: string;
};
```

- [ ] **Step 2: Add version-gated put() method**

Replace the `put()` method in `app/utils/document-store.ts` (lines 50-57):

```typescript
async put(entry: DocumentStoreEntry): Promise<void> {
  if (this._useMemory()) {
    const existing = this._mem().get(entry.docId);
    if (existing && existing.localVersion >= entry.localVersion) {
      return; // reject stale write
    }
    this._mem().set(entry.docId, { ...entry });
    return;
  }
  const db = await this._getDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const existing = await store.get(entry.docId);
  if (existing && existing.localVersion >= entry.localVersion) {
    return; // reject stale write
  }
  await store.put(entry);
  await tx.done;
}
```

- [ ] **Step 3: Add version counter to editor update handler**

In `app/routes/app_.documents_.$id/editor/index.tsx`, add a version counter ref and use it in the update handler. Near line 248 (with the other refs):

```typescript
const localVersionRef = useRef(Date.now());
```

Then update the `editor.on('update')` handler (lines 546-562):

```typescript
editor.on('update', async ({ editor: e }) => {
  const html = e.getHTML();
  const text = e.getText();
  const hash = await contentHash(html, text);
  localVersionRef.current += 1;
  await documentStore.put({
    docId,
    html,
    text,
    updatedAt: Date.now(),
    localVersion: localVersionRef.current,
    serverRevision: currentRevisionRef.current,
    syncStatus: 'pending',
    lastSyncedAt: null,
    lastSyncError: null,
    contentHash: hash,
  });
  syncServiceRef.current?.scheduleSave();
});
```

- [ ] **Step 4: Update markSynced and markFailed to preserve localVersion**

In `app/utils/document-store.ts`, update `markSynced()` (lines 68-82) to preserve localVersion:

```typescript
async markSynced(
  docId: string,
  serverRevision: number,
  contentHash: string
): Promise<void> {
  const entry = await this.get(docId);
  if (!entry) return;
  await this._rawPut({
    ...entry,
    serverRevision,
    syncStatus: 'synced',
    lastSyncedAt: Date.now(),
    lastSyncError: null,
    contentHash,
  });
}
```

Add a `_rawPut()` that bypasses version gating (for internal updates that don't change content):

```typescript
private async _rawPut(entry: DocumentStoreEntry): Promise<void> {
  if (this._useMemory()) {
    this._mem().set(entry.docId, { ...entry });
    return;
  }
  const db = await this._getDb();
  await db.put(STORE_NAME, entry);
}
```

Similarly update `markFailed()` (lines 84-92) to use `_rawPut()`.

- [ ] **Step 5: Run tests**

Run: `cd services/web-app && bun test`
Expected: All existing tests pass (no tests directly cover document-store yet).

- [ ] **Step 6: Commit**

```bash
git add app/utils/document-store.ts app/routes/app_.documents_.\$id/editor/index.tsx
git commit -m "feat: version-gate IndexedDB writes to prevent stale overwrites"
```

---

### Task 2: IDB-Aware Hydration on Page Load

When the document page loads, compare IndexedDB content (if any) with server content. Use whichever is newer. This handles: tab close before sync, browser crash, network failure during save.

**Files:**
- Modify: `app/routes/app_.documents_.$id/route.tsx:441-452`
- Modify: `app/routes/app_.documents_.$id/editor/index.tsx:262-267`

- [ ] **Step 1: Add IDB hydration check in the route component**

In `app/routes/app_.documents_.$id/route.tsx`, replace the `initialEditorContent` useMemo (lines 441-452) and add IDB hydration state:

```typescript
// After line 440, replace the existing initialEditorContent block:

const [hydratedContent, setHydratedContent] = useState<{
  html: string;
  text: string;
  source: 'server' | 'local';
} | null>(null);

// Server content (always available from loader)
const serverHtml = isTeacherSnapshotView && activeSnapshot?.html
  ? activeSnapshot.html
  : data.doc.html;
const serverText = (isTeacherSnapshotView ? activeSnapshot?.text : data.doc.text) ?? '';

// Check IDB on mount for fresher content
useEffect(() => {
  // Only check IDB for student editing (not teacher snapshot view)
  if (isTeacherSnapshotView) {
    setHydratedContent({ html: serverHtml ?? '', text: serverText, source: 'server' });
    return;
  }

  documentStore.get(data.doc.id).then((entry) => {
    if (entry && entry.updatedAt > new Date(data.doc.updatedAt).getTime()) {
      // IDB is newer — use local content
      setHydratedContent({ html: entry.html, text: entry.text, source: 'local' });
      // Schedule a background sync to push local content to server
      // (SyncService will handle this when editor mounts)
    } else {
      // Server is newer or IDB empty — use server content
      setHydratedContent({ html: serverHtml ?? '', text: serverText, source: 'server' });
    }
  }).catch(() => {
    // IDB error — fall back to server
    setHydratedContent({ html: serverHtml ?? '', text: serverText, source: 'server' });
  });
}, []); // Only on mount

const initialEditorContent = useMemo(
  () => hydratedContent ?? { html: serverHtml ?? '', text: serverText, source: 'server' as const },
  [hydratedContent, serverHtml, serverText]
);
```

Add the import at the top of the file:

```typescript
import { documentStore } from '~/utils/document-store';
```

- [ ] **Step 2: Seed IDB on first load from server**

In `app/routes/app_.documents_.$id/editor/index.tsx`, after the editor initializes (around the SyncService setup, line 611), seed IDB if it's empty:

```typescript
// Inside the SyncService useEffect, after syncService.start(docId):
// Seed IDB from server if empty (first visit to this document)
documentStore.get(docId).then(async (entry) => {
  if (!entry && docHtml) {
    const hash = await contentHash(docHtml, '');
    await documentStore.put({
      docId,
      html: docHtml,
      text: '',
      updatedAt: Date.now(),
      localVersion: localVersionRef.current,
      serverRevision: initialRevision,
      syncStatus: 'synced',
      lastSyncedAt: Date.now(),
      lastSyncError: null,
      contentHash: hash,
    });
  }
});
```

- [ ] **Step 3: Run tests**

Run: `cd services/web-app && bun test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app/routes/app_.documents_.\$id/route.tsx app/routes/app_.documents_.\$id/editor/index.tsx
git commit -m "feat: hydrate editor from IDB when local content is newer than server"
```

---

### Task 3: Block All Loader Revalidation on Document Page

Add `shouldRevalidate` that returns `false` for all fetcher submissions. This is belt-and-suspenders — the version-gated IDB already prevents stale writes, but this eliminates unnecessary server round-trips and the entire class of revalidation race conditions.

**Files:**
- Modify: `app/routes/app_.documents_.$id/route.tsx`

- [ ] **Step 1: Add shouldRevalidate export**

In `app/routes/app_.documents_.$id/route.tsx`, add after the loader export (after line 399):

```typescript
import type { ShouldRevalidateFunctionArgs } from 'react-router';

export function shouldRevalidate(_args: ShouldRevalidateFunctionArgs) {
  // Never revalidate the document page loader from fetcher submissions.
  // The editor owns document state client-side. Server state flows
  // through explicit fetch() calls, not loader revalidation.
  // This prevents stale DB content from interfering with editor state.
  return false;
}
```

- [ ] **Step 2: Verify tutor/comments still work**

This blocks loader revalidation, which means any component relying on `useLoaderData()` refreshing won't get updates. Tasks 4 and 5 convert those to local state. For now, verify the page still renders:

Run: `cd services/web-app && bun test`
Expected: PASS

Note: Tutor messages and comments may appear stale until Task 4 is complete. This is expected — the shouldRevalidate and the fetcher->fetch conversion are a pair.

- [ ] **Step 3: Commit**

```bash
git add app/routes/app_.documents_.\$id/route.tsx
git commit -m "feat: block all loader revalidation on document editor page"
```

---

### Task 4: Convert Tutor and Comments to Plain Fetch

Replace all `fetcher.submit()` calls on the document page with plain `fetch()` + local React state updates. This eliminates the revalidation trigger at the source. Each interaction updates the UI optimistically without touching the loader.

**Files:**
- Modify: `app/routes/app_.documents_.$id/tutor/index.tsx:128-135, 141-148, 165-171`
- Modify: `app/routes/app_.documents_.$id/editor/bar.tsx:111-114`
- Modify: `app/routes/app_.documents_.$id/editor/comment.tsx:60`
- Modify: `app/routes/app_.documents_.$id/route.tsx` (comment state management)

- [ ] **Step 1: Convert tutor response fetcher to plain fetch**

In `app/routes/app_.documents_.$id/tutor/index.tsx`, replace `tutorResponseFetcher.submit()` (lines 128-135):

```typescript
// Replace:
// tutorResponseFetcher.submit(
//   { response, cmsId: cms.id, content: getCurrentDocumentText?.() ?? '' },
//   { method: 'POST', action: '/api/domain/tutor-response' }
// );

// With:
const body = new FormData();
body.append('response', response);
body.append('cmsId', cms.id);
body.append('content', getCurrentDocumentText?.() ?? '');

fetch('/api/domain/tutor-response', { method: 'POST', body })
  .then((res) => res.json())
  .then((data) => {
    if (data?.messages) {
      // Update local tutor message state via callback
      onTutorMessagesUpdate?.(data.messages);
    }
  })
  .catch((err) => {
    console.error('Tutor response failed:', err);
  });
```

Update the component props to accept an `onTutorMessagesUpdate` callback instead of relying on loader revalidation. The parent route component should manage tutor messages in local state.

- [ ] **Step 2: Convert course module session fetchers to plain fetch**

Same file, replace `incrementInstructionFetcher.submit()` (lines 141-148):

```typescript
const body = new FormData();
body.append('_action', 'increment');
fetch(`/api/model/course-module-session/${cms.id}`, { method: 'POST', body })
  .then((res) => res.json())
  .then((data) => {
    if (data) onCmsUpdate?.(data);
  });
```

And `advanceCourseModuleFetcher.submit()` (lines 165-171):

```typescript
const body = new FormData();
body.append('_action', 'advance');
body.append('courseModuleId', nextCmId);
fetch('/api/model/course-module-session', { method: 'POST', body })
  .then((res) => res.json())
  .then((data) => {
    if (data) onCmsUpdate?.(data);
  });
```

- [ ] **Step 3: Convert comment creation to plain fetch**

In `app/routes/app_.documents_.$id/editor/bar.tsx`, replace `createDocumentCommentFetcher.submit()` (lines 111-114):

```typescript
const body = new FormData();
body.append('id', id);
body.append('content', content);
body.append('documentId', documentId);

fetch('/api/model/document-comment', { method: 'POST', body })
  .then((res) => res.json())
  .then((newComment) => {
    if (newComment) onCommentCreated?.(newComment);
  });
```

Add `onCommentCreated` callback prop. The parent manages comments in local state.

- [ ] **Step 4: Convert comment response to plain fetch**

In `app/routes/app_.documents_.$id/editor/comment.tsx`, replace `createCommentResponseFetcher.submit()` (around line 60):

```typescript
const body = new FormData();
body.append('commentId', comment.id);
body.append('content', content);

fetch('/api/model/document-comment-response', { method: 'POST', body })
  .then((res) => res.json())
  .then((newResponse) => {
    if (newResponse) onResponseCreated?.(comment.id, newResponse);
  });
```

- [ ] **Step 5: Add local state management in route component**

In `app/routes/app_.documents_.$id/route.tsx`, manage tutor messages and comments in local state instead of relying on loader data:

```typescript
// After useLoaderData(), initialize local state from loader:
const [comments, setComments] = useState(data.doc.comments ?? []);
const [currentCms, setCurrentCms] = useState(data.currentCms);

// Callbacks for child components:
const handleCommentCreated = useCallback((newComment: any) => {
  setComments((prev) => [...prev, newComment]);
}, []);

const handleResponseCreated = useCallback((commentId: string, newResponse: any) => {
  setComments((prev) =>
    prev.map((c) =>
      c.id === commentId
        ? { ...c, responses: [...(c.responses ?? []), newResponse] }
        : c
    )
  );
}, []);

const handleCmsUpdate = useCallback((updated: any) => {
  setCurrentCms(updated);
}, []);
```

Pass these as props to the respective child components instead of relying on loader revalidation.

- [ ] **Step 6: Remove unused fetcher imports**

Clean up `useFetcher` imports and instances that are no longer needed in the tutor and comment components.

- [ ] **Step 7: Run tests**

Run: `cd services/web-app && bun test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add app/routes/app_.documents_.\$id/tutor/index.tsx \
       app/routes/app_.documents_.\$id/editor/bar.tsx \
       app/routes/app_.documents_.\$id/editor/comment.tsx \
       app/routes/app_.documents_.\$id/route.tsx
git commit -m "feat: convert tutor/comments to plain fetch, eliminate loader revalidation triggers"
```

---

### Task 5: Flush Editor Content Before Document Submission

The submit-document action currently reads `document.html` from the DB. If the editor has unsaved content (debounce pending), the submitted content is stale. Fix: flush editor content to server immediately before submission, then submit.

**Files:**
- Modify: `app/routes/app_.documents_.$id/route.tsx:1309-1316`
- Modify: `app/routes/api.domain.submit-document/route.ts:26-66`

- [ ] **Step 1: Add flush-then-submit flow in route component**

In `app/routes/app_.documents_.$id/route.tsx`, replace the submit handler (around lines 1309-1316). Find where `submitFetcher.submit()` is called and replace with:

```typescript
// Replace:
// submitFetcher.submit(
//   { documentId: data.doc.id },
//   { method: 'POST', action: '/api/domain/submit-document' }
// );

// With flush-then-submit:
const handleSubmitDocument = async () => {
  // 1. Force-flush editor content to server immediately
  if (editorBridgeRef.current) {
    await editorBridgeRef.current.saveNow({ source: 'pre-submit-flush' });
  }

  // 2. Now submit — server has the latest content
  const body = new FormData();
  body.append('documentId', data.doc.id);

  const res = await fetch('/api/domain/submit-document', {
    method: 'POST',
    body,
  });

  if (res.ok) {
    const result = await res.json();
    // Handle success (redirect or update local state)
    if (result.redirect) {
      window.location.href = result.redirect;
    }
  } else {
    console.error('Document submission failed');
  }
};
```

Update the submit button's onClick to call `handleSubmitDocument()` instead of `submitFetcher.submit()`.

- [ ] **Step 2: Verify saveNow triggers forceSave**

Check that `editorBridgeRef.current.saveNow()` calls `syncService.forceSave()` which awaits the sync. In `editor/index.tsx` lines 518-524, the bridge's `saveNow` should resolve only after server confirms. Verify and fix if needed:

```typescript
// In editor/index.tsx, the editorBridge setup:
saveNow: async (options) => {
  // For local-first path, force the sync service to flush
  if (syncServiceRef.current) {
    await syncServiceRef.current.forceSave({ trigger: options?.source ?? 'manual' });
  } else {
    // Fallback: old save path
    await save(options);
  }
},
```

- [ ] **Step 3: Run tests**

Run: `cd services/web-app && bun test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app/routes/app_.documents_.\$id/route.tsx \
       app/routes/app_.documents_.\$id/editor/index.tsx
git commit -m "feat: flush editor content to server before document submission"
```

---

### Task 6: Fix Revision Creation Bug

Found during analysis: `api.document.$id.save/route.ts` lines 92-93 create revision snapshots using old `document.html`/`document.text` instead of the new content being saved. This means version history has stale snapshots.

**Files:**
- Modify: `app/routes/api.document.$id.save/route.ts:92-93`

- [ ] **Step 1: Fix revision to use new content**

In `app/routes/api.document.$id.save/route.ts`, change the revision creation (lines 88-97):

```typescript
if (shouldCreateRevision) {
  await prisma.documentRevision.create({
    data: {
      documentId: document.id,
      html: html,   // was: document.html (stale!)
      text: text,   // was: document.text (stale!)
      trigger: resolvedTrigger ?? (!lastRevision ? 'session-start' : 'auto'),
    },
  });
}
```

- [ ] **Step 2: Run tests**

Run: `cd services/web-app && bun test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add app/routes/api.document.\$id.save/route.ts
git commit -m "fix: use new content for revision snapshots, not stale DB content"
```

---

### Task 7: E2E Regression Tests for Data Loss Scenarios

Write E2E tests that verify the anti-fragile guarantees hold under the exact conditions that previously caused data loss.

**Files:**
- Create: `e2e/tests/document-data-loss-regression.spec.ts`

- [ ] **Step 1: Create regression test file with setup**

```typescript
import { test, expect } from '../fixtures';
import { TestHelpers } from '../test-helpers';

test.describe('Document Data Loss Regression', () => {
  test.beforeEach(async ({ page, signIn, e2eContext }) => {
    await signIn('jdoe@brock.software', 'johndoe');
  });

  test('content survives tutor interaction during unsaved edits', async ({
    page,
    e2eContext,
  }) => {
    const helpers = new TestHelpers(page);
    const editor = await helpers.openDocumentEditor(e2eContext.documentId);
    await editor.click();

    // Type content without waiting for save
    const testContent = 'Content typed before tutor interaction ' + Date.now();
    await editor.type(testContent, { delay: 30 });

    // Interact with tutor immediately (don't wait for debounce)
    const tutorInput = page.locator('[data-testid="tutor-input"], textarea[placeholder*="tutor"], textarea[placeholder*="message"]').first();
    if (await tutorInput.isVisible()) {
      await tutorInput.fill('What should I write about?');
      await tutorInput.press('Enter');
      // Wait for tutor response
      await page.waitForTimeout(3000);
    }

    // Verify content is still in editor
    await expect(editor).toContainText(testContent);

    // Wait for save and verify persistence
    await page.waitForTimeout(4000);
    await helpers.verifySavedData({
      expectedTexts: [testContent],
      documentId: e2eContext.documentId,
      courseId: e2eContext.studentCourseId,
    });
  });

  test('content survives page visibility change', async ({
    page,
    e2eContext,
  }) => {
    const helpers = new TestHelpers(page);
    const editor = await helpers.openDocumentEditor(e2eContext.documentId);
    await editor.click();

    const testContent = 'Content before visibility change ' + Date.now();
    await editor.type(testContent, { delay: 30 });

    // Simulate tab becoming hidden (triggers forceSave)
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await page.waitForTimeout(2000);

    // Verify content persisted
    await helpers.verifySavedData({
      expectedTexts: [testContent],
      documentId: e2eContext.documentId,
      courseId: e2eContext.studentCourseId,
    });
  });

  test('rapid edits followed by immediate submission preserves all content', async ({
    page,
    e2eContext,
  }) => {
    const helpers = new TestHelpers(page);
    const editor = await helpers.openDocumentEditor(e2eContext.documentId);
    await editor.click();

    // Rapid typing
    const phrases = ['First thought.', ' Second thought.', ' Final thought.'];
    for (const phrase of phrases) {
      await editor.type(phrase, { delay: 20 });
    }

    // Submit immediately without waiting for debounce
    // The flush-then-submit flow should handle this
    const submitButton = page.locator('button:has-text("Submit"), button:has-text("Turn in")').first();
    if (await submitButton.isVisible()) {
      await submitButton.click();
      await page.waitForTimeout(3000);
    }

    // Verify all content present after submission
    for (const phrase of phrases) {
      await expect(async () => {
        const content = await page.evaluate(() => document.body.innerText);
        expect(content).toContain(phrase.trim());
      }).toPass({ timeout: 5000 });
    }
  });
});
```

- [ ] **Step 2: Run regression tests**

Run: `cd services/web-app && bun run test:e2e:smoke`
Expected: Tests may need adjustment based on actual test fixture structure. Iterate until they pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/document-data-loss-regression.spec.ts
git commit -m "test: add E2E regression tests for document data loss scenarios"
```

---

## Verification Checklist

After all tasks, verify these guarantees hold:

- [ ] Typing in editor -> closing tab -> reopening: content is preserved (IDB hydration)
- [ ] Typing in editor -> tutor interaction -> content still in editor (no revalidation overwrite)
- [ ] Typing in editor -> adding comment -> content still in editor
- [ ] Typing in editor -> immediate submit -> submitted content matches editor (flush-then-submit)
- [ ] Opening document in new tab after unsaved edits in another: IDB has latest content
- [ ] Network offline -> typing -> network returns: content syncs to server
- [ ] `shouldRevalidate` returns false for all actions on this route
