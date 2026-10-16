# Unified sign-on typography — di-signon-fix-entry-typography

Visual-only correction for the FAILURES.md slug `di-signon-fix-entry-typography`.
Base: origin/main `822e3a04` (origin correction #568 included).

The unified shell, heading, body and controls use the existing system sans theme
stack through `--font-sans`. A root alias preserves that existing stack before the
legacy `* { --font-sans: Roboto }` declaration replaces the variable on each element.
The alias is consumed only inside the unified shell; no stack is duplicated.
The code input retains its intentional monospace type. Copy, sizes, gaps, routes,
authentication and default-OFF rollout behavior are unchanged.

## Local comparison evidence

All implementation captures wait for `document.fonts.ready`, in Chromium 1248,
at 1280×1000 and 390×844. Before captures are from the unchanged main stylesheet.
`reference-provenance.json` records the exact v2 PNG sources, hashes and mobile crop.
The v2 DOM `data-cs` attributes and `.txt` copy were also inspected.

| Evidence | Desktop 1280 | Mobile 390 |
| --- | --- | --- |
| Supplied v2 PNG / implementation | [comparison](signon-03-entry-1280-side-by-side.png) | [comparison](signon-03-entry-390-side-by-side.png) |
| Before / after | [comparison](signon-03-entry-1280-before-after.png) | [comparison](signon-03-entry-390-before-after.png) |
| Fresh v2 DOM heading / implementation | [comparison](entry-1280-fresh-dom-comparison.png) | [comparison](entry-390-fresh-dom-comparison.png) |
| Inherited states, before / after | [contact sheet](affected-states-1280-contact.png) | [contact sheet](affected-states-390-contact.png) |

Contact sheet pairs, left to right: password, account choice, email code, trial
status, membership. Each pair has before on the left and after on the right.
All fixture states were checked for copy, accessibility and horizontal overflow.
Full-resolution state captures, entry errors/focus/loading, baseline logs and
validation logs are retained under the lane's `shots/di-signon-fix-entry-typography/`.

The supplied PNG uses a different installed system font than this Linux host.
This host resolves `system-ui` to DejaVu Sans, with a bold face for weight 600.
Its entry heading wraps to two lines. Fresh **unmodified v2 DOM** rendering and
the implementation match exactly in heading glyph width (286.154296875px),
600 weight, 18px size, 24.3px line height, 272px available width and 48.59375px
two-line height at both viewports; see `fresh-reference-metrics.json`.
The fresh DOM crops isolate typography, so missing reference image URLs do not
enter the comparison. Supplied PNG comparisons remain visible as a separate
reference; they are not claimed to be pixel-identical. Mobile reference broken
logo/frame artifacts were not reproduced in the implementation.

## Flag-OFF evidence

Local isolated database only; unified setting absent. No demo/production flag
was changed. No credentials or hosted resources were used.

| Route | Desktop before / after | Mobile before / after |
| --- | --- | --- |
| Login | [comparison](flag-off-login-1280-comparison.png) | [comparison](flag-off-login-390-comparison.png) |
| Signup | [comparison](flag-off-signup-1280-comparison.png) | [comparison](flag-off-signup-390-comparison.png) |
| Reset request | [comparison](flag-off-reset-1280-comparison.png) | [comparison](flag-off-reset-390-comparison.png) |

All six screenshot files are byte-identical before/after. Computed font, weight,
copy and element box records are also byte-identical. See `flag-off-results.json`.
No forms were submitted and no email was requested.

## Validation and Ship Review handoff

- Project CLI capabilities, doctor and isolated local-dev fixture verification: pass.
- New typography browser checks: pass at both widths across seven representative states.
  They check the theme stack after fonts load, reference wrapping, weight, controls,
  the intentional monospace exception and absence of horizontal overflow.
- Existing unified fixture checks: 16 pass, including every presentation state at both widths.
- Legacy/unified dispatch unit tests: 43 pass.
- Project typecheck: pass with `NODE_OPTIONS=--max-old-space-size=4096`.
  The first attempt exhausted the default 2GB heap; existing LTI route-collision
  warnings remain. No TypeScript diagnostic was introduced.
- Pre-fix typography run was red; final exact-revision execution results are recorded
  in the lane handoff. Local fixture transport is presentation evidence only.
- No migration. No preview activation, visit, deployment, label, rebase or push to #565.
- Independent Ship Review and driver-verified merge remain required. Keep backlog item
  in_progress; hosted re-QA is the separate task after merge.
