# Composition Drills Design

Issue: #214

## Decision

Port the smallest useful subset of PR #206 onto the consolidated Writing
Fundamentals foundation. Preserve the existing ACT/Grammar & Mechanics path
unchanged and add one independently gated `Composition` path for exactly four
constructed-response skills:

1. Topic Sentences
2. Paragraph Transitions
3. Evidence
4. Analysis

PR #206's Thesis Statements, Hooks & Openings, Conclusions, personal-topic
generator, Teacher's Lounge links, mandatory title/due-date behavior, and broad
dashboard redesign are deliberately excluded. They are not required by #214
and would turn a bounded follow-through into a curriculum/authoring expansion.

## Gate and rollback

`Organization.compositionDrillsEnabled` is a new default-false tenant gate.
The existing `writingFundamentalsEnabled` gate remains the parent prerequisite.
`COMPOSITION_DRILLS_ENABLED=false` is an emergency process-wide kill switch;
it never turns a tenant on. Disabling either gate makes Composition metadata,
direct routes, assignment options, and assigned responses unavailable while
leaving stored attempts intact for reversible rollback.

## Domain shape

Lessons gain a top-level section and explicit interaction kind:

- `Grammar & Mechanics` / `act`
- `Composition` / `composition`

Mixed teacher assignments store a discriminated prompt sequence. Old prompt
sets without a discriminator continue to decode as ACT items. Composition
attempts snapshot the prompt, the student's response, and redacted tutor
feedback. Revisions are append-only and use a revision number; progress counts
one position only after a `strong` result. ACT attempts remain immutable and
complete after one answer.

The teacher result surface renders the actual student response and feedback;
class/report summaries consume the same tenant-scoped attempt rows. Assignment
list payloads contain only skill metadata and progress counts, never generated
prompts, answer keys, or tutor response content.

## Provider boundary

The existing tutor adapter remains production code. Its proof starts an
independent Anthropic-compatible HTTP server and points the unmodified SDK to
that server through its network configuration. The server journals requests
and emits deterministic strong/developing feedback, malformed JSON, 429/500,
and connection-failure scenarios. No application-level provider function is
mocked.

Provider input/output continues to use metadata-only logging. Student writing,
prompts, provider payloads, and answers are not retained in `LlmLog`.

## Security and integrity

- Every assignment, prompt set, attempt, membership, and class is constrained
  to one organization in application queries and database triggers.
- Actions resolve the submitted position against the server-owned stored
  sequence; clients cannot submit or switch a prompt, kind, lesson, or answer.
- Composition responses are bounded, guardrailed, and never rendered as HTML.
- Retry/idempotency keys prevent duplicate revisions from browser/network
  replay while allowing intentional revision after non-strong feedback.
- Read-only impersonation and student-preview modes never initialize sets or
  persist attempts.

## Human marker

Curriculum owners should review authored examples and feedback calibration
before the tenant flag is enabled. That review is a release gate, not an
implementation blocker.
