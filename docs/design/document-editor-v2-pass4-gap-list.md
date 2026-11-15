# Document editor v2 — pass 4 gap list

Branch: `cursor/document-editor-v2-pass4-parity-168b` (preview: `pr-N.preview.yawp.school`).

## Identified gaps (design vs preview)

| State | Gap | Status |
| --- | --- | --- |
| Student desktop | Margin comments always visible when count > 0; design ties visibility to Comments panel toggle | fixing |
| Comments sheet (mobile) | Legacy sidebar styling (stone cards, Hide Comments); design uses sheet header, count, white cards, footer hint | fixing |
| Comments sidebar list | Sidebar layout did not reuse margin card chrome / reply UX | fixing |
| Resolved row (expanded) | Duplicate `margin-comment-card-*` test ids when expanded | fixing |
| Loading shell | Hydration test expects “Loading editor…” copy; shell was skeleton-only | fixing |
| Teacher load | Suspense hydration warning from post-mount state before paint | fixing |
| PM tripwire | Bootstrap/normalize transactions on server HTML lacked `recovery-on-mount` | fixing |
| Staff `?editor=v1` | Opt-out worked but was not exposed for capture/analytics | fixing |
| Tutor polish | Minor spacing/token alignment (ongoing in pass 4) | in progress |

## Design reference paths (uploaded)

- `/home/ubuntu/.cursor/projects/agent-repos-yawp/uploads/document-editor_3712.html`
- `/home/ubuntu/.cursor/projects/agent-repos-yawp/uploads/document-editor-states_510e.html`