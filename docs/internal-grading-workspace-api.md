# Internal grading workspace lifecycle writes

These endpoints share `/api/internal/v1/admin/assignment-types/:id`. All require
HMAC authentication, `management:write`, and the signed `X-Yawp-Actor` and
`X-Yawp-Key-Id` attribution. Use the existing signing helper for timestamp, nonce,
signature, method, URL and exact raw body bytes. Legacy bearer authentication is
not accepted. Every response uses `Cache-Control: no-store`. No query parameters
are accepted. The existing demo preview-access prefix covers these paths.

Bodies are strict JSON objects, limited to 256 KiB of raw bytes. Unknown fields,
invalid UTF-8, invalid identifiers and malformed JSON return 400. `reason` is
optional on every write; when supplied it is trimmed and must contain 1–500
characters. It is recorded in both before/after audit rows with the signed actor,
key ID and SHA256 of the original body. Writes use short ReadCommitted transactions and lock the assignment type with
`FOR UPDATE`. Run creation commits its running artifact and before audit before
provider execution, then commits its final state and after audit together. Other
writes keep mutations and paired audits in one transaction.

## Start a run

`POST /evaluation-runs`

```ts
type RequestBody = {
  promptVersion: string; // Owned prompt row ID or decimal version, 1..2147483647.
  suiteId: string;       // Owned, active evaluation group ID.
  reason?: string;
};
```

`Idempotency-Key` is required: 1–200 visible ASCII characters after trimming.
Identical raw bytes, actor, key ID, endpoint and key replay the existing run with
200 and no provider call or additional write audits. The completed response is
recorded durably; later domain edits do not change that replay. Changing the
bytes under the same key returns 409, including while pending. An identical key
while pending returns 409: `{"error":"An evaluation run request is waiting for another write; retry after it completes."}`.
A new run returns 201. Re-sign every replay with a new
nonce. Missing keys return 400.

Execution shares the admin `runSuite` preparation, provider execution, and result
persistence functions. `suiteId` establishes active
ownership; execution covers the **full current assignment type snapshot**,
including every other active evaluation group and legacy case. The admin publish
prerequisite requires this complete snapshot, prompt version and prompt revision.
A partial group run would not establish that prerequisite. Run results may
contain failed cases, following existing admin behavior.

Both success statuses return exactly the GET `/evaluation-runs/:runId` envelope:

```ts
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type RunResponse = {
  run: {
    id: string;
    createdAt: string; // ISO timestamp.
    completedAt: string | null;
    assignmentTypeId: string;
    promptVersion: number;
    promptVersionId: string | null;
    promptRevision: number | null;
    promptSnapshotJson: Json;
    evaluationSuiteVersionId: string | null;
    evaluationSuiteContentHash: string | null;
    evaluationSnapshotJson: Json;
    status: string; // "completed" on successful creation.
    totalCases: number;
    passedCases: number;
    failedCases: number;
    needsReviewCases: number;
    results: Array<{
      id: string;
      createdAt: string;
      runId: string;
      caseId: string | null;
      caseTitle: string;
      rubricCategoryKey: string;
      criterion: string;
      status: string; // "pass" | "fail" | "needs_review" for new results.
      evidence: string;
      gradingOutputJson: Json;
      expectedOutputJson: Json;
      responseContractJson: Json;
      requestSnapshotJson: Json;
    }>;
  };
};
```

JSON fields retain the existing admin/GET domain representations:
`gradingOutputJson` and `expectedOutputJson` contain `{categories:
[{key, score, comment}], overallComment}` or null. `responseContractJson` contains
`{status, evidence}`. `requestSnapshotJson` contains `{system, userMessage}` or
null. `promptSnapshotJson` contains the assignment title, version, revision,
status, content hash, prompt templates, scoring scale, rubric, prompt config and
compiled prompt. `evaluationSnapshotJson` contains `{evaluations, legacyCases}`
with the saved case inputs and expected outputs. Results are ordered by
`createdAt`, then `id`, ascending, as in GET.

### Timeout and size decision

Production infrastructure uses App Runner (`infra/main.tf`), with CloudFront's
`origin_read_timeout = 120`. AWS documents a total
[120-second App Runner HTTP request limit](https://docs.aws.amazon.com/apprunner/latest/dg/develop.html).
There is no separately configured ALB in this deployment. The Node application
uses `react-router-serve` without a shorter application response timeout.

The API caps the complete snapshot at **eight active cases** and uses a **45-second
budget**, starting before transaction acquisition. Provider calls receive an
AbortSignal and are raced against its deadline. **No database transaction, parent
row lock, or idempotency advisory lock remains open while awaiting a provider.**

- Tx1 locks the parent and scoped idempotency key, validates ownership and the
  complete immutable snapshot/cap, creates the running artifact, and writes the
  before audit as the durable pending reservation; then commits.
- Providers run outside transactions using those captured inputs. Admin and
  internal edits on the same assignment type can complete during this wait.
- Tx2 reacquires short locks, saves results and completion (or failed-run state),
  writes the after audit with the finalized response, and commits. Changes to
  prompt revision or evaluation snapshot during the wait retain the existing
  publish prerequisite: an older run cannot validate newer content.

Each database transaction has a 20-second ceiling and two-second pool acquisition
limit. Transaction-local Postgres lock/statement timeouts are five/ten seconds,
including the parent and idempotency locks. Lock contention returns 409 with
`{"error":"An evaluation run request is waiting for another write; retry after it completes."}`.
A statement timeout returns 422 with
`{"error":"Evaluation run database time budget exceeded; retry the request."}`.
A failed persistence transaction is rolled back before a fresh short transaction
records failed state and the error response. If the database remains unavailable,
the pending reservation is recovered as described below.

Pending reservations expire **120 seconds after Tx1 reserves the request**, the
platform request ceiling. On a later run request, the expired run is marked
failed and its original key is finalized with the 422 time-budget error. This
works for both the same key and a new key on the same assignment type. The
original key replays that error; a fresh key can start a new run. Late completion
of an expired request cannot overwrite the recovered result. Recovery is lazy,
requires no queue or schema migration, and retains the original actor, signing
key, endpoint, raw-body hash, reason, and audit pair.

These limits leave headroom below the platform's 120-second ceiling. No queue is created.
The existing admin route retains its execution behavior and limits.

Exceeding the case cap returns 422 before provider execution:
`{"error":"Evaluation runs support at most 8 active cases across the current assignment type snapshot."}`.
Exceeding the budget returns 422:
`{"error":"Evaluation run exceeded its 45-second time budget; reduce the case count or input size and retry."}`.
A timed-out run remains `failed`, with `completedAt` set, `failedCases` equal to
`totalCases`, no partial results, and paired before/after audits. It cannot satisfy
publish. The original key replays the same 422 error without another provider
call. Use a fresh key for a retry, including a changed body. Request-level errors
retain their existing status and `{error}`-only envelope.

Provider errors caught by the shared per-case evaluator retain admin behavior:
they become failed case results in a completed run (201; replay 200). An uncaught
execution error marks the run failed and returns the generic 500 error. A database
statement failure during finalization marks it failed and returns 422. These
finalized failures replay their original error status/body, with no provider call.

## Delete an evaluation suite

`DELETE /evaluation-suites/:suiteId`

```ts
type RequestBody = { reason?: string }; // Empty body is equivalent to {}.
type ResponseBody = { deleted: { id: string } }; // 200; suite row ID.
```

There is no admin suite-delete action. This operation sets `archivedAt` on the
owned active group and its active cases, following the existing admin case
archive convention, then refreshes the current evaluation snapshot. It preserves
historical snapshots, runs and results. Subsequent active suite reads omit it.
A foreign, missing or already archived suite returns 404. Repeated DELETE returns
404. Suite changes invalidate an older run's current-snapshot publish prerequisite.

## Discard a prompt draft

`DELETE /prompt-versions/:v`

```ts
type RequestBody = { reason?: string }; // Empty body is equivalent to {}.
type ResponseBody = { deleted: { id: string } }; // 200; prompt row ID.
```

`:v` accepts the owned row ID or decimal version (1..2147483647). There is no admin
discard action. Only inactive `draft` rows can be deleted. Published/production,
retired, or currently active versions return 409:
`{"error":"Only inactive draft prompt versions can be discarded"}`.
The row is removed; existing run snapshots/results remain and their prompt FK is
set to null by the existing relation. The full discarded row is retained in the
before audit. Missing or foreign versions, including repeated DELETE, return 404.
Production and legacy assignment prompt configuration remain unchanged.

## Error contract

All errors have **only** `{error: string}`; no success flag or validation details.

| Status | Conditions / representative messages |
| --- | --- |
| 400 | Invalid assignment type/resource/prompt version, JSON, query or strict body (`Invalid grading workspace request`); missing/invalid Idempotency-Key; empty current snapshot (`Add at least one evaluation case before running.`); AP History requires an assignment snapshot. |
| 401 | Missing/invalid HMAC, invalid nonce, unsigned attribution, or legacy bearer (`Unauthorized`). |
| 403 | Valid HMAC without `management:write` (`Forbidden`). |
| 404 | Missing assignment type (`Assignment type not found`); foreign/missing/archived suite (`Evaluation suite not found`); foreign/missing prompt (`Prompt version not found`); unavailable signing-key configuration (`Not found`). |
| 405 | Unsupported method (`Method not allowed`). |
| 409 | Five-second lock contention (message above); non-draft/active discard; existing running evaluation (`An evaluation suite run is already in progress.`); invalid evaluation snapshot; replay conflict (`Idempotency-Key was already used with a different request`) or unsafe replay (`Idempotency-Key could not be replayed safely`). |
| 413 | More than 256 KiB of raw body bytes (`Request body too large`). |
| 422 | Eight-case cap, ten-second database statement timeout, or 45-second run budget exceeded, as above. |
| 429 | Authentication rate limit (`Too many requests`). |
| 500 | Unexpected database/domain failure (`The grading workspace request could not complete`), or the existing domain run failure message. |

No migrations are required. Existing admin actions, routes, GET response shapes,
legacy configuration writes and preview gate prefixes remain compatible.
