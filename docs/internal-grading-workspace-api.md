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
key ID and SHA256 of the original body. Writes use a ReadCommitted transaction
and lock the assignment type with `FOR UPDATE`; mutations and audits commit or
roll back together.

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
200 and no provider call or additional write audits. Changing the bytes under
the same key returns 409. A new run returns 201. Re-sign every replay with a new
nonce. Missing keys return 400.

Execution reuses the admin `runSuite` domain action. `suiteId` establishes active
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
AbortSignal and are raced against its deadline, so a stalled provider cannot
hold the request indefinitely. The transaction has a 55-second timeout and
2-second pool acquisition limit, leaving headroom for database rollback and
response delivery below the platform's 120-second ceiling. No queue is created.
The existing admin route retains its execution behavior and limits.

Exceeding the case cap returns 422 before provider execution:
`{"error":"Evaluation runs support at most 8 active cases across the current assignment type snapshot."}`.
Exceeding the budget returns 422:
`{"error":"Evaluation run exceeded its 45-second time budget; reduce the case count or input size and retry."}`.
A timed-out run and its result/audit writes roll back; it cannot satisfy publish.
Use a fresh key or retry the same request after reducing the workload (a changed
body requires a new key after a successful run).

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
| 409 | Non-draft/active discard; existing running evaluation (`An evaluation suite run is already in progress.`); invalid evaluation snapshot; replay conflict (`Idempotency-Key was already used with a different request`) or unsafe replay (`Idempotency-Key could not be replayed safely`). |
| 413 | More than 256 KiB of raw body bytes (`Request body too large`). |
| 422 | Eight-case cap or 45-second run budget exceeded, as above. |
| 429 | Authentication rate limit (`Too many requests`). |
| 500 | Unexpected database/domain failure (`The grading workspace request could not complete`), or the existing domain run failure message. |

No migrations are required. Existing admin actions, routes, GET response shapes,
legacy configuration writes and preview gate prefixes remain compatible.
