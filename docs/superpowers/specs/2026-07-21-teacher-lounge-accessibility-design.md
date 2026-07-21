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
small for coarse pointers. A focused rerun then deterministically caught the
global navigation progress bar while active; it exposed a value but had no
accessible name. Those independently valuable cross-cutting repairs are owned
by milestone issue #221 so their provenance is explicit rather than silently
expanding #220.

The first independent review round then opened the repaired action menu and
found a state that the original page-load axe contract never exercised. A
`DropdownMenuItem` wrapped a native button, and Radix's modal behavior hid
focusable application chrome from assistive technology while the menu was open.

## Decision

- Compose `DropdownMenuTrigger` with `asChild` so exactly one button is rendered.
- Give that button the contextual accessible name
  `Module actions for {module title}` and an explicit non-submit type.
- Scope `text-white/70` to the black empty-video state. This keeps it visually
  muted while producing approximately 9.9:1 contrast without changing shared
  theme tokens.
- Render the restart control directly as one `DropdownMenuItem`, producing one
  semantic menu item rather than nested interactive controls. Independent
  keyboard verification showed that Radix selection did not submit the prior
  nested form, so the final design renders the Radix item directly and uses the
  route's existing fetcher to send one explicit `restartModule` POST on select.
- Use a non-modal dropdown. This one-action menu does not need modal
  outside-content suppression, and the modal implementation caused a real
  `aria-hidden-focus` violation in the integrated application shell.

Issue #221 separately owns and verifies the established Yawp/ui.sh 48px
coarse-pointer target and the shared navigation progress bar's stable accessible
name. Both remain in the integrated summer branch, with their own milestone
acceptance criteria and human markers.

No axe exclusions, test bypasses, data changes, or route-behavior changes are
permitted.

## Verification

The production-build axe test is the RED/GREEN contract. It must keyboard-open
the module menu, wait on the menu's actual CSS animation promises, scan the
stable open state, and keyboard-activate Restart Module. The test must observe
the `restartModule` POST and its successful response. No arbitrary delay or axe
exclusion is allowed. The focused Teacher Lounge case and complete UA suite
must pass on a Playwright-owned port. Stable desktop and mobile captures plus an
actual browser-flow video must show the open menu and responsive layout.
