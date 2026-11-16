# Document editor v2 — pass 8 gap list

Branch: `cursor/document-editor-v2-pass8-parity-dde8`  
Preview: `https://pr-963.preview.yawp.school` (`?editor=v2` for staff; E2E seed has v2 on)  
Design sources: `docs/design/document-editor-v2/document-editor.html`, `document-editor-states.html`

## Side-by-side evidence

| State | Design PNG | Live preview PNG | Side-by-side |
| --- | --- | --- | --- |
| Student desktop 1440 | `docs/design/evidence/document-editor-v2-pass8/design-student-desktop.png` | Run `capture-document-editor-v2-pass8-side-by-side.mjs` after preview deploy | `…/student-desktop-1440-side-by-side.png` |
| States board (reference) | `docs/design/evidence/document-editor-v2-pass8/design-states-board-full.png` | Per-state captures via `capture-document-editor-v2-preview.mjs` | See manifest after preview run |
| Mobile 390 | Design states board crop | `…/mobile-390-preview.png` | `…/mobile-390-side-by-side.png` |

Capture commands (after preview overlay credentials are posted on the PR):

```bash
cd services/web-app
bun run scripts/capture-document-editor-v2-design-states.mjs
PREVIEW_BASE_URL=https://pr-963.preview.yawp.school \
PREVIEW_ACCESS_CODE=<overlay-code> \
bun run scripts/capture-document-editor-v2-preview.mjs
PREVIEW_BASE_URL=https://pr-963.preview.yawp.school \
PREVIEW_ACCESS_CODE=<overlay-code> \
bun run scripts/capture-document-editor-v2-pass8-side-by-side.mjs
```

## Gaps (design vs implementation)

| State / surface | Gap | Status |
| --- | --- | --- |
| Design exports in repo | Pass 8 Claude exports not versioned | **fixed** (`docs/design/document-editor-v2/*`) |
| Resolved collapsed row | Glass chrome + `#1F7CDA` Show link + 12px meta | **fixed** |
| Tutor Ready! | Missing stable `data-testid` for e2e | **fixed** (`tutor-ready-button`) |
| Save status (saving/synced) | No test hook for states board “Saving…” row | **fixed** (`document-save-status` + e2e) |
| Pass 4 tutor micro-spacing | No visual regression vs states board | **remaining** (tokens/CSS already match export; no diff in pass 8 sweep) |
| Pass 4 automated loading/error/submitted on preview | Preview DB document discovery without overlay | **remaining** (blocked on preview deploy + `DOCUMENT_ID`; scripts extended) |
| Full states board (every figcaption) | Not every figcaption auto-cropped yet | **remaining** (design full-board PNG captured; per-figma clip follow-up optional) |

## Test coverage added (pass 8)

- `document-editor-v2-states.spec.ts` — save status, empty submit, tutor step/Ready, resolved row expand, mobile tabs, teacher view-only, tutor ask/chat chrome
- `document-editor-v2-design-contract.test.ts` — committed design paths + resolved row CSS
- Existing: `document-editor-v2-margin.spec.ts`, v2 cases in `document-editor.spec.ts`

## CI

- Pending green run after code push (Sign-on + E2E shards include new states spec on shard 2).

## Flags / prod

- No change to `document-editor-v2` global flag (prod fail-closed unchanged).
- No sign-on / dev-panel bundle changes.