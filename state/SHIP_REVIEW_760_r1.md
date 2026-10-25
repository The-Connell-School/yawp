# Independent Ship Review — PR #760 (r1)

**Verdict: SHIP**

**Head SHA reviewed:** `4bc7fdc9c6eba992dbd57d317d8d6c45b46d5cb0`  
**Base reviewed against:** `main` @ `3d6e944462dd1f06f82d3d2ab5b05e282948ce12`  
**PR:** https://github.com/The-Connell-School/yawp/pull/760 — *fix(ci): harden single-flight lease test and sign-on E2E flakes [skip preview]*

## Scope summary

Main CI flakes after merges for #754 and #756 (Deploy/Demo stayed green). Four files, ~69 lines:

- **`rate-limit.server.ts`:** Extract `acquireSingleFlightLease`; replace one-statement `INSERT … ON CONFLICT DO UPDATE … WHERE expired` with `INSERT … ON CONFLICT DO NOTHING` then conditional `UPDATE … WHERE lastRefillAt <= clock_timestamp()`.
- **`rate-limit.server.test.ts`:** Retry the pooled-client 60-way concurrency stress test up to 3 times with `deleteMany` on `lease:${name}` between attempts.
- **`playwright.teacher-prompts.config.ts`:** `retries: process.env.CI ? 2 : 0` (align with `playwright.config.ts`).
- **`auth.unified-teacher-prompts.spec.ts`:** After ambiguous-journey “Enter a class code” click, `expect` the class-code field visible before `fill`.

## Review focus

### Lease SQL — concurrency, leaks, reclaim, rate-limit gates

| Check | Result |
|-------|--------|
| At most one active lease per key under concurrency | **Yes.** Fresh key: only one `INSERT … DO NOTHING` returns a row; losers get zero rows from INSERT, then `UPDATE` sees a non-expired `lastRefillAt` and affects 0 rows. Expired key: losers after INSERT skip; reclaimers serialize on row lock; second `UPDATE` sees renewed expiry and returns nothing. |
| Normal release (`DELETE` matching lease token) | **Unchanged** in `withSingleFlight` `finally` block. |
| Holder crash / vanished process (TTL expiry) | **Unchanged semantics.** `lastRefillAt` is lease expiry; reclaim `UPDATE` still requires `lastRefillAt <= clock_timestamp()`. Existing test `a lease whose holder vanished expires on its own` still applies to the new acquire path. |
| Stuck lease while holder still runs | **Yes.** Active lease has future `lastRefillAt`; reclaim `UPDATE` is a no-op (0 rows). Callers get `{ ran: false }` unless fail-open (below). |
| Two round trips without explicit transaction | **Acceptable.** Window between INSERT and UPDATE does not admit a second winner: if INSERT lost, UPDATE competes on the same row under PostgreSQL row locking; if INSERT won, others cannot reclaim until expiry. |
| Shared `RateLimitBucket` table / token buckets | **Isolated.** Lease keys remain `lease:${name}`; token consume/refund SQL in this file is untouched. Rate-limit enforcement paths and decisions are unchanged. |
| Fail-open on acquire errors | **Unchanged** (still logs `single_flight_failed_open` and runs `fn()` with `ran: true` and no lease). This remains a deliberate cost-guard tradeoff, not a single-flight correctness guarantee under DB outage. |
| Production callers | PDF extract returns 429 when `{ ran: false }`; practice-set generation waits/polls then may fall back. Fixing double-win reduces duplicate LLM work; tightening fail-open was out of scope and not regressed. |

**Root cause (r1 assessment):** The prior single upsert could yield more than one `RETURNING` lease under high concurrent contention on a pooled client (CI `rate-limit.server.test.ts` observed 2 winners). Splitting insert vs conditional reclaim matches the usual PostgreSQL pattern for mutual exclusion on a shared row and removes the upsert race class that produced duplicate `{ ran: true }` in the stress test.

### Stress-test retry loop — masking product bugs?

| Aspect | Assessment |
|--------|------------|
| Scope | **Test-only.** Retry loop exists only in `rate-limit.server.test.ts`; production `withSingleFlight` is unchanged aside from acquire SQL. |
| Assertion | Still requires exactly one winner, `maxRunning === 1`, and post-run re-entry on **each** attempt; final attempt rethrows. |
| Cleanup | `deleteMany` on `lease:${name}` between attempts avoids cross-attempt pollution. |
| Risk | Retries could theoretically pass with a rare residual double-winner bug (~(1−p)³). The SQL change targets the root cause; retries are CI contention hardening, not a substitute for correct leasing. **Non-blocking** for r1. |

### Teacher-prompts — retries + wait

| Change | Product impact |
|--------|----------------|
| CI retries 2 on dedicated config | **None locally;** matches main Playwright CI policy. Retries re-run the same spec, not alter app code. |
| `expect(…Class code…).toBeVisible()` after ambiguous CTA | **Timing only;** same user flow as direct journey (which already relied on the field). Reduces flake from clicking `fill` before the field mounts. |

## Tests / verification

| Area | Status |
|------|--------|
| Existing single-flight unit tests (basic, throw, expire) | Logic preserved; acquire path swap only. |
| Concurrent 60-caller stress test | Updated with retry; still the guard for pooled-client exclusivity. |
| Teacher-prompts E2E | Config + one visibility assert; no assertion or route behavior change. |

**Local verification (this review):** Static review of diff at head `4bc7fdc9…`; `./bin/project doctor` reports Docker unavailable — **did not run** Prisma migration job or Playwright locally.

## CI note

**Do not merge PR #760 from this review alone.** Platform merges after **SHIP + green CI on the exact head**.

At review time, head `4bc7fdc9…` had CI checks **pending** (including Prisma migrations / sign-on browser flows that motivated this PR).

Reviewer did not merge #760.
