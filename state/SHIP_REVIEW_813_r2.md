# Independent Ship Review r2 — PR #813

**Target:** [fix: redact domain sign-on/student-join error.message (#8ab)](https://github.com/The-Connell-School/yawp/pull/813)  
**Reviewed head (matches PR `headRefOid` at review time):** `04dc039454e54b4e3b0b2c4214d61e2bb8dbea5a`  
**Prior r1 head (SHIP, superseded for CI only):** `d568d0b0f91b1e285cb86d7c26b947768bc1dada` (canaries without Response cast)  
**Production redaction commit (unchanged in r2):** `f8b17826c17858b67c5b702c9587a43aaf7da2c6`  
**Branch:** `cursor/redact-domain-signon-student-join-5cca`  
**Diff base (PR base tip):** `491f5db47db8de8aa69f64c8742ebcf8b7a8bd3c` (#811 merge tip)  
**Comparison performed:** `git diff origin/main...04dc039454e54b4e3b0b2c4214d61e2bb8dbea5a` (full PR diff vs `main`)

## Verdict

**SHIP** (independent approval for merge of #813 when required CI is green on this head; this review does **not** merge #813).

---

## Delta since r1

r1 SHIPed production wiring plus canaries at `d568d0b0`. CI **TypeScript** then failed on the new unified-signon canaries because `dispatchUnifiedLogin()`’s return type is a React Router action union (not narrowed to `Response` on the `intent: 'resolve'` path).

Commit `04dc03945` (`fix(test): cast unified-signon canary results to Response`) adjusts **only** `services/web-app/app/domain/unified-signon/entry.server.test.ts`:

- Wrap each `await dispatchUnifiedLogin(...)` result as `as unknown as Response` before `.status` / `.json()`.
- Same **test-only** bridge pattern as #808 r2 (`login.server.test.ts` rate-limit mock) and assignments-list canaries.

**Production code is unchanged** from the r1 SHIP commit (`f8b17826c` production redaction + `d568d0b0` tests minus the cast fix).

---

## TS cast fix (soundness)

| Check | Result |
|-------|--------|
| r2 diff scope | **3 lines × 3 tests** — cast only; expectations unchanged |
| Local `react-router typegen && tsc` on head `04dc03945` | **Pass** (`NODE_OPTIONS=--max-old-space-size=8192`) |
| Canary assertions | Still assert HTTP status, JSON `error` / `fieldErrors`, absence of `SECRET-TOKEN` and `teacher@school.edu`, retention of intentional copy (`Invalid request origin.`) |
| Weakening risk | **Low** — cast does not skip runtime checks; mocked path always returns `Response.json(...)` from the `FlowError` handler. Mis-typed production returns would still fail `.json()` or expectations at runtime |

The fix resolves typechecking without hiding wrong return types in production: production typing is unchanged; tests document the FlowError JSON contract explicitly.

---

## Claim vs diff (full PR — production scope, matches r1 rationale)

Follow-up to the #8y / #8z / #8aa error-redaction sweep. Closes **domain-layer** JSON leaks for unified sign-on and free-tier student join (ticket **#8ab**).

**4 files, +133 / −3 lines** — two production modules and focused unit canaries only; no schema, flags, Terraform, or unrelated routes.

| Surface | Module | Client field | Change |
|---------|--------|--------------|--------|
| Unified sign-on login action | `domain/unified-signon/entry.server.ts` | `error` in `Response.json` when `FlowError` has no `fieldErrors` | `error.message` → `safeDomainErrorTextForClientResponse(error, 'This sign-in session expired. Please start again.')` |
| Free-tier student join | `domain/free-tier/student-join.server.ts` | `error` on `FreeClassSeatError` branch | `error.message` → `safeDomainErrorTextForClientResponse(error, FREE_CLASS_CLASS_FULL_MESSAGE)` |

When `FlowError.fieldErrors` is set, top-level `error` remains `''` (unchanged).

Helper choice: **`safeDomainErrorTextForClientResponse`** is correct — typed domain `Error` messages may include intentional validation copy; `redactFreeformMessage` strips tokens, emails, and prisma noise while preserving safe substrings.

---

## Test quality

| File | Coverage |
|------|----------|
| `entry.server.test.ts` (new) | Three canaries: sensitive `FlowError.message` redacted; intentional validation copy preserved; empty top-level `error` when `fieldErrors` present |
| `student-join.server.test.ts` | Two helper-level canaries for `FreeClassSeatError`: class-full copy preserved; injected secrets redacted |

Existing `student-join.server.test.ts` integration-style tests for register/reset unchanged and passing.

**Out of scope (informational):** `backend.server.ts` still references `error.message` for control flow / internal paths; not part of this PR’s client JSON surfaces.

---

## Kevin / #608 untouched

PR #813 diff is limited to:

- `services/web-app/app/domain/unified-signon/entry.server.ts`
- `services/web-app/app/domain/unified-signon/entry.server.test.ts`
- `services/web-app/app/domain/free-tier/student-join.server.ts`
- `services/web-app/app/domain/free-tier/student-join.server.test.ts`

No overlap with open platform preview PR **#608** (`platform-enhancements`), lesson planner, assignment-type v2, or other Kevin/Bryant platform surfaces.

---

## Findings

| ID | Severity | Finding |
|----|----------|------------|
| — | — | None blocking. |

**Observations (informational):**

- Free-tier `/join` and sign-on JSON consumers now align with #808’s `class-student-enrollment` pattern for seat-cap errors.
- Unified sign-on password / legacy `loginAction` branches unchanged; canaries exercise the `unifiedAction` + `FlowError` path only.

---

## Verification (reviewer, head `04dc039454e54b4e3b0b2c4214d61e2bb8dbea5a`)

```bash
export PATH="/home/ubuntu/.bun/bin:$PATH"
cd services/web-app
NODE_OPTIONS="--max-old-space-size=8192" bun run typecheck

bun test \
  app/domain/unified-signon/entry.server.test.ts \
  app/domain/free-tier/student-join.server.test.ts
```

- **Typecheck:** pass on reviewed head.
- **12 pass**, 0 fail across the two PR test files.

GitHub PR #813 `headRefOid`: `04dc039454e54b4e3b0b2c4214d61e2bb8dbea5a` — no head movement during review.

---

## Reviewer

Independent Ship Review (Cloud Agent), 2026-10-26.
