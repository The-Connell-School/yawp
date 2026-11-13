# Dev panel v3 — PE3 HTML exports

**Source of truth (2026-10-27):** inline accordion model in this folder and `../pe3-inline-2026-10-27/` (same frames).

Supersedes the Oct 26 **flyout / radio** exports:

- Removed: `FreeTierStates.pe3.html`, `GiveFeedback.pe3.html` (side-panel flyouts)
- Added: `FreeTierInline*.pe3.html`, `GiveFeedbackInline*.pe3.html`, `TesterToolsExpanded.pe3.html`

| File | Frame |
| --- | --- |
| `DevPanel.pe3.html` | Unlocked, sections collapsed |
| `DevPanel.locked.pe3.html` | Locked / access gate |
| `FreeTierInlineIdle.pe3.html` | Free-tier expanded, jump rows |
| `FreeTierInlineConfirm.pe3.html` | Inline confirm in row |
| `FreeTierApplying.pe3.html` | Applying spinner, dimmed rows |
| `GiveFeedbackInline.empty.pe3.html` | Give feedback inline, Send disabled |
| `GiveFeedbackInline.pe3.html` | Give feedback inline, Send enabled |
| `TesterToolsExpanded.pe3.html` | Tester tools expanded |
| `Locked.pe3.html`, `SignedOut.pe3.html`, `HeaderRowStates.pe3.html` | Legacy Oct 26 frames (header/sign-in) |

Expanded block padding: `12px 12px 12px 24px`. No second 320px panel.

Implementation: `services/web-app/app/dev-panel/dev-panel.css` and inline section components.
