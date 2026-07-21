# Teacher Lounge Module Accessibility Design

Issue: #220  
Date: 2026-07-21

## Findings

The production-build axe run found three related defects on the seeded Teacher
Lounge module page:

- Radix rendered a menu-trigger button around the shared icon `Button`, creating
  nested interactive controls.
- Neither generated button had a discernible name.
- The empty-video message inherited the light-theme muted foreground on a black
  player surface and rendered at 3.18:1.

The ui.sh review also identified the existing 24x24 module-action control as too
small for coarse pointers.

## Decision

- Compose `DropdownMenuTrigger` with `asChild` so exactly one button is rendered.
- Give that button the contextual accessible name
  `Module actions for {module title}` and an explicit non-submit type.
- Preserve the visible 24x24 row layout while adding the established Yawp/ui.sh
  invisible 48x48 coarse-pointer target.
- Scope `text-white/70` to the black empty-video state. This keeps it visually
  muted while producing approximately 9.9:1 contrast without changing shared
  theme tokens.

No axe exclusions, test bypasses, data changes, or route-behavior changes are
permitted.

## Verification

The existing production-build axe test is the RED/GREEN contract. The focused
Teacher Lounge case and complete UA suite must pass on a Playwright-owned port.
Desktop and mobile screenshots must show an intentional empty state with no
layout regression.

