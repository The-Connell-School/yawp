# Independent Ship Review — PR #839 (round 1)

| Field | Value |
| --- | --- |
| **PR** | [#839](https://github.com/The-Connell-School/yawp/pull/839) — Pending page: in-card forward / wrong admin disclosure |
| **Branch** | `cursor/pending-forward-disclosure-c02a` |
| **Reviewed head** | `a0e9587f73dfd03de6f44a485865730cbc9816da` |
| **Base** | `origin/main` (diff `origin/main...a0e9587f73dfd03de6f44a485865730cbc9816da`) |
| **Reviewer** | Independent (not PR author) |
| **Design refs** | Claude Design pending-forward; frames 01 / 02 / 06 / 09 (1280); NOTES + BRIEF in review bundle |
| **Verdict** | **SHIP** |

Head SHA on GitHub matches the requested review target (`headRefOid` = `a0e9587f73dfd03de6f44a485865730cbc9816da`). Review stopped at that commit only.

## Summary

PR #839 moves the free-tier pending “wrong administrator” forward path from a below-card bare form into an in-card terracotta disclosure with a tinted panel, while keeping the existing `intent=forward` POST and `forwardApprovalRequest` server path. Denied-state “ask another administrator” continues to use `ApprovalForwardForm` unchanged. Scope is focused (8 files, +593 / −61 lines).

## Checklist

### 1. Chrome vs design

| Criterion | Result | Notes |
| --- | --- | --- |
| Disclosure under recipient chip | **Pass** | `PendingForwardDisclosure` renders after `FreeTierPerson` inside the v2 `SENT` card (`route.tsx`). |
| Expanded panel: title, helper, Administrator name/email, Forward + Cancel | **Pass** | Matches frames 02 / 06; placeholders and labels pinned in tests. |
| Draft a Request + Explore remain primary CTAs at card bottom | **Pass** | Order asserted in `route.v2.test.tsx` (person → disclosure → draft → explore). |
| Sign out alone under card | **Pass** | `PendingCardFooter` is only `FreeTierSignOut`; forward UI removed from footer. |
| Success banner | **Pass** | `PendingForwardSuccessBanner`: “Request forwarded to {name}.” (frame 09). |
| One disclosure at a time (pending path) | **Pass** | Single `PendingForwardDisclosure` on the v2 waiting surface; denied branch is separate and still uses legacy inline form. |
| Reduced motion | **Pass** | `usePrefersReducedMotion`: no chevron rotation / no CSS transition; panel toggles `display` instead of animated grid. |
| Motion timing (when not reduced) | **Pass** | 200ms open / 160ms close on chevron and panel; opacity + grid-template-rows transitions in `app.css`. |
| Terracotta trigger | **Pass** | Trigger uses `hsl(var(--primary))` (free-tier primary). |

**Non-blocking polish:** Panel height animation uses `grid-template-rows: 0fr` → `auto`; opacity animates reliably; height may feel less smooth than a fully mocked frame-11 pass. Acceptable for ship.

### 2. API / data / secrets

| Criterion | Result | Notes |
| --- | --- | --- |
| Still `intent=forward` | **Pass** | Hidden input in `PendingApprovalForwardForm`. |
| Still `forwardApprovalRequest` | **Pass** | `action()` unchanged; same rate limits and e2e stub hooks. |
| No new HTTP API | **Pass** | UI-only + CSS. |
| No secrets / prod data paths | **Pass** | No new env or production queries in diff. |

### 3. Validation, errors, loading

| Criterion | Result | Notes |
| --- | --- | --- |
| Bad email copy `name@school.org` | **Pass** | `BAD_EMAIL_HINT` + placeholder; per-field alert with icon (frame 06). |
| Empty submit summary + fields | **Pass** | `forwardValidationSummary` + per-field messages; name empty uses “Enter their name.” |
| `unavailable` / `email_failed` → Try again | **Pass** | `forwardRetry` only for those reasons (head commit message matches behavior). |
| Server errors in panel | **Pass** | `serverAlert` via `pendingForwardAlertMessage` inside form. |
| Forwarding state | **Pass** | “Forwarding…”, fields `readOnly`, Cancel disabled, submit disabled. |
| Draft / Explore disabled while forwarding | **Pass** | `disabled={forwarding}` on draft link wrapper and explore link (`pointer-events-none`, `aria-disabled`). |
| Forward looks inactive until valid but submits for errors | **Pass** | `opacity-50` when incomplete; button stays enabled unless `forwarding`. |

### 4. Denied-state legacy form

| Criterion | Result | Notes |
| --- | --- | --- |
| Out of scope left alone | **Pass** | `TeacherAskAnotherForm` + `ApprovalForwardForm` on denied surface unchanged; below-card forward removed only from v2 waiting footer. |

### 5. Tests

| Criterion | Result | Notes |
| --- | --- | --- |
| New unit coverage | **Pass** | `PendingForwardDisclosure.test.tsx` (collapsed + expanded markup, test ids, copy). |
| Route ordering contract | **Pass** | `route.v2.test.tsx` asserts disclosure between person chip and draft CTA. |
| E2E label / success updates | **Pass** | `Administrator name` / `Administrator email`; success via `pending-forward-success` test id. |
| Coverage regression | **Pass (with note)** | E2E still asserts generic copy for teacher-self forward (`We could not forward this request…`) while pinned product copy for `same_as_teacher` is `teacherPendingForwardError` (“That’s your own email…”). This mismatch predates the disclosure move (same `pendingForwardAlertMessage` on main); not introduced by #839. Recommend aligning e2e to pinned copy in a follow-up if smoke ever strict-matches text. |

**Local verification (review head, targeted):**

```text
bun test app/routes/free-tier/PendingForwardDisclosure.test.tsx \
         app/routes/app.free-tier.pending/route.v2.test.tsx
→ 5 pass, 0 fail
```

Full `./bin/project test --profile changed` hit unrelated suite failures in this VM snapshot (LLM/grading mocks); not used as gate for this UI-only PR.

### 6. Product copy

| Criterion | Result | Notes |
| --- | --- | --- |
| No “AI” in new user-facing strings | **Pass** | Grep on new/changed pending forward components. |
| Yawp! branding | **Pass** | Existing “Yawp!” / “Yawp!” review step unchanged; new strings are forward-specific and match design artifact (no erroneous “AI” or off-brand product rename). |

## Diff inventory (reviewed)

- `services/web-app/app/app.css` — disclosure/panel/chevron styles
- `services/web-app/app/routes/app.free-tier.pending/route.tsx` — layout, forwarding vs resend navigation split, in-card wiring
- `services/web-app/app/routes/free-tier/PendingForwardDisclosure.tsx` — disclosure shell, a11y, motion
- `services/web-app/app/routes/free-tier/PendingApprovalForwardForm.tsx` — forward form (client validation + POST fields)
- `services/web-app/app/routes/free-tier/PendingForwardSuccessBanner.tsx` — success banner
- `services/web-app/app/routes/free-tier/PendingForwardDisclosure.test.tsx` — unit tests
- `services/web-app/app/routes/app.free-tier.pending/route.v2.test.tsx` — ordering contract
- `services/web-app/e2e/tests/free-tier.approval-v2.spec.ts` — label + success assertions

## Blockers

None for round 1 at head `a0e9587f73dfd03de6f44a485865730cbc9816da`.

## Follow-ups (non-blocking)

1. Align e2e teacher-self-forward assertion with pinned `teacherPendingForwardError` copy (if not already satisfied by CI text matching behavior).
2. Optional: separate empty-email field message from bad-format hint if design frame 05 must be pixel-exact on empty email.

## Decision

**SHIP** — Implementation matches the Claude Design pending-forward intent, preserves the existing forward contract and denied legacy path, and adds appropriate unit/route tests. Safe to merge #839 once required CI is green.
