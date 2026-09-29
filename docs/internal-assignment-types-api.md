### Internal Assignment Types API (Yawp-side)

Authentication and rollout:
- Requires `INTERNAL_CONTENT_ENABLED=true`
- Bearer `YAWP_CONTENT_SERVICE_KEY` header (at least 43 URL-safe chars)
- Same auth, gating, and error formats as the existing rubrics endpoints

Base path: `/api/internal/v1/assignment-types`

Endpoints:

1) List assignment types
- Method: GET
- Path: `/api/internal/v1/assignment-types`
- Response:
  - 200 OK
    - `{ items: Array<{ id, key, title, rubric: { source: 'library', name, rubricId } | { source: 'per-type' }, currentRevision: { id, version, fingerprint } | null, updatedAt, outdatedPinnedAssignments: number }> }`

2) Read one assignment type (with revision history)
- Method: GET
- Path: `/api/internal/v1/assignment-types/:id`
- Response:
  - 200 OK
    - `{ assignmentType: { id, key, title, rubric: { source: 'library', name, rubricId } | { source: 'per-type' }, currentRevision: { id, version, fingerprint } | null, perTypeSchema, revisions: Array<{ id, version, fingerprint, createdAt, createdBy, reason }> } }`
  - 404 when not found

3) Update per-type rubric JSON (immutable baseline via auto-revision)
- Method: POST
- Path: `/api/internal/v1/assignment-types/:id/rubric`
- Request:
  - Content-Type: application/json
  - Body:
    ```
    {
      "requestId": "<uuid>",
      "actorId": "<string>",
      "reason": "<string>",
      "expected": { "fingerprint": "<sha256-hex>" | null, "version": <int> | null }, // optional optimistic concurrency
      "schema": {
        "scoringScale"?: <json> | null,
        "rubric"?: <json> | null,
        "promptConfig"?: <json> | null,
        "outputSchema"?: <json> | null,
        "calibrationNotes"?: <string> | null
      }
    }
    ```
- Response:
  - 200 OK `{ revision: { id, version, fingerprint }, unchanged: boolean }`
  - 400 invalid input; 404 not found; 409 concurrency conflict
- Semantics:
  - Triggers create a new immutable `RubricRevision` for this assignment type (`rubricName = "assignment-type:<id>"`) and update the per-type baseline mapping atomically.
  - Existing assignments remain pinned to their old revisions; new assignments pin to the new baseline.

4) Relink to a library rubric (immutable current revision)
- Method: POST
- Path: `/api/internal/v1/assignment-types/:id/relink`
- Request:
  ```
  {
    "requestId": "<uuid>",
    "actorId": "<string>",
    "reason": "<string>",
    "expected": { "fingerprint": "<sha256-hex>" | null, "version": <int> | null }, // optional optimistic concurrency on current link
    "rubricName": "<existing library rubric name>"
  }
  ```
- Response:
  - 200 OK `{ revision: { id, version, fingerprint }, unchanged: boolean }`
  - 400 invalid request or unknown rubric; 404 not found; 409 concurrency conflict
- Semantics:
  - Switches the assignment type to grade with the selected library rubric.
  - Per-type JSON fields are cleared. Already-pinned assignments remain unchanged.

5) Compare two revisions (JSON Pointer add/remove/replace)
- Method: POST
- Path: `/api/internal/v1/assignment-types/compare`
- Request:
  ```
  { "a": "<RubricRevision id>", "b": "<RubricRevision id>" }
  ```
- Response:
  - 200 OK `{ a: { id, version, fingerprint }, b: { id, version, fingerprint }, ops: Array<{ op, path, value? }> }`

Notes:
- Idempotency: `requestId` is serialized with advisory locks; replays with identical inputs are safe no-ops.
- Optimistic concurrency: pass `expected.fingerprint` or `expected.version` from the current baseline/current-revision; mismatches return 409.
- No feature flags; live on merge. When PR #383 (rubric-revision pinning + baselines) is not merged, this branch targets `cursor/assignment-rubric-locking-e840`.

