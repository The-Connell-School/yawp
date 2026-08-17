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

### 3. Document ownership and authorization (blocker)

`Document.membershipId` is a single owner. No group or team concept exists
anywhere in `schema.prisma`. Needs a `DocumentCollaborator` join table.

The catch: the authorization predicate (*owner, OR teacher of the owner's
class*) is **duplicated** across at least:

- `app/routes/app_.documents_.$id/route.tsx` (loader)
- `app/routes/api.document.$id.save/route.ts`
- `app/routes/api.model.document.$id/route.ts`

Extract it into one shared, tested predicate **before** widening it. Otherwise
the widening lands inconsistently and something leaks.

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

1. **Consolidate document authorization.** Extract the duplicated
   owner-or-teacher predicate into one tested function. Pure refactor, no
   behavior change, ships alone. Unit tests first.
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
3. **Do teachers write in student drafts, or only comment?** Teachers already
   reach student documents through the existing auth path. Live teacher
   co-editing is a distinct pedagogical act and deserves an explicit decision
   rather than falling out of the permission model.
4. **Is student writing allowed to leave the VPC?** Decides whether a managed
   realtime provider is on the table — the difference between a week and a month
   of infra work.
5. **What happens to a group when a student transfers out mid-assignment?**
   `DocumentClassForensic` and `ClassStudentCourseForensic` show roster churn is
   an established problem here, not a hypothetical. The "Not in a group" bucket
   covers transfers *in*; transfers *out* still need an answer (does the group
   keep working with their text in place? almost certainly yes).
