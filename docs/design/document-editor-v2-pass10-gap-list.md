# Document editor v2 — pass 10 gap list

Branch: `cursor/document-editor-v2-pass8-parity-dde8`  
Preview: `https://pr-963.preview.yawp.school` (`?editor=v2`, QA docs `previewdoceditv2qa0001` / `previewdoceditv2graded01`)  
Evidence: `docs/design/evidence/document-editor-v2-pass10/` (`manifest.json` + `*-side-by-side.png`)

## Pass 10 capture

```bash
cd services/web-app
PREVIEW_BASE_URL=https://pr-963.preview.yawp.school \
PREVIEW_ACCESS_CODE=steady-panda-6196 \
DOCUMENT_ID=previewdoceditv2qa0001 \
GRADED_DOCUMENT_ID=previewdoceditv2graded01 \
node scripts/capture-document-editor-v2-pass10-side-by-side.mjs
```

Preview-only fixtures: `?v2Capture=` (`loading`, `empty`, `error`, `saving`, `submitted`, `comments-reply-resolved`) via `document-editor-v2-capture.*`.

## Pixel diff summary (pass 10, PR #963 preview)

| State | Diff % | Notes |
| --- | ---: | --- |
| student-desktop-1440 | 6.74 | Live QA copy/title vs static design essay |
| mobile-390 | 14.42 | Framing + tab bar vs design board mobile frame |
| tutor-panel | 14.15 | Tutor transcript/content differs from design fixture |
| comments-margin | 6.58 | Seeded comment text; anchor layout close |
| comments-reply-resolved | 7.57 | Reply + resolved row expanded in capture |
| chrome-toolbar-prompt | 2.64 | Header + toolbar + prompt clip |
| top-bar | 10.66 | Class subtitle + live title |
| teacher-view-only | 5.53 | Full teacher frame vs design teacher card |
| view-only | 4.98 | Toolbar view-only strip |
| loading | 4.29 | `v2Capture=loading` skeleton |
| empty | 2.36 | `v2Capture=empty` disabled submit |
| error | 11.29 | Design board has no error row; compared to Saving… card |
| saving | 10.74 | `v2Capture=saving` vs Saving… card |
| submitted | 10.77 | `v2Capture=submitted` vs Submitted card |

## Remaining gaps

- Design export has no dedicated save-error artboard; pass 10 uses the Saving… top-bar card as the design proxy for `error`.
- Tutor/mobile double-digit diffs are largely fixture copy and viewport framing, not single-token CSS bugs; tutor micro-spacing tightened in pass 10 CSS.
- Full-page pass 9 captures duplicated states; pass 10 uses per-panel crops and distinct preview setup (see `capture-document-editor-v2-preview.mjs`).