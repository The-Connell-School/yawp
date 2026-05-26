# Login Page Brand Refresh — Design Spec

**Date:** 2026-05-26
**Branch:** `claude/remove-grade-highlights-BgmGE`
**Goal:** Refresh `/auth/login` as the first page in a conservative YAWP brand-guidelines pass while preserving the existing authentication, signup, and password-reset behavior.

---

## Audience

The login page serves literature teachers, English department heads, and students writing documents. The design should feel organized and work-focused, but with enough literary warmth to fit people who care about language, books, taste, and classroom craft.

## Approved Direction

Use the **C+ conservative direction** from the UI brainstorming companion:

- Keep the current centered, compact login structure.
- Avoid a large side panel or new marketing narrative.
- Use the page to refine the brand system through details: background, input styling, button hierarchy, typography, spacing, and surface treatment.
- Keep the current routes and account actions intact.

## Visual System

The page should use page-scoped login styles first, not global token changes. This lets YAWP pilot the direction without unexpectedly changing active app screens.

Core visual choices:

- **Background:** warm off-white/parchment rather than gray or slate.
- **Panel:** distinct white/warm-white login panel with a subtle border so the tinted page background remains accessible and intentional.
- **Primary accent:** a restrained burnt coral for `Log in`.
- **Secondary action:** a quieter cream or outline treatment for `Create account`; it must not compete with `Log in`.
- **Text:** dark ink foreground, muted warm gray supporting copy.
- **Radius:** consistent 8px controls, slightly larger outer panel radius.
- **Typography:** serif display headline for literary tone; sans-serif UI text for labels, inputs, links, and buttons.

## Page Structure

`/auth/login` should render:

1. A full-viewport login surface.
2. A compact centered panel.
3. Existing YAWP logo.
4. Heading: `Welcome back`.
5. Supporting copy: `Continue to your YAWP workspace.`
6. Email and password fields with existing labels.
7. Existing `Forgot password?` link.
8. Existing `Log in` submit button.
9. Existing create-account route as a quieter secondary action.

No route behavior changes:

- Form still posts through the existing `action`.
- `redirectTo` handling stays unchanged.
- Signup link keeps the existing redirect behavior.
- Forgot-password link remains `/auth/inv/forgot-password`.
- Invalid credentials and field validation continue using the existing RVF/conform error flow.

## Testing

Add an e2e visual contract test before implementation. The test should verify:

- `/auth/login` renders the redesigned page shell and panel.
- The shell uses a warm, non-default background treatment.
- The heading uses a serif display face.
- The login form still exposes labeled email and password fields.
- `Log in` is the only filled primary action, uses the conservative square-ish radius, and meets AA contrast with white text.
- `Create account` remains present as a lower-contrast secondary action.
- Mobile layout keeps the panel and form actions visible, stacked, and non-overlapping.
- The existing real sign-in e2e still passes.

## Non-Goals

- No redesign of `/`, `/info`, signup, forgot-password, onboarding, or authenticated app screens.
- No feature flag is required because this is visual-only and keeps all auth behavior backward compatible.
- No global design-token rollout in this task. Promote successful login-specific tokens globally later after review.
