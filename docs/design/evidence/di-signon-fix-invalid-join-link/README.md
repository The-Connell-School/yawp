# Rejected class join links

FAILURES.md slug: `di-signon-fix-invalid-join-link`.

Real local `/join?t=invalid` routing failed before the implementation at both 1280px and 390px: the page showed generic class-link instructions. It now renders the existing unified sign-on invalid-link state only when `unified-sign-on` is enabled.

| Width | V2 comparison (design left, implementation right) | Before / after |
| --- | --- | --- |
| 1280px | [Comparison](signon-18-invalid-link-1280-side-by-side.png) | [Before / after](signon-18-invalid-link-1280-before-after.png) |
| 390px | [Comparison](signon-18-invalid-link-390-side-by-side.png) | [Before / after](signon-18-invalid-link-390-before-after.png) |

The v2 signon-18 DOM panel is isolated for the references. Its missing exported logo is restored using the app's existing local logo. The desktop reference centers the responsive mobile panel; v2 supplies no separate desktop invalid-link panel. Local system font rendering wraps the heading to two lines in both the reference and implementation. The local development flask button is present only in implementation captures. The footer differs vertically by approximately 2px. Source hashes and supplied-PNG crop coordinates are recorded in [reference-provenance.json](reference-provenance.json). Exact copy also matches signon-02.

The loader still performs the same rate-limited server lookup. Rejected supplied tokens return no class, join token, flow, or cookie. Missing/blank tokens retain the existing instructions. Invalid screens contain no inputs or registration/enrollment form; their Sign in action navigates to ordinary `/auth/login`. The POST action and invitation policy are unchanged. Token rotation and archived classes are rejected by the existing model, which has no time-based join-token expiry.

Validation uses a fresh, disposable local Postgres fixture with no hosted requests or real mail. Five real-database handler tests cover flag on/off, missing/blank/rejected/valid tokens, rotated/archived tokens, forged token/class mismatches, unchanged account/session counts and lookup throttling. Four browser tests exercise both widths, the actual loader, exact rendered copy, no form or authentication/flow/enrollment side effects, sign-in navigation, valid generated-handle continuation, and legacy flag-off controls. The tests are wired into existing GitHub sign-on integration/browser jobs and the project `signon-classcode` profile.

Additional retained coverage: the existing sign-on profile passes its unit/database files, including class-full, origin, rate-limit, confirmation and access-boundary assertions. Existing class-code browser journeys pass at both widths, including generated handles and joined/already-joined confirmations. The two mocked-Google browser cases are skipped without provider-mock configuration. Project typecheck passes with the existing LTI route-collision warnings.

Complete local controls and execution logs live in lane `shots/di-signon-fix-invalid-join-link/`. Historical hosted failures remain unresolved until the separate hosted re-QA task. No demo/production flags, configuration, deployment, preview or migration actions occurred.
