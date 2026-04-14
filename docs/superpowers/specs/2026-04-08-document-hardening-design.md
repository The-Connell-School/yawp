# Document Hardening — Design Spec

**Status:** Draft, awaiting user approval before implementation plan
**Date:** 2026-04-08
**Author:** Bryant + Claude
**Branch:** `document-hardening` (off `main`)
**Supersedes:** PR #91 (`anti-fragile-editor`), incorporates good ideas from PR #77 (`feat/submission-model-consolidation`)

## Summary

Refactor the document editor area top-to-bottom: collapse three overlapping data models into one source of truth each, delete the dead and the dual code paths, decompose the spaghetti `route.tsx` (1507 lines, 17 effects) and `editor/index.tsx` (873 lines), eliminate the architectural fragility that lets stale data poison ProseMirror, and adopt a hardened submission flow. Single PR, single deploy with a maintenance window for the schema migration.

## Goal

Make data loss structurally impossible, the codebase ~2000 lines smaller, and the editor area something that fits in your head. After this work the document area should be:

- **One source of truth per concern.** `Document` for the working copy, `DocumentRevision` for history, `Submission` for submitted versions. No snapshot model. No legacy version model. No dual write paths. No transitional state.
- **Anti-fragile by construction.** ProseMirror can only be written to by user keystrokes (and the one-shot recovery hydration on mount). Any other code path that mutates editor content is caught by a runtime tripwire in dev and logged in prod.
- **Decomposed.** No file over ~300 lines. Each module has one purpose, communicates through a typed interface, and can be understood without reading the others.
- **Aggressively deleted.** Every line of code is a liability. The deletion list (below) is the most important part of this spec.

## Conceptual Model

```
Document         ─── mutable working copy. ProseMirror ↔ IndexedDB ↔ Postgres.
                     "What the student is currently writing."

DocumentRevision ─── append-only history. Auto-saved every 5 min (idle-resetting,
                     hash-deduped) plus on session-start, manual save, pre-submit.
                     "What the student's writing looked like at moment T."

Submission       ─── append-only immutable submitted versions, with grading attached.
                     "What the student turned in for grade #N."
```

Three models. Each has exactly one source of truth and exactly one writer.

## What Gets Deleted

The most important section. Everything below is gone after this PR ships.

### Schema deletions

- `model DocumentVersion` (table + relation)
- `model DocumentSnapshot` (table + relation)
- `model Grade` (table + relations)
- `model GradeComment` (table + relations)
- `model GradeCommentResponse` (table + relations)
- `Document.submittedAt` column
- `Document.submittedSnapshotId` column
- `Document.submittedSnapshot` relation

### Code deletions

#### Editor / persistence layer

- `app/utils/pending-document-save.ts` (entire file + tests) — localStorage layer for "unsaved content during login redirect", redundant now that IDB-aware hydration exists
- `recoverPendingSave` callback in `route.tsx` and both of its callsites
- `editorBridge.setContent` method — only consumer was `recoverPendingSave`; with that gone, the bridge has no external write path to PM
- `useOldSaveFlow` branch in `editor/index.tsx` — only used for `saveSnapshotId` (teacher snapshot edit), which dies with snapshots
- `?spa=1` revalidation in `tutor/index.tsx` (4 callsites) and the matching exception in `shouldRevalidate`
- `app_.documents_.$id/editor/editor-content-context.tsx` — completely unused dead code (verified: no consumers)
- `editor-ready` window event bus + 500 ms `setInterval` polling in `route.tsx` for `hasEditorContent`
- `app_.documents_.$id/_components/document-versions.tsx` (376 lines) — UI for the dead `DocumentVersion` model
- `api.model.document.$id.versions/route.ts` and tests
- `api.domain.restore-document-version/route.ts` and tests

#### Submission / grading layer

- `api.domain.grade-essay/route.ts` and tests — replaced by `api.domain.update-submission`
- `api.domain.update-grade/route.ts` and tests — replaced by `api.domain.update-submission`
- `api.model.grade-comment/*` routes — replaced by `api.model.submission-comment/*`
- `api.model.grade-comment-response/*` routes
- `app_.graded_.$gradeId/route.tsx` — replaced by `app.submissions.$submissionId/route.tsx`
- All references to `submittedSnapshot` / `submittedSnapshotId` / `submittedAt` on Document throughout the codebase

#### Estimated net change

- Deletions: ~3000-3500 lines
- Additions: ~1500-1800 lines (mostly rearranging existing logic into smaller files, plus new schema/endpoints/tests)
- **Net: ~1500-1700 lines smaller**

## Target File Structure

```
app_.documents_.$id/
├── route.tsx                          (~250 lines, was 1507)
│   └── Thin shell: loader, layout, wires children. Owns nothing
│       except routing-level state. Zero useEffects.
│
├── document-editor/                   (NEW — student editing)
│   ├── document-editor.tsx            Top-level component for the editor pane
│   ├── editor.tsx                     (~250 lines, was 873)
│   │                                  Pure ProseMirror host. PM ↔ IDB only.
│   ├── editor-bar.tsx                 Toolbar (was bar.tsx)
│   ├── use-editor-sync.ts             Hook: PM → IDB → server, version counter,
│   │                                  hash dedup, 5-min revision timer
│   ├── use-pm-tripwire.ts             Hook: runtime guard against unauthorized
│   │                                  PM mutations
│   └── extensions/
│       ├── source-tracker.ts          NEW: tags user-originated transactions
│       ├── tab-indent.ts
│       ├── line-height.ts
│       └── comment.ts
│
├── teacher-grading/                   (NEW — teacher grading view)
│   ├── teacher-grading-panel.tsx      (was _components/teacher-grading-panel.tsx,
│   │                                  refactored onto Submission + auto-save on blur)
│   ├── grading-comments-sidebar.tsx   (was _components/grading-comments-sidebar.tsx)
│   ├── grade-highlights-overlay.tsx   NEW — extracted from editor.tsx
│   ├── selection-toolbar.tsx          NEW — extracted from editor.tsx
│   └── use-update-submission.ts       NEW — auto-save hook for grading fields
│
├── document-history/                  (NEW — revision timeline UI)
│   └── document-history.tsx           (renamed from _components/document-history.tsx,
│                                      reads DocumentRevision)
│
├── tutor/
│   ├── tutor.tsx                      (renamed from index.tsx, ?spa=1 removed)
│   ├── response-bar.tsx
│   └── loading.tsx
│
├── comments/
│   ├── comments.tsx                   (renamed from index.tsx)
│   ├── comment.tsx
│   └── selection-context.tsx
│
└── hooks/                             (NEW — extracted from route.tsx)
    ├── use-document-loader-data.ts
    ├── use-auth-heartbeat.ts
    ├── use-tutor-state.ts
    ├── use-comments-state.ts
    └── use-document-submit.ts

app/routes/                            (top-level route changes)
├── app.submissions.$submissionId/     NEW — replaces app_.graded_.$gradeId/
│   └── route.tsx
└── app_.graded_.$gradeId/             KEPT as redirect-only loader for old links
    └── route.tsx                      (looks up LegacyGradeRedirect, 301s to new URL)
```

**Principle:** every file has one clear purpose, communicates through a well-defined interface, can be understood without reading the others, and fits in your head at once. Target: no file over 300 lines.

## Phase 1: Editor Flow Consolidation

This phase delivers the editor + persistence cleanup. Internally executed first because phase 2 and 3 build on top of the new file structure.

### `editor.tsx` (~250 lines, was 873)

Pure ProseMirror host. Owns the editor instance, exposes a bridge to its parent, nothing else. All auxiliary concerns (grade highlights, grammar highlights, paste alerts, comment marks, selection toolbars, copy detection) move to siblings.

```tsx
export function Editor({ docId, initialHtml, isEditable, onBridgeReady }: Props) {
  const editor = useEditor({
    extensions,
    content: initialHtml,
    immediatelyRender: false,
    editable: isEditable,
  })

  usePmTripwire(editor)
  useEditorSync(editor, { docId, onBridgeReady })

  return (
    <ErrorBoundary>
      <EditorContent editor={editor} />
    </ErrorBoundary>
  )
}
```

### `use-editor-sync.ts` — heart of the persistence layer

One hook owns the localVersion counter, the IDB write on every PM update, the SyncService schedule, the 5-min idle-resetting hash-deduped revision timer, the visibility-change forceSave handler, and the bridge object exposed upward.

Bridge interface (note the absence of `setContent`):

```ts
type EditorBridge = {
  getContent: () => { html: string; text: string }
  saveNow: (options?: { source?: string }) => Promise<void>
}
```

Revision timer logic:

```ts
const scheduleRevisionTick = useCallback(() => {
  if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
  idleTimerRef.current = setTimeout(async () => {
    const { html, text } = getSnapshot()
    const hash = await contentHash(html, text)
    if (hash === lastRevisionHashRef.current) return  // dedup
    await syncRef.current?.forceSave({ trigger: 'periodic', createRevision: true })
    lastRevisionHashRef.current = hash
  }, 5 * 60 * 1000)
}, [])
```

On every PM update: write IDB, schedule sync, reset idle timer. The reset means a revision only fires after 5 min of *no* edits — naturally implementing "every 5 min while active."

### `route.tsx` — the new shape

```tsx
export default function Route() {
  const data = useLoaderData<typeof loader>()
  const [searchParams] = useSearchParams()
  const tab = searchParams.get('tab') ?? 'tutor'
  const editorBridgeRef = useRef<EditorBridge | null>(null)

  const auth = useAuthHeartbeat({ documentId: data.doc.id })
  const tutor = useTutorState(data.currentCms)
  const comments = useCommentsState(data.doc.comments)
  const submit = useDocumentSubmit({ documentId: data.doc.id, editorBridgeRef })

  return (
    <Layout>
      <Header documentId={data.doc.id} />
      <DocumentEditor
        docId={data.doc.id}
        initialContent={data.doc.html ?? ''}
        isEditable={!auth.isLocked}
        onBridgeReady={(b) => { editorBridgeRef.current = b }}
      />
      <SidePanel tab={tab}>
        {tab === 'tutor' && <Tutor cms={tutor.cms} onMessagesChange={tutor.update} />}
        {tab === 'comments' && <Comments comments={comments.list} onCreate={comments.add} />}
      </SidePanel>
      <SubmitButton onClick={submit.submitNow} disabled={submit.isSubmitting} />
    </Layout>
  )
}
```

The 17 useEffects of today's `route.tsx` collapse into ~5 hooks called from Route. The route component itself has zero useEffects.

### Hook decomposition

| Hook | Owns | Replaces |
|---|---|---|
| `use-auth-heartbeat.ts` | session lock, login redirect, focus/visibility auth checks, periodic 5-min auth ping | ~80 lines of route effects + handlers |
| `use-tutor-state.ts` | tutor messages + CMS local state, callbacks the tutor child calls after mutations | ~30 lines of route state + the resync effect |
| `use-comments-state.ts` | comment list local state + add/respond callbacks | ~25 lines of route state |
| `use-document-submit.ts` | flush-then-submit flow, submitting state, redirect on success | ~40 lines of route handler |
| `use-grade-highlights.ts` (teacher view only) | grade-comment + grammar-issue mark application | ~150 lines moved out of editor.tsx |

### Tutor cleanup — kill `?spa=1`

Today: tutor mutations call the API, then `navigate('?spa=1')` to trigger loader revalidation.

Tomorrow: tutor mutations call the API, the API **returns the updated `cms` in its JSON response**, the tutor stores it in local state via `useTutorState`. No revalidation, no `shouldRevalidate` exception.

Endpoints to update:

- `POST /api/domain/tutor-response` — return the **whole updated `cms`** (with messages) instead of just the assistant message
- `POST /api/model/course-module-session/:id` (instruction increment/decrement) — return updated cms
- `POST /api/model/course-module-session` (advance) — return the new cms

Frontend stores whatever comes back. `shouldRevalidate` returns `false` unconditionally — no `?spa=1` exception.

### Comments cleanup

Today: comments live in local state, BUT a useEffect resyncs from `data.doc.comments` on revalidation (route.tsx:798-801). That effect exists ONLY because of `?spa=1`. With `?spa=1` gone, the resync effect dies. Comments live purely in local state.

### 5-minute revision timer details

- **Idle reset on keystroke.** Every PM `update` event resets the 5-min countdown. A revision only fires after 5 min of no edits.
- **Hash dedup.** Before creating the revision, compare current `contentHash` against the last revision's hash. Skip if equal.
- **Existing triggers preserved:** `session-start`, `pre-submit-flush`, `manual` (Cmd+S). Plus the new `periodic` (5-min timer).
- **Server-side enforcement.** `api.document.$id.save/route.ts` already has revision-creation logic; small change to honor the client's `createRevision: true` flag for `periodic` triggers, plus its existing logic for the others. The server still hash-checks against the most recent revision before creating.
- **No cap, no auto-prune.** Easy to add later.

### DocumentVersion → DocumentRevision migration

Single Prisma migration:

```sql
INSERT INTO "DocumentRevision" (id, "createdAt", "documentId", html, text, trigger)
SELECT id, "createdAt", "documentId", html, text, 'imported-version'
FROM "DocumentVersion";

DROP TABLE "DocumentVersion";
```

The `trigger='imported-version'` lets the UI distinguish historical imports from real revisions if useful.

## Phase 2: Submission Consolidation

Big-bang migration. Adopts PR #77's Submission/SubmissionComment schema, but skips its expand-and-contract phasing — drops old tables in the same migration that creates new ones.

### Schema

```prisma
model Submission {
  id                String              @id @default(cuid())
  createdAt         DateTime            @default(now()) @db.Timestamptz(6)
  updatedAt         DateTime            @default(now()) @db.Timestamptz(6)

  // Snapshot data (immutable after creation)
  title             String
  text              String
  html              String
  submittedAt       DateTime            @db.Timestamptz(6)

  // Grading data (auto-saved on blur via update-submission)
  score             String?
  feedback          String?
  rubricScores      Json?
  overallScore      Int?
  overallComment    String?
  numericPercentage Int?
  letterGrade       String?
  grammarIssues     Json?
  promptConfig      Json?
  aiMeta            Json?
  gradedAt          DateTime?           @db.Timestamptz(6)
  gradedById        String?
  gradedBy          Profile?            @relation(fields: [gradedById], references: [id], onDelete: SetNull)
  releasedAt        DateTime?           @db.Timestamptz(6)

  documentId        String
  document          Document            @relation(fields: [documentId], references: [id], onDelete: Restrict)
  comments          SubmissionComment[]

  @@index([documentId, submittedAt(sort: Desc)])
  @@index([gradedById])
  @@index([releasedAt])
}

model SubmissionComment {
  id           String     @id @default(cuid())
  createdAt    DateTime   @default(now()) @db.Timestamptz(6)
  updatedAt    DateTime   @default(now()) @db.Timestamptz(6)
  content      String
  excerpt      String?
  occurrence   Int        @default(1)
  submissionId String
  submission   Submission @relation(fields: [submissionId], references: [id], onDelete: Cascade)
  profileId    String
  profile      Profile    @relation(fields: [profileId], references: [id], onDelete: Cascade)

  @@index([submissionId, createdAt(sort: Desc)])
  @@index([profileId])
}
```

**No `legacySnapshotId` field.** PR #77 included it for dual-write deduplication. Since we're not running dual-writes, it has no purpose.

**Key trick: ID reuse.** Backfill reuses `DocumentSnapshot.id` (a cuid) as `Submission.id`. This keeps `SubmissionComment.submissionId` backfill trivial via the existing `Grade.snapshotId` join — no ID remapping table needed.

### Migration SQL (simplified)

```sql
-- 1. Create new tables
CREATE TABLE "Submission" (...);
CREATE TABLE "SubmissionComment" (...);

-- 2. Backfill Submissions from DocumentSnapshot + Grade
INSERT INTO "Submission" (
  id, "createdAt", "updatedAt", title, text, html, "submittedAt",
  score, feedback, "rubricScores", "overallScore", "overallComment",
  "numericPercentage", "letterGrade", "grammarIssues", "promptConfig", "aiMeta",
  "gradedAt", "gradedById", "releasedAt", "documentId"
)
SELECT
  s.id,                                                  -- ID reuse
  s."createdAt",
  COALESCE(g."updatedAt", s."createdAt"),
  COALESCE(g."essayTitle", d.title, 'Untitled'),
  COALESCE(g."essayText", s.text),
  COALESCE(g."essayHtml", s.html),
  COALESCE(s."submittedAt", s."createdAt"),
  g.score, g.feedback, g."rubricScores", g."overallScore", g."overallComment",
  g."numericPercentage", g."letterGrade", g."grammarIssues", g."promptConfig", g."aiMeta",
  g."gradedAt", g."gradedById", g."releasedAt",
  s."documentId"
FROM "DocumentSnapshot" s
LEFT JOIN "Grade" g ON g."snapshotId" = s.id
LEFT JOIN "Document" d ON d.id = s."documentId"
WHERE s."archivedAt" IS NULL;

-- 3. Backfill SubmissionComments from GradeComments
INSERT INTO "SubmissionComment" (
  id, "createdAt", "updatedAt", content, excerpt, occurrence, "submissionId", "profileId"
)
SELECT
  gc.id, gc."createdAt", gc."updatedAt", gc.content, gc.excerpt, gc.occurrence,
  g."snapshotId",         -- which is now also the Submission id
  gc."profileId"
FROM "GradeComment" gc
JOIN "Grade" g ON g.id = gc."gradeId"
WHERE EXISTS (SELECT 1 FROM "Submission" sub WHERE sub.id = g."snapshotId");

-- 4. Build legacy redirect table for old /app/graded URLs
CREATE TABLE "LegacyGradeRedirect" (
  "gradeId"      TEXT PRIMARY KEY,
  "submissionId" TEXT NOT NULL,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO "LegacyGradeRedirect" ("gradeId", "submissionId")
SELECT id, "snapshotId" FROM "Grade";

-- 5. Drop old tables and columns
ALTER TABLE "Document" DROP COLUMN "submittedAt";
ALTER TABLE "Document" DROP COLUMN "submittedSnapshotId";
DROP TABLE "GradeCommentResponse";
DROP TABLE "GradeComment";
DROP TABLE "Grade";
DROP TABLE "DocumentSnapshot";
DROP TABLE "DocumentVersion";   -- from Phase 1
```

`DocumentSnapshot.archivedAt` rows are dropped (not migrated). Per PR #77 rationale: `Submission` replaces archival semantics with the Released lifecycle state.

### Pre-deploy dry-run script

`packages/prisma/scripts/document-hardening-dry-run.ts` — runs the SELECTs of the backfill as count queries and prints:

- N snapshots in source (excluding archived)
- N snapshots with grades / N without grades
- N grade comments (will become submission comments)
- N grades (will become legacy redirect rows)
- Expected post-migration row counts

Run in staging before the maintenance window, and again in production immediately before running the real migration.

### Endpoint changes

| Endpoint | Today | Tomorrow |
|---|---|---|
| `POST /api/domain/submit-document` | Reads `document.html`/`text` from DB, creates `DocumentSnapshot`, archives comments, sets `Document.submittedAt`/`submittedSnapshotId`, blocks resubmission | Reads current `Document`, creates `Submission`, returns the new submission. **Removes the resubmission block. Removes the comment archival.** |
| `POST /api/domain/grade-essay` | Creates/updates `Grade` row | **DELETED** — replaced by `update-submission` |
| `POST /api/domain/grade-essay-ai` | AI grading, writes to `Grade` | Refactored to write to `Submission` directly |
| `POST /api/domain/update-grade` | Manual grade edit | **DELETED** |
| `POST /api/domain/release-grades` | Sets `Grade.releasedAt` for a class | Refactored to set `Submission.releasedAt` |
| `POST /api/domain/update-submission` (NEW) | — | Single auto-save endpoint for any subset of submission fields |
| `POST /api/model/grade-comment*` | Grade comment CRUD | **DELETED** — replaced by submission-comment endpoints |
| `POST /api/model/submission-comment` (NEW) | — | Create/update SubmissionComment |

### Product changes locked in

- **Multi-submit enabled.** A document can have N submissions. The `submittedAt` resubmission block is removed. Each submission is independently graded.
- **DocumentComment archival on submit removed.** Students keep their working comments across submissions.

### Read-path migrations

Approximately 20 files with small (5-20 line) edits. Categories:

- Teacher dashboard tabs (Submitted/Graded/Released) → query `Submission` directly
- Student "Graded" view → reads `Submission` (route also moves)
- Student dashboard "Released" badge → checks `Submission.releasedAt`
- Document loader's `submittedSnapshot`/`activeSnapshot` derivation → latest `Submission` for the document
- Grade-comments sidebar → `SubmissionComment`
- AI grading pipeline → `Submission`

## Phase 3: Grading Panel Cleanup

Pure UI work on top of the new Submission model. Smallest part of the work.

### Goals

1. Teacher grading panel uses `Submission` semantics throughout — no `Grade`/`Snapshot` indirection
2. **Auto-save on blur for every grading field** — delete the "Save" button
3. `/app/graded/:gradeId` → `/app/submissions/:submissionId` (with redirect for old links)
4. File moves into `teacher-grading/` folder

### Auto-save UX

Every grading field (score, feedback, rubricScores, overallScore, overallComment, numericPercentage, letterGrade) saves on blur via `POST /api/domain/update-submission`:

```tsx
<TextArea
  defaultValue={submission.overallComment ?? ''}
  onBlur={(e) => updateSubmission({ overallComment: e.target.value })}
/>
```

A `useUpdateSubmission(submissionId)` hook wraps the fetch and exposes `status: 'idle' | 'saving' | 'saved' | 'error'` for one indicator at the top of the panel. Same pattern as the document title save indicator already used in the app.

**No save button. No "are you sure" dialogs. Edit, blur, saved.**

### Old `/app/graded/:gradeId` URLs

The migration creates a `LegacyGradeRedirect` table mapping `gradeId → submissionId`. The old route becomes a tiny redirect-only loader:

```ts
export async function loader({ params }: LoaderFunctionArgs) {
  const redirect = await prisma.legacyGradeRedirect.findUnique({
    where: { gradeId: params.gradeId },
  })
  if (!redirect) throw new Response('Not found', { status: 404 })
  return redirectResponse(`/app/submissions/${redirect.submissionId}`, 301)
}
```

After ~6 months the table can be dropped. No urgency.

### Teacher grading panel files

| File | Action |
|---|---|
| `_components/teacher-grading-panel.tsx` | Move to `teacher-grading/teacher-grading-panel.tsx`, refactor onto `update-submission`, delete fetcher.submit calls, delete save-button JSX, add field-level on-blur handlers, save status indicator |
| `_components/grading-comments-sidebar.tsx` | Move to `teacher-grading/grading-comments-sidebar.tsx`, switch to `SubmissionComment` API, switch from fetcher to plain fetch + local state |
| `app_.graded_.$gradeId/route.tsx` | Replace with redirect-only loader (above) |
| `app.submissions.$submissionId/route.tsx` (NEW) | The graded view, reads from `Submission` directly |
| `app.my-classes.$classId/route.tsx` | Update teacher dashboard tab queries to use `Submission` |
| `app_.documents_.$id/route.tsx` | Switch teacher-viewing-as-grader code path from `activeSnapshot` derivation to "latest Submission for this document" |

## Cross-Cutting: PM-Write Tripwire

The runtime guard that makes future regressions impossible.

### Mechanism

1. **PM plugin tags every user-originated transaction.** A new ProseMirror plugin in `editor/extensions/source-tracker.ts` watches `appendTransaction`. Any transaction whose origin can be traced to a user input event (keydown, paste, drop, input, compositionend, cut) gets stamped: `tr.setMeta('yawp-pm-source', 'user')`. Tracking is via a small WeakSet of "in-flight user events" set in DOM listeners.

2. **PM plugin tags the one-shot recovery write.** When the editor is created with non-empty `initialHtml` (the IDB-aware hydration case), the very first content-mutating transaction gets stamped `'recovery-on-mount'`. Single-fire — the next transaction is no longer recovery.

3. **Hook throws on untagged content mutations.** `usePmTripwire(editor)` subscribes to `editor.on('transaction')`. If `transaction.docChanged && !['user', 'recovery-on-mount'].includes(transaction.getMeta('yawp-pm-source'))`, that's a violation:
   - **Dev mode:** `throw new Error(...)` — crashes the editor, surfaces in tests and local dev immediately.
   - **Prod mode:** `console.error(...)` + increment `window.__yawpUnauthorizedPmWrites`. Don't crash — log so we can detect the regression in real users without breaking their session.

4. **Test instrumentation:** E2E tests call `await page.evaluate(() => window.__yawpUnauthorizedPmWrites ?? 0)` after every interaction; assertion is `=== 0`.

### Why this works

- TipTap doesn't expose a way to mutate `doc` without a transaction.
- All transactions go through PM's dispatch.
- A transaction either originated from user input (tagged) or from explicit code (must be tagged or it throws).
- New code that calls `editor.commands.setContent()` without setting the meta gets caught immediately in dev.
- The `recovery-on-mount` exception fires exactly once per mount via the WeakSet.

## Cross-Cutting: Testing Strategy

### Layer 1: Unit tests

| Module | Tests |
|---|---|
| `use-editor-sync` | localVersion increments monotonically; IDB writes use version-gated put; revision timer fires after 5 min idle; revision timer resets on update; hash dedup skips identical content; visibility-change forces save |
| `use-pm-tripwire` | unauthorized mutation throws in dev / counts in prod; tagged user transaction passes; tagged recovery transaction passes |
| `document-store` | version gating rejects stale writes (already exists from PR #91 work) |
| `sync-service` | retry/backoff/forceSave (already exists from PR #91 work) |
| `update-submission` route | each subset of fields saves correctly; `gradedAt` is set on first grading edit and stays stable on subsequent edits; auth checks |
| Migration backfill | dry-run reports correct counts; full migration produces 1:1 Submissions; ungraded snapshots become Submissions with null grading fields |

### Layer 2: Adversarial E2E

`e2e/tests/document-editor-invariants.spec.ts` — brute-forces every interaction known to potentially poison editor state and asserts the invariant after each.

```ts
test('content survives every plausible interaction', async ({ page }) => {
  const X = `unique-${Date.now()}`
  await editor.type(X)

  for (const interaction of [
    'tutor-respond',
    'tutor-increment-instruction',
    'tutor-decrement-instruction',
    'tutor-advance-module',
    'comment-add',
    'comment-respond',
    'visibility-hide-show',
    'window-blur-focus',
    'browser-back-forward',
    'manual-save-cmd-s',
    'force-revalidate-via-other-fetcher',
  ]) {
    await trigger(page, interaction)
    expect(await page.evaluate(() => window.__yawpUnauthorizedPmWrites ?? 0)).toBe(0)
    await expect(editor).toContainText(X)
    expect(await readIdbContent(page)).toContain(X)
  }
})
```

Plus the existing `document-data-loss-regression.spec.ts` (from PR #91 work) stays.

### Layer 3: Migration validation

Test that builds a fixture database with realistic snapshot+grade+comment data, runs the migration, and asserts:

- Row counts match
- Random sample of (snapshot, submission) pairs has identical content
- Random sample of (grade, submission) pairs has identical grading fields
- All grade comments became submission comments
- Legacy redirect table populated correctly
- No orphaned data

## Cross-Cutting: Migration & Rollback

### Pre-migration

1. Run dry-run script in staging — verify counts
2. Run full migration in staging — spot-check 10 random submissions, 10 graded, 10 released
3. Run reverse migration in staging (the `down.sql`) to validate rollback path
4. Take production DB snapshot, export relevant tables to S3
5. Schedule maintenance window (off-hours)

### Maintenance window deploy (T+0 reference)

| Time | Action |
|---|---|
| T-1h | Final dry-run in production database (read-only) — verify counts |
| T+0 | Enable read-only banner ("YAWP is updating, brb") |
| T+5min | Run Prisma migration |
| T+10min | Smoke test: log in as teacher → view a graded submission → verify renders. Log in as student → verify "Released" tab works. Type into a document → close tab → reopen → content survives. |
| T+20min | If green: remove banner, traffic resumes. If red: restore from snapshot, revert deploy, post-mortem. |

Total budget: **2 hours**, with most of that as buffer. Realistic execution: 30 min.

### Rollback

PR-2 schema changes are destructive. Mitigations:

1. **Pre-migration snapshot.** Full Postgres backup, exported to S3.
2. **Reverse migration script** (`down.sql`) tested in staging. Recreates DocumentSnapshot/Grade/GradeComment from Submission/SubmissionComment. Not part of the normal deploy — for emergency rollback only.
3. **Maintenance window discipline.** Smoke test before un-pausing traffic. If red, revert before letting users back in.
4. **No partial rollbacks.** Either the whole branch ships or none of it. The deploy is all-or-nothing.

If a critical bug is discovered in production *after* the maintenance window completes and traffic resumes, we either:
- Hot-fix on main and deploy ASAP (preferred)
- Re-enter maintenance, restore from snapshot, redeploy old code (last resort)

## Decisions Made (Product-Level)

- **Multi-submit enabled.** Removes the `submittedAt` resubmission block. Each submission is independently graded. (Per PR #77 design.)
- **DocumentComment archival on submit removed.** Comments stay tied to the living document across submissions.
- **Old `/app/graded/:gradeId` URLs preserved** via `LegacyGradeRedirect` table. Drop the table after ~6 months.
- **Tripwire dev-throws, prod-logs.** Loud during dev; quiet but tracked in prod.
- **Multi-class assignment creation deferred** to a future assignments refactor project.
- **Maintenance window**: 2 hours scheduled, ~30 min realistic.

## Out of Scope

- Multi-class assignment creation (future assignments project)
- DocumentRevision auto-prune / cap (future cleanup if rows grow)
- Alternative tutor architectures
- Redesigning the grading panel UI beyond the auto-save changes
- Submission-level analytics/dashboards
- Editing the AI grading prompt configuration

## File Touch Estimate

| Area | Files touched |
|---|---|
| Editor refactor (Phase 1) | ~25 |
| Submission consolidation (Phase 2) | ~30 |
| Grading panel (Phase 3) | ~12 |
| Schema + migration | 2 |
| Tests (unit + E2E) | ~15 |
| Deletions | ~20 files removed |

**Total: ~75-90 files touched, ~20 deleted, net ~1500-1700 lines smaller.**
