# Dev panel v3 — PE3 HTML exports

These `.pe3.html` files are the **source of truth** for dev-panel chrome (Bryant rule: exported HTML, not screenshots).

| File | Frame |
| --- | --- |
| `DevPanel.pe3.html` | Unlocked panel, sections collapsed |
| `GiveFeedback.pe3.html` | Give feedback flyout open |
| `FreeTierStates.pe3.html` | Free-tier states flyout open |
| `Locked.pe3.html` | Locked / access gate |
| `SignedOut.pe3.html` | Signed-out row value |
| `HeaderRowStates.pe3.html` | Header, row, and flyout-row states |

Supersedes stale `*.dc.html` accordion exports in `design/devpanel-v3/html/`.

Implementation tokens live in `services/web-app/app/dev-panel/dev-panel.css` (`--yawp-dev-panel-*`).
