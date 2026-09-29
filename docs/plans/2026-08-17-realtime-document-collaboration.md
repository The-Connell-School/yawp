# Real-time document collaboration — feature sketch

**Date:** 2026-08-17
**Status:** Partly implemented — see PR #267. Product decisions recorded below;
one still open (whether an individual grade may exceed the group grade).

Letting multiple people (students or teachers) write in the same document at the
same time.

## Decisions — 2026-08-17

Answers from Kevin. These supersede anything below that contradicts them.

| # | Question | Answer |
| --- | --- | --- |
| 1 | Buy a collaboration provider? | **No.** Build with what we already have — no new SaaS subscription. |
| 2 | May student writing leave our AWS account? | **Probably not** — Bryant decides, but plan for no. |
| 3 | Can any group member hit submit? | **Yes**, any one of them submits for the group. |
| 4 | Can an individual grade exceed the group grade? | **Open.** Still thinking. |
| 5 | Shared writing tutor, or one each? | **One each.** |
| 6 | Can teachers type in a student draft? | **No — comment only.** |
| 7 | Share an existing draft as a copy, or move the original? | **Copy.** Original stays private. |
| 8 | Students share freely, or teacher approves? | **Both** must be possible. |

### What 1 and 2 change: no provider, we host the transport

Together these rule out Tiptap Collaboration Cloud and every other hosted
provider — one on cost, the other on data residency. The remaining option is the
one this doc previously withdrew: **Yjs updates over ordinary HTTP, served by the
existing app.**

It is a downgrade in exactly one dimension and an upgrade in several:

- **Latency.** Polling gives roughly 600ms–1s before a partner's text appears,
  against ~100ms for a hosted WebSocket service. Server-sent events might reach
  200–350ms and are worth one day of investigation. Note what is *not* affected:
  a student's own typing stays instant regardless, because Yjs applies edits
  locally before the network is involved. Cursors can also stay lively on a faster
  channel than text.
- **Cost.** Zero. No subscription, no new infrastructure.
- **Data residency.** Student writing never leaves the AWS account, which
  answers question 2 by construction rather than by contract.
- **Verifiability.** This is the significant one. Every piece that was unverifiable
  because it depended on a third party becomes ordinary code we own and can test:
  the seeding transport, the room storage, the token exchange.
- **Portability.** Because it is still Yjs underneath, swapping to self-hosted
  Hocuspocus later — after the App Runner migration lands and WebSockets become
  possible — is a transport change, not a rewrite.

The earlier objection to this approach was that App Runner is in maintenance mode
and not worth investing in. That argument is about platform longevity, not cost,
and it is answered by the portability point: the Yjs layer survives the migration
even if the HTTP transport is later replaced.

**Code this removes rather than adds.** The provider integration built so far
becomes simpler, not more complex:

- the inbound webhook, its signature verification and replay handling — gone;
  the endpoint that receives updates does the dual-write directly
- the signed JWT handed to a third party — gone; requests carry the existing
  session cookie
- `providerRoomClient`, the one genuinely unverified piece of HTTP — replaced by
  a Postgres table of Yjs updates, which is testable

**New work it adds:** an append-only updates table with a sequence cursor, an
endpoint to accept batched updates, an endpoint to stream or poll them back, and
periodic compaction so the table does not grow without bound.

### What 3, 5, 6, 7 and 8 change

- **3 — any member submits.** Group submission is a real feature now rather than
  an open question. Still needs the availability fallback described below, and
  still sits behind the two-tier grading model.
- **5 — one tutor conversation each.** This is the larger of the two options
  considered: `AssignmentModuleSession` is keyed to `documentId` with no
  `membershipId`, so it needs the column, a backfill from `Document.membershipId`,
  and a uniqueness change to `[documentId, membershipId, assignmentModuleId]`.
  Until that lands, collaboration and the tutor must not both be on for the same
  assignment.
- **6 — teachers comment only.** Already how the collaborative side is built:
  `documentAuthorWhere` excludes teachers, and the token exchange grants them
  read-only. No change needed, and the exclusion is now a requirement rather than
  a judgement call. Note this is about *shared* drafts; the solo editor's existing
  behaviour is untouched.
- **7 — copy, not move.** Already built and verified. The tradeoff stands: later
  edits to the private original do not appear in the shared copy.
- **8 — both sharing modes.** New work: a per-organization (or per-class) setting
  for whether a student's share needs teacher approval, plus a pending state and
  an approval queue. Today sharing is immediate with no approval path.

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

## Teacher side: contribution breakdown and two-tier grading

Requirement: the group gets a grade, and each student also gets an individual
grade based on their contribution, with a teacher-facing breakdown of who did
what.

### Recommendation: the breakdown is evidence, not an algorithm

Build the breakdown as evidence a teacher reads, and keep the individual grade
**teacher-set**. Do not compute an individual grade from contribution metrics.
This still delivers the requirement — every student gets their own grade — but it
does not pretend a metric can measure contribution, and it is the difference
between a feature teachers trust and one they fight.

Every automatic contribution metric fails in ways that are common rather than
exotic:

| Failure | Why it happens |
| --- | --- |
| **The scribe** | One student types while the group talks. Character attribution gives the typist 100% and everyone else 0% — and this is the single most common group-work pattern. |
| **The reviser** | A student who cuts 300 words and tightens the argument shows *negative* net contribution by volume, while doing some of the highest-value work. |
| **The thesis writer** | Writes the one sentence the others elaborate on. Scores ~2%. |
| **Gaming** | Once students know volume is measured, padding then deleting is trivial. |
| **Equity** | Slower typists, students with motor impairments, and students who compose on paper first are systematically undercounted. This repo already carries `docs/compliance/accessibility` and accessibility e2e specs; an auto-graded volume metric cuts against that work. |

Teachers also audit evidence they can see far more readily than a number they
cannot, so the evidence panel is the more defensible product regardless.

### What the panel should show

Roughly in order of usefulness — note that the most useful signals are
behavioral, not volumetric:

1. **Authorship heatmap over the draft itself.** The real document with each
   student's text tinted in their caret color. A teacher can see who wrote the
   conclusion in about two seconds. Reuses the student-side color assignment, so
   one color means one person everywhere in the product.
2. **Session timeline per student.** When each student worked, how many distinct
   sessions, spread across the week or all at 11pm the night before. The best
   free-rider signal available, and it does not reward verbosity.
3. **Added vs. revised vs. deleted.** Splitting new text from edits to existing
   text is what rescues the reviser from looking like a freeloader.
4. **Words surviving in the final draft** — the headline number, but never shown
   alone, and never shown as a percentage that looks like a grade.
5. **Comments and tutor engagement.** `DocumentComment` and
   `DocumentCommentResponse` both already carry `membershipId`, so who asked what
   is free data. If the tutor stays communal, who engaged it is a strong signal.

### Where attribution data comes from

Two candidate sources, and the choice matters:

- **`DocumentWriteJournal`** carries `membershipId` and `userId` per write, so
  attribution is technically available today. But it stores **full `html` +
  `text` per row**, not diffs, so "who wrote what" means diffing consecutive
  snapshots. It also records rejected writes. Workable, but it is
  reverse-engineering, and on a shared document the row count and stored text
  multiply per collaborator.
- **Yjs `PermanentUserData`** makes per-character authorship a durable property
  of the document rather than something inferred. This is the real answer, and it
  is **a second independent argument for the CRDT approach** that blocker 1
  already forces: contribution attribution stops being an analytics problem and
  becomes a property of the data structure.

Caveats: Yjs attributes *insertions* cleanly, while deletion attribution needs
deliberate handling, and `PermanentUserData` adds document size overhead. Also
note `DocumentRevision` has **no** author field at all, so revision history
cannot help here.

### Schema: two-tier grading

The group grade needs no schema change. `Submission` already has `overallScore`,
`numericPercentage`, `letterGrade`, `feedback`, `rubricScores` — the submission
simply belongs to the group.

The individual grade is a new per-member overlay:

```prisma
model SubmissionMemberGrade {
  id                   String        @id @default(cuid())
  createdAt            DateTime      @default(now()) @db.Timestamptz(6)
  updatedAt            DateTime      @default(now()) @updatedAt @db.Timestamptz(6)
  submissionId         String
  submission           Submission    @relation(fields: [submissionId], references: [id], onDelete: Cascade)
  membershipId         String
  membership           OrgMembership @relation(fields: [membershipId], references: [id], onDelete: Cascade)

  /// While true this row tracks the group grade. The teacher editing the
  /// individual grade detaches it, and a later group regrade updates only the
  /// rows still attached.
  followsGroupGrade    Boolean       @default(true)
  numericPercentage    Int?
  letterGrade          String?
  /// Private to this student — not shown to the rest of the group.
  overallComment       String?
  gradedAt             DateTime?     @db.Timestamptz(6)
  gradedByMembershipId String?

  @@unique([submissionId, membershipId])
  @@index([membershipId])
}
```

`followsGroupGrade` resolves the absolute-vs-delta fork. Storing an absolute
value alone means a group regrade silently strands the individual grades; storing
a delta alone means the number a student already saw can shift under them. The
boolean plus an absolute value gives both: the stored number is always
authoritative, and a regrade can safely reapply to the untouched rows only.

**Release stays a single gate.** `Submission.releasedAt` continues to govern.
Releasing individual grades separately would leak comparative timing information
between group members for no benefit.

### Query surface — easy to miss

Everything student-facing on submissions is currently scoped through
`document.membershipId`, so on a shared document **only the nominal owner would
see the submission or its grade at all.** Verified sites:

- `app/routes/app_.submissions_.$submissionId/route.tsx` — owner OR
  teacher-of-owner, inline
- `app/routes/api.domain.release-grades/route.ts` — filters
  `document: { is: { membershipId: { not: actor.membershipId } } }`
- plus `api.domain.grade-essay-ai` and `api.domain.update-submission`

These need the same widening as document access, and for a group member the
grade shown must be their `SubmissionMemberGrade`, not the raw `Submission`
fields.

### Phasing consequence

This does **not** move graded group work earlier — it still sits behind
attribution, which sits behind the CRDT, which sits behind the transport spike.
But it splits usefully: **the contribution panel is buildable and testable as a
read-only teacher view on ungraded group work**, before any grading exists. Ship
the evidence first, find out from teachers whether it is actually useful, then
put grading on top of evidence that has already earned trust.

### Deliberately not in v1

`SubmissionGradingAssistantRun` runs per submission with a rubric snapshot, so
once text is authorship-segmented the AI assistant could comment on the *quality*
of each student's contribution rather than its volume — the thing word count
fundamentally cannot do. Genuinely promising, and explicitly out of scope for
v1: an AI judgment that feeds an individual student's grade needs its own
scrutiny and almost certainly a human-in-the-loop requirement.

## Technical blockers

### 0. Architecture decision: a separate page, not a flag inside the editor

**The collaborative editor is a new route that duplicates the existing document
page. The existing editor, its save path, and submit-document are not modified
at all.**

This is the strongest available form of the backward-compatibility rule in
`AGENTS.md`, and this subsystem has already earned it: the local-first
persistence work was reverted from `main` for breaking things adjacent to it
(`docs/decisions/2026-03-30-revert-local-first-persistence.md`). A flag threaded
through `use-editor-sync.ts` puts collaborative and solo writing in the same
code path, where a mistake reaches every student. A parallel route cannot.

Consequences, all of them good:

- `app_.documents_.$id/route.tsx`, `use-editor-sync.ts`,
  `api.document.$id.save`, and `api.domain.submit-document` stay byte-identical.
  A diff against `main` in those paths is a bug in this plan.
- The new page duplicates the editor shell so it looks the same to students, but
  swaps `use-editor-sync` for the Yjs `Collaboration` extensions, and disables
  whole-document autosave entirely.
- Routing decides which page a student lands on, based on whether their
  assignment is collaborative — so the two never mix at runtime.
- Duplication is accepted deliberately and temporarily. Once collaborative
  editing has run in production long enough to trust, the two pages can be
  reconciled; until then, duplication is the cheap insurance and shared code is
  the expensive risk.
- **The predicate consolidation is therefore reverted out of this branch.** Even
  a behavior-preserving swap is a diff in files this feature has decided not to
  touch. It is worth doing on its own, as its own PR.

Because the old page keeps its narrow inline predicate, a co-author cannot open a
shared draft there at all — which is correct: they belong on the new page.

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

### 2. Hosting does not support WebSockets — RESOLVED

**Decision: keep Yawp on App Runner. The browser connects directly to a managed
collaboration provider over WSS. Pilot Tiptap Collaboration Cloud.**

```
Browser (Tiptap)
├─ HTTPS → Yawp on App Runner: session, authorization, grading, submission
└─ WSS   → Tiptap Cloud: Yjs document, live edits, cursors, presence

Tiptap Cloud webhook/API
└─ HTTPS → Yawp: derived HTML/text snapshots → existing Postgres
```

The move that makes this work: App Runner never carries a socket, so its
WebSocket limitation stops being something to engineer around. App Runner keeps
doing what it is good at — HTTP request/response for auth, grading and
submission — and realtime traffic bypasses it entirely. No hosting migration is
required to ship collaboration.

**An earlier draft of this plan recommended spiking SSE on App Runner. That
recommendation is withdrawn**, for a reason that also removes option 3 below:

- App Runner's runtime is HTTP request/response with a 120s cap and assumes
  stateless request processing.
- The WebSocket roadmap request was closed **not planned**.
- **App Runner moved to maintenance mode** — announced 31 March 2026, effective
  30 April 2026. Existing customers continue and may still create services;
  no new customers, and **no new features planned**. AWS points migrations at
  ECS Express Mode.

Engineering a streaming transport onto a platform AWS has stopped developing is
the wrong direction. Worth stating the corollary plainly, though: **Yawp has an
App Runner exit ahead of it regardless of collaboration.** That is a separate
piece of work, and it should not be bundled into this feature — but it does
change the long-run economics below.

**Why Tiptap Cloud specifically**

- Yawp is already on Tiptap/ProseMirror, so the editor integration is the
  supported path rather than an adaptation.
- Tiptap Collaboration is Yjs plus Hocuspocus underneath: merging, presence,
  persistence, history and export APIs.
- Server-generated JWTs can scope access to exact document names with read/write
  levels — which maps onto the authorization scopes already built, with the token
  endpoint as the seam.

**Lock-in is lower than a managed dependency usually implies, and this is a
significant part of the argument.** The protocol underneath is Yjs/Hocuspocus,
which is open and self-hostable. Moving later from Tiptap Cloud to self-hosted
Hocuspocus is a transport swap, not a rewrite. Combined with the App Runner exit
above — which likely lands on ECS anyway — the self-hosted option gets cheaper
over time, and piloting managed now does not foreclose it.

**Superseded options,** kept for the record: a separate ECS + ALB Hocuspocus
service (still the endgame if data residency demands it, and cheaper once the
ECS migration happens for other reasons), and Yjs over HTTP/SSE on App Runner
(withdrawn — wrong platform to invest in).

### 2a. Open questions on the provider decision

Not blockers, but each should have an answer before money or student data moves:

- **Pricing tier and its limits.** Webhook/API access appears to be a higher tier
  than the entry plan, and dependable Postgres snapshots depend on it — so the
  real number is likely the Team price, not the entry price. **Concurrent
  connection and document limits per tier need confirming**, because the failure
  mode is mid-class: one period with several classes doing group work at once is
  a spike, not a trickle. (Not verified here — tiptap.dev is blocked by this
  environment's egress proxy.)
- **DPA, data residency and FERPA.** This is the real gate, and it is contractual
  rather than technical. SOC 2 is a security audit and is **not** FERPA
  compliance: a K-12 arrangement needs the provider bound as a school official
  under the district's terms, with residency pinned. COPPA also applies if any
  students are under 13. Settle this before student writing leaves Yawp's AWS
  account.
- **Submission availability coupling.** See the submission note below — this is
  the most user-visible failure mode and it needs a specified fallback.

### 2b. How fast can it actually be

Three different latencies get conflated as "realtime". Only the third is
transport-bound:

| What | Latency | Depends on transport? |
| --- | --- | --- |
| Your own keystroke reaching your own screen | ~0ms | **No.** Yjs applies your edit to the local doc synchronously; it never waits on the network. True even at 5s polling. |
| Your partner's cursor moving | tens of ms | Only loosely — awareness data is tiny and disposable, and can ride a faster cadence than content. |
| Your partner's *text* appearing | 100ms–1s | **Yes.** This is the whole question. |

Budget for the third: client batch ~150ms + network ~20-60ms + server and
Postgres write ~5-20ms + delivery down (the variable) + apply and render ~5ms. So
the floor is ~200ms whatever we do; the transport decides whether delivery adds
nothing or up to a full poll interval.

| Approach | Realistic p50 for partner's text | Cost |
| --- | --- | --- |
| WebSocket sync service (Hocuspocus on ECS + ALB) | **80–150ms** — Google Docs territory | New service, Terraform, deploy target, auth bridging |
| **SSE down + batched POST up on App Runner** | **200–350ms** — reads as live | No new infra, if streaming holds |
| HTTP polling at 1s | ~600ms average, ~1.1s worst | No new infra, cheapest to build |
| HTTP polling at 300ms | ~300–450ms | 3.3 req/s **per client**: 30 students on one document is ~100 req/s for that document alone |

The polling row is why whole-class is the heaviest case: poll cost is
O(participants) per document, while push is O(1) write fanned out.

**Why a dumb transport is still correct.** Yjs is a CRDT, so updates are
commutative and idempotent. Late, duplicated, or out-of-order delivery cannot
corrupt the document. Polling would be unacceptable with OT; here it is merely
laggier. That is what makes the cheap option safe rather than a hack.

**Known wrinkle for SSE:** App Runner caps request duration (120s), so an SSE
stream will be cut and must reconnect. `EventSource` reconnects on its own, but
the client needs a `since` cursor to catch up — which an append-only update table
with a sequence number provides for free.

**What we can do regardless of transport,** and it accounts for most of the
perceived speed:

- optimistic local apply — own typing always instant (free, biggest win)
- awareness on a faster, separate cadence than content, so cursors feel live even
  when text trails
- batch upstream at ~150ms instead of per keystroke
- compact accumulated Yjs updates server-side to keep payloads small
- `y-indexeddb` for instant load and offline tolerance

Honest summary: **~200–350ms without leaving App Runner if SSE streaming works,
~600ms–1s if we must poll, ~100ms only with a dedicated sync service.** The spike
is worth a day precisely because it separates "feels live" from "feels laggy"
without spending a month on infrastructure.

### 2c. Carets, as built — and where this doc was wrong about them

The plan said awareness could "ride a faster cadence than content, so cursors
feel live even when text trails". It does not, and the reason is worth recording
because it inverts the assumption.

Awareness on its own cadence means a second timer, and a second timer against
this transport means a second HTTP request per client per interval. Carets and
text are wanted about the same draft at the same moment, so a separate presence
poll would double the request count to learn something the content poll already
had to ask for — and the poll row above is the one that scales O(participants).
So **reading** presence rides the content GET, and the caret is exactly as
current as the text it sits beside. That is the honest pairing anyway: a caret
that is 300ms ahead of the sentence it is in front of is not more truthful, it
is misplaced.

**Writing** presence is a separate endpoint, and that asymmetry is deliberate. A
document POST appends to the room's permanent log and triggers the snapshot
dual-write that grading, search and submission read. A cursor moving several
times a second must reach neither, and keeping the endpoints apart means it
cannot, however the client behaves.

Three things the plan did not anticipate:

**Presence is in Postgres, not in a process.** The transport polls whatever app
instance answers, so in-memory presence is per-instance presence: two students in
one group would see each other only when their requests happened to land on the
same one. Teammates whose carets come and go are worse than no carets. The cost
is one small upsert per open editor per few seconds and one indexed read that
rides an existing query, with a TTL sweep that only runs when it has something to
delete.

**The caret label is written by the server.** It is the one part of presence a
student reads and believes, and awareness state is whatever the browser puts in
it — including a classmate's name. So the endpoint throws away what was claimed,
keeps only the cursor, and stamps the identity it resolved from the session.

**Colour is a function of the ordered roster, not the roster.** Inside the
palette, `buildAuthorColorScale` assigns by position, so two pages that order
their member queries differently hand the same student two different colours.
Harmless while colour only tinted a contribution panel; not harmless once a caret
carries it, because a caret in one colour and its owner's initials in another is
worse than no caret. Every query that feeds a scale now shares one ordering.

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
Current example: `classInsightsEnabled` — most recently added by
`20260720163000_add_combined_feature_rollout_gates`. It is loaded in `root.tsx`,
checked through a small availability helper
(`class-insight-generate-availability.ts`), and enforced in query `where`
clauses (`organization: { classInsightsEnabled: true }`).

Note: `reporterEnabled` and `writingPracticeEnabled` were retired — Reporter and
Writing Practice are always on for every organization now. The columns remain
for backward-compatibility and historical data.

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
| Contribution panel | new read-only teacher view; authorship source is Yjs `PermanentUserData` (preferred) or diffed `DocumentWriteJournal` rows |
| Two-tier grading | new `SubmissionMemberGrade`; widen `app_.submissions_.$submissionId`, `api.domain.release-grades`, `api.domain.grade-essay-ai`, `api.domain.update-submission` |
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

Contribution and grading:

- attribution — text typed by A is attributed to A after B edits a different
  paragraph; a paragraph A wrote and B rewrote reports as revised, not as A's
- `followsGroupGrade` — a group regrade updates attached rows and leaves detached
  ones alone; editing an individual grade detaches exactly that row
- every group member can open the submission and sees **their own**
  `SubmissionMemberGrade`, not the group's raw fields and not a peer's
- release — no member sees any grade before `Submission.releasedAt`
- a member's private `overallComment` is not visible to the rest of the group

## Rollout requirements for the provider integration

Sequenced, and each one is load-bearing:

1. **Flag per document/class.** Largely built: `Organization.collaborativeDraftsEnabled`
   gates the rollout and `Assignment.collaborationEnabled` plus groups on
   `ClassAssignment` give per-class and per-document granularity. The legacy
   editor stays unchanged.
2. **One collaboration room per Yawp document.** Room name derived from the
   document id.
3. **Token endpoint on App Runner** validates existing owner/co-author/teacher
   permissions, then returns a document-scoped JWT. This is where
   `documentAuthorWhere` earns its place — the access model is already built and
   tested, and the token endpoint is its first production call site.
4. **Seed existing HTML exactly once, and only after confirming the room is
   empty.** Seeding on every join duplicates content. This check is the
   difference between a working migration and silently doubling a student's
   essay.
5. **Disable whole-document autosave on collaborative documents.** Free here,
   because the collaborative page is a separate route that never wires up
   `use-editor-sync` in the first place.
6. **Keep dual-writing derived HTML/text into `Document`** for grading, tutor,
   search, comments, revisions and backward compatibility. Non-negotiable per
   `AGENTS.md`, and the specific thing whose absence got the last attempt
   reverted.
7. **Submission fetches canonical state server-side** and creates an immutable
   `Submission`.
8. **Enforce editor schema version before joining a room.** A client with an
   older bundle and fewer extensions can silently drop unsupported nodes from a
   shared document. This is a data-loss vector, not a compatibility nicety, and
   it is worse here than in single-player editing because one stale client
   damages everyone's draft.
9. **DPA, residency and FERPA cleared** before student writing leaves the AWS
   account.

### The gap worth closing before build: submission availability

"Submission waits for provider sync" couples the single most deadline-sensitive
action in the product to a third party's uptime. If Tiptap Cloud is slow or down
at 11:59pm on a due date, the current plan has no specified behavior — and this
is precisely the failure that generates angry parent email.

Proposed rule, to be confirmed:

- Try the server-side canonical fetch first, with a short timeout.
- On timeout or error, fall back to the most recent dual-written
  `Document.html/text` snapshot rather than blocking the submission.
- Record which path produced the `Submission`, so a teacher can tell whether they
  are grading canonical text or a snapshot that may be seconds stale.
- Never leave the student unable to submit because of provider availability.

A stale-by-seconds submission that exists beats a perfect one that failed to save
at the deadline.

## Seeing it in a preview

The end-to-end path exists in code. What it needs to actually run:

**One-time setup**

1. **Provider credentials.** Set `TIPTAP_COLLAB_APP_ID` and
   `TIPTAP_COLLAB_SECRET`. Both are optional in `env.server.ts` so environments
   without them still boot; the token route returns 500 rather than a token when
   they are absent. **This requires a Tiptap Cloud account and is the one
   blocker that cannot be satisfied from the repo.**
2. **Turn on the org gate.** `Organization.collaborativeDraftsEnabled = true` for
   the preview organization. There is no admin UI for this yet, so it is a SQL
   update.

**Per assignment**

3. **Create a collaborative assignment.** The creation sheet shows a
   "Collaborative draft" checkbox and a students-per-group select, but only when
   the org gate above is on — the toggle is hidden entirely otherwise. Note the
   sheet's caller must pass `collaborativeDraftsEnabled`; a caller that does not
   renders the sheet exactly as before.
4. **Arrange and open groups.** Visit
   `/app/class-assignments/:classAssignmentId/groups` as the class's teacher.
   Pick a size, shuffle, review, then **Open groups** — which provisions one
   shared draft per group and stamps `openedAt`. Rearranging is refused after
   that point.
5. **Students click Start.** They are routed to
   `/app/collab-documents/:documentId` instead of getting a personal document.
   A student whose teacher has not opened groups gets a toast saying so.

**What a preview will and will not show**

Working: two students in the same group typing into one document, named carets,
presence avatars, a teacher joining read-only.

Not working, and expected:

- **Nothing reaches Postgres.** No dual-write exists yet, so `Document.html/text`
  stays empty. The Y.Doc persists in the provider, so content survives a reload —
  but grading, tutor, search, comments and submission all read the stale row.
  **This is the next thing to build and the one that most matters.**
- **No seeding.** Irrelevant for a fresh preview, since a newly provisioned group
  draft starts empty. It matters the moment collaboration is turned on for an
  assignment students have already written in.
- **No submission.** Not wired, including the availability fallback above.
- **No comments, tutor, module sessions or grade panels** on the collaborative
  page. Acceptable for an ungraded small-group pilot, not beyond it.
- **The groups page has no drag-and-drop.** Shuffle, review, open. Move and
  exchange between groups are not built.

**Unverified.** Steps 3–5 exercise UI that has never been rendered. The server
side of each — the parser, the rollout gate, group planning and provisioning, the
start-route branch, the groups loader and action, the token endpoint — is
unit-tested. The pages are not.

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
2. ~~**Spike the transport.**~~ **Resolved by decision, no spike needed:** the
   browser connects directly to Tiptap Collaboration Cloud over WSS and App
   Runner never carries a socket. What replaces the spike is a provider
   evaluation — pricing tier limits, and the DPA/FERPA review.
3. **Model groups and collaborators.** `Assignment.collaborationEnabled`,
   grouping mode, group table on `ClassAssignment`, `DocumentCollaborator`.
   Additive migration, nothing reads it yet. Flag `collaborative-drafts`,
   default off.
4. **Pilot: small teacher-assigned groups, ungraded.** The new collaborative
   route, breakout panel, per-group document provisioning, token endpoint, and
   the creation-to-class hand-off. No grade fan-out yet. Groups of 2-4. E2E
   first.
5. **Contribution panel, read-only.** The authorship heatmap and session
   timeline on ungraded group work. Ships before any grading, so teachers can
   tell us whether the evidence is useful before it carries consequences.
6. **Whole-class shared document.** A deliberate concurrency stress test, not a
   shortcut — see the note below.
7. **Two-tier graded submissions.** Last. Group grade plus
   `SubmissionMemberGrade`, on top of an evidence panel that has already earned
   trust. Dual-write throughout.

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
2. ~~**Does every group member get the same grade?**~~ **Decided:** no. Two-tier —
   a group grade on `Submission` plus a per-member `SubmissionMemberGrade` that
   defaults to following the group grade and detaches when the teacher edits it.
   The remaining sub-question is whether an individual grade may exceed the group
   grade, or only reduce it.
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
7. **May students form their own groups?** **Not until teachers are asked.** The
   student road — start a shared draft, invite classmates — is built, tested and
   currently hidden: `studentStartedSharedDraftsEnabled()` closes it at
   `requireSharingStudent`, which both the loader and the action go through, and
   the two entry points that offered it are gated on the same function. Nothing
   was deleted, so turning it back on is one line.

   The reason is pedagogical, not technical. Who works with whom is a teaching
   decision, and a class that sorts itself into groups has social consequences a
   teacher is positioned to manage and the software is not. The pilot therefore
   ships with only the teacher road open, and the question of whether students
   should ever have the other one is a conversation to have with teachers rather
   than a default to arrive at by having built it first.
