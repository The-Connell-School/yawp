# Admin Seed-Data Generator Rebuild — Design

Date: 2026-08-06
Status: Approved for implementation
Owner: Bryant Brock / Yawp engineering
Branch: `ws/admin-seed-generator` (PR #245 against `The-Connell-School/yawp-2.0`)

## Summary

The current admin seed-data generator (shipped on this branch in `d0e29942`, not yet
merged to `main`) is a single-shot, single-message tool call: one Anthropic request
authors full essay text *and* grading for every student at `maxTokens: 8000`, with no
conversation persistence. Measured behavior in the preview environment: ~150-260s
latency, ~50% failure rate (502 from the app's own error branch when the LLM call
times out or the tool-round budget is exceeded), no continuity between turns, and a
correctness bug where a `draft`-status submission silently produces a `Document` with
no `Submission` row, which reads to the user as "it didn't create the submission."

This rebuild makes the feature behave like the Reporter feature Bryant already trusts:
persisted, multi-turn, switchable threads that carry real entity IDs forward, with a
two-phase generation architecture (fast structural graph, then lazy content fill) to
fix both the latency/reliability problem and to enable the two other asks — an
editable entity-relationship graph and expandable long-content previews — from the
same architectural change.

## Problems this design must solve (traced to root cause)

1. **Latency/reliability.** `seed-generator-propose.server.ts` makes one
   `getLLMCompletion` call with `maxTokens: 8000`, `temperature: 0.7`,
   `maxToolRounds: 2`, asking the model to write full essay prose for every
   submission and grade every one in the same response
   (`seed-generator-propose.server.ts:27-58`, `:71-103`). Anthropic call time scales
   with output tokens; authoring N full essays inline is why this take 150-260s and
   times out under load. The route then converts any `'error' in result` into a
   generic 502 (`app.admin.organizations.$id.seed-generator/route.tsx:113-116`), which
   is indistinguishable from a genuine parse failure — so a user facing a timeout
   rewrites their prompt instead of retrying, which is exactly the wrong recovery.

2. **No conversation continuity.** There is no thread/message Prisma model for this
   feature (confirmed by grep — only `ReporterConversation`/`ReporterMessage`/
   `ReporterGrowthPlan` exist, `packages/prisma/schema.prisma:471-528`). Each proposal
   call builds a fresh single-message array from only the current form submission
   (`seed-generator-propose.server.ts:74`). "Now add a submission for that student"
   has nothing to resolve "that student" against — no history, no entity IDs.

3. **draft vs submitted correctness bug.** The write path
   (`seed-generator-write.server.ts:285-329`) always creates a `Document`, then
   creates a `Submission` only if `submission.status !== 'draft'` (`:304`). The tool
   schema documents `draft` as "in-progress document only, no submission yet"
   (`seed-generator-schema.ts:246`), but nothing in the system prompt tells the model
   that "not yet graded" (Bryant's actual phrase) must map to `status: 'submitted'`,
   not `status: 'draft'`. Plain-English "ungraded" is ambiguous between "not
   submitted" and "submitted but not graded" — the schema draws a hard line the
   prompt doesn't teach the model to draw. Root cause is a prompt/schema-alignment
   gap, not a transaction bug (the write is one atomic `$transaction`, so partial
   writes from thrown exceptions are not the mechanism — confirmed by code read).

4. **Flat, non-relational review UI.** `seed-generator-panel.tsx` has three
   independent checkbox lists (classes `:232-251`, assignments `:254-274`, students
   `:277-299`); submissions have no `approved` field at all and ride along with their
   parent student. This can't show or edit "this submission belongs to this document
   belongs to this assignment belongs to this class."

5. **No content preview / no way to inspect essay text before commit** except by
   scrolling the flat lists.

6. **Sparkle icon present.** `seed-generator-panel.tsx:8,179` imports and renders
   `lucide-react`'s `Sparkles` icon. Must be removed repo-wide for this feature; no
   other sparkle/wand/magic occurrences found in these files.

## What to copy from Reporter, and what to deliberately not copy

Reporter's architecture (full trace: `app/routes/app.reporter/route.tsx`,
`app/routes/api.domain.reporter/route.ts`, `app/domain/reporter/reporter-tools.server.ts`,
`packages/prisma/schema.prisma:471-500`) gives us a proven pattern:

- **Thread model**: a parent conversation row + ordered message rows, thread selection
  via `?c=<id>` in the URL, lazy conversation creation on first turn inside the same
  `$transaction` that appends the first two messages, list capped at 30 most-recent
  threads ordered by `updatedAt desc`.
- **Bounded history**: cap by both message count (`MAX_HISTORY_MESSAGES`) and total
  characters (`MAX_HISTORY_CHARS`, walking backward from newest) rather than sending
  the entire thread every turn.
- **Access gate pattern**: a single `require*Access` gate used by both the page loader
  and the resource-route action, 404 (not redirect) from the action so the feature is
  invisible where disabled.
- **Propose-then-confirm for writes**: `save_growth_plan` is staged
  (`ctx.pendingGrowthPlanSaves`) and returned to the client rather than written inside
  the tool-call loop; a second, separately-validated action call
  (`intent: 'confirm-growth-plan'`) does the actual persistence, re-validated
  server-side rather than trusting the client blob. This is the direct precedent for
  "review step lets him edit before committing."
- **`logPayload: 'metadata-only'`** on every `getLLMCompletion` call — the "redaction
  session" is this flag, which makes `logLlmCall()` store `{ redacted: true,
  messageCount }` instead of actual message content in `LlmLog`. Keep this on all new
  calls; seed-gen conversations will contain synthetic-but-realistic student names and
  essay content, and metadata-only logging is already this repo's standard for
  anything touching student-shaped data.

**Deliberately different:**

- Reporter's tools are all read-only except one staged write. Seed generation is
  inherently a multi-entity write feature, so the propose/confirm split needs to cover
  a whole graph of entities (class → assignment → student → document → submission),
  not one plan object. This is the graph-edit UI requirement below.
- Reporter uses one call per turn with tool-calling for data lookups. Seed generation
  needs two distinct LLM call *shapes* per turn (structural pass, then content fill) —
  see Two-Phase Generation below. This is the one deliberate architecture deviation
  from Reporter, justified by the latency numbers above; a single smaller call was
  tried implicitly (the existing feature already trims scope by asking for one org
  worth of demo data) and still times out because the bottleneck is essay-authoring
  token volume, not request count.

## Data model changes

Add to `packages/prisma/schema.prisma`, mirroring `ReporterConversation`/
`ReporterMessage` shape and indexing:

```prisma
model SeedGeneratorConversation {
  id             String    @id @default(cuid())
  membershipId   String
  organizationId String
  title          String?
  deletedAt      DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  membership     OrgMembership @relation(fields: [membershipId], references: [id])
  organization   Organization  @relation(fields: [organizationId], references: [id])
  messages       SeedGeneratorMessage[]
  nodes          SeedGeneratorNode[]

  @@index([membershipId, updatedAt(sort: Desc)])
  @@index([organizationId])
}

model SeedGeneratorMessage {
  id             String   @id @default(cuid())
  conversationId String
  role           String   // "user" | "assistant"
  content        String
  toolCalls      Json?
  createdAt      DateTime @default(now())
  conversation   SeedGeneratorConversation @relation(fields: [conversationId], references: [id])

  @@index([conversationId, createdAt])
}

// The entity graph itself, persisted so it survives a page reload and so
// follow-up turns can resolve "that student" to a real row instead of
// re-deriving it from message text.
model SeedGeneratorNode {
  id             String   @id @default(cuid())
  conversationId String
  localId        String   // stable id the LLM refers to within a thread, e.g. "student-1"
  kind           String   // "class" | "assignment" | "student" | "document" | "submission"
  parentLocalId  String?  // graph edge: submission -> document -> assignment -> class; student -> class
  status         String   // "proposed" | "approved" | "rejected" | "committed"
  data           Json     // kind-specific payload (name, essayText, grade, etc.)
  committedEntityId String? // once written, the real Class/Assignment/User/Document/Submission id
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  conversation   SeedGeneratorConversation @relation(fields: [conversationId], references: [id])

  @@index([conversationId, localId])
  @@unique([conversationId, localId])
}
```

`SeedGeneratorNode` is the key departure from Reporter: it is the durable
representation of the entity graph across turns, edits, and the two generation
phases. A follow-up turn's system prompt includes the current node graph (not just
message text), so "now add a submission for that student" resolves `that student`
against a real `SeedGeneratorNode` row with `kind: "student"` and its
`committedEntityId` if already written, or its `localId` if still proposed.

## Thread model (route layout, mirroring Reporter)

- Page route: `app/routes/app.admin.organizations.$id.seed-generator/route.tsx`
  (promote from the current sub-panel to its own page, per Bryant's "possibly its own
  page" note — the graph view needs real vertical space, and a dedicated route gives
  threads a URL to switch through exactly like `?c=` does for Reporter). Link to it
  from a compact entry point on `app.admin.organizations.$id/route.tsx` (replace the
  current inline `SeedGeneratorPanel` embed with a card that links out).
- Resource/action route: `app.api.domain.seed-generator/route.ts` (mirrors
  `api.domain.reporter`), handling `intent: "message"`, `intent: "commit-node"`,
  `intent: "edit-node"`, `intent: "delete-node"`.
- Loader lists the membership's `SeedGeneratorConversation`s (cap 30, `updatedAt
  desc`) and, when `?c=<id>` is present, the thread's messages + current
  `SeedGeneratorNode` graph.
- Access gate: reuse the existing `requirePreviewSeatMode()` +
  `requireAdmin(request)` pattern already on the current route
  (`app.admin.organizations.$id.seed-generator/route.tsx:24-28,63,80`) — this feature
  stays preview/demo-only and admin-only, unchanged from today.

## Two-phase generation

**Phase 1 — structural pass (target: under 5s).** One `getLLMCompletion` call, tool
`propose_seed_graph`, small `maxTokens` (structural JSON only — no essay bodies, no
grades): entity names, relationships (`parentLocalId` edges), submission `status`
enum only (no essay text yet). This is what renders as the editable graph
immediately. System prompt for this phase explicitly defines `draft` vs `submitted`
vs `graded` in plain terms tied to the user's own vocabulary ("not yet graded" →
`submitted`; "hasn't turned it in" → `draft`) to close the correctness bug from
Problem 3 above, and gives worked examples of both.

**Phase 2 — content fill, per node, on demand.** Once the user approves (or edits)
the graph, content generation happens per-`SeedGeneratorNode` rather than in one
blocking call:

- Triggered lazily: expanding a submission's content dropdown (the "expandable long
  content" ask) fires a per-node content-fill call if that node's `data.essayText` is
  still empty.
- Triggered eagerly on commit: clicking Commit fires content-fill calls for every
  approved submission node that doesn't have content yet, in parallel
  (`Promise.all`, bounded concurrency — reuse the existing per-membership/per-org
  `reserveAiRequest` admission control so parallel fill calls don't blow through rate
  limits), then does the actual DB write in one `$transaction` once all fills resolve.
- Each fill call is small and fast: one essay + its grade, not N essays. This is the
  mechanism that turns a 150-260s single call into a first-paint under 5s and a total
  commit time bounded by the slowest individual essay call run in parallel, not their
  sum.

This satisfies "make the one giant call smaller is not sufficient" — the change is
architectural (blocking-monolith → structural-pass + parallel-lazy-fill), not a token
trim.

## Editable entity graph UI

Render `SeedGeneratorNode` rows as a tree/graph view: class → assignments →
(students × their submissions-per-assignment via document). Concretely:

- A vertical tree/DAG (reuse or extend an existing tree component if one exists in
  the design system; otherwise a simple indented grouped-card layout is acceptable —
  Bryant's quality bar is "does it work," not novel visualization tech).
- Each node shows kind, name/summary, and status (proposed/approved/rejected) with
  inline edit (rename, change grade, change status) and per-node approve/reject —
  replacing the current three-flat-list, student-only-approval UI.
  Submission nodes get their own approve/reject, closing the gap noted in the current
  panel where submissions have no `approved` field.
  Deleting a parent node cascades a reject to its children in the UI (a rejected
  class removes its assignments/students from the commit set) — surfaced visually,
  not silently.
- A submission node's essay content is behind a collapsed `<details>`/expandable
  section by default ("dropdown for longer content"); expanding it either shows
  already-filled content or triggers the lazy Phase 2 fill for that node with a small
  inline loading state.

## Error handling

Replace the current binary `'error' in result` → flat 502
(`app.admin.organizations.$id.seed-generator/route.tsx:113-116`) with a typed error
result distinguishing:

- `transient` (timeout, rate-limit, provider outage) — message tells the user to
  retry, and the client auto-offers a retry action rather than implying the prompt
  was bad.
- `unparseable` (tool schema validation failed, model didn't call the tool) — message
  tells the user their instructions may need to be more specific.

Both phases' `getLLMCompletion` calls should carry a deadline (mirror Reporter's
`REPORTER_REQUEST_DEADLINE_MS` `AbortSignal.timeout` pattern) short enough that a
structural-pass timeout is itself fast to observe and retry. Since Phase 1 no longer
authors essay prose, its natural timeout risk drops sharply on its own; this error
typing is still required per the explicit ask ("may become moot if the architecture
changes, but the principle stands").

## Also-fix items (in scope, same PR)

1. **Hydration mismatch**, `app.admin.organizations.$id/route.tsx:662,673,727` — three
   unguarded `new Date(...).toLocaleDateString()` calls with no explicit locale/
   timeZone, so SSR (server TZ) and client (browser TZ) can disagree near a UTC day
   boundary. Fix: pass explicit `{ year: 'numeric', month: 'numeric', day: 'numeric',
   timeZone: 'UTC' }` (or the org's configured timezone if one exists) so server and
   client compute the same string — same fix class Reporter already uses elsewhere
   for date-ish output (`app.reporter/route.tsx:656-660` passes explicit options).
2. **Preview workflow access code not on the PR comment**,
   `.github/workflows/preview-environments.yml` — the "Verify preview access gate"
   step already has `steps.deploy.outputs.access_code` (`:178`) but the sticky
   comment step (`marocchino/sticky-pull-request-comment@v2`, `:207-219`) never
   references it. Add a bullet to the `message:` block surfacing
   `${{ steps.deploy.outputs.access_code }}` so every preview PR ships working
   access, per the standing "packets ship with working access" practice.
3. **Sparkle icon removal**, `seed-generator-panel.tsx:8,179` — since the panel is
   being replaced by the new dedicated route/components, this is satisfied by not
   carrying the import forward; confirm no sparkle/wand/magic iconography exists
   anywhere in the new components before calling this done.

## Verification plan

- `bun run --cwd services/web-app typecheck`
- `bun run --cwd services/web-app test` (unit)
- Relevant `test:e2e:*` covering the admin org route and the new seed-generator route
- Live verification against the preview environment (not local-only): create a new
  thread, run a prompt that creates a student + assignment + document + ungraded
  submission, confirm all four entity kinds appear in the graph and actually commit
  to the DB (spot-check via the org detail page), then a follow-up turn in the same
  thread referencing "that student" and confirming it resolves to the real row. Time
  the structural-pass response and the full commit. Screenshot the graph view and the
  expanded-content dropdown.

## Explicitly out of scope

- Redesigning the org detail page beyond the seed-generator entry point swap and the
  hydration fix.
- Any change to Reporter itself (data model, tools) — this is a sibling feature that
  borrows its shape, not a shared implementation.
- A generic graph-visualization library dependency — a tree/grouped-card layout is
  sufficient for the entity depths involved (class → assignment → student → document
  → submission is 5 levels, not an arbitrary graph).
