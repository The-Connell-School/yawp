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

- `--primary`: lightness 57.0588% -> 44%.
- `--muted-foreground`: lightness 49.0196% -> 43%.

Calculated contrast for the new values:

- Primary foreground on primary: 5.13:1.
- Primary on page background: 4.75:1.
- Muted foreground on muted: 4.96:1.
- Muted foreground on page background: 4.59:1.

The high-contrast override remains at primary lightness 40% and muted foreground
lightness 36%, preserving a stronger optional mode. Dark-theme tokens are not
changed because they were not implicated by the failing evidence.

## Verification

The existing Playwright + axe login test is the regression test. It must run on
an isolated Yawp-owned port and report no serious or critical violations. The
broader UA accessibility suites run afterward to catch shared-token side
effects.

