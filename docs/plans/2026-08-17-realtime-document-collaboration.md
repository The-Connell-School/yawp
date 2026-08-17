# Real-time document collaboration — feature sketch

**Date:** 2026-08-17
**Status:** Sketch / brainstorm. No implementation. Open questions listed at the bottom.

Letting multiple people (students or teachers) write in the same document at the
same time.

## Product shape

### The toggle

Collaboration is opt-in per assignment, turned on by the teacher in the
assignment creation sheet. `tutorEnabled` is the precedent to copy exactly:

- `Assignment.tutorEnabled Boolean @default(true)` on the model
- parsed by `app/utils/assignment-tutor-enabled.server.ts`
- rendered as a `Switch` in `app/components/assignments/assignment-creation-sheet.tsx`
- carried on `SavedAssignment` so reused assignments keep the setting

A `collaborationEnabled` flag follows the same path. **It must also be threaded
through `SavedAssignment`**, or assignment reuse silently drops collaboration.

### Toggle lives on Assignment, groups live on ClassAssignment

`Assignment` fans out to N `ClassAssignment` rows (one per class). Groups are
made of students, so they are inherently per-class. These cannot share a home:

- `Assignment.collaborationEnabled` — intent, set once at creation, all classes
- group rows hang off `ClassAssignment` — roster data, set up per class

Consequence: flipping the toggle at creation does not finish the job. It creates
a follow-up "set up groups for Period 3" task per class, and students in a class
cannot start until that class has groups. This hand-off should be designed
deliberately.

### Grouping mode — recommendation

Recommend **teacher-assigned groups with a shuffle button** for v1. Not student
self-select.

| Mode | Verdict |
| --- | --- |
| Teacher chooses (drag roster into groups, "shuffle into groups of N" helper) | **v1 default** |
| Random groups of N | Cheap — a preset of the above, not a separate system |
| Whole class, one document | Different use case (shared notes/brainstorm); likely ungraded, so it sidesteps grade fan-out — but 30 editors on one doc is the heaviest transport case, not the lightest. |
| Students pick partners | Defer. Needs invite/accept state, a cap, and a fix for the creation race below. |

Reasons teacher-assignment wins for v1:

1. **Grading needs deterministic membership up front.** A grade on a shared
   draft must reach every member. If membership is fluid at submit time there is
   no answer to "whose grade is this?"
2. **Self-select races at document creation.**
   `app/routes/app.class-assignments.$classAssignmentId.start/route.ts` creates a
   brand-new document on click via
   `createDocumentForAssignmentType({ membershipId: profile.id, ... })`. Two
   partners clicking simultaneously produce two documents and no group.
   Teacher-assigned groups let documents be provisioned per group up front, so
   "Start" becomes "open your group's draft" and the race disappears.
3. **Teachers want the control** — mixed-ability pairing, IEP considerations,
   keeping particular students apart.

### Group builder: borrow the breakout-room panel

The reference model is Zoom/Hangouts breakout rooms. Zoom's three options are
*Assign automatically*, *Assign manually*, *Let participants choose* — the same
three modes above, arrived at independently. Teachers already know this
interaction; adopting its vocabulary means close to zero learning curve.

(Supporting data point for deferring student-picked partners: *Let participants
choose* is the option Zoom shipped **last**, years after the other two, and it
needed a client-version gate.)

The panel maps cleanly onto `Class.students`, which is a flat `OrgMembership[]`
many-to-many roster — nothing exotic to query. Carry over:

- **Group cards with member chips**, sized by a "groups of N" control
- **Shuffle** to seed, then drag to adjust
- **Move to** *and* **Exchange** — swapping two students between groups is a
  single intent, not two moves
- **An "Not in a group" bucket, always visible.** This is how a student who
  joined the class after groups were built becomes the teacher's problem rather
  than a silent failure. It is the concrete answer to the roster-churn open
  question: a transfer-in lands in the bucket and the class assignment shows an
  unresolved badge until someone places them.
- **"Open groups"** as a distinct action from building them — this is the
  lifecycle boundary below

### Where the breakout analogy stops: persistence

Breakout rooms are disposable; these groups own a document. A Zoom room holds no
artifact, which is why *Recreate rooms* is a harmless button. Here a group owns a
draft with revision history and a pending submission, so the same button is
destructive once writing has begun.

The panel therefore needs a lifecycle boundary Zoom has no reason to model:

| | Before "Open groups" | After the first keystroke |
| --- | --- | --- |
| Documents | Not yet provisioned | Exist, contain writing |
| Shuffle / Recreate | Cheap, reversible | Destructive — remove or hard-confirm |
| Moving a student | Reseating a chart | Moving them between two live drafts |

When a student is moved after writing has started, their text stays in the old
draft. Because `DocumentWriteJournal` attributes every write, it stays correctly
attributed to them there — nothing is lost or misassigned, it just does not
follow them. That is probably the right behavior, but it should be a decision
rather than an accident.

### Student-facing

Named carets in per-collaborator colors, presence avatars, live text. Two
details that fall out of the data model:

- **Attribution is nearly free.** `DocumentWriteJournal` already stamps `userId`
  and `membershipId` on every write. That is enough to answer "did both students
  contribute?" — a per-author contribution breakdown is a feature hiding in
  existing telemetry.
- **`PasteAlert` gets noisy.** Copying a line from your partner's paragraph is
  normal in a shared document. Paste detection must become collaborator-aware or
  it will fire on every group assignment.

## Technical blockers

### 1. The save path cannot support two writers (blocker)

`app/routes/api.document.$id.save/route.ts` is whole-document snapshot
persistence with single-writer optimistic locking:

- client POSTs full `html` + `text` + `contentHash` + `baseRevision`
- server rejects with `409 stale_base_revision` when
  `baseRevision !== document.revision`
- on success, `Document.revision` increments

This is working as designed, and it is structurally incompatible with concurrent
editing. Two editors invalidate each other on every keystroke: constant 409s,
and the loser's text is discarded. Collaboration cannot be layered on this
endpoint — it needs a CRDT as the live source of truth, with the snapshot write
demoted to a derived flush by one designated writer.

### 2. Hosting does not support WebSockets (blocker)

`infra/main.tf` deploys `aws_apprunner_service`. App Runner does not support
WebSockets, so a Hocuspocus / `y-websocket` server cannot live inside the
existing service. Three options:

1. **Managed realtime provider** (Liveblocks / Hocuspocus Cloud / PartyKit) —
   fastest, but student writing leaves the VPC and needs a compliance read.
2. **Separate ECS + ALB sync service** — right long-term answer, keeps data
   in-VPC, real infra work.
3. **Yjs updates over plain HTTP** — POST up, SSE or poll down. Works on App
   Runner today at ~1-2s latency, no infra change. Needs a spike to confirm App
   Runner's streaming behavior.

### 3. Document ownership and authorization (smaller than it looked)

`Document.membershipId` is a single owner, and no group or team concept exists
anywhere in `schema.prisma`. But the authorization rule is already centralized in
`app/utils/document-access.server.ts` with a READ/WRITE split worth keeping — see
the implementation map below for the real adoption picture and the four
document-scoped routes still holding an inline copy. This is a contained change,
not a sweep.

### 4. Grading a shared draft (needs a product decision)

`Submission.documentId` is a single FK — one submission per document. One shared
draft is one submission, but three students need three gradebook entries. There
is no mechanism for this today. Unanswered: who may submit for the group, what
an unsubmit by one member does to the others, whether the AI grading assistant
runs once or per student. A grade-recipient concept is needed, but the product
answer should come first.

### Editor choice is favorable

TipTap v2 / ProseMirror is already in `services/web-app/package.json`
(`@tiptap/react`, `@tiptap/starter-kit`, `prosemirror-state`,
`prosemirror-history`). The canonical path is `yjs` + `y-prosemirror` +
TipTap's `Collaboration` and `CollaborationCursor` extensions.

One integration catch: `Collaboration` replaces ProseMirror's history, so
StarterKit's `history` must be disabled and undo handed to Y's. This interacts
with `document-editor/use-pm-tripwire.ts` and `use-editor-sync.ts`.

## Implementation map

### Correction: the auth predicate is already centralized

An earlier draft of this sketch said the owner-or-teacher predicate was
duplicated across three routes and needed extracting. That was wrong, and the
real picture is better. `app/utils/document-access.server.ts` already exists and
is carefully designed — it returns Prisma `where` fragments rather than booleans
so an unauthorized caller never loads the row, and it draws a distinction worth
preserving:

| Helper | Scope |
| --- | --- |
| `documentReadWhere` | owner + teachers of the owner's classes |
| `documentOwnerWhere` | **owner only** — teachers deliberately excluded |
| `documentOwnerSessionWhere` | the owner rule via `AssignmentModuleSession` |
| `documentCommentReadWhere` | the read rule via `DocumentComment` |

The reason `documentOwnerWhere` excludes teachers is documented in the file: it
guards tutor conversations and module progress, and "a teacher writing into them
would fabricate student dialogue."

Adoption is partial. Seven routes use the helper (`api.document.$id.revisions`,
`api.domain.tutor-response`, `api.model.assignment-module-session` ×2,
`api.model.document-comment`, `api.model.document-comment-response`,
`api.model.document.$id`). Four document-scoped routes are still inline:

- `app/routes/app_.documents_.$id/route.tsx` — the editor loader
- `app/routes/api.document.$id.save/route.ts` — the save path
- `app/routes/app.documents._index/route.tsx`
- `app/routes/api.domain.submit-document/route.ts`

The other inline `classesAsStudent` matches are submission-, class- or
org-scoped, a different predicate shape, and out of scope here.

So phase 1 shrinks from "extract a predicate" to "migrate four routes onto the
existing helper, then widen it in one place." The first two on that list are
exactly the routes collaboration has to change anyway.

### A third scope is needed

Collaboration does not fit either existing rule. It needs a third:

```
documentAuthorWhere  — owner OR co-authors in the same group; teachers still excluded
```

`documentReadWhere` stays as-is (teachers still read group work for grading).
`documentOwnerWhere` stays as-is for anything that is genuinely one student's own
record. The new rule guards the collaborative write path.

### New blocker: the tutor conversation is keyed to the document, not the student

`AssignmentModuleSession` has **no `membershipId`** — it hangs off `documentId`
alone, and carries `instructionsCompleted` plus the whole
`AssignmentModuleSessionMessage` thread. On a shared document that means all
co-authors share **one** tutor conversation and **one** module-progress counter.
If one student completes the scaffolding steps, they are complete for everyone.

`Assignment.tutorEnabled` defaults to `true`, so turning on collaboration
silently makes the tutor conversation communal unless something is done. And the
logic in `document-access.server.ts` applies directly: if a teacher writing into
a student's tutor dialogue is fabrication, so is a co-author writing into their
partner's. Three options:

1. **Per-student module sessions** — add `membershipId` to
   `AssignmentModuleSession`, backfill from `Document.membershipId`, unique on
   `[documentId, membershipId, assignmentModuleId]`. Correct, and the largest
   change; touches `buildAssignmentModuleSessionCreateData` and
   `ensureAssignmentModuleSessionsForDocument`.
2. **Communal tutor on collaborative assignments** — defensible on pedagogical
   grounds (a group asking the tutor together is real group work) and costs
   nothing to build. Needs to be a stated decision, not a side effect.
3. **Force `tutorEnabled` off when collaboration is on** — crude, shippable,
   buys time. Bad if teachers want both.

Recommend (2) for the pilot with the behavior stated plainly in the UI, and (1)
only if teachers report it as a problem.

### Feature flag mechanism

`AGENTS.md` requires a flag, and the repo has tried generic flag systems twice
and dropped them both — `20260617120000_drop_feature_flags` and
`20260706120000_drop_feature_flags`, with `FeatureAccessTargetTeacherForensic`
left behind as an `@@ignore`d husk. Do not build a third generic system.

The live house pattern is a boolean column on `Organization`, default `false`.
Three current examples: `reporterEnabled`, `classInsightsEnabled`,
`writingPracticeEnabled` — most recently added by
`20260720163000_add_combined_feature_rollout_gates`. It is loaded in `root.tsx`,
checked through a small availability helper
(`class-insight-generate-availability.ts`), and enforced in query `where`
clauses (`organization: { classInsightsEnabled: true }`).

Follow it: `Organization.collaborativeDraftsEnabled Boolean @default(false)`.

**Naming hazard:** the org gate and the teacher toggle are different concepts and
must not be confused in review. Gate = `Organization.collaborativeDraftsEnabled`
(may this org use the feature at all). Toggle =
`Assignment.collaborationEnabled` (did this teacher turn it on here).

### Schema additions

House style is `String` with a default rather than a Prisma enum — only
`MembershipRole` is an enum — so group mode is a string.

```prisma
model Organization {
  collaborativeDraftsEnabled Boolean @default(false)   // rollout gate
}

model Assignment {
  collaborationEnabled   Boolean @default(false)       // teacher toggle
  collaborationGroupMode String  @default("teacher")   // teacher | random | whole-class
  collaborationGroupSize Int?                          // null for whole-class
}

model SavedAssignment {
  // must mirror the three fields above, or assignment reuse drops the setting
}

/// One group within one ClassAssignment. Exists before any document does:
/// pre-open it is a seating chart, post-open it owns a draft.
model DocumentGroup {
  id                String                @id @default(cuid())
  createdAt         DateTime              @default(now()) @db.Timestamptz(6)
  updatedAt         DateTime              @default(now()) @db.Timestamptz(6)
  classAssignmentId String
  classAssignment   ClassAssignment       @relation(fields: [classAssignmentId], references: [id], onDelete: Cascade)
  label             String                                  // "Group 1"
  ordinal           Int
  openedAt          DateTime?             @db.Timestamptz(6) // the lifecycle boundary
  documentId        String?               @unique            // provisioned at open
  document          Document?             @relation(fields: [documentId], references: [id], onDelete: SetNull)
  members           DocumentGroupMember[]

  @@index([classAssignmentId, ordinal])
}

model DocumentGroupMember {
  id           String        @id @default(cuid())
  createdAt    DateTime      @default(now()) @db.Timestamptz(6)
  groupId      String
  group        DocumentGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  membershipId String
  membership   OrgMembership @relation(fields: [membershipId], references: [id], onDelete: Cascade)
  removedAt    DateTime?     @db.Timestamptz(6)   // soft — transfers keep their history

  @@unique([groupId, membershipId])
  @@index([membershipId])
}
```

**Deliberately omitted: a `DocumentCollaborator` table.** The obvious alternative
is a direct document→membership join for the auth path. Skipping it keeps one
source of truth for "who is in this group" and avoids two tables that can
disagree; the cost is one extra indexed join in `documentAuthorWhere`
(document → group → members), which is cheap next to what the save path already
does. Add it only when a genuine non-group collaborator appears — a co-teacher or
an aide — rather than up front.

**"Not in a group" needs no table.** It is a derived view: students in
`Class.students` (a flat `OrgMembership[]`) with no non-removed
`DocumentGroupMember` row for this `ClassAssignment`.

### Change surface

| Area | Files |
| --- | --- |
| Auth | `app/utils/document-access.server.ts` (widen, add `documentAuthorWhere`); migrate the four inline routes listed above |
| Toggle | `assignment-creation-sheet.tsx`; a new parser beside `app/utils/assignment-tutor-enabled.server.ts`; `api.assignments.create/route.ts`; `app/domain/assignments/saved-assignments{,.server}.ts` |
| Provisioning | `app/domain/documents.server.ts` (`createDocumentForAssignmentType` → open-or-join); `app.class-assignments.$classAssignmentId.start/route.ts` |
| Editor | `document-editor/editor.tsx` (Yjs extensions, disable StarterKit `history`); `use-editor-sync.ts` (the save loop becomes a flush); `use-pm-tripwire.ts`; `use-paste-alert.ts` (collaborator-aware) |
| Persistence | `api.document.$id.save/route.ts` — one designated writer flushes; keep dual-write to `Document.html/text` + `DocumentRevision` |
| Group builder | new route + API under `app.my-classes.$classId...` |
| Transport | new route (HTTP/SSE) or a separate sync service, pending the spike |

### Test list (TDD, per AGENTS.md)

Unit / server first:

- `documentAuthorWhere` — co-author allowed; non-member of the same class denied;
  teacher denied on the write path but allowed on read; platform admin allowed
- the new toggle parser — mirrors `assignment-tutor-enabled.server.test.ts`,
  including the malformed-value case
- group provisioning — one document per group at open; idempotent under a double
  "Open groups" click
- open-or-join — two students in one group racing `start` converge on the same
  document, never two
- org gate — collaboration inert when `collaborativeDraftsEnabled` is false, even
  with the assignment toggle on
- reuse — a `SavedAssignment` round-trip preserves all three collaboration fields

E2E (before the UI, per AGENTS.md), alongside the existing
`document-editor.spec.ts` and `document-data-loss-regression.spec.ts`:

- two browser contexts, same group document, both see each other's text
- a student not in the group gets 403 on the document
- teacher opens a group draft read-only and comments
- shuffle before open is free; after open it is blocked or confirmed
- **regression:** a single-author document behaves exactly as before with the
  flag off — the existing specs must pass untouched

## Prior art in this subsystem — read first

`docs/decisions/2026-03-30-revert-local-first-persistence.md`. A previous attempt
in exactly this area was reverted from main because the new `DocumentRevision`
flow stopped populating tables that history and grading views depended on. Its
stated path forward — dual-write to old models until the new one is verified — is
the same discipline `AGENTS.md` requires, and collaboration touches the same
code.

## Rollout sequence

Each phase de-risks the next. Every phase ships behind a flag with the existing
single-writer path untouched, per `AGENTS.md`.

1. **Finish adopting `document-access.server.ts`.** Migrate the four inline
   document-scoped routes onto the existing helper. Pure refactor, no behavior
   change, ships alone. Unit tests first.
2. **Spike the transport.** Answer the App Runner question with running code
   before committing to a design. Everything downstream depends on it.
3. **Model groups and collaborators.** `Assignment.collaborationEnabled`,
   grouping mode, group table on `ClassAssignment`, `DocumentCollaborator`.
   Additive migration, nothing reads it yet. Flag `collaborative-drafts`,
   default off.
4. **Pilot: small teacher-assigned groups, ungraded.** Breakout panel, per-group
   document provisioning, the creation-to-class hand-off. No grade fan-out yet.
   Groups of 2-4. E2E first.
5. **Whole-class shared document.** A deliberate concurrency stress test, not a
   shortcut — see the note below.
6. **Graded group submissions.** Last, and only once the submission questions
   have real answers. Dual-write throughout.

### Revision to the phasing

An earlier draft of this sketch put the whole-class shared document first as the
cheapest pilot, since it needs no group UI and no grade fan-out. That is true of
the *product* work but backwards on the *transport*: ~30 students on one document
is the heaviest concurrency case, because presence and update fan-out grow with
the square of the participant count. Once the breakout panel is being built
anyway, small groups are the better first pilot — 2-4 concurrent editors is a
gentle load, and it exercises group formation, where the real product risk lives.

## Open questions

1. **Can one student submit for the whole group?** All of the grading model
   hangs off this.
2. **Does every group member get the same grade?** Usually yes-with-override; an
   override needs per-student scores on a shared submission.
3. **Is the writing tutor shared by the group, or one conversation per student?**
   Forced by the schema: `AssignmentModuleSession` is keyed to `documentId` with
   no `membershipId`, so today the answer is "shared" by default and module
   progress is communal. See the implementation map — this needs an explicit
   decision before the pilot, since `tutorEnabled` defaults to `true`.
4. **Do teachers write in student drafts, or only comment?** Teachers already
   reach student documents through the existing auth path. Live teacher
   co-editing is a distinct pedagogical act and deserves an explicit decision
   rather than falling out of the permission model.
5. **Is student writing allowed to leave the VPC?** Decides whether a managed
   realtime provider is on the table — the difference between a week and a month
   of infra work.
6. **What happens to a group when a student transfers out mid-assignment?**
   `DocumentClassForensic` and `ClassStudentCourseForensic` show roster churn is
   an established problem here, not a hypothetical. The "Not in a group" bucket
   covers transfers *in*; transfers *out* still need an answer (does the group
   keep working with their text in place? almost certainly yes).
