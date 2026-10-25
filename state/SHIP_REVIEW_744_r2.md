# Independent Ship Review — PR #744 (r2)

**PR:** https://github.com/The-Connell-School/yawp/pull/744  
**Branch:** `cursor/quality-sweep-8-log-redaction-deps-2902` → `main`  
**Reviewed SHA:** `6cae2e44de622cd05f64e0dfe6f0c5466ff1baab`  
**Base (at review):** `e2b8a8a3582054ece752f5cbdff14abd349eeceb`  
**Remote HEAD at review time:** matched `6cae2e44de622cd05f64e0dfe6f0c5466ff1baab` (unchanged).

SHIP

## Scope

Diff vs `main` remains twelve files: Bun overrides, server log redaction, and tests only. No UI, locked-dashboard, Kevin/#608, or Terraform changes. Same file set as r1 (`00d810e53bb031c85035bb5bc06ec2c5a9e48086`); r2 adds one commit fixing fetch mock typing in `blackboard-ags.server.test.ts`.

## r1 blocker resolution

r1 **BLOCK** was `TS2352` on the new AGS test’s `globalThis.fetch = mock(...)` assignment. At this SHA the mock uses `as unknown as typeof fetch`, matching existing repo patterns (e.g. `email.server.test.ts`, `http-provider.test.ts`).

Verified on reviewed SHA:

- `bun run web-app:typecheck` (`react-router typegen && tsc`) — **pass**
- `bun test app/integrations/blackboard-ags.server.test.ts` — **2 pass**

## Redaction (spot-check, no regression)

Re-read diff at r2 HEAD; behavior unchanged from r1 aside from the typing fix:

- **`buildSafeErrorForLog`** on feature-flag, internal HTTP, free-tier hook, and rate-limit warn paths; Prisma init connection strings still omitted in tests.
- **Blackboard AGS:** `agsUpstreamHttpError` still logs HTTP status and body byte count only; contract test still rejects leaked token text in thrown messages.
- **Teacher training video:** structured `teacher_training_video_sign_failed` with redacted error payload.

Ran PR-related tests:

`bun test app/domain/feature-flags/feature-flags.server.test.ts app/integrations/blackboard-ags.server.test.ts app/utils/server-error-request-context.server.test.ts app/utils/teacher-training-video-link.server.test.ts`

— **48 pass, 0 fail**.

## Dependency overrides

Unchanged from r1: patch/minor pins for `compression`, `proxy-addr`, and `ws` alongside existing `axios` override.

## Verdict rationale

Scope stays tight; redaction behavior and tests remain sound; the sole r1 merge blocker (TypeScript on the AGS fetch mock) is resolved at the reviewed SHA.
