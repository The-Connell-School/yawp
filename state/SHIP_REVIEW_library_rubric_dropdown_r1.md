# Independent Ship Review r1 — Library GA rubric listing + prod wiring

**Branch:** `cursor/library-rubric-dropdown-1173`  
**Reviewer:** Cloud Agent (independent ship review)  
**Date:** 2026-11-02  

**SHIP** (pending CI green on PR)

---

## Product intent vs implementation

| Intent | Evidence | Result |
| --- | --- | --- |
| GALS Claims + Strode Autobiography library rubrics visible in admin/Internal picker | `listLiveRubricsForAdminPicker` revision fallback; `gals-claims` in `STARTER_RUBRICS` + fixture | **Met** |
| Prod assignment types wired to library rows + kinds | Migrations `20261102193000`, `20261102194500`, `20261102210000` set/link `rubricId` | **Met** |
| Kind defaults still work without manual pick | Unchanged `assignment-type-rubric-config` kind registry | **Met** |
| Tests for listing filters | `admin-rubric-picker.server.test.ts` empty-revision fallback; prod-shaped fixture counts | **Met** |

## Risk notes

- Title-based `UPDATE` remains best-effort if prod titles drift from `Claims` / `autobiograph`.
- Regenerated `grading-prompt-golden-main.json` adds starter/catalog digests for `gals-claims`.

## Verification

- `./bin/project test --profile assignment-rubric-unit` — pass
- Rubric picker / catalog / backcompat tests — pass (see PR)
