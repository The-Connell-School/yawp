# Document editor v2 — pass 4 gap list

Branch: `cursor/document-editor-v2-pass4-parity-168b` (preview: `pr-N.preview.yawp.school`).

## Identified gaps (design vs preview)

| State | Gap | Status |
| --- | --- | --- |
| Student desktop | Margin comments always visible when count > 0; design ties visibility to Comments panel toggle | fixed |
| Comments sheet (mobile) | Legacy sidebar styling (stone cards, Hide Comments); design uses sheet header, count, white cards, footer hint | fixed |
| Comments sidebar list | Sidebar layout did not reuse margin card chrome / reply UX | fixed |
| Resolved row (expanded) | Duplicate `margin-comment-card-*` test ids when expanded | fixed |
| Loading shell | Hydration test expects “Loading editor…” copy; shell was skeleton-only | fixed |
| Teacher load | Suspense hydration warning from post-mount state before paint | fixed (deferred mount via `startTransition`) — preview verify pending |
| PM tripwire | Bootstrap/normalize transactions on server HTML lacked `recovery-on-mount` | fixed |
| Staff `?editor=v1` | Opt-out worked but was not exposed for capture/analytics | fixed (`data-document-editor-staff-opt-out="v1"`) |
| Tutor polish | Minor spacing/token alignment vs states board | remaining (no regressions found in pass) |
| Full states board | Automated side-by-side for loading/error/saving/submitted on preview | remaining (preview DB had no document deep links for Casey/Alex; need overlay creds or seeded doc id) |

## CI

- Green: https://github.com/The-Connell-School/yawp/actions/runs/43686218920 (`3b543f8c`)

## Design reference paths (uploaded)

- `/home/ubuntu/.cursor/projects/agent-repos-yawp/uploads/document-editor_3712.html`
- `/home/ubuntu/.cursor/projects/agent-repos-yawp/uploads/document-editor-states_510e.html`