# Independent Ship Review r1 — PR #834

**Subject:** Yawp! Lesson Planner deck art library seed  
**PR:** https://github.com/The-Connell-School/yawp/pull/834  
**Branch:** `cursor/lesson-planner-art-library-seed-cbad`  
**Reviewer:** Independent Ship Review (Composer 2.5 fast)  
**Reviewed at (UTC):** 2026-10-26

## Freshness

| Check | Result |
|-------|--------|
| Required head | `79ed5d5f6a2861885a9be51250d80ecaeb84bc41` |
| `gh pr view 834` `headRefOid` | `79ed5d5f6a2861885a9be51250d80ecaeb84bc41` |
| Match | Yes |

Diff reviewed: `origin/main...79ed5d5f6a2861885a9be51250d80ecaeb84bc41`.

## Bryant-approved scope

| Requirement | Verified |
|-------------|----------|
| Extend `deck-art.ts` + `public/lesson-planner/art/` only (ingest via existing `add-deck-art.ts` pipeline) | Yes — 26 files: `deck-art.ts`, new `deck-art.test.ts`, 24 JPEGs under `public/lesson-planner/art/` |
| No `art-library.json` | Yes — not added; repo has no such file in diff |
| No S3 `art/` prefix wiring | Yes — no S3 or remote art paths in diff |
| No planner UI wiring | Yes — no routes, components, or feature-flag changes |
| No Kevin / unrelated refactors | Yes — diff limited to lesson-planner deck art catalog + assets + unit test |
| `add-deck-art.ts` width unchanged (no ≥2400 bump) | Yes — file untouched on PR; `WIDE = 1600` on `main`; spot-check `ffprobe` on ingested mains → 1600px wide |
| No secrets in diff | Yes — scanned diff for common secret patterns; none |

## Held works (must be absent from runtime `DECK_ART`)

| Held ID | In `DECK_ART` at head? |
|---------|-------------------------|
| `klee-castle-sun` | No |
| `mondrian-composition-rby` | No |
| `sargent-gassed` | No |

`deck-art.test.ts` asserts `HELD_ART_IDS` are not present. Klee/Mondrian images remain only under legacy `class-art` (`/img/class-art/…`), not the lesson-planner deck library.

## Shipped catalog (7 works)

`DECK_ART.length === 7`: `bierstadt-yosemite-valley`, `bruegel-childrens-games`, `degas-dance-class`, `homer-breezing-up`, `hokusai-great-wave`, `turner-temeraire` (pre-existing), `vangogh-bearers-burden`.

Each entry includes `src`, three crops (`swatch`, `strip`, `divider`), `focal`, ≥2 `colors`, ≥4 `themes`, and `subject`.

## Rights spot-check

| ID | `rights` string | OK for scope |
|----|-----------------|--------------|
| `bierstadt-yosemite-valley` | Public domain (Metropolitan Museum of Art, CC0) | Yes |
| `bruegel-childrens-games` | Public domain | Yes |
| `degas-dance-class` | Public domain (Metropolitan Museum of Art, CC0) | Yes |
| `homer-breezing-up` | Public domain | Yes |
| `hokusai-great-wave` | Public domain (Metropolitan Museum of Art, CC0) | Yes |
| `turner-temeraire` | Public domain | Yes |
| `vangogh-bearers-burden` | Public domain | Yes |

All included works use public-domain or Met CC0 wording; none of the held-rights trio appear in the catalog.

## Local verification

At head `79ed5d5f`, with PR tree checked out:

```text
bun test app/domain/lesson-planner/deck-art.test.ts
→ 2 pass, 0 fail (59 expect() calls)
```

## CI (informational)

GitHub Actions on PR #834 at review time: TypeScript, migration-integration, changed-paths, E2E smoke shards, preview-deploy, and browser suites **pass**; Prisma migrations job and merge E2E report job were still **pending** when this review was written (no schema changes in the PR). Re-check required checks on the exact head before merge.

## Verdict

**SHIP** for head `79ed5d5f6a2861885a9be51250d80ecaeb84bc41` — scope, held-work exclusion, rights strings, and catalog/asset pairing match Bryant-approved bounds for PR #834.
