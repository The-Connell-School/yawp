# Document editor v2 — pass 8/9 gap list

Branch: `cursor/document-editor-v2-pass8-parity-dde8`  
Preview: `https://pr-963.preview.yawp.school` (`?editor=v2` for staff; preview defaults v2 on)  
Design sources: `docs/design/document-editor-v2/document-editor.html`, `document-editor-states.html`

## Side-by-side evidence (pass 9)

| State | Design | Preview | Side-by-side |
| --- | --- | --- | --- |
| Student desktop 1440 | `docs/design/evidence/document-editor-v2-pass9/student-desktop-1440-design.png` | `…-preview.png` | `…-side-by-side.png` |
| Mobile 390 | pass9 `mobile-390-*` | pass9 preview capture | pass9 |
| Tutor panel | pass9 `tutor-panel-*` | pass9 | pass9 |
| Comments margin (3+ cards) | pass9 `comments-margin-*` | pass9 (seeded margin comments) | pass9 |
| Toolbar + prompt + top bar | pass9 `chrome-toolbar-prompt-*` | pass9 | pass9 |
| Teacher view-only | pass9 `teacher-view-only-*` | pass9 (graded QA doc) | pass9 |
| Saving / submitted / states | `artifacts/document-editor-v2-preview/07-*.png` | live preview script | preview only |

Capture (after preview redeploy with pass 9 seed):

```bash
cd services/web-app
PREVIEW_BASE_URL=https://pr-963.preview.yawp.school \
PREVIEW_ACCESS_CODE=steady-panda-6196 \
DOCUMENT_ID=previewdoceditv2qa0001 \
GRADED_DOCUMENT_ID=previewdoceditv2graded01 \
bun run scripts/capture-document-editor-v2-preview.mjs
bun run scripts/capture-document-editor-v2-pass8-side-by-side.mjs
bun run scripts/capture-document-editor-v2-pass9-side-by-side.mjs
```

Preview seed: `packages/prisma/scripts/seed-preview-document-editor-v2-qa.ts` (stable document ids in `local-dev/preview-document-editor-v2-qa.ts`).

## Gaps (design vs implementation)

| State / surface | Gap | Status |
| --- | --- | --- |
| Design exports in repo | Pass 8 Claude exports not versioned | **fixed** (`docs/design/document-editor-v2/*`) |
| Preview capture document discovery | My Documents links use `/app/submissions/`; scripts only scanned `/app/documents/` | **fixed** (pass 9 discovery + preview QA seed) |
| Preview capture login persona | PR seat 1 dev-login grid has no Sam Student; Casey is not doc owner | **fixed** (`loginPreviewQaStudent` POST `dev.student@yawp.local`) |
| Resolved collapsed row | Glass chrome + `#1F7CDA` Show link + 12px meta | **fixed** |
| Tutor Ready! | Missing stable `data-testid` for e2e | **fixed** (`tutor-ready-button`) |
| Save status (saving/synced) | No test hook for states board “Saving…” row | **fixed** (`document-save-status` + e2e) |
| Pass 4 tutor micro-spacing | No visual regression vs states board | **remaining** (tokens/CSS match export; no diff in pass 8–9 sweep) |
| Full states board (every figcaption) | Not every figcaption auto-cropped yet | **remaining** (design full-board PNG captured; per-figma clip optional) |
| Loading / empty / error on preview | Scripted only after QA doc seed + bootstrap fallback | **remaining** (preview captures saving/submitted; empty/error need dedicated route fixtures) |

## Test coverage

- `document-editor-v2-states.spec.ts` — save status, empty submit, tutor step/Ready, resolved row expand, mobile tabs, teacher view-only, tutor ask/chat chrome
- `document-editor-v2-design-contract.test.ts` — design paths, resolved row CSS, preview QA constants
- `seed-preview-document-editor-v2-qa.test.ts` — preview-only seed wiring
- `document-editor-v2-preview-discovery.test.ts` — href parsing for capture scripts
- Existing: `document-editor-v2-margin.spec.ts`, v2 cases in `document-editor.spec.ts`

## Flags / prod

- No change to `document-editor-v2` global flag (prod fail-closed unchanged).
- No sign-on / dev-panel bundle changes.