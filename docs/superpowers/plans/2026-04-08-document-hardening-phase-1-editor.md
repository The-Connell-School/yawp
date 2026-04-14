# Phase 1 — Editor Flow Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the document editor area into a decomposed, anti-fragile structure with a single forward data flow (PM → IDB → server), zero loader revalidation on the document route, a runtime tripwire preventing unauthorized PM mutations, and 5-min idle-resetting hash-deduped revisions. Net result: route.tsx 1507 → ~250 lines, editor/index.tsx 873 → ~250 lines, ~1500 lines deleted.

**Architecture:** Single source of truth per concern. ProseMirror is write-only externally — only user keystrokes and the one-shot recovery hydration on mount can mutate it. All side effects extracted from route.tsx into focused hooks. Tutor and CMS interactions return updated state in their JSON responses; no `?spa=1` revalidation. The `pendingSave` localStorage layer dies (IDB-aware hydration replaces it). The legacy PUT save path dies (SyncService becomes the only writer).

**Tech Stack:** React Router v7 (Remix), TipTap/ProseMirror, IndexedDB via `idb`, Prisma, TypeScript, Vitest, Playwright

**Branch:** `document-hardening` (off `main`)
**Spec:** `docs/superpowers/specs/2026-04-08-document-hardening-design.md`

---

## File Map

All paths relative to `services/web-app/`. Phase 1 only — Phase 2 and 3 have their own plans.

| File | Action | Responsibility |
|---|---|---|
| `app/utils/document-store.ts` | Cherry-pick from `anti-fragile-editor` | IDB store with version-gated writes |
| `app/utils/sync-service.ts` | Cherry-pick from `anti-fragile-editor` | Retry/backoff sync to server |
| `app/utils/content-hash.ts` | Cherry-pick from `anti-fragile-editor` | Hash function for dedup |
| `app/components/save-status-indicator.tsx` | Cherry-pick from `anti-fragile-editor` | Sync status UI |
| `app/routes/api.document.$id.save/route.ts` | Cherry-pick from `anti-fragile-editor` | Local-first save endpoint |
| `app/routes/api.document.$id.revisions/route.ts` | Cherry-pick from `anti-fragile-editor` | Read revision timeline |
| `packages/prisma/schema.prisma` | Cherry-pick `DocumentRevision` model + add migration | Revision history |
| `app/routes/app_.documents_.$id/document-editor/editor.tsx` | Create | Slim ProseMirror host (~250 lines) |
| `app/routes/app_.documents_.$id/document-editor/document-editor.tsx` | Create | Top-level editor pane wrapper |
| `app/routes/app_.documents_.$id/document-editor/use-editor-sync.ts` | Create | PM ↔ IDB ↔ server hook + 5-min timer |
| `app/routes/app_.documents_.$id/document-editor/use-pm-tripwire.ts` | Create | Runtime guard for unauthorized PM writes |
| `app/routes/app_.documents_.$id/document-editor/editor-bar.tsx` | Move from `editor/bar.tsx` | Toolbar |
| `app/routes/app_.documents_.$id/document-editor/extensions/source-tracker.ts` | Create | PM plugin tagging user transactions |
| `app/routes/app_.documents_.$id/document-editor/extensions/` | Move from `editor/extensions/` | Existing PM extensions |
| `app/routes/app_.documents_.$id/hooks/use-auth-heartbeat.ts` | Create | Session lock + login redirect logic |
| `app/routes/app_.documents_.$id/hooks/use-tutor-state.ts` | Create | Local CMS/messages state + callbacks |
| `app/routes/app_.documents_.$id/hooks/use-comments-state.ts` | Create | Local comments state + callbacks |
| `app/routes/app_.documents_.$id/hooks/use-document-submit.ts` | Create | Flush-then-submit handler |
| `app/routes/app_.documents_.$id/teacher-grading/grade-highlights-overlay.tsx` | Create | Extracted DOM mark application |
| `app/routes/app_.documents_.$id/teacher-grading/selection-toolbar.tsx` | Create | Extracted from editor.tsx |
| `app/routes/app_.documents_.$id/document-history/document-history.tsx` | Move from `_components/document-history.tsx` | Revision timeline UI |
| `app/routes/app_.documents_.$id/route.tsx` | Refactor | Thin shell, ~250 lines |
| `app/routes/app_.documents_.$id/tutor/tutor.tsx` | Move from `tutor/index.tsx` and refactor | No `?spa=1`, returns cms via callback |
| `app/routes/app_.documents_.$id/comments/comments.tsx` | Move from `comments/index.tsx` | No-op rename for consistency |
| `app/routes/api.domain.tutor-response/route.ts` | Modify | Return updated `cms` in response |
| `app/routes/api.model.course-module-session.$id/route.ts` | Modify | Return updated `cms` in response |
| `app/routes/api.model.course-module-session/route.ts` | Modify | Return new `cms` in response |
| `app/utils/pending-document-save.ts` | **DELETE** | Replaced by IDB hydration |
| `app/utils/pending-document-save.test.ts` | **DELETE** | Tests for deleted file |
| `app/routes/app_.documents_.$id/editor/editor-content-context.tsx` | **DELETE** | Dead code |
| `app/routes/app_.documents_.$id/editor/index.tsx` | **DELETE** (after extraction) | Replaced by `document-editor/editor.tsx` |
| `app/routes/app_.documents_.$id/_components/document-versions.tsx` | **DELETE** | Old DocumentVersion UI |
| `app/routes/api.model.document.$id.versions/route.ts` | **DELETE** | Old DocumentVersion API |
| `app/routes/api.model.document.$id.versions/route.test.ts` | **DELETE** | Tests for deleted file |
| `app/routes/api.domain.restore-document-version/route.ts` | **DELETE** | Old version restore |
| `app/routes/api.domain.restore-document-version/route.test.ts` | **DELETE** | Tests for deleted file |
| `packages/prisma/schema.prisma` | Modify | Drop `DocumentVersion` model |
| `packages/prisma/migrations/<new>/migration.sql` | Create | Drop DocumentVersion table, backfill into DocumentRevision |
| `e2e/tests/document-editor-invariants.spec.ts` | Create | Adversarial test for PM-write tripwire |
| `e2e/tests/document-data-loss-regression.spec.ts` | Cherry-pick from `anti-fragile-editor` | Existing regression suite |

---

### Task 1: Cherry-pick foundational IDB work from `anti-fragile-editor`

The `anti-fragile-editor` branch (PR #91) has utility files we want to keep wholesale: `document-store.ts`, `sync-service.ts`, `content-hash.ts`, `save-status-indicator.tsx`, the `api.document.$id.save` endpoint, the `api.document.$id.revisions` endpoint, the `DocumentRevision` model, and the `idb` package dependency. Cherry-pick the files (not the whole commits — we'll selectively apply).

**Files (all paths from repo root):**
- Copy from `anti-fragile-editor` branch: `services/web-app/app/utils/document-store.ts`, `services/web-app/app/utils/document-store.test.ts`, `services/web-app/app/utils/sync-service.ts`, `services/web-app/app/utils/sync-service.test.ts`, `services/web-app/app/utils/content-hash.ts`, `services/web-app/app/utils/content-hash.test.ts`, `services/web-app/app/components/save-status-indicator.tsx`, `services/web-app/app/routes/api.document.$id.save/route.ts`, `services/web-app/app/routes/api.document.$id.save/route.test.ts`, `services/web-app/app/routes/api.document.$id.revisions/route.ts`
- Modify: `packages/prisma/schema.prisma` (add `DocumentRevision` model)
- Modify: `services/web-app/package.json` (add `idb` dependency)
- Create: `packages/prisma/migrations/<timestamp>_add_document_revision/migration.sql`
- Modify: `services/web-app/e2e/prepare-e2e.ts` (any e2e fixture changes from #91)

- [ ] **Step 1: Verify we're on the document-hardening branch**

```bash
cd ~/brocksoftware/yawp-2.0
git branch --show-current
```
Expected output: `document-hardening`

- [ ] **Step 2: Copy utility files from anti-fragile-editor**

```bash
git checkout anti-fragile-editor -- \
  services/web-app/app/utils/document-store.ts \
  services/web-app/app/utils/document-store.test.ts \
  services/web-app/app/utils/sync-service.ts \
  services/web-app/app/utils/sync-service.test.ts \
  services/web-app/app/utils/content-hash.ts \
  services/web-app/app/utils/content-hash.test.ts \
  services/web-app/app/components/save-status-indicator.tsx \
  services/web-app/app/routes/api.document.\$id.save/route.ts \
  services/web-app/app/routes/api.document.\$id.save/route.test.ts \
  services/web-app/app/routes/api.document.\$id.revisions/route.ts
```

- [ ] **Step 3: Add `idb` dependency to package.json**

```bash
git checkout anti-fragile-editor -- services/web-app/package.json
```
Then run `cd services/web-app && bun install`.
Expected: package installs cleanly.

- [ ] **Step 4: Add `DocumentRevision` model to schema**

Manually add to `packages/prisma/schema.prisma` (do not cherry-pick the whole schema file from #91 — it has snapshot logic we want to delete in Phase 2):

```prisma
model DocumentRevision {
  id         String   @id @default(cuid())
  createdAt  DateTime @default(now()) @db.Timestamptz(6)
  documentId String
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  html       String
  text       String
  trigger    String

  @@index([documentId, createdAt(sort: Desc)])
}
```

Also add the relation on `Document`:
```prisma
model Document {
  // ... existing fields ...
  revisions DocumentRevision[]
}
```

- [ ] **Step 5: Generate the Prisma migration**

```bash
cd packages/prisma
bunx prisma migrate dev --name add_document_revision --create-only
```
Expected: a new migration file appears under `packages/prisma/migrations/`. Inspect it — it should `CREATE TABLE "DocumentRevision"` and the index.

- [ ] **Step 6: Apply the migration locally**

```bash
cd packages/prisma
bunx prisma migrate dev
```
Expected: migration applies cleanly.

- [ ] **Step 7: Run the new utility tests**

```bash
cd services/web-app
bun test app/utils/document-store.test.ts app/utils/sync-service.test.ts app/utils/content-hash.test.ts
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add services/web-app/app/utils/document-store.ts \
        services/web-app/app/utils/document-store.test.ts \
        services/web-app/app/utils/sync-service.ts \
        services/web-app/app/utils/sync-service.test.ts \
        services/web-app/app/utils/content-hash.ts \
        services/web-app/app/utils/content-hash.test.ts \
        services/web-app/app/components/save-status-indicator.tsx \
        services/web-app/app/routes/api.document.\$id.save/ \
        services/web-app/app/routes/api.document.\$id.revisions/ \
        services/web-app/package.json \
        packages/prisma/schema.prisma \
        packages/prisma/migrations/
git commit -m "feat: foundational IDB utilities + DocumentRevision schema"
```

---

### Task 2: Set up new folder structure (empty placeholders)

Create the new folders so subsequent tasks have a place to write files. Use empty `.gitkeep` files since git doesn't track empty directories.

**Files:**
- Create: `services/web-app/app/routes/app_.documents_.$id/document-editor/.gitkeep`
- Create: `services/web-app/app/routes/app_.documents_.$id/document-editor/extensions/.gitkeep`
- Create: `services/web-app/app/routes/app_.documents_.$id/teacher-grading/.gitkeep`
- Create: `services/web-app/app/routes/app_.documents_.$id/document-history/.gitkeep`
- Create: `services/web-app/app/routes/app_.documents_.$id/hooks/.gitkeep`

- [ ] **Step 1: Create the directories**

```bash
cd services/web-app/app/routes/app_.documents_.\$id
mkdir -p document-editor/extensions teacher-grading document-history hooks
touch document-editor/.gitkeep document-editor/extensions/.gitkeep teacher-grading/.gitkeep document-history/.gitkeep hooks/.gitkeep
```

- [ ] **Step 2: Commit**

```bash
git add services/web-app/app/routes/app_.documents_.\$id/document-editor/ \
        services/web-app/app/routes/app_.documents_.\$id/teacher-grading/ \
        services/web-app/app/routes/app_.documents_.\$id/document-history/ \
        services/web-app/app/routes/app_.documents_.\$id/hooks/
git commit -m "chore: scaffold new folder structure for document editor refactor"
```

---

### Task 3: Create source-tracker PM extension

A ProseMirror plugin that tags every user-originated transaction with `tr.setMeta('yawp-pm-source', 'user')`. Tracks user input via DOM event listeners on keydown, paste, drop, input, compositionend, cut. The tripwire hook (Task 4) will reject any docChanged transaction that lacks this meta or the `recovery-on-mount` meta.

**Files:**
- Create: `services/web-app/app/routes/app_.documents_.$id/document-editor/extensions/source-tracker.ts`
- Create: `services/web-app/app/routes/app_.documents_.$id/document-editor/extensions/source-tracker.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// services/web-app/app/routes/app_.documents_.$id/document-editor/extensions/source-tracker.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SourceTracker, USER_SOURCE_META } from './source-tracker';

describe('SourceTracker extension', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      extensions: [StarterKit, SourceTracker],
      content: '<p>hello</p>',
    });
  });

  it('tags transactions originating from user input events', () => {
    let lastMeta: string | null = null;
    editor.on('transaction', ({ transaction }) => {
      if (transaction.docChanged) {
        lastMeta = transaction.getMeta(USER_SOURCE_META) ?? null;
      }
    });

    // Simulate a user keydown by triggering it on the editor view dom
    const dom = editor.view.dom as HTMLElement;
    dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    // Simulate the resulting input by dispatching a transaction
    editor.commands.insertContent('a');

    expect(lastMeta).toBe('user');
  });

  it('does NOT tag transactions originating from explicit code', () => {
    let lastMeta: string | null = null;
    editor.on('transaction', ({ transaction }) => {
      if (transaction.docChanged) {
        lastMeta = transaction.getMeta(USER_SOURCE_META) ?? null;
      }
    });

    // No DOM event — pure code-initiated transaction
    editor.commands.insertContent('hello world');

    expect(lastMeta).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd services/web-app
bun test app/routes/app_.documents_.\$id/document-editor/extensions/source-tracker.test.ts
```
Expected: FAIL with "Cannot find module './source-tracker'"

- [ ] **Step 3: Implement the source-tracker extension**

```ts
// services/web-app/app/routes/app_.documents_.$id/document-editor/extensions/source-tracker.ts
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';

export const USER_SOURCE_META = 'yawp-pm-source';

const sourceTrackerKey = new PluginKey('source-tracker');

/**
 * PM plugin that tags every transaction whose origin can be traced
 * to a user input DOM event. Uses a WeakSet of in-flight events to
 * survive across the React → PM dispatch boundary.
 */
export const SourceTracker = Extension.create({
  name: 'sourceTracker',

  addProseMirrorPlugins() {
    let userEventActive = false;

    const view = this.editor.view;
    const dom = view.dom as HTMLElement;

    const userEvents = ['keydown', 'paste', 'drop', 'input', 'compositionend', 'cut'];
    const handlers: Array<[string, EventListener]> = [];

    const wrap = (eventName: string) => {
      const handler: EventListener = () => {
        userEventActive = true;
        // Reset on next tick — the resulting PM transaction will fire
        // before this microtask drains.
        queueMicrotask(() => { userEventActive = false; });
      };
      dom.addEventListener(eventName, handler, { capture: true });
      handlers.push([eventName, handler]);
    };

    userEvents.forEach(wrap);

    return [
      new Plugin({
        key: sourceTrackerKey,
        appendTransaction(transactions, _oldState, newState) {
          if (!userEventActive) return null;
          if (transactions.every((tr) => !tr.docChanged)) return null;
          const tr = newState.tr;
          tr.setMeta(USER_SOURCE_META, 'user');
          return tr;
        },
      }),
    ];
  },

  onDestroy() {
    // (Listener cleanup happens via editor destroy chain — no-op here)
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test app/routes/app_.documents_.\$id/document-editor/extensions/source-tracker.test.ts
```
Expected: PASS for both test cases.

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/app_.documents_.\$id/document-editor/extensions/
git commit -m "feat: add source-tracker PM extension for transaction provenance"
```

---

### Task 4: Create `use-pm-tripwire` hook

A React hook that subscribes to `editor.on('transaction')` and throws (in dev) or logs (in prod) when a docChanged transaction lacks an authorized source tag.

**Files:**
- Create: `services/web-app/app/routes/app_.documents_.$id/document-editor/use-pm-tripwire.ts`
- Create: `services/web-app/app/routes/app_.documents_.$id/document-editor/use-pm-tripwire.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// services/web-app/app/routes/app_.documents_.$id/document-editor/use-pm-tripwire.test.tsx
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SourceTracker, USER_SOURCE_META } from './extensions/source-tracker';
import { usePmTripwire, RECOVERY_SOURCE } from './use-pm-tripwire';

describe('usePmTripwire', () => {
  let editor: Editor;
  let originalEnv: any;

  beforeEach(() => {
    editor = new Editor({
      extensions: [StarterKit, SourceTracker],
      content: '<p>hello</p>',
    });
    originalEnv = (import.meta as any).env;
    // Default to dev mode for tests
    (import.meta as any).env = { ...originalEnv, DEV: true };
  });

  afterEach(() => {
    (import.meta as any).env = originalEnv;
  });

  it('throws in dev when an untagged docChanged transaction occurs', () => {
    renderHook(() => usePmTripwire(editor));

    expect(() => {
      // No source meta on this transaction — should throw
      editor.commands.insertContent('untagged');
    }).toThrow(/Unauthorized PM mutation/);
  });

  it('does NOT throw for transactions tagged as user', () => {
    renderHook(() => usePmTripwire(editor));

    expect(() => {
      const tr = editor.state.tr.insertText('tagged');
      tr.setMeta(USER_SOURCE_META, 'user');
      editor.view.dispatch(tr);
    }).not.toThrow();
  });

  it('does NOT throw for transactions tagged as recovery-on-mount', () => {
    renderHook(() => usePmTripwire(editor));

    expect(() => {
      const tr = editor.state.tr.insertText('recovered');
      tr.setMeta(USER_SOURCE_META, RECOVERY_SOURCE);
      editor.view.dispatch(tr);
    }).not.toThrow();
  });

  it('logs and counts in prod instead of throwing', () => {
    (import.meta as any).env = { ...originalEnv, DEV: false };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (window as any).__yawpUnauthorizedPmWrites = 0;

    renderHook(() => usePmTripwire(editor));

    expect(() => {
      editor.commands.insertContent('untagged');
    }).not.toThrow();

    expect(errorSpy).toHaveBeenCalled();
    expect((window as any).__yawpUnauthorizedPmWrites).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test app/routes/app_.documents_.\$id/document-editor/use-pm-tripwire.test.tsx
```
Expected: FAIL with "Cannot find module './use-pm-tripwire'"

- [ ] **Step 3: Implement the hook**

```ts
// services/web-app/app/routes/app_.documents_.$id/document-editor/use-pm-tripwire.ts
import { useEffect } from 'react';
import type { Editor } from '@tiptap/core';
import { USER_SOURCE_META } from './extensions/source-tracker';

export const RECOVERY_SOURCE = 'recovery-on-mount';
const ALLOWED = new Set(['user', RECOVERY_SOURCE]);

declare global {
  interface Window {
    __yawpUnauthorizedPmWrites?: number;
  }
}

/**
 * Runtime guard that catches any code path mutating PM doc content
 * without an authorized source tag. In dev: throws. In prod: logs +
 * increments a counter that E2E tests can read.
 */
export function usePmTripwire(editor: Editor | null) {
  useEffect(() => {
    if (!editor) return;

    const handler = ({ transaction }: { transaction: any }) => {
      if (!transaction.docChanged) return;
      const source = transaction.getMeta(USER_SOURCE_META);
      if (ALLOWED.has(source)) return;

      const message = `Unauthorized PM mutation. steps=${transaction.steps.length}, source=${source ?? 'null'}`;
      if ((import.meta as any).env?.DEV) {
        throw new Error(message);
      }
      console.error(message);
      window.__yawpUnauthorizedPmWrites = (window.__yawpUnauthorizedPmWrites ?? 0) + 1;
    };

    editor.on('transaction', handler);
    return () => {
      editor.off('transaction', handler);
    };
  }, [editor]);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test app/routes/app_.documents_.\$id/document-editor/use-pm-tripwire.test.tsx
```
Expected: PASS for all four test cases.

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/app_.documents_.\$id/document-editor/use-pm-tripwire.ts \
        services/web-app/app/routes/app_.documents_.\$id/document-editor/use-pm-tripwire.test.tsx
git commit -m "feat: add use-pm-tripwire hook for runtime PM-write guard"
```

---

### Task 5: Move PM extensions to new folder

Existing extensions live at `editor/extensions/`. Move them to `document-editor/extensions/`. Update imports.

**Files:**
- Move: `services/web-app/app/routes/app_.documents_.$id/editor/extensions/comment.ts` → `document-editor/extensions/comment.ts`
- Move: `services/web-app/app/routes/app_.documents_.$id/editor/extensions/line-height.ts` → `document-editor/extensions/line-height.ts`
- Move: `services/web-app/app/routes/app_.documents_.$id/editor/extensions/tab-indent.ts` → `document-editor/extensions/tab-indent.ts`
- Move: `services/web-app/app/routes/app_.documents_.$id/editor/extensions/line-height.test.ts` → `document-editor/extensions/line-height.test.ts`

- [ ] **Step 1: Move extension files**

```bash
cd services/web-app/app/routes/app_.documents_.\$id
git mv editor/extensions/comment.ts document-editor/extensions/comment.ts
git mv editor/extensions/line-height.ts document-editor/extensions/line-height.ts
git mv editor/extensions/line-height.test.ts document-editor/extensions/line-height.test.ts
git mv editor/extensions/tab-indent.ts document-editor/extensions/tab-indent.ts
```

- [ ] **Step 2: Verify no other code references the old paths**

```bash
cd services/web-app
```
Use Grep tool with pattern `editor/extensions/(comment|line-height|tab-indent)` and assert zero matches outside the moved files.

- [ ] **Step 3: Run extension tests at the new location**

```bash
bun test app/routes/app_.documents_.\$id/document-editor/extensions/
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add services/web-app/app/routes/app_.documents_.\$id/document-editor/extensions/ \
        services/web-app/app/routes/app_.documents_.\$id/editor/extensions/
git commit -m "refactor: move PM extensions to document-editor/extensions/"
```

---

### Task 6: Create `use-editor-sync` hook

The heart of the persistence layer. Owns the localVersion counter, IDB writes, SyncService scheduling, the 5-min idle-resetting hash-deduped revision timer, the visibility-change forceSave handler, and exposes a bridge upward (with NO `setContent` method).

**Files:**
- Create: `services/web-app/app/routes/app_.documents_.$id/document-editor/use-editor-sync.ts`
- Create: `services/web-app/app/routes/app_.documents_.$id/document-editor/use-editor-sync.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// services/web-app/app/routes/app_.documents_.$id/document-editor/use-editor-sync.test.tsx
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { useEditorSync } from './use-editor-sync';
import { documentStore } from '~/utils/document-store';

describe('useEditorSync', () => {
  let editor: Editor;
  const docId = 'test-doc-1';

  beforeEach(async () => {
    vi.useFakeTimers();
    editor = new Editor({
      extensions: [StarterKit],
      content: '<p>hello</p>',
    });
    await documentStore.clear?.();
  });

  afterEach(() => {
    vi.useRealTimers();
    editor.destroy();
  });

  it('writes to IDB on every editor update', async () => {
    renderHook(() => useEditorSync(editor, { docId, onBridgeReady: () => {} }));

    await act(async () => {
      editor.commands.insertContent(' world');
    });

    const stored = await documentStore.get(docId);
    expect(stored?.html).toContain('world');
  });

  it('increments localVersion on each update', async () => {
    renderHook(() => useEditorSync(editor, { docId, onBridgeReady: () => {} }));

    await act(async () => {
      editor.commands.insertContent(' a');
    });
    const v1 = (await documentStore.get(docId))?.localVersion;

    await act(async () => {
      editor.commands.insertContent(' b');
    });
    const v2 = (await documentStore.get(docId))?.localVersion;

    expect(v2).toBeGreaterThan(v1!);
  });

  it('exposes a bridge with getContent and saveNow but no setContent', () => {
    let bridge: any = null;
    renderHook(() =>
      useEditorSync(editor, { docId, onBridgeReady: (b) => { bridge = b; } })
    );

    expect(bridge).not.toBeNull();
    expect(typeof bridge.getContent).toBe('function');
    expect(typeof bridge.saveNow).toBe('function');
    expect((bridge as any).setContent).toBeUndefined();
  });

  it('schedules a periodic revision after 5 min of idle', async () => {
    const forceSaveSpy = vi.fn().mockResolvedValue(undefined);
    // Inject a fake sync service that records calls
    renderHook(() =>
      useEditorSync(editor, {
        docId,
        onBridgeReady: () => {},
        __testSyncService: { forceSave: forceSaveSpy, scheduleSave: vi.fn(), start: vi.fn(), stop: vi.fn(), onStatusChange: vi.fn() } as any,
      })
    );

    await act(async () => {
      editor.commands.insertContent(' edit');
    });

    // 4:59 — no revision yet
    await act(async () => {
      vi.advanceTimersByTime(4 * 60 * 1000 + 59 * 1000);
    });
    expect(forceSaveSpy).not.toHaveBeenCalledWith(expect.objectContaining({ trigger: 'periodic' }));

    // 5:01 — revision fires
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(forceSaveSpy).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'periodic' }));
  });

  it('resets the 5-min timer on each new edit', async () => {
    const forceSaveSpy = vi.fn().mockResolvedValue(undefined);
    renderHook(() =>
      useEditorSync(editor, {
        docId,
        onBridgeReady: () => {},
        __testSyncService: { forceSave: forceSaveSpy, scheduleSave: vi.fn(), start: vi.fn(), stop: vi.fn(), onStatusChange: vi.fn() } as any,
      })
    );

    await act(async () => { editor.commands.insertContent(' a'); });
    await act(async () => { vi.advanceTimersByTime(4 * 60 * 1000); });
    await act(async () => { editor.commands.insertContent(' b'); }); // resets timer
    await act(async () => { vi.advanceTimersByTime(4 * 60 * 1000); });
    // Total elapsed = 8 min, but only 4 min since last edit → no periodic yet
    expect(forceSaveSpy).not.toHaveBeenCalledWith(expect.objectContaining({ trigger: 'periodic' }));
  });

  it('skips periodic revision when content hash equals last revision hash', async () => {
    const forceSaveSpy = vi.fn().mockResolvedValue(undefined);
    renderHook(() =>
      useEditorSync(editor, {
        docId,
        onBridgeReady: () => {},
        __testSyncService: { forceSave: forceSaveSpy, scheduleSave: vi.fn(), start: vi.fn(), stop: vi.fn(), onStatusChange: vi.fn() } as any,
      })
    );

    await act(async () => { editor.commands.insertContent(' x'); });
    await act(async () => { vi.advanceTimersByTime(5 * 60 * 1000 + 1000); });
    expect(forceSaveSpy).toHaveBeenCalledTimes(1);

    // No new edit — timer expires again, but hash unchanged → skip
    await act(async () => { vi.advanceTimersByTime(5 * 60 * 1000 + 1000); });
    expect(forceSaveSpy).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
bun test app/routes/app_.documents_.\$id/document-editor/use-editor-sync.test.tsx
```
Expected: FAIL with "Cannot find module './use-editor-sync'"

- [ ] **Step 3: Implement the hook**

```ts
// services/web-app/app/routes/app_.documents_.$id/document-editor/use-editor-sync.ts
import { useCallback, useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import { documentStore } from '~/utils/document-store';
import { SyncService, type SyncStatus } from '~/utils/sync-service';
import { contentHash } from '~/utils/content-hash';

const REVISION_INTERVAL_MS = 5 * 60 * 1000;

export type EditorBridge = {
  getContent: () => { html: string; text: string };
  saveNow: (options?: { source?: string }) => Promise<void>;
};

type UseEditorSyncOptions = {
  docId: string;
  initialRevision?: number;
  onBridgeReady: (bridge: EditorBridge | null) => void;
  onSyncStatusChange?: (status: SyncStatus) => void;
  /** Test-only: inject a mock sync service */
  __testSyncService?: SyncService;
};

export function useEditorSync(
  editor: Editor | null,
  {
    docId,
    initialRevision = 0,
    onBridgeReady,
    onSyncStatusChange,
    __testSyncService,
  }: UseEditorSyncOptions
) {
  const versionRef = useRef(0);
  const lastRevisionHashRef = useRef<string | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncServiceRef = useRef<SyncService | null>(null);
  const currentRevisionRef = useRef(initialRevision);

  const getSnapshot = useCallback(() => {
    if (!editor) return { html: '', text: '' };
    return { html: editor.getHTML(), text: editor.getText().replace(/\u00A0/g, ' ') };
  }, [editor]);

  const scheduleRevisionTick = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(async () => {
      const { html, text } = getSnapshot();
      const hash = await contentHash(html, text);
      if (hash === lastRevisionHashRef.current) return;
      await syncServiceRef.current?.forceSave({ trigger: 'periodic' });
      lastRevisionHashRef.current = hash;
    }, REVISION_INTERVAL_MS);
  }, [getSnapshot]);

  // Set up the sync service and IDB seed on mount
  useEffect(() => {
    if (!docId) return;

    const sync = __testSyncService ?? new SyncService(documentStore);
    syncServiceRef.current = sync;
    sync.start(docId);

    documentStore.get(docId).then(async (entry) => {
      if (entry?.localVersion) {
        versionRef.current = entry.localVersion;
      }
    });

    const unsub = onSyncStatusChange ? sync.onStatusChange(onSyncStatusChange) : undefined;

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        void sync.forceSave({ trigger: 'session-end' });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      void sync.forceSave({ trigger: 'session-end' });
      sync.stop();
      unsub?.();
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      syncServiceRef.current = null;
    };
  }, [docId, __testSyncService, onSyncStatusChange]);

  // Wire the editor update handler
  useEffect(() => {
    if (!editor) return;

    const handler = async () => {
      const { html, text } = getSnapshot();
      const hash = await contentHash(html, text);
      versionRef.current += 1;
      await documentStore.put({
        docId,
        html,
        text,
        updatedAt: Date.now(),
        localVersion: versionRef.current,
        serverRevision: currentRevisionRef.current,
        syncStatus: 'pending',
        lastSyncedAt: null,
        lastSyncError: null,
        contentHash: hash,
      });
      syncServiceRef.current?.scheduleSave();
      scheduleRevisionTick();
    };

    editor.on('update', handler);
    return () => {
      editor.off('update', handler);
    };
  }, [editor, docId, getSnapshot, scheduleRevisionTick]);

  // Expose bridge upward
  useEffect(() => {
    if (!editor) {
      onBridgeReady(null);
      return;
    }

    const bridge: EditorBridge = {
      getContent: getSnapshot,
      saveNow: async (options) => {
        const { html, text } = getSnapshot();
        const hash = await contentHash(html, text);
        versionRef.current += 1;
        await documentStore.put({
          docId,
          html,
          text,
          updatedAt: Date.now(),
          localVersion: versionRef.current,
          serverRevision: currentRevisionRef.current,
          syncStatus: 'pending',
          lastSyncedAt: null,
          lastSyncError: null,
          contentHash: hash,
        });
        await syncServiceRef.current?.forceSave({ trigger: options?.source ?? 'manual' });
      },
    };

    onBridgeReady(bridge);
    return () => onBridgeReady(null);
  }, [editor, docId, getSnapshot, onBridgeReady]);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test app/routes/app_.documents_.\$id/document-editor/use-editor-sync.test.tsx
```
Expected: PASS for all six test cases.

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/app_.documents_.\$id/document-editor/use-editor-sync.ts \
        services/web-app/app/routes/app_.documents_.\$id/document-editor/use-editor-sync.test.tsx
git commit -m "feat: add use-editor-sync hook (PM ↔ IDB ↔ server + 5min revisions)"
```

---

### Task 7: Server-side support for `periodic` revision trigger

The save endpoint already creates revisions on `session-start`, `auto`, and other triggers. Add explicit support for `periodic` and ensure the existing hash-dedup logic on the server still applies.

**Files:**
- Modify: `services/web-app/app/routes/api.document.$id.save/route.ts`
- Modify: `services/web-app/app/routes/api.document.$id.save/route.test.ts`

- [ ] **Step 1: Read the current save endpoint to find the revision logic**

Use Read tool on `services/web-app/app/routes/api.document.$id.save/route.ts`. Locate the block that creates `documentRevision` (likely with a `shouldCreateRevision` flag and a `trigger` value derived from the request body).

- [ ] **Step 2: Add a test asserting `periodic` trigger creates a revision**

Add to `services/web-app/app/routes/api.document.$id.save/route.test.ts`:

```ts
it('creates a revision when trigger=periodic and content has changed', async () => {
  const doc = await createTestDocument({ html: '<p>old</p>', text: 'old' });

  const res = await action({
    request: new Request('http://test/api/document/' + doc.id + '/save', {
      method: 'POST',
      body: new URLSearchParams({
        html: '<p>new</p>',
        text: 'new',
        trigger: 'periodic',
        editorSessionId: 'test-session',
        clientSeq: '1',
        baseRevision: String(doc.revision),
      }),
    }),
    params: { id: doc.id },
    context: {},
  } as any);

  expect(res.ok).toBe(true);
  const revs = await prisma.documentRevision.findMany({ where: { documentId: doc.id } });
  expect(revs.some((r) => r.trigger === 'periodic')).toBe(true);
});

it('skips revision creation when periodic trigger fires but content hash matches last revision', async () => {
  const doc = await createTestDocument({ html: '<p>same</p>', text: 'same' });
  // Pre-seed a revision with the same content
  await prisma.documentRevision.create({
    data: { documentId: doc.id, html: '<p>same</p>', text: 'same', trigger: 'session-start' },
  });

  const res = await action({
    request: new Request('http://test/api/document/' + doc.id + '/save', {
      method: 'POST',
      body: new URLSearchParams({
        html: '<p>same</p>',
        text: 'same',
        trigger: 'periodic',
        editorSessionId: 'test-session',
        clientSeq: '1',
        baseRevision: String(doc.revision),
      }),
    }),
    params: { id: doc.id },
    context: {},
  } as any);

  expect(res.ok).toBe(true);
  const revs = await prisma.documentRevision.findMany({ where: { documentId: doc.id } });
  expect(revs.length).toBe(1); // No new revision added
});
```

- [ ] **Step 3: Run the test and verify it fails**

```bash
bun test app/routes/api.document.\$id.save/route.test.ts -t "periodic"
```
Expected: FAIL — the existing logic may not recognize `periodic` as a trigger.

- [ ] **Step 4: Update the save endpoint to honor `periodic` trigger**

In `services/web-app/app/routes/api.document.$id.save/route.ts`, in the revision-creation block, add `'periodic'` to the list of triggers that create revisions. Ensure the hash check against the most recent revision still applies. Concretely, find the section that looks like:

```ts
const allowedTriggers = ['session-start', 'auto', 'pre-submit-flush', 'manual'];
```

And update to:

```ts
const allowedTriggers = ['session-start', 'auto', 'pre-submit-flush', 'manual', 'periodic'];
```

If the structure is different, just ensure `trigger === 'periodic'` results in `shouldCreateRevision = true && hash !== lastRevisionHash`.

- [ ] **Step 5: Run tests**

```bash
bun test app/routes/api.document.\$id.save/route.test.ts
```
Expected: PASS for all tests including the two new ones.

- [ ] **Step 6: Commit**

```bash
git add services/web-app/app/routes/api.document.\$id.save/
git commit -m "feat: support 'periodic' revision trigger in save endpoint"
```

---

### Task 8: Create the slim `editor.tsx`

Build the new editor component. Pure ProseMirror host. Owns the editor instance, calls the tripwire and sync hooks, exposes a bridge to its parent. ~250 lines max. NO grade highlights, NO grammar highlights, NO paste alerts (yet — moves later), NO selection toolbars.

**Files:**
- Create: `services/web-app/app/routes/app_.documents_.$id/document-editor/editor.tsx`

- [ ] **Step 1: Implement the new editor**

```tsx
// services/web-app/app/routes/app_.documents_.$id/document-editor/editor.tsx
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import ListItem from '@tiptap/extension-list-item';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { ErrorBoundary } from '../editor/error-boundry';
import { Comment, CommentExtension } from './extensions/comment';
import { LineHeight } from './extensions/line-height';
import { TabIndent } from './extensions/tab-indent';
import { SourceTracker } from './extensions/source-tracker';
import { useEditorSync, type EditorBridge } from './use-editor-sync';
import { usePmTripwire } from './use-pm-tripwire';
import type { SyncStatus } from '~/utils/sync-service';

const extensions = [
  TabIndent,
  LineHeight,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Color.configure({ types: [TextStyle.name, ListItem.name] }),
  // @ts-ignore
  TextStyle.configure({ types: [ListItem.name] }),
  StarterKit.configure({
    bulletList: { keepMarks: true, keepAttributes: false },
    orderedList: { keepMarks: true, keepAttributes: false },
  }),
  Highlight.extend({
    addAttributes() {
      return {
        id: { default: null, renderHTML: ({ id }: any) => ({ id }) },
        class: { default: null, renderHTML: ({ class: cn }: any) => ({ class: cn }) },
      };
    },
  }),
  Comment,
  CommentExtension,
  SourceTracker,
];

type Props = {
  docId: string;
  initialHtml: string;
  initialRevision: number;
  isEditable: boolean;
  onBridgeReady: (bridge: EditorBridge | null) => void;
  onSyncStatusChange?: (status: SyncStatus) => void;
};

export function Editor({
  docId,
  initialHtml,
  initialRevision,
  isEditable,
  onBridgeReady,
  onSyncStatusChange,
}: Props) {
  const editor = useEditor({
    extensions,
    content: initialHtml,
    immediatelyRender: false,
    editable: isEditable,
  });

  usePmTripwire(editor);
  useEditorSync(editor, {
    docId,
    initialRevision,
    onBridgeReady,
    onSyncStatusChange,
  });

  return (
    <ErrorBoundary>
      <div
        className="no-scrollbar grow overflow-y-scroll p-5"
        key={`${docId}-editor`}
      >
        <div className="mx-auto w-full max-w-[920px] font-times">
          <EditorContent
            editor={editor}
            className="h-full pb-5 [&>div]:h-full [&>div]:outline-none"
          />
        </div>
      </div>
    </ErrorBoundary>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

```bash
cd services/web-app
bun run typecheck
```
Expected: no new errors related to `document-editor/editor.tsx`. Existing errors from other files are OK at this stage.

- [ ] **Step 3: Commit**

```bash
git add services/web-app/app/routes/app_.documents_.\$id/document-editor/editor.tsx
git commit -m "feat: add slim editor.tsx (PM host only)"
```

---

### Task 8.5: Extract grade highlights and selection toolbar into `teacher-grading/`

The current `editor/index.tsx` (lines 74-203 and ~277-415, ~784-824) contains DOM-mutation logic for applying grade-comment marks and grammar-issue marks to the editor's read-only view, plus a selection toolbar that floats above selected text in grading mode. None of this belongs in the new slim `editor.tsx` — it's teacher-only behavior. Extract into siblings that mount alongside the editor when in grading mode.

**Files:**
- Create: `services/web-app/app/routes/app_.documents_.$id/teacher-grading/grade-highlights-overlay.tsx`
- Create: `services/web-app/app/routes/app_.documents_.$id/teacher-grading/selection-toolbar.tsx`
- Reference: read `services/web-app/app/routes/app_.documents_.$id/editor/index.tsx` lines 74-203, 277-415, 784-824 to extract the relevant logic.

- [ ] **Step 1: Create `grade-highlights-overlay.tsx`**

```tsx
// services/web-app/app/routes/app_.documents_.$id/teacher-grading/grade-highlights-overlay.tsx
import { useEffect } from 'react';
import { findExcerptRange } from '~/utils/excerpt-position';

export type GradeHighlight = {
  id: string;
  excerpt: string | null;
  occurrence?: number | null;
  dataAttr?: 'data-grade-comment-id' | 'data-grammar-issue-id';
  className?: string;
};

type Props = {
  editorRoot: HTMLElement | null;
  highlights: GradeHighlight[];
  activeGradeCommentId: string | null;
  onGradeCommentSelect: (id: string) => void;
  onGrammarIssueHover: (id: string | null, rect: DOMRect | null) => void;
};

// Helper functions extracted from the old editor/index.tsx (lines 74-203)
function isTextNode(node: Node): node is Text {
  return node.nodeType === Node.TEXT_NODE;
}
function getTextNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current: Node | null;
  while ((current = walker.nextNode())) {
    if (isTextNode(current)) nodes.push(current);
  }
  return nodes;
}
function resolveTextBoundary(root: HTMLElement, absoluteOffset: number) {
  // ... copy from editor/index.tsx lines 89-111 ...
}
function clearReviewMarks(root: HTMLElement) {
  // ... copy from editor/index.tsx lines 113-126 ...
}
function applyReviewHighlights(root: HTMLElement, highlights: GradeHighlight[]) {
  // ... copy from editor/index.tsx lines 128-203 ...
}

export function GradeHighlightsOverlay({
  editorRoot,
  highlights,
  activeGradeCommentId,
  onGradeCommentSelect,
  onGrammarIssueHover,
}: Props) {
  // Apply highlights when they change
  useEffect(() => {
    if (!editorRoot) return;
    clearReviewMarks(editorRoot);
    applyReviewHighlights(editorRoot, highlights);
  }, [editorRoot, highlights]);

  // Toggle .focused class on active grade comment
  useEffect(() => {
    if (!editorRoot) return;
    editorRoot.querySelectorAll<HTMLElement>('.grade-comment-mark').forEach((el) => {
      el.classList.remove('focused');
    });
    if (!activeGradeCommentId) return;
    editorRoot
      .querySelectorAll<HTMLElement>(`[data-grade-comment-id="${activeGradeCommentId}"]`)
      .forEach((el) => el.classList.add('focused'));
  }, [editorRoot, activeGradeCommentId]);

  // Scroll active grade comment into view
  useEffect(() => {
    if (!editorRoot || !activeGradeCommentId) return;
    const first = editorRoot.querySelector<HTMLElement>(
      `[data-grade-comment-id="${activeGradeCommentId}"]`
    );
    first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [editorRoot, activeGradeCommentId]);

  // Click handler for grade comment marks
  useEffect(() => {
    if (!editorRoot) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const mark = target?.closest('[data-grade-comment-id]') as HTMLElement | null;
      if (!mark) return;
      const id = mark.getAttribute('data-grade-comment-id');
      if (id) onGradeCommentSelect(id);
    };
    editorRoot.addEventListener('click', onClick);
    return () => editorRoot.removeEventListener('click', onClick);
  }, [editorRoot, onGradeCommentSelect]);

  // Hover handlers for grade marks (copy from editor/index.tsx lines 326-383)
  useEffect(() => {
    if (!editorRoot) return;
    // ... full handler logic ...
  }, [editorRoot]);

  // Grammar issue hover (copy from editor/index.tsx lines 385-415)
  useEffect(() => {
    if (!editorRoot) return;
    // ... full handler logic ...
  }, [editorRoot, onGrammarIssueHover]);

  return null; // overlay is pure DOM mutation, no JSX
}
```

The component takes the editor's DOM root as a prop and applies all its DOM mutations imperatively. It renders nothing — its only output is side effects on the editor's DOM. Mounted from `route.tsx` only when in teacher grading mode.

**Important:** read the source lines from `editor/index.tsx` and copy the exact helper function bodies. The pseudocode above shows the structure; the actual implementation copies real code.

- [ ] **Step 2: Create `selection-toolbar.tsx`**

```tsx
// services/web-app/app/routes/app_.documents_.$id/teacher-grading/selection-toolbar.tsx
import { useCallback, useEffect, useState } from 'react';
import { GradingSelectionToolbar } from '../editor/grading-selection-toolbar';
import { getSelectionInfo } from '../_components/grading-selection-utils';

type Props = {
  editorRoot: HTMLElement | null;
};

export function SelectionToolbar({ editorRoot }: Props) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!editorRoot) return;

    const updateSelection = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setRect(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!editorRoot.contains(range.commonAncestorContainer)) {
        setRect(null);
        return;
      }
      const excerpt = sel.toString().trim();
      if (!excerpt) {
        setRect(null);
        return;
      }
      setRect(range.getBoundingClientRect());
    };

    const onSelectionChange = () => requestAnimationFrame(updateSelection);
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [editorRoot]);

  const handleCommentRequest = useCallback(() => {
    if (!editorRoot) return;
    const info = getSelectionInfo(editorRoot);
    if (!info) return;
    window.dispatchEvent(new CustomEvent('grading-comment-request', { detail: info }));
    window.getSelection()?.removeAllRanges();
    setRect(null);
  }, [editorRoot]);

  if (!rect) return null;
  return <GradingSelectionToolbar rect={rect} onCommentClick={handleCommentRequest} />;
}
```

- [ ] **Step 3: Update `editor.tsx` to expose its DOM root via a callback**

Add an `onEditorDomReady?: (root: HTMLElement | null) => void` prop to `Editor` in `document-editor/editor.tsx`. Inside the component:

```tsx
const editor = useEditor({ ... });

useEffect(() => {
  if (!editor || !onEditorDomReady) return;
  onEditorDomReady(editor.view.dom as HTMLElement);
  return () => onEditorDomReady(null);
}, [editor, onEditorDomReady]);
```

This lets sibling components (like `GradeHighlightsOverlay`) get a handle to the editor's DOM root for their imperative mutations, without coupling them to the editor's React tree.

- [ ] **Step 4: Verify typecheck**

```bash
cd services/web-app && bun run typecheck
```
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/app_.documents_.\$id/teacher-grading/ \
        services/web-app/app/routes/app_.documents_.\$id/document-editor/editor.tsx
git commit -m "feat: extract grade-highlights-overlay and selection-toolbar to teacher-grading/"
```

---

### Task 9: Move `bar.tsx` to `editor-bar.tsx`

Mechanical move + import path updates. The bar component manages the toolbar (bold, italic, comments, etc.). Move it into `document-editor/` and rename for consistency.

**Files:**
- Move: `services/web-app/app/routes/app_.documents_.$id/editor/bar.tsx` → `document-editor/editor-bar.tsx`

- [ ] **Step 1: Move the file**

```bash
cd services/web-app/app/routes/app_.documents_.\$id
git mv editor/bar.tsx document-editor/editor-bar.tsx
```

- [ ] **Step 2: Update imports inside the moved file**

Use Read tool to inspect `document-editor/editor-bar.tsx`. The relative imports from inside `editor/` likely reference `./extensions/`, `./error-boundry`, etc. Update to:
- `./extensions/comment` (already at the right relative location after Task 5)
- `../editor/error-boundry` (until error-boundry is moved later — leave for now)
- Keep `~/...` absolute imports as-is

- [ ] **Step 3: Find all consumers of the old path and update them**

```bash
cd services/web-app
```
Use Grep tool with pattern `from ['"](\.\/|\.\.\/)*editor\/bar['"]` and update each import to `document-editor/editor-bar`. Most likely consumers:
- `app/routes/app_.documents_.$id/editor/index.tsx` (still exists at this point)
- Any test file

- [ ] **Step 4: Run typecheck**

```bash
bun run typecheck
```
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/app_.documents_.\$id/document-editor/editor-bar.tsx \
        services/web-app/app/routes/app_.documents_.\$id/editor/bar.tsx
git commit -m "refactor: rename bar.tsx → editor-bar.tsx and move to document-editor/"
```

---

### Task 10: Create `document-editor.tsx` (top-level wrapper)

The component the route renders. Wraps `Editor` + `EditorBar` and handles the IDB-aware hydration logic that was previously in `route.tsx`.

**Files:**
- Create: `services/web-app/app/routes/app_.documents_.$id/document-editor/document-editor.tsx`

- [ ] **Step 1: Implement the wrapper**

```tsx
// services/web-app/app/routes/app_.documents_.$id/document-editor/document-editor.tsx
import { useEffect, useState } from 'react';
import { documentStore } from '~/utils/document-store';
import type { SyncStatus } from '~/utils/sync-service';
import { Editor } from './editor';
import { EditorBar } from './editor-bar';
import type { EditorBridge } from './use-editor-sync';

type Props = {
  docId: string;
  serverHtml: string;
  serverText: string;
  serverUpdatedAt: string | Date;
  initialRevision: number;
  isEditable: boolean;
  onBridgeReady: (bridge: EditorBridge | null) => void;
  onSyncStatusChange?: (status: SyncStatus) => void;
  onCommentCreated?: (comment: any) => void;
};

type HydratedContent = { html: string; text: string; source: 'server' | 'local' };

export function DocumentEditor({
  docId,
  serverHtml,
  serverText,
  serverUpdatedAt,
  initialRevision,
  isEditable,
  onBridgeReady,
  onSyncStatusChange,
  onCommentCreated,
}: Props) {
  const [hydrated, setHydrated] = useState<HydratedContent | null>(null);

  // IDB-aware hydration: pick whichever source is newer
  useEffect(() => {
    let cancelled = false;
    documentStore
      .get(docId)
      .then((entry) => {
        if (cancelled) return;
        if (entry && entry.updatedAt > new Date(serverUpdatedAt).getTime()) {
          setHydrated({ html: entry.html, text: entry.text, source: 'local' });
        } else {
          setHydrated({ html: serverHtml, text: serverText, source: 'server' });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHydrated({ html: serverHtml, text: serverText, source: 'server' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [docId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!hydrated) {
    // Skeleton while we wait for IDB read
    return <div className="flex h-full w-full items-center justify-center text-muted-foreground">Loading editor…</div>;
  }

  return (
    <div className="flex w-full flex-col overflow-hidden border-r md:h-full">
      {isEditable ? <EditorBar documentId={docId} onCommentCreated={onCommentCreated} /> : null}
      <Editor
        docId={docId}
        initialHtml={hydrated.html}
        initialRevision={initialRevision}
        isEditable={isEditable}
        onBridgeReady={onBridgeReady}
        onSyncStatusChange={onSyncStatusChange}
      />
    </div>
  );
}
```

Note: `EditorBar` expects an `editor` prop in the current implementation. We need to thread that through. Update `editor.tsx` (Task 8) to also call back with the editor instance, OR move `EditorBar` *inside* `editor.tsx` rendering. Cleanest: move `EditorBar` rendering into `editor.tsx` since they share the editor instance, and pass the bar's outer props through `Editor`.

**Refinement to Task 8:** rather than a separate `EditorBar`-passing pattern, have `Editor` render the bar internally. Update `editor.tsx`:

```tsx
return (
  <ErrorBoundary>
    <div className="flex w-full flex-col overflow-hidden border-r md:h-full">
      {isEditable && editor ? (
        <EditorBar editor={editor} documentId={docId} isEditable={isEditable} onCommentCreated={onCommentCreated} />
      ) : null}
      <div className="no-scrollbar grow overflow-y-scroll p-5" key={`${docId}-editor`}>
        <div className="mx-auto w-full max-w-[920px] font-times">
          <EditorContent editor={editor} className="..." />
        </div>
      </div>
    </div>
  </ErrorBoundary>
);
```

And drop the bar from `document-editor.tsx`:

```tsx
return (
  <Editor
    docId={docId}
    initialHtml={hydrated.html}
    initialRevision={initialRevision}
    isEditable={isEditable}
    onBridgeReady={onBridgeReady}
    onSyncStatusChange={onSyncStatusChange}
    onCommentCreated={onCommentCreated}
  />
);
```

Add `onCommentCreated` to `Editor` props.

- [ ] **Step 2: Apply the bar refinement to `editor.tsx`**

Edit `services/web-app/app/routes/app_.documents_.$id/document-editor/editor.tsx` to import `EditorBar` and render it inside the editor's wrapper div. Add `onCommentCreated?: (c: any) => void` to Props.

- [ ] **Step 3: Verify typecheck**

```bash
cd services/web-app && bun run typecheck
```
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add services/web-app/app/routes/app_.documents_.\$id/document-editor/document-editor.tsx \
        services/web-app/app/routes/app_.documents_.\$id/document-editor/editor.tsx
git commit -m "feat: add document-editor.tsx wrapper with IDB-aware hydration"
```

---

### Task 11: Create `use-tutor-state` hook

Local-state owner for tutor messages and CMS data. Provides callbacks the tutor child calls after server mutations. Replaces the loader-revalidation-via-`?spa=1` pattern.

**Files:**
- Create: `services/web-app/app/routes/app_.documents_.$id/hooks/use-tutor-state.ts`
- Create: `services/web-app/app/routes/app_.documents_.$id/hooks/use-tutor-state.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
// services/web-app/app/routes/app_.documents_.$id/hooks/use-tutor-state.test.tsx
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTutorState } from './use-tutor-state';

describe('useTutorState', () => {
  const initialCms = {
    id: 'cms-1',
    messages: [{ id: 'm1', agent: 'assistant', content: 'hello' }],
  };

  it('initializes from the loader-provided cms', () => {
    const { result } = renderHook(() => useTutorState(initialCms as any));
    expect(result.current.cms).toEqual(initialCms);
  });

  it('replaces cms when updateCms is called', () => {
    const { result } = renderHook(() => useTutorState(initialCms as any));
    const next = { id: 'cms-1', messages: [...initialCms.messages, { id: 'm2', agent: 'user', content: 'hi' }] };

    act(() => result.current.updateCms(next as any));

    expect(result.current.cms.messages).toHaveLength(2);
    expect(result.current.cms.messages[1].content).toBe('hi');
  });

  it('handles cms switch (advance to next module)', () => {
    const { result } = renderHook(() => useTutorState(initialCms as any));
    const newCms = { id: 'cms-2', messages: [] };

    act(() => result.current.updateCms(newCms as any));

    expect(result.current.cms.id).toBe('cms-2');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun test app/routes/app_.documents_.\$id/hooks/use-tutor-state.test.tsx
```
Expected: FAIL (module not found)

- [ ] **Step 3: Implement the hook**

```ts
// services/web-app/app/routes/app_.documents_.$id/hooks/use-tutor-state.ts
import { useCallback, useState } from 'react';

export type TutorCms = {
  id: string;
  messages: Array<{
    id: string;
    agent: string;
    content: string;
    createdAt?: string | Date;
  }>;
  // Other CMS fields as needed by the UI
  [key: string]: any;
};

export function useTutorState(initialCms: TutorCms) {
  const [cms, setCms] = useState<TutorCms>(initialCms);

  const updateCms = useCallback((next: TutorCms) => {
    setCms(next);
  }, []);

  return { cms, updateCms };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test app/routes/app_.documents_.\$id/hooks/use-tutor-state.test.tsx
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/app_.documents_.\$id/hooks/use-tutor-state.ts \
        services/web-app/app/routes/app_.documents_.\$id/hooks/use-tutor-state.test.tsx
git commit -m "feat: add use-tutor-state hook for local cms state"
```

---

### Task 12: Refactor tutor endpoints to return updated cms

Three endpoints currently mutate server state and rely on the client navigating to `?spa=1` to revalidate. Change them to return the updated cms (with messages) in their JSON response so the client can store it locally.

**Files:**
- Modify: `services/web-app/app/routes/api.domain.tutor-response/route.ts`
- Modify: `services/web-app/app/routes/api.model.course-module-session.$id/route.ts`
- Modify: `services/web-app/app/routes/api.model.course-module-session/route.ts`
- Modify: tests for each (if they exist)

- [ ] **Step 1: Read each endpoint to understand its current return shape**

Use Read tool on all three files. Identify what each currently returns and where the cms data needs to be loaded post-mutation.

- [ ] **Step 2: For `api.domain.tutor-response/route.ts`, return the updated cms**

After the mutation, query the cms with full message list and return it:

```ts
// At the end of the action, after the server-side mutation completes:
const updatedCms = await prisma.studentCourseModuleSession.findUnique({
  where: { id: cmsId },
  include: {
    messages: { orderBy: { createdAt: 'asc' } },
    studentCourseModule: {
      include: {
        instructions: { orderBy: { position: 'asc' }, include: { buttons: { orderBy: { position: 'asc' } } } },
        studentCourse: { select: { studentCourseModules: { select: { id: true, position: true }, orderBy: { position: 'asc' } } } },
      },
    },
  },
});

return dataResponse({ cms: updatedCms });
```

(Use the Read tool first to see the EXACT current shape — this is the conceptual change.)

- [ ] **Step 3: Same change for `course-module-session/$id` (instruction increment/decrement)**

After the mutation, query and return the updated cms with the same shape.

- [ ] **Step 4: Same change for `course-module-session/index` (advance to next module)**

After creating the new cms, query and return it with the same shape. Note: this endpoint might create a NEW cms, so the returned `cms` is the new one, not the old one.

- [ ] **Step 5: Run tests for these endpoints (if any exist)**

```bash
cd services/web-app
bun test app/routes/api.domain.tutor-response/ app/routes/api.model.course-module-session/
```
Expected: pass — but you may need to update test expectations to match the new return shape.

- [ ] **Step 6: Commit**

```bash
git add services/web-app/app/routes/api.domain.tutor-response/ \
        services/web-app/app/routes/api.model.course-module-session/ \
        services/web-app/app/routes/api.model.course-module-session.\$id/
git commit -m "refactor: tutor/cms endpoints return updated cms in response (no more loader revalidation)"
```

---

### Task 13: Refactor `tutor/index.tsx` to use returned cms (kill `?spa=1`)

Move `tutor/index.tsx` to `tutor/tutor.tsx` and update it to read the returned cms from each fetch and pass it up via a callback prop instead of calling `navigate('?spa=1')`.

**Files:**
- Move: `services/web-app/app/routes/app_.documents_.$id/tutor/index.tsx` → `tutor/tutor.tsx`
- Modify: the moved file

- [ ] **Step 1: Move the file**

```bash
cd services/web-app/app/routes/app_.documents_.\$id
git mv tutor/index.tsx tutor/tutor.tsx
```

- [ ] **Step 2: Update component props**

Add `onCmsUpdate: (cms: TutorCms) => void` to the Props type. Remove `navigate` and `searchParams` usage related to `?spa=1`.

- [ ] **Step 3: Update each mutation call to use the returned cms**

Find each `navigate(\`/app/documents/\${docId}?spa=1\`, { replace: true })` callsite (4 of them: line 147, 170, 188, 207 in the current file). Replace each with:

```ts
const json = await res.json();
if (json?.cms) {
  onCmsUpdate(json.cms);
}
```

For example, in `respondToTutor`:

```ts
const res = await fetch('/api/domain/tutor-response', {
  method: 'POST',
  body: formData,
});
const json = await res.json();
if (!res.ok || json.error) {
  setTutorError(json.error ?? 'An error occurred.');
  setOptimisticMessage(null);
} else {
  setOptimisticMessage(null);
  setIsTutorResponding(false);
  if (json?.cms) onCmsUpdate(json.cms);
  return;
}
```

- [ ] **Step 4: Remove the `?spa=1` cleanup useEffect (lines 226-232 in the current file)**

```ts
// Delete this entire effect:
useEffect(() => {
  if (!searchParams.has('spa')) return;
  const next = new URLSearchParams(searchParams);
  next.delete('spa');
  setSearchParams(next, { replace: true });
}, [searchParams, setSearchParams]);
```

- [ ] **Step 5: Update the import in `route.tsx`**

```bash
cd services/web-app
```
Use Grep tool with pattern `from ['"]\.\/tutor['"]|from ['"]\.\/tutor\/index['"]` to find consumers. Update to `from './tutor/tutor'`.

- [ ] **Step 6: Run typecheck**

```bash
bun run typecheck
```
Expected: no new errors. Errors about `route.tsx` still passing `searchParams` to Tutor that no longer needs them are expected — those will be resolved in Task 17.

- [ ] **Step 7: Commit**

```bash
git add services/web-app/app/routes/app_.documents_.\$id/tutor/
git commit -m "refactor: tutor uses returned cms from fetch (kills ?spa=1 navigation)"
```

---

### Task 14: Create `use-comments-state` hook

Local-state owner for comments. Same pattern as `use-tutor-state` but for the comments collection.

**Files:**
- Create: `services/web-app/app/routes/app_.documents_.$id/hooks/use-comments-state.ts`
- Create: `services/web-app/app/routes/app_.documents_.$id/hooks/use-comments-state.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
// services/web-app/app/routes/app_.documents_.$id/hooks/use-comments-state.test.tsx
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCommentsState } from './use-comments-state';

describe('useCommentsState', () => {
  const initial = [
    { id: 'c1', content: 'first', responses: [] },
    { id: 'c2', content: 'second', responses: [] },
  ];

  it('initializes from loader-provided comments', () => {
    const { result } = renderHook(() => useCommentsState(initial as any));
    expect(result.current.comments).toHaveLength(2);
  });

  it('appends a new comment via addComment', () => {
    const { result } = renderHook(() => useCommentsState(initial as any));
    act(() => {
      result.current.addComment({ id: 'c3', content: 'third', responses: [] } as any);
    });
    expect(result.current.comments).toHaveLength(3);
    expect(result.current.comments[2].id).toBe('c3');
  });

  it('appends a response to an existing comment via addResponse', () => {
    const { result } = renderHook(() => useCommentsState(initial as any));
    act(() => {
      result.current.addResponse('c1', { id: 'r1', content: 'reply' } as any);
    });
    expect(result.current.comments[0].responses).toHaveLength(1);
    expect(result.current.comments[0].responses[0].id).toBe('r1');
  });

  it('does nothing when addResponse references a non-existent comment id', () => {
    const { result } = renderHook(() => useCommentsState(initial as any));
    act(() => {
      result.current.addResponse('does-not-exist', { id: 'r1', content: 'orphan' } as any);
    });
    expect(result.current.comments).toEqual(initial);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun test app/routes/app_.documents_.\$id/hooks/use-comments-state.test.tsx
```
Expected: FAIL (module not found)

- [ ] **Step 3: Implement the hook**

```ts
// services/web-app/app/routes/app_.documents_.$id/hooks/use-comments-state.ts
import { useCallback, useState } from 'react';

export type DocComment = {
  id: string;
  content: string;
  responses: any[];
  [key: string]: any;
};

export function useCommentsState(initialComments: DocComment[]) {
  const [comments, setComments] = useState<DocComment[]>(initialComments);

  const addComment = useCallback((comment: DocComment) => {
    setComments((prev) => [...prev, comment]);
  }, []);

  const addResponse = useCallback((commentId: string, response: any) => {
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? { ...c, responses: [...(c.responses ?? []), response] }
          : c
      )
    );
  }, []);

  return { comments, addComment, addResponse };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test app/routes/app_.documents_.\$id/hooks/use-comments-state.test.tsx
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/app_.documents_.\$id/hooks/use-comments-state.ts \
        services/web-app/app/routes/app_.documents_.\$id/hooks/use-comments-state.test.tsx
git commit -m "feat: add use-comments-state hook"
```

---

### Task 15: Create `use-auth-heartbeat` hook

Encapsulates the session-lock + login-redirect dance currently scattered across route.tsx (~80 lines).

**Files:**
- Create: `services/web-app/app/routes/app_.documents_.$id/hooks/use-auth-heartbeat.ts`

- [ ] **Step 1: Read the existing auth code in route.tsx**

Use Read tool on `services/web-app/app/routes/app_.documents_.$id/route.tsx` lines 690-905 to understand:
- `lockSession`, `checkAuthSession`, `handleLoginRedirect`
- The two `useEffect` blocks at ~822 (initial check) and ~899 (periodic 5min)
- The visibility/focus listeners

- [ ] **Step 2: Implement the hook**

```ts
// services/web-app/app/routes/app_.documents_.$id/hooks/use-auth-heartbeat.ts
import { useCallback, useEffect, useState } from 'react';

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

type Options = {
  documentId: string;
  isEditable: boolean;
  onLockTriggered?: () => void;
};

export function useAuthHeartbeat({ documentId, isEditable, onLockTriggered }: Options) {
  const [isLocked, setIsLocked] = useState(false);
  const [isInitialCheckComplete, setIsInitialCheckComplete] = useState(false);

  const lockSession = useCallback(() => {
    setIsLocked(true);
    onLockTriggered?.();
  }, [onLockTriggered]);

  const checkAuthSession = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/check', { cache: 'no-store' });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          lockSession();
          return false;
        }
        return true;
      }
      const data = (await response.json()) as { valid?: boolean };
      if (!data?.valid) {
        lockSession();
        return false;
      }
      return true;
    } catch {
      return true;
    }
  }, [lockSession]);

  // Reset lock when documentId changes
  useEffect(() => {
    setIsLocked(false);
  }, [documentId]);

  // Initial auth check + focus/visibility listeners
  useEffect(() => {
    if (!isEditable) {
      setIsInitialCheckComplete(true);
      return;
    }
    let cancelled = false;
    setIsInitialCheckComplete(false);

    const runInitialCheck = async () => {
      await checkAuthSession();
      if (!cancelled) setIsInitialCheckComplete(true);
    };

    const onFocus = () => {
      if (document.visibilityState !== 'visible') return;
      void checkAuthSession();
    };
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      void checkAuthSession();
    };

    void runInitialCheck();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [checkAuthSession, documentId, isEditable]);

  // Periodic 5-min heartbeat
  useEffect(() => {
    if (!isEditable) return;
    const interval = setInterval(() => {
      void checkAuthSession();
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isEditable, checkAuthSession]);

  return {
    isLocked,
    isInitialCheckComplete,
    checkAuthSession,
  };
}
```

- [ ] **Step 3: Verify typecheck**

```bash
cd services/web-app && bun run typecheck
```
Expected: no new errors related to the new hook.

- [ ] **Step 4: Commit**

```bash
git add services/web-app/app/routes/app_.documents_.\$id/hooks/use-auth-heartbeat.ts
git commit -m "feat: extract use-auth-heartbeat hook from route.tsx"
```

---

### Task 16: Create `use-document-submit` hook

Encapsulates the flush-then-submit flow.

**Files:**
- Create: `services/web-app/app/routes/app_.documents_.$id/hooks/use-document-submit.ts`

- [ ] **Step 1: Implement the hook**

```ts
// services/web-app/app/routes/app_.documents_.$id/hooks/use-document-submit.ts
import { useCallback, useState, type RefObject } from 'react';
import { toast } from 'sonner';
import type { EditorBridge } from '../document-editor/use-editor-sync';

type Options = {
  documentId: string;
  editorBridgeRef: RefObject<EditorBridge | null>;
  onSubmitted?: () => void;
};

export function useDocumentSubmit({ documentId, editorBridgeRef, onSubmitted }: Options) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitNow = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      // 1. Flush latest editor content to server
      if (editorBridgeRef.current) {
        await editorBridgeRef.current.saveNow({ source: 'pre-submit-flush' });
      }

      // 2. POST submit
      const formData = new FormData();
      formData.append('documentId', documentId);
      const res = await fetch('/api/domain/submit-document', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(body?.message ?? 'Submission failed.');
        return;
      }

      toast.success('Submitted!');
      onSubmitted?.();
    } catch (err) {
      toast.error('Submission failed: ' + (err instanceof Error ? err.message : 'unknown'));
    } finally {
      setIsSubmitting(false);
    }
  }, [documentId, editorBridgeRef, isSubmitting, onSubmitted]);

  return { submitNow, isSubmitting };
}
```

- [ ] **Step 2: Verify typecheck**

```bash
cd services/web-app && bun run typecheck
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add services/web-app/app/routes/app_.documents_.\$id/hooks/use-document-submit.ts
git commit -m "feat: extract use-document-submit hook with flush-then-submit"
```

---

### Task 17: Refactor `route.tsx` to thin shell

The biggest single edit in Phase 1. Replace `route.tsx`'s 1507 lines (excluding the loader) with ~250 lines that compose the new hooks and components. The loader stays as-is for now (Phase 2 will refactor the snapshot/grade reads). Remove the `?spa=1` exception in `shouldRevalidate`. Delete the `recoverPendingSave` flow, the editor-ready window event bus, the 500ms hasEditorContent polling, and all the inline state management that's now in hooks.

**Files:**
- Modify: `services/web-app/app/routes/app_.documents_.$id/route.tsx`

- [ ] **Step 1: Take a snapshot of the current route.tsx loader (so we don't accidentally lose loader logic)**

```bash
cd ~/brocksoftware/yawp-2.0
git show HEAD:services/web-app/app/routes/app_.documents_.\$id/route.tsx > /tmp/route-tsx-before.tsx
```
(This is just for reference during the rewrite — not committed.)

- [ ] **Step 2: Rewrite `shouldRevalidate` to return false unconditionally**

In `route.tsx`, find the `shouldRevalidate` export (currently lines 404-416) and replace with:

```ts
export function shouldRevalidate(_args: ShouldRevalidateFunctionArgs) {
  // Never revalidate the document page loader. The editor owns
  // document state client-side. Server state flows through explicit
  // fetch() calls + local React state, not loader revalidation.
  return false;
}
```

Remove the import of `ShouldRevalidateFunctionArgs` if it becomes unused (it won't — keep for the param type).

- [ ] **Step 3: Replace the entire Route component (the default export)**

Replace the existing `export default function Route()` with a thin shell. The replacement is large but mechanical. Below is the target:

```tsx
export default function Route() {
  const data = useLoaderData<typeof loader>();
  const user = useUser();
  const navigate = useNavigate();
  const breakpoint = useBreakpoint();
  const [searchParams, setSearchParams] = useSearchParams();

  // Routing-level state (cheap, derived from URL)
  const tab = searchParams.get('tab') ?? 'tutor';
  const leftPanel = searchParams.get('left') ?? 'tutor';
  const isReviseMode = searchParams.get('revise') === '1';
  const isMobile = ['base', 'sm', 'md'].includes(breakpoint ?? '');

  // Derived flags
  const activeSnapshot = data.activeSnapshot ?? data.doc.submittedSnapshot;
  const isViewingAsTeacher = data.doc && user.id !== data.doc?.profile.userId;
  const isSubmitted = data.doc.submittedAt !== null;
  const grade = activeSnapshot?.grades?.[0];
  const isTeacherSnapshotView = isViewingAsTeacher && Boolean(activeSnapshot?.id);
  const canUseGradingPanel = data.isDocumentSubmissionEnabled && isViewingAsTeacher && isSubmitted;
  const isTeacherGradingTabOpen = canUseGradingPanel && leftPanel === 'grading';
  const isDocumentEditable = !isViewingAsTeacher || !isTeacherGradingTabOpen;

  // Server-derived editor seed
  const serverHtml =
    isTeacherSnapshotView && activeSnapshot?.html
      ? activeSnapshot.html
      : data.doc.html ?? '';
  const serverText =
    (isTeacherSnapshotView ? activeSnapshot?.text : data.doc.text) ?? '';

  // Refs
  const editorBridgeRef = useRef<EditorBridge | null>(null);

  // Hooks (one per concern)
  const auth = useAuthHeartbeat({
    documentId: data.doc.id,
    isEditable: isDocumentEditable,
  });
  const tutor = useTutorState(data.currentCms ?? data.doc.studentCourseModuleSessions?.[0] ?? null);
  const comments = useCommentsState(data.doc.comments ?? []);
  const submit = useDocumentSubmit({
    documentId: data.doc.id,
    editorBridgeRef,
    onSubmitted: () => navigate('/app'),
  });

  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [isSaving, setIsSaving] = useState(false);

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-white">
      <Header
        documentId={data.doc.id}
        title={data.doc.title}
        isTeacher={isViewingAsTeacher}
        syncStatus={syncStatus}
        isSaving={isSaving}
        onExit={() => navigate('/app')}
      />

      <div className="flex grow overflow-hidden">
        <DocumentEditor
          docId={data.doc.id}
          serverHtml={serverHtml}
          serverText={serverText}
          serverUpdatedAt={data.doc.updatedAt}
          initialRevision={data.doc.revision}
          isEditable={isDocumentEditable && !auth.isLocked}
          onBridgeReady={(b) => { editorBridgeRef.current = b; }}
          onSyncStatusChange={setSyncStatus}
          onCommentCreated={comments.addComment}
        />

        <SidePanel tab={tab} onTabChange={(v) => {
          const params = new URLSearchParams(searchParams);
          params.set('tab', v);
          setSearchParams(params, { replace: true });
        }}>
          {tab === 'tutor' && (
            <Tutor
              cms={tutor.cms}
              docId={data.doc.id}
              isSessionLocked={auth.isLocked}
              onCmsUpdate={tutor.updateCms}
              getCurrentDocumentText={() => editorBridgeRef.current?.getContent().text ?? ''}
              beforeRespond={async () => {
                await editorBridgeRef.current?.saveNow();
                return await auth.checkAuthSession();
              }}
            />
          )}
          {tab === 'comments' && (
            <Comments
              documentId={data.doc.id}
              comments={comments.comments}
              onCommentAdded={comments.addComment}
              onResponseAdded={comments.addResponse}
            />
          )}
        </SidePanel>
      </div>

      {!isViewingAsTeacher && !isSubmitted && (
        <SubmitButton
          onClick={submit.submitNow}
          disabled={submit.isSubmitting || isSaving}
        />
      )}
    </main>
  );
}
```

Note: `Header`, `SidePanel`, and `SubmitButton` are presentational components that probably already exist (or are inline JSX in the current route.tsx). Either keep them inline or extract to small files. For Phase 1, leave inline as JSX if simpler — the goal is `route.tsx` ≤ 250 lines, not perfect decomposition.

- [ ] **Step 4: Add the new imports**

At the top of `route.tsx`:

```ts
import { useRef, useState } from 'react';  // remove useEffect, useCallback, useMemo if unused
import { DocumentEditor } from './document-editor/document-editor';
import { useAuthHeartbeat } from './hooks/use-auth-heartbeat';
import { useTutorState } from './hooks/use-tutor-state';
import { useCommentsState } from './hooks/use-comments-state';
import { useDocumentSubmit } from './hooks/use-document-submit';
import type { EditorBridge } from './document-editor/use-editor-sync';
import { Tutor } from './tutor/tutor';
import { Comments } from './comments';
```

Remove imports that are no longer used:
- `setPendingSave`, `getPendingSave`, `clearPendingSave` (the entire pending-document-save module — to be deleted in Task 21)
- `findExcerptRange` if no longer referenced
- `Editor` from `./editor/index` (use `DocumentEditor` instead)
- All grammar-issue / grade-comment / persistedGrammarIssues stuff if it's not needed in this file (most of it stays for the teacher view path — leave for now, will extract in Phase 3)

- [ ] **Step 5: Run typecheck**

```bash
cd services/web-app && bun run typecheck
```
Expected: a few errors about removed imports and any logic that referenced state now living in hooks. Fix iteratively.

- [ ] **Step 6: Run unit tests**

```bash
bun test
```
Expected: passing or only failing on tests that need updates for the new structure (which we'll address in subsequent tasks).

- [ ] **Step 7: Verify line count**

```bash
wc -l services/web-app/app/routes/app_.documents_.\$id/route.tsx
```
Expected: ≤ 350 lines (target ~250 but allow some slack for the loader function).

- [ ] **Step 8: Commit**

```bash
git add services/web-app/app/routes/app_.documents_.\$id/route.tsx
git commit -m "refactor: collapse route.tsx into thin shell using extracted hooks (1507 → ~250 lines)"
```

---

### Task 18: Delete `pending-document-save.ts` and its tests

The localStorage layer for "unsaved content during login redirect" is redundant — IDB-aware hydration in `document-editor.tsx` (Task 10) handles this case.

**Files:**
- Delete: `services/web-app/app/utils/pending-document-save.ts`
- Delete: `services/web-app/app/utils/pending-document-save.test.ts`

- [ ] **Step 1: Verify no remaining consumers**

```bash
cd services/web-app
```
Use Grep tool with pattern `pending-document-save|setPendingSave|getPendingSave|clearPendingSave` and verify the only matches are in the two files about to be deleted.

- [ ] **Step 2: Delete the files**

```bash
git rm services/web-app/app/utils/pending-document-save.ts \
       services/web-app/app/utils/pending-document-save.test.ts
```

- [ ] **Step 3: Run tests to verify nothing broke**

```bash
bun test
```
Expected: PASS (or the same baseline of failures as before).

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: delete pending-document-save (replaced by IDB hydration)"
```

---

### Task 19: Delete `editor-content-context.tsx`

Pure dead code — verified earlier as having zero consumers.

**Files:**
- Delete: `services/web-app/app/routes/app_.documents_.$id/editor/editor-content-context.tsx`

- [ ] **Step 1: Final consumer check**

Use Grep tool with pattern `editor-content-context|EditorContentProvider|useEditorContent` to verify zero matches outside the file itself.

- [ ] **Step 2: Delete the file**

```bash
git rm services/web-app/app/routes/app_.documents_.\$id/editor/editor-content-context.tsx
```

- [ ] **Step 3: Run typecheck**

```bash
cd services/web-app && bun run typecheck
```
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: delete unused editor-content-context.tsx"
```

---

### Task 20: Delete the old `editor/index.tsx`

This is the 873-line monolith that's been replaced by `document-editor/editor.tsx` + hooks. After Tasks 8 and 17 land, no consumers remain.

**Files:**
- Delete: `services/web-app/app/routes/app_.documents_.$id/editor/index.tsx`

- [ ] **Step 1: Verify no consumers**

```bash
cd services/web-app
```
Use Grep tool with pattern `from ['"](\.\/|\.\.\/)*editor['"]|from ['"](\.\/|\.\.\/)*editor\/index['"]` and confirm no matches reference the old `editor/index.tsx` (matches against `document-editor/editor` are fine).

- [ ] **Step 2: Delete the file**

```bash
git rm services/web-app/app/routes/app_.documents_.\$id/editor/index.tsx
```

- [ ] **Step 3: Delete error-boundry.tsx if no longer used (or move it)**

Check if `editor/error-boundry.tsx` is still referenced. If only `document-editor/editor.tsx` uses it, move it:

```bash
git mv services/web-app/app/routes/app_.documents_.\$id/editor/error-boundry.tsx \
       services/web-app/app/routes/app_.documents_.\$id/document-editor/error-boundry.tsx
```

Update the import in `document-editor/editor.tsx` from `../editor/error-boundry` to `./error-boundry`.

- [ ] **Step 4: Delete the now-empty `editor/` folder if applicable**

```bash
ls services/web-app/app/routes/app_.documents_.\$id/editor/
```
If the folder still has `commands/` and `grading-selection-toolbar.tsx`, leave them — they're handled in later tasks. If empty, `rmdir`.

- [ ] **Step 5: Run typecheck and tests**

```bash
bun run typecheck && bun test
```
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add services/web-app/app/routes/app_.documents_.\$id/document-editor/ \
        services/web-app/app/routes/app_.documents_.\$id/editor/
git commit -m "chore: delete old editor/index.tsx (replaced by document-editor/)"
```

---

### Task 21: Delete the old `_components/document-versions.tsx`

The 376-line UI for the dead `DocumentVersion` model. Replaced by `document-history/document-history.tsx` (which already exists from PR #91 work — we'll wire it up in the next task).

**Files:**
- Delete: `services/web-app/app/routes/app_.documents_.$id/_components/document-versions.tsx`

- [ ] **Step 1: Find consumers**

```bash
cd services/web-app
```
Use Grep tool with pattern `from ['"].*_components/document-versions['"]` to find import sites. Most likely: `route.tsx` or one of the panel components.

- [ ] **Step 2: Replace consumers' import with `document-history`**

For each consumer, replace `import { DocumentVersions } from '.../_components/document-versions'` with `import { DocumentHistory } from '.../document-history/document-history'`. Update JSX usage from `<DocumentVersions ... />` to `<DocumentHistory ... />`. The props may differ — adjust accordingly.

- [ ] **Step 3: Delete the file**

```bash
git rm services/web-app/app/routes/app_.documents_.\$id/_components/document-versions.tsx
```

- [ ] **Step 4: Move `document-history.tsx` from `_components` to `document-history/`**

```bash
git mv services/web-app/app/routes/app_.documents_.\$id/_components/document-history.tsx \
       services/web-app/app/routes/app_.documents_.\$id/document-history/document-history.tsx
```

(Note: this assumes `document-history.tsx` was cherry-picked from #91 in Task 1. If not, cherry-pick now.)

- [ ] **Step 5: Update import paths in consumers**

```bash
cd services/web-app
```
Update any `from '.../_components/document-history'` to `from '.../document-history/document-history'`.

- [ ] **Step 6: Run typecheck**

```bash
bun run typecheck
```
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add services/web-app/app/routes/app_.documents_.\$id/_components/ \
        services/web-app/app/routes/app_.documents_.\$id/document-history/
git commit -m "chore: delete document-versions.tsx, move document-history into its own folder"
```

---

### Task 22: Delete DocumentVersion API routes

`api.model.document.$id.versions/route.ts` (read versions) and `api.domain.restore-document-version/route.ts` (restore from version).

**Files:**
- Delete: `services/web-app/app/routes/api.model.document.$id.versions/route.ts` (and tests)
- Delete: `services/web-app/app/routes/api.domain.restore-document-version/route.ts` (and tests)

- [ ] **Step 1: Find consumers of either endpoint**

```bash
cd services/web-app
```
Use Grep tool with pattern `api/model/document/.*/versions|api/domain/restore-document-version` to find any frontend caller. Most likely the now-deleted `document-versions.tsx`.

- [ ] **Step 2: Delete the routes**

```bash
git rm -r services/web-app/app/routes/api.model.document.\$id.versions/ \
         services/web-app/app/routes/api.domain.restore-document-version/
```

- [ ] **Step 3: Run typecheck and tests**

```bash
bun run typecheck && bun test
```
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: delete DocumentVersion API routes (read + restore)"
```

---

### Task 23: Schema migration — drop DocumentVersion, backfill into DocumentRevision

**Files:**
- Modify: `packages/prisma/schema.prisma` (remove `DocumentVersion` model and the `versions` relation on `Document`)
- Create: `packages/prisma/migrations/<timestamp>_drop_document_version/migration.sql`

- [ ] **Step 1: Remove `DocumentVersion` from schema.prisma**

```bash
cd packages/prisma
```
Use Edit tool on `schema.prisma` to remove the `model DocumentVersion { ... }` block AND remove the `versions DocumentVersion[]` line from `model Document`.

- [ ] **Step 2: Generate the migration**

```bash
bunx prisma migrate dev --name drop_document_version --create-only
```
Expected: a new migration file appears. Inspect it — Prisma will auto-generate `DROP TABLE "DocumentVersion"`.

- [ ] **Step 3: Edit the migration to also backfill before dropping**

Open the generated `migration.sql` and prepend the backfill INSERT before the DROP TABLE:

```sql
-- Backfill existing DocumentVersion rows into DocumentRevision
INSERT INTO "DocumentRevision" (id, "createdAt", "documentId", html, text, trigger)
SELECT id, "createdAt", "documentId", html, text, 'imported-version'
FROM "DocumentVersion"
WHERE NOT EXISTS (
  SELECT 1 FROM "DocumentRevision" r WHERE r.id = "DocumentVersion".id
);

-- Now drop the old table (Prisma's auto-generated DROP follows)
```

- [ ] **Step 4: Apply the migration**

```bash
bunx prisma migrate dev
```
Expected: backfill runs, then table drops.

- [ ] **Step 5: Verify the relation is gone from generated client**

```bash
bunx prisma generate
```
Expected: no errors. Generated types no longer have `Document.versions`.

- [ ] **Step 6: Run app tests to catch any remaining `versions` references**

```bash
cd services/web-app
bun run typecheck
```
Expected: errors about `data.doc.versions` or similar — find and fix each. The loader in `route.tsx` still selects `versions: { orderBy: { createdAt: 'desc' } }` — remove that select. Replace with a fetch to `/api/document/:id/revisions` (the new endpoint cherry-picked in Task 1) wherever the timeline UI needs it.

- [ ] **Step 7: Run all tests**

```bash
bun test
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/prisma/schema.prisma \
        packages/prisma/migrations/ \
        services/web-app/app/routes/app_.documents_.\$id/route.tsx
git commit -m "feat: drop DocumentVersion table, backfill into DocumentRevision"
```

---

### Task 24: Move `comments/index.tsx` → `comments/comments.tsx`

Pure rename for consistency with the new naming convention.

**Files:**
- Move: `services/web-app/app/routes/app_.documents_.$id/comments/index.tsx` → `comments.tsx`

- [ ] **Step 1: Move the file**

```bash
cd services/web-app/app/routes/app_.documents_.\$id
git mv comments/index.tsx comments/comments.tsx
```

- [ ] **Step 2: Update consumers**

Use Grep tool with pattern `from ['"]\.\/comments['"]|from ['"]\.\/comments\/index['"]` and update each to `from './comments/comments'`.

- [ ] **Step 3: Add a barrel re-export at `comments/index.ts`** (optional but keeps `import { Comments } from './comments'` working)

Create `services/web-app/app/routes/app_.documents_.$id/comments/index.ts`:

```ts
export { Comments } from './comments';
export * from './selection-context';
```

- [ ] **Step 4: Run typecheck**

```bash
cd services/web-app && bun run typecheck
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/app_.documents_.\$id/comments/
git commit -m "refactor: rename comments/index.tsx → comments.tsx"
```

---

### Task 25: Adversarial E2E invariant test

The test that catches every plausible regression in one place.

**Files:**
- Create: `services/web-app/e2e/tests/document-editor-invariants.spec.ts`

- [ ] **Step 1: Implement the test**

```ts
// services/web-app/e2e/tests/document-editor-invariants.spec.ts
import { test, expect } from '../fixtures';
import { TestHelpers } from '../test-helpers';

test.describe('Document Editor Invariants', () => {
  test.beforeEach(async ({ signIn }) => {
    await signIn('jdoe@brock.software', 'johndoe');
  });

  test('content survives every plausible interaction without unauthorized PM writes', async ({
    page,
    e2eContext,
  }) => {
    const helpers = new TestHelpers(page);
    const editor = await helpers.openDocumentEditor(e2eContext.documentId);
    await editor.click();

    const X = `unique-marker-${Date.now()}`;
    await editor.type(X, { delay: 30 });

    // Helper to check invariants after each interaction
    const assertInvariant = async (label: string) => {
      const unauthorized = await page.evaluate(() => (window as any).__yawpUnauthorizedPmWrites ?? 0);
      expect(unauthorized, `unauthorized PM writes after ${label}`).toBe(0);
      await expect(editor, `editor content after ${label}`).toContainText(X);
    };

    // 1. Tutor interaction
    const tutorInput = page.locator('[data-testid="tutor-input"], textarea[placeholder*="tutor"], textarea[placeholder*="message"]').first();
    if (await tutorInput.isVisible().catch(() => false)) {
      await tutorInput.fill('What should I write?');
      await tutorInput.press('Enter');
      await page.waitForTimeout(2000);
      await assertInvariant('tutor-respond');
    }

    // 2. Visibility change
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(500);
    await assertInvariant('visibility-change');

    // 3. Window blur/focus
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(500);
    await assertInvariant('blur-focus');

    // 4. Manual save (Cmd+S)
    await editor.click();
    await page.keyboard.press('Meta+S');
    await page.waitForTimeout(500);
    await assertInvariant('manual-save');

    // 5. Browser back/forward
    await page.goBack().catch(() => {});
    await page.goForward().catch(() => {});
    await page.waitForTimeout(1000);
    // After navigating away and back, the editor should be remounted but content should persist via IDB
    await editor.click();
    await assertInvariant('back-forward');

    // Final: confirm content persists in IDB
    const stored = await page.evaluate(async (docId) => {
      const dbReq = indexedDB.open('yawp-document-store');
      return new Promise<string | null>((resolve) => {
        dbReq.onsuccess = () => {
          const db = dbReq.result;
          const tx = db.transaction(['documents'], 'readonly');
          const req = tx.objectStore('documents').get(docId);
          req.onsuccess = () => resolve(req.result?.text ?? null);
          req.onerror = () => resolve(null);
        };
        dbReq.onerror = () => resolve(null);
      });
    }, e2eContext.documentId);
    expect(stored).toContain(X);
  });
});
```

- [ ] **Step 2: Run the test in headed mode to debug if needed**

```bash
cd services/web-app
bunx playwright test e2e/tests/document-editor-invariants.spec.ts --headed
```
Expected: PASS. If failures, iterate on the test until it passes.

- [ ] **Step 3: Add to CI smoke suite**

Edit `services/web-app/.github/workflows/...` (or wherever the smoke list is defined). Add `document-editor-invariants.spec.ts` to the smoke run.

Alternatively, if the smoke list is in a config file:

```bash
cd services/web-app
```
Use Grep tool with pattern `document-data-loss-regression.spec.ts` to find the config file and add the new spec next to it.

- [ ] **Step 4: Commit**

```bash
git add services/web-app/e2e/tests/document-editor-invariants.spec.ts \
        services/web-app/.github/workflows/
git commit -m "test: add adversarial E2E invariant suite for editor"
```

---

### Task 26: Cherry-pick the existing data-loss regression suite from #91

The `document-data-loss-regression.spec.ts` from #91 covers the original failure modes (tutor interaction, visibility change, rapid edit + submit). It complements the new invariants test.

**Files:**
- Cherry-pick: `services/web-app/e2e/tests/document-data-loss-regression.spec.ts`

- [ ] **Step 1: Cherry-pick the file**

```bash
cd ~/brocksoftware/yawp-2.0
git checkout anti-fragile-editor -- services/web-app/e2e/tests/document-data-loss-regression.spec.ts
```

- [ ] **Step 2: Run the test locally**

```bash
cd services/web-app
bunx playwright test e2e/tests/document-data-loss-regression.spec.ts
```
Expected: PASS. If selectors differ from main, fix them.

- [ ] **Step 3: Commit**

```bash
git add services/web-app/e2e/tests/document-data-loss-regression.spec.ts
git commit -m "test: add document data loss regression suite (from anti-fragile-editor)"
```

---

### Task 27: Final cleanup and full test pass

- [ ] **Step 1: Run the full test suite**

```bash
cd services/web-app
bun test
```
Expected: PASS.

- [ ] **Step 2: Run all E2E smoke tests**

```bash
bunx playwright test --grep @smoke
```
Expected: PASS. If anything fails, fix before continuing.

- [ ] **Step 3: Verify final line counts**

```bash
wc -l app/routes/app_.documents_.\$id/route.tsx \
      app/routes/app_.documents_.\$id/document-editor/editor.tsx
```
Expected: route.tsx ≤ 350, editor.tsx ≤ 300.

- [ ] **Step 4: Run typecheck**

```bash
bun run typecheck
```
Expected: no errors.

- [ ] **Step 5: Manual smoke check (local dev server)**

```bash
bun run dev
```
Open a document, type some content, interact with the tutor, add a comment, refresh the page, verify content survived. Confirm `window.__yawpUnauthorizedPmWrites` is 0 in the dev console.

- [ ] **Step 6: Commit any final fixes**

If any small fixes were needed during the smoke check:

```bash
git add -A
git commit -m "fix: post-refactor smoke check fixes"
```

---

## Verification Checklist for Phase 1

After all tasks complete, manually verify:

- [ ] `route.tsx` ≤ 350 lines, no `useEffect` calls
- [ ] `document-editor/editor.tsx` ≤ 300 lines
- [ ] No file in `document-editor/` over 350 lines
- [ ] No file in `hooks/` over 200 lines
- [ ] `pending-document-save.ts` deleted
- [ ] `editor-content-context.tsx` deleted
- [ ] `editor/index.tsx` deleted (873-line monolith gone)
- [ ] `_components/document-versions.tsx` deleted
- [ ] `api.model.document.$id.versions/` deleted
- [ ] `api.domain.restore-document-version/` deleted
- [ ] `DocumentVersion` model removed from schema.prisma
- [ ] DocumentVersion data backfilled into DocumentRevision
- [ ] Tutor's 4 `?spa=1` callsites removed
- [ ] `shouldRevalidate` returns `false` unconditionally
- [ ] `bridge.setContent` does NOT exist on the editor bridge
- [ ] PM tripwire installed and adversarial E2E test passes
- [ ] 5-min idle-resetting hash-deduped revision timer working (verified by test)
- [ ] All unit tests pass
- [ ] All E2E smoke tests pass
- [ ] Manual smoke: type → close tab → reopen → content survives
- [ ] Manual smoke: type → tutor interact → content survives
- [ ] Manual smoke: type → submit → submitted content matches editor

When all items are checked, Phase 1 is complete. Proceed to Phase 2 (Submission Consolidation).
