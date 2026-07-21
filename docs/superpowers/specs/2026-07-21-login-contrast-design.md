# Login Contrast Remediation Design

Issue: #219  
Date: 2026-07-21

## Context

The isolated Chromium accessibility run found three WCAG AA contrast failures on
the login route. All three elements use shared theme tokens, so route-specific
classes would hide a broader theme regression rather than fix it.

## Decision

Keep the existing hue and saturation while darkening the standard light-theme
tokens enough to clear 4.5:1 against the surfaces used by the application:

- `--primary`: lightness 57.0588% -> 40%.
- `--muted-foreground`: lightness 49.0196% -> 36%.
- High-contrast `--primary`: lightness 40% -> 30%, and high-contrast
  `--muted-foreground`: lightness 36% -> 28%, so the optional mode remains
  materially stronger than the standard accessible palette.

Calculated contrast for the new values:

- Primary foreground on primary: 5.96:1.
- Primary on page background: 5.51:1.
- Primary on a 10% primary overlay: 4.79:1.
- Muted foreground on muted: 6.51:1.
- Muted foreground on page background: 6.02:1.
- Muted foreground on secondary: 5.07:1.

Dark-theme tokens are not changed because they were not implicated by the
failing evidence.

## Verification

The existing Playwright + axe login test is the regression test. It must run on
an isolated Yawp-owned port and report no serious or critical violations. The
broader UA accessibility suites run afterward to catch shared-token side
effects.
