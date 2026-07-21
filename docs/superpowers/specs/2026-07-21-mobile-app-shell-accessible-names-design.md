# Mobile App-Shell Accessible Names Design

Issue: #222  
Date: 2026-07-21

## Finding

The authenticated production build passed its desktop accessibility scan but a
390x844 scan exposed two critical `button-name` failures in the shared mobile
top menu. The hamburger icon opens app navigation and the reload icon reloads
the current page, but neither icon-only button exposed its action to assistive
technology.

## Decision

- Name the hamburger control `Open app navigation`, matching the existing
  `Close app navigation` control in the mobile drawer.
- Name the reload control `Reload page`.
- Preserve visible UI, handlers, sizing, and responsive behavior.
- Keep the mobile production-build axe scan as the RED/GREEN contract; no axe
  exclusion or test-only production branch is allowed.

## Human marker

Product/accessibility should review the wording in the combined Summer 2026
candidate. Push, merge, deploy, and production smoke remain approval-gated.
