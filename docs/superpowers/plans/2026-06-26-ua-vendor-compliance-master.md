# UA Vendor Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make YAWP materially ready for University of Alabama vendor review by producing WCAG 2.1 AA evidence, fixing the highest-risk accessibility/security gaps, publishing support documentation, and building a HECVAT-lite/SOC 2 readiness packet without waiting for a formal SOC 2 audit.

**Architecture:** Treat UA readiness as one integration branch with independent evidence-producing workstreams: accessibility, application security, AI/data governance, infrastructure/deploy hardening, and compliance documentation. Every engineering change starts with a failing unit/e2e/security test, lands in a small commit, and updates the evidence packet that supports the external claim. External-facing claims stay conservative unless backed by automated tests, manual assistive-technology evidence, or documented vendor contracts.

**Tech Stack:** React Router 7, React 18, Bun, Prisma/Postgres, Playwright, AWS App Runner/RDS/ECR/S3/Terraform, Anthropic Claude primary LLM, OpenAI fallback, PostHog analytics.

---

## Operating Decision Framework

Bryant asked where AI judgment should end and human judgment should begin. Use this framework throughout the work:

- Agent-owned judgments: reversible technical implementation choices, test design, evidence structure, default security hardening, accessible semantics, code organization, documentation drafts, conservative compliance wording, and remediation sequencing.
- Bryant-owned judgments: business risk appetite, public commitments, pricing/contract concessions, support SLA promises, final vendor response tone, and whether a feature is included in UA's purchased scope.
- Legal/vendor-owned judgments: DPA terms, FERPA school-official language, subprocessor approval, SOC 2 auditor engagement, Anthropic/OpenAI Zero Data Retention or enterprise terms, and any statement that legally binds YAWP.
- UA-owned judgments: whether UA accepts WCAG self-evaluation instead of VPAT/ACR, whether Teacher's Lounge videos are in review scope, whether accessible HTML/print output satisfies "output", whether OpenAI fallback is permitted, and whether any remediation must precede approval.

Default decisions until contradicted:

- Provide a WCAG 2.1 AA self-evaluation, not a VPAT/ACR, because UA's request explicitly permits that path when no current VPAT exists.
- Include the core app in scope: login, app navigation, student editor, tutor chat, submission, teacher dashboard, grading, admin/course setup, public accessibility pages, and generated browser/print output.
- Include Teacher's Lounge in engineering remediation because it exists in the teacher app; disclose it as "available only with captions/transcripts or alternate materials" if UA does not need it for initial launch.
- Treat OpenAI fallback as disabled for UA unless Bryant/legal explicitly approve OpenAI as a subprocessor and data flow.
- Treat full prompt/response LLM logging as a temporary diagnostic mode, not a permanent default. Default retention target is 30 days for minimized metadata and 0 days for raw prompt/response unless explicitly enabled for debugging.
- Treat PostHog session recording/autocapture as disabled or strictly masked for UA until a DPA/subprocessor review and masking evidence exist.
- Treat public statements as "we are completing WCAG 2.1 AA evidence and remediating findings" until every "Supports" claim has evidence.

## Authoritative Inputs

- `docs/work/ua-accessibility-vendor-response.md`
- Gmail source threads from Rachel Thompson, Brian Connell, and Mary Anne Canant summarized in the prior UA response packet.
- Granola 2026-06-22 meeting note: mid-July GBA 300 demo, accessibility audit/docs required, VPAT-style documentation in progress.
- UA vendor accessibility guidance: `https://accessibility.ua.edu/vendorinformation/`
- UA procurement digital accessibility guidance: `https://procurement.ua.edu/procuring-digital-content-and-technology/`
- WCAG 2.1: `https://www.w3.org/TR/WCAG21/`
- EDUCAUSE HECVAT: `https://www.educause.edu/higher-education-community-vendor-assessment-toolkit`
- FERPA school official guidance: `https://studentprivacy.ed.gov/faq/who-school-official-under-ferpa`
- AICPA Trust Services Criteria: `https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022`
- Anthropic data/training/subprocessor docs and OpenAI enterprise privacy/subprocessor docs cited in `docs/work/ua-accessibility-vendor-response.md` and subagent findings.

## Branch And Commit Strategy

- Integration branch: `codex/ua-vendor-compliance`.
- Base: `main`.
- Already preserved on this branch: `docs/work/ua-accessibility-vendor-response.md`.
- Workstream branches are optional, but if used, branch from `codex/ua-vendor-compliance` and merge back after each green slice.
- Commit after each coherent change:
  - failing test observed,
  - minimal implementation,
  - targeted test green,
  - evidence doc updated when a claim changes.
- Do not push unless Bryant asks.

## Evidence Gates

Gate 1: Planning complete.

- `docs/superpowers/plans/2026-06-26-ua-vendor-compliance-master.md` exists.
- Open decisions are recorded with recommended defaults.
- Existing UA response packet is linked.

Gate 2: Audit harness exists.

- Playwright accessibility helpers exist.
- Known accessibility issues are captured by failing tests before implementation.
- Automated scans produce artifacts under `docs/compliance/evidence/`.

Gate 3: Accessibility remediation complete for UA scope.

- Keyboard-only E2E tests pass for core flows.
- Tutor chat live-region semantics pass.
- Icon-only controls have accessible names.
- Clickable cards are keyboard-operable links/buttons.
- 200% zoom and viewport scaling are verified.
- Manual screen reader runbook is complete and test log has Bryant/agent execution slots.

Gate 4: Security blockers complete.

- IDOR tests reject cross-org/student raw IDs on tutor/session/comment/revision routes.
- Session expiry is enforced.
- Sensitive request headers are redacted from error logs.
- LLM logs are minimized and retained according to policy.
- PostHog/session recording posture is documented and configurable.

Gate 5: AI/data governance complete.

- AI data inventory covers tutor, grading, PDF extraction, fallback, logs, retention, deletion, and subprocessors.
- Per-org or policy-level provider controls exist for OpenAI fallback and PDF extraction.
- FERPA/subprocessor docs exist.

Gate 6: HECVAT-lite/SOC 2 readiness packet complete.

- Security packet docs exist under `docs/compliance/security/`.
- Control matrix maps implementation evidence to HECVAT/SOC 2 themes.
- Infrastructure hardening plan and evidence exist.

Gate 7: Final UA packet complete.

- `docs/compliance/ua-vendor-response-packet.md` links all evidence.
- Every "Supports" WCAG claim maps to automated test, manual screen-reader entry, or documented product behavior.
- Remaining limitations are explicit, bounded, and paired with remediation dates.

## Workstream Overview

1. Accessibility evidence and remediation.
2. Application security blockers.
3. AI/data governance and FERPA/subprocessor posture.
4. Infrastructure/deploy hardening for HECVAT/SOC 2 readiness.
5. Compliance documentation and external response packet.

## Task 0: Create Compliance Documentation Skeleton

**Files:**

- Create: `docs/compliance/README.md`
- Create: `docs/compliance/ua-product-scope.md`
- Create: `docs/compliance/ua-open-decisions.md`
- Create: `docs/compliance/evidence/README.md`
- Create: `docs/compliance/accessibility/README.md`
- Create: `docs/compliance/security/README.md`
- Create: `docs/compliance/ai-data-governance/README.md`

- [ ] **Step 1: Add the skeleton files**

Create short docs with these contents:

```markdown
# Compliance

This directory contains YAWP vendor-readiness evidence for University of Alabama and future enterprise reviews. Claims in this directory must map to tests, logs, runbooks, contracts, or manually recorded evidence.
```

`ua-product-scope.md` must state the default UA scope:

```markdown
# UA Product Scope

Default in scope: login, app navigation, student editor, tutor chat, document submission, teacher dashboard, grading view, admin/course setup, public accessibility pages, and generated browser/print output.

Teacher's Lounge is remediated as a product surface. If UA does not need it for initial approval, the final response may disclose it as out of initial scope while keeping caption/transcript support on the roadmap.
```

`ua-open-decisions.md` must list only human/external decisions, each with an agent default:

```markdown
# UA Open Decisions

| Decision | Agent default | Human/external owner |
|---|---|---|
| VPAT/ACR vs WCAG self-evaluation | WCAG 2.1 AA self-evaluation | UA/Bryant |
| OpenAI fallback for UA | Disabled unless approved | Bryant/legal/UA |
| Raw LLM prompt/response retention | Disabled by default; minimized metadata for 30 days | Bryant/legal |
| Teacher's Lounge in UA scope | Remediate; disclose scope clearly | Bryant/UA |
| Accessibility contact address | Use support@theyawp.com or current support inbox until a dedicated address exists | Bryant |
| Tagged PDF requirement | Do not promise tagged PDF; provide accessible HTML/print output unless UA requires tagged PDF | UA/Bryant |
```

- [ ] **Step 2: Verify docs are discoverable**

Run: `rg -n "UA Product Scope|UA Open Decisions|Compliance" docs/compliance`

Expected: the new headings are found.

- [ ] **Step 3: Commit**

Run:

```bash
git add docs/compliance
git commit -m "docs: scaffold UA compliance evidence"
```

## Task 1: Build Accessibility Audit Harness

**Files:**

- Create: `services/web-app/e2e/accessibility-helpers.ts`
- Create: `services/web-app/e2e/tests/accessibility.ua-keyboard.spec.ts`
- Create: `services/web-app/e2e/tests/accessibility.ua-semantics.spec.ts`
- Create: `services/web-app/e2e/tests/accessibility.ua-zoom.spec.ts`
- Modify: `services/web-app/package.json` only if adding `@axe-core/playwright`
- Create: `docs/compliance/accessibility/automated-audit-log.md`

- [ ] **Step 1: Write helper tests for focus and accessible names**

Add helper functions:

```ts
import { expect, type Locator, type Page } from '@playwright/test';

export async function expectTabReaches(page: Page, locator: Locator, label: string) {
  for (let i = 0; i < 80; i += 1) {
    if (await locator.evaluate((el) => el === document.activeElement).catch(() => false)) {
      return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error(`Tab did not reach ${label}`);
}

export async function expectNoKeyboardTrap(page: Page) {
  const seen = new Set<string>();
  for (let i = 0; i < 80; i += 1) {
    const marker = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return 'none';
      return [
        el.tagName,
        el.getAttribute('role'),
        el.getAttribute('aria-label'),
        el.textContent?.trim().slice(0, 40),
        el.getAttribute('href'),
        el.getAttribute('data-testid'),
      ].join('|');
    });
    seen.add(marker);
    await page.keyboard.press('Tab');
  }
  expect(seen.size).toBeGreaterThan(5);
}

export async function expectNamedButton(page: Page, name: RegExp | string) {
  await expect(page.getByRole('button', { name }).first()).toBeVisible();
}
```

- [ ] **Step 2: Write first failing keyboard tests**

In `accessibility.ua-keyboard.spec.ts`, cover:

```ts
import { test, expect } from '../test-setup';
import { expectNoKeyboardTrap, expectTabReaches } from '../accessibility-helpers';

test.describe.serial('UA keyboard accessibility', () => {
  test('app shell exposes named navigation controls and no global keyboard trap', async ({ page, signIn, e2eContext }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app');
    await expect(page.getByRole('navigation')).toBeVisible();
    await expect(page.getByRole('button', { name: /collapse navigation/i })).toBeVisible();
    await expectNoKeyboardTrap(page);
  });

  test('student can reach tutor chat and submit controls by keyboard', async ({ page, signIn, e2eContext, helpers }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    await expectTabReaches(page, page.getByTestId('document-editor-surface'), 'document editor');
    await expect(page.getByRole('button', { name: /print document/i })).toBeVisible();
  });
});
```

Expected initial failures: missing navigation button names, missing landmarks, editor focus assertions may need accessible surface fixes.

- [ ] **Step 3: Run tests and record red state**

Run: `bun run --cwd services/web-app playwright test --project=chromium e2e/tests/accessibility.ua-keyboard.spec.ts`

Expected: FAIL on missing accessible names and/or focus reachability.

- [ ] **Step 4: Add automated audit log**

Append the failing command, date, and top failure to `docs/compliance/accessibility/automated-audit-log.md`.

- [ ] **Step 5: Commit red-audit harness only if tests are skipped or marked as expected-failing**

Do not commit intentionally failing merge-gating tests. Either keep this uncommitted until Task 2 fixes pass, or mark known-failing assertions with `test.fixme()` and a precise reason:

```ts
test.fixme(true, 'UA accessibility remediation task will add named nav controls before enabling this assertion.');
```

Preferred path: implement Task 2 in the same branch before committing.

## Task 2: Fix Global Accessibility Foundations

**Files:**

- Modify: `services/web-app/app/root.tsx`
- Modify: `services/web-app/app/routes/app/route.tsx`
- Modify: `services/web-app/app/routes/app/sidebar-nav.tsx`
- Modify: `services/web-app/app/components/global-loading.tsx`
- Test: `services/web-app/e2e/tests/accessibility.ua-keyboard.spec.ts`
- Test: `services/web-app/e2e/tests/accessibility.ua-zoom.spec.ts`

- [ ] **Step 1: Write failing zoom test**

Add:

```ts
import { test, expect } from '../test-setup';

test('UA scope allows browser zoom and keeps app content reachable at 200 percent', async ({ page, signIn, e2eContext }) => {
  await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto('/app');
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewport).not.toContain('user-scalable=no');
  expect(viewport).not.toContain('maximum-scale=1.0');
  await page.evaluate(() => document.body.style.zoom = '2');
  await expect(page.getByRole('main')).toBeVisible();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `bun run --cwd services/web-app playwright test --project=chromium e2e/tests/accessibility.ua-zoom.spec.ts`

Expected: FAIL because `root.tsx` disables scaling.

- [ ] **Step 3: Implement global fixes**

Change the viewport meta in `root.tsx` from disabling zoom to:

```tsx
<meta name="viewport" content="width=device-width,initial-scale=1" />
```

Add a skip link before the app chrome:

```tsx
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:ring-2 focus:ring-ring"
>
  Skip to main content
</a>
```

Give the app `main` content a target:

```tsx
<div id="main-content" className="flex-1 bg-background" tabIndex={-1}>
  <Outlet />
</div>
```

In `app/route.tsx`, add `aria-label`s:

```tsx
aria-label={state === 'expanded' ? 'Collapse navigation' : 'Expand navigation'}
```

```tsx
aria-label="Close navigation"
```

Add `<nav aria-label="Primary navigation">`.

- [ ] **Step 4: Run targeted tests**

Run:

```bash
bun run --cwd services/web-app playwright test --project=chromium e2e/tests/accessibility.ua-keyboard.spec.ts e2e/tests/accessibility.ua-zoom.spec.ts
```

Expected: PASS for global shell checks.

- [ ] **Step 5: Commit**

Run:

```bash
git add services/web-app/app/root.tsx services/web-app/app/routes/app/route.tsx services/web-app/app/routes/app/sidebar-nav.tsx services/web-app/e2e/accessibility-helpers.ts services/web-app/e2e/tests/accessibility.ua-keyboard.spec.ts services/web-app/e2e/tests/accessibility.ua-zoom.spec.ts docs/compliance/accessibility/automated-audit-log.md
git commit -m "fix: add UA accessibility app shell foundations"
```

## Task 3: Fix Tutor Chat Live-Region And Accessible Control Semantics

**Files:**

- Modify: `services/web-app/app/routes/app_.documents_.$id/tutor/tutor.tsx`
- Modify: `services/web-app/app/routes/app_.documents_.$id/tutor/response-bar.tsx`
- Modify: `services/web-app/app/components/rich-textarea.tsx`
- Test: `services/web-app/e2e/tests/accessibility.ua-semantics.spec.ts`
- Test: `services/web-app/e2e/tests/accessibility.ua-keyboard.spec.ts`

- [ ] **Step 1: Write failing tutor semantics test**

Add:

```ts
import { test, expect } from '../test-setup';

test('tutor chat exposes a screen-reader log, status, alert, and named chat controls', async ({ page, signIn, e2eContext, helpers }) => {
  await signIn('jdoe@brock.software', 'johndoe');
  await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });

  await expect(page.getByRole('log', { name: /tutor conversation/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /ask the tutor/i }).first()).toBeVisible();
  await page.getByRole('button', { name: /ask the tutor/i }).first().click();
  await expect(page.getByRole('textbox', { name: /message to tutor/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /send tutor message/i })).toBeDisabled();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `bun run --cwd services/web-app playwright test --project=chromium e2e/tests/accessibility.ua-semantics.spec.ts`

Expected: FAIL because the message stream lacks `role="log"` and chat controls lack names.

- [ ] **Step 3: Implement live-region semantics**

In `tutor.tsx`, add:

```tsx
role="log"
aria-live="polite"
aria-relevant="additions text"
aria-label="Tutor conversation"
```

to the scrollable message container.

Add `role="status"` to loading/retrying UI and `role="alert"` to tutor error text.

In `response-bar.tsx`, add explicit names:

```tsx
aria-label="Back to tutor response choices"
aria-label="Ask the tutor"
aria-label={check ? 'Confirm next step' : 'Next tutor step'}
```

In `RichTextarea`, add a default accessible label:

```tsx
aria-label={textareaProps['aria-label'] ?? 'Message to tutor'}
```

and give the send icon button:

```tsx
aria-label="Send tutor message"
```

- [ ] **Step 4: Run targeted tests**

Run:

```bash
bun run --cwd services/web-app playwright test --project=chromium e2e/tests/accessibility.ua-semantics.spec.ts e2e/tests/document-editor.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add services/web-app/app/routes/app_.documents_.$id/tutor/tutor.tsx services/web-app/app/routes/app_.documents_.$id/tutor/response-bar.tsx services/web-app/app/components/rich-textarea.tsx services/web-app/e2e/tests/accessibility.ua-semantics.spec.ts
git commit -m "fix: expose tutor chat to assistive technology"
```

## Task 4: Fix Editor Surface And Toolbar Keyboard Semantics

**Files:**

- Modify: `services/web-app/app/routes/app_.documents_.$id/document-editor/editor.tsx`
- Modify: `services/web-app/app/routes/app_.documents_.$id/document-editor/editor-bar.tsx`
- Modify: `services/web-app/app/routes/app_.documents_.$id/document-editor/commands/index.tsx`
- Test: `services/web-app/e2e/tests/accessibility.student-editor-tutor.spec.ts`

- [ ] **Step 1: Write failing editor toolbar test**

Create `accessibility.student-editor-tutor.spec.ts`:

```ts
import { test, expect } from '../test-setup';

test('student editor exposes named editable region and keyboard-operable toolbar buttons', async ({ page, signIn, e2eContext, helpers }) => {
  await signIn('jdoe@brock.software', 'johndoe');
  await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });

  await expect(page.getByRole('textbox', { name: /student document editor/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^bold$/i })).toBeVisible();
  await page.getByRole('button', { name: /^bold$/i }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('textbox', { name: /student document editor/i }).click();
  await page.keyboard.type('Bold check');
  await expect(page.locator('.ProseMirror strong')).toContainText('Bold check');
});
```

- [ ] **Step 2: Run and verify failure**

Run: `bun run --cwd services/web-app playwright test --project=chromium e2e/tests/accessibility.student-editor-tutor.spec.ts`

Expected: FAIL because toolbar controls are divs and editor lacks the expected accessible name.

- [ ] **Step 3: Implement editor naming and button semantics**

In `editor.tsx`, set editor attributes through TipTap:

```ts
editorProps: {
  attributes: {
    role: 'textbox',
    'aria-label': 'Student document editor',
    'aria-multiline': 'true',
  },
},
```

In `commands/index.tsx`, replace `COMMAND_STYLE` with a button-compatible style:

```ts
export const COMMAND_STYLE =
  'h-8 rounded-sm p-2 transition-colors hover:bg-foreground/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';
```

In `editor-bar.tsx`, render commands as `<button type="button">` with `aria-label`, `aria-pressed` when active, and `disabled` from `checkDisabled`.

- [ ] **Step 4: Run targeted tests**

Run:

```bash
bun run --cwd services/web-app playwright test --project=chromium e2e/tests/accessibility.student-editor-tutor.spec.ts e2e/tests/document-editor.spec.ts e2e/tests/document-editor-invariants.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add services/web-app/app/routes/app_.documents_.$id/document-editor/editor.tsx services/web-app/app/routes/app_.documents_.$id/document-editor/editor-bar.tsx services/web-app/app/routes/app_.documents_.$id/document-editor/commands/index.tsx services/web-app/e2e/tests/accessibility.student-editor-tutor.spec.ts
git commit -m "fix: make document editor toolbar keyboard accessible"
```

## Task 5: Fix Form Error Announcements And Input Labels

**Files:**

- Modify: `services/web-app/app/components/forms/error-list.tsx`
- Modify: `services/web-app/app/components/forms/form-textarea-2.tsx`
- Modify: `services/web-app/app/components/search-input.tsx`
- Test: `services/web-app/app/components/forms/form-textarea-2.test.tsx`
- Test: route/component tests that already cover assignment creation and auth forms.

- [ ] **Step 1: Write failing component test for `form-textarea-2`**

Create a test that renders the component with a validation error and expects `aria-describedby` to point at the rendered error element, not the textarea id.

Expected assertion shape:

```ts
expect(textarea.getAttribute('aria-describedby')).toBe(error.id);
```

- [ ] **Step 2: Run test and verify failure**

Run: `bun run --cwd services/web-app test app/components/forms/form-textarea-2.test.tsx`

Expected: FAIL because `aria-describedby` currently points at `id`.

- [ ] **Step 3: Implement shared error semantics**

In `ErrorList`, add:

```tsx
role="alert"
aria-live="assertive"
```

In `form-textarea-2.tsx`, create `errorId = hasError ? `${id}-error` : undefined` and use it for both `aria-describedby` and rendered error `id`.

In `search-input.tsx`, require or default an `aria-label`:

```tsx
aria-label={props['aria-label'] ?? 'Search'}
```

- [ ] **Step 4: Run targeted tests**

Run:

```bash
bun run --cwd services/web-app test app/components/forms app/components/assignments
bun run --cwd services/web-app playwright test --project=chromium e2e/tests/auth.signin.spec.ts e2e/tests/teacher.assignments-page.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add services/web-app/app/components/forms/error-list.tsx services/web-app/app/components/forms/form-textarea-2.tsx services/web-app/app/components/search-input.tsx services/web-app/app/components/forms/form-textarea-2.test.tsx
git commit -m "fix: announce form errors and label search inputs"
```

## Task 6: Fix Clickable Card Semantics

**Files:**

- Modify: `services/web-app/app/routes/app.teacher-trainings._index/route.tsx`
- Modify: `services/web-app/app/routes/app.admin.teacher-trainings._index/route.tsx`
- Modify: `services/web-app/app/routes/app.admin.assignment-types._index/route.tsx`
- Test: `services/web-app/e2e/tests/accessibility.ua-keyboard.spec.ts`

- [ ] **Step 1: Write failing tests**

Add assertions:

```ts
await expect(page.getByRole('link', { name: /open .* training/i }).first()).toBeVisible();
```

and:

```ts
await page.getByRole('link', { name: /open .* training/i }).first().focus();
await page.keyboard.press('Enter');
await expect(page).toHaveURL(/teacher-trainings/);
```

- [ ] **Step 2: Run and verify failure**

Run: `bun run --cwd services/web-app playwright test --project=chromium e2e/tests/accessibility.ua-keyboard.spec.ts`

Expected: FAIL on clickable card role/name.

- [ ] **Step 3: Convert cards to links**

Use `Link` wrappers or `Button asChild` where existing patterns allow. Preserve card visuals and nested actions. If a card contains nested buttons, use a named primary link inside the card instead of making the whole card clickable.

- [ ] **Step 4: Run targeted tests**

Run:

```bash
bun run --cwd services/web-app playwright test --project=chromium e2e/tests/accessibility.ua-keyboard.spec.ts e2e/tests/teacher.dashboard-workspace.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add services/web-app/app/routes/app.teacher-trainings._index/route.tsx services/web-app/app/routes/app.admin.teacher-trainings._index/route.tsx services/web-app/app/routes/app.admin.assignment-types._index/route.tsx services/web-app/e2e/tests/accessibility.ua-keyboard.spec.ts
git commit -m "fix: make training and admin cards keyboard operable"
```

## Task 7: Create Screen Reader Test Game Plan And Log

**Files:**

- Create: `docs/compliance/accessibility/screen-reader-test-plan.md`
- Create: `docs/compliance/accessibility/screen-reader-test-log.md`

- [ ] **Step 1: Write the runbook**

Include exact scripts for:

- VoiceOver on macOS with Safari or Chrome.
- NVDA on Windows with Chrome or Edge.
- Required flows: login, navigation, student editor, tutor chat, submit dialog, teacher dashboard, grading, public accessibility page, Teacher's Lounge video if in scope.

Use this format:

```markdown
## Flow: Student editor and tutor chat

Environment:
- Screen reader:
- Browser:
- OS:
- Date:
- Tester:

Steps:
1. Sign in as the seeded student.
2. Open a writing document.
3. Navigate by landmarks.
4. Move to the tutor conversation log.
5. Confirm new messages are announced when added.
6. Move to the editor by form controls.
7. Type text and submit.

Pass criteria:
- Current page, primary navigation, tutor conversation, editor, and submit dialog all have understandable names.
- No keyboard trap occurs.
- Tutor status/error messages are announced.
- The editor can be entered and exited without losing context.
```

- [ ] **Step 2: Write log template**

Use rows:

```markdown
| Date | Tester | OS/browser/screen reader | Flow | Result | Finding IDs | Evidence link |
|---|---|---|---|---|---|---|
```

- [ ] **Step 3: Commit**

Run:

```bash
git add docs/compliance/accessibility/screen-reader-test-plan.md docs/compliance/accessibility/screen-reader-test-log.md
git commit -m "docs: add UA screen reader test plan"
```

Human blocker: a human or external tester must run at least one VoiceOver and one NVDA pass before claiming "Supports" for screen-reader-dependent WCAG criteria. The agent can provide the script and remediate findings.

## Task 8: Add Public Accessibility And Product Accessibility Pages

**Files:**

- Create: `services/web-app/app/routes/accessibility/route.tsx`
- Create: `services/web-app/app/routes/accessibility.product/route.tsx`
- Modify: `services/web-app/app/routes/_index/route.tsx`
- Modify: `services/web-app/app/routes/info/route.tsx`
- Test: `services/web-app/e2e/tests/accessibility.public-pages.spec.ts`

- [ ] **Step 1: Write failing public page tests**

Add:

```ts
import { test, expect } from '../test-setup';

test('public accessibility pages are reachable and disclose support path', async ({ page }) => {
  await page.goto('/accessibility');
  await expect(page.getByRole('heading', { name: /accessibility/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /report an accessibility issue/i })).toBeVisible();
  await page.goto('/accessibility/product');
  await expect(page.getByRole('heading', { name: /YAWP Writing Program accessibility/i })).toBeVisible();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `bun run --cwd services/web-app playwright test --project=chromium e2e/tests/accessibility.public-pages.spec.ts`

Expected: FAIL because routes do not exist.

- [ ] **Step 3: Implement pages with conservative language**

The public page must say:

- YAWP targets WCAG 2.1 AA.
- UA-specific WCAG self-evaluation is in progress.
- Users can report issues through the support link.
- Known limitations are documented and updated when product behavior changes.

The product page must list:

- In-scope workflows.
- Supported browsers.
- Keyboard support summary.
- Assistive-technology testing status.
- Media and output status.
- How YAWP triages accessibility issues.

Avoid the phrase "fully accessible" until the final evidence gate passes.

- [ ] **Step 4: Run tests**

Run:

```bash
bun run --cwd services/web-app playwright test --project=chromium e2e/tests/accessibility.public-pages.spec.ts
bun run --cwd services/web-app typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add services/web-app/app/routes/accessibility services/web-app/app/routes/accessibility.product services/web-app/app/routes/_index/route.tsx services/web-app/app/routes/info/route.tsx services/web-app/e2e/tests/accessibility.public-pages.spec.ts
git commit -m "feat: publish accessibility documentation pages"
```

## Task 9: Create WCAG 2.1 AA Self-Evaluation Evidence Packet

**Files:**

- Create: `docs/compliance/accessibility/wcag-2.1-aa-self-evaluation.md`
- Create: `docs/compliance/accessibility/known-accessibility-issues.md`
- Create: `docs/compliance/accessibility/third-party-accessibility-inventory.md`
- Create: `docs/compliance/accessibility/contrast-and-zoom-audit.md`
- Create: `docs/compliance/accessibility/accessible-output.md`

- [ ] **Step 1: Build self-evaluation table**

Use columns:

```markdown
| WCAG criterion | Level | Status | Evidence | Notes/remediation |
|---|---|---|---|---|
```

Allowed statuses:

- Supports
- Partially Supports
- Does Not Support
- Not Applicable
- Not Evaluated

Rule: "Supports" requires a test command, screen-reader log row, or source evidence.

- [ ] **Step 2: Record known issues**

Use issue IDs:

```markdown
| ID | Severity | Surface | WCAG criterion | Status | Remediation owner | Target date |
|---|---|---|---|---|---|---|
```

- [ ] **Step 3: Add third-party inventory**

Include at minimum:

- Radix UI
- TipTap/ProseMirror
- Recharts
- Browser-native `<video>`
- Anthropic/OpenAI separately in AI inventory, not accessibility inventory.

- [ ] **Step 4: Add output evidence**

Document current output posture:

- Primary output is browser-rendered HTML.
- Print/save-as-PDF is browser-generated and not represented as tagged PDF.
- If UA requires tagged PDF, create a separate implementation plan for tagged PDF generation.

- [ ] **Step 5: Commit**

Run:

```bash
git add docs/compliance/accessibility
git commit -m "docs: add WCAG self-evaluation evidence packet"
```

## Task 10: Fix Raw-ID Authorization Gaps For Tutor And Session APIs

**Files:**

- Create: `services/web-app/app/utils/document-access-policy.server.ts`
- Modify: `services/web-app/app/routes/api.domain.tutor-response/route.ts`
- Modify: `services/web-app/app/routes/api.model.assignment-module-session/route.ts`
- Modify: `services/web-app/app/routes/api.model.assignment-module-session.$id/route.ts`
- Test: existing route tests plus new security tests:
  - `services/web-app/app/routes/api.domain.tutor-response/route.test.ts`
  - `services/web-app/app/routes/api.model.assignment-module-session/route.test.ts`
  - `services/web-app/app/routes/api.model.assignment-module-session.$id/route.test.ts`

- [ ] **Step 1: Write failing IDOR tests**

For each endpoint, assert:

```ts
test('rejects cross-student or cross-organization raw ids', async () => {
  // Arrange authenticated user A.
  // Arrange cms/document/session owned by user B or another org.
  // POST with user A session and user B id.
  // Expect 403 and no created messages/session updates.
});
```

Use the repo's existing route test mocking style. The exact mocks must prove `prisma.assignmentModuleSession.update` and LLM calls are not invoked after authorization fails.

- [ ] **Step 2: Run and verify failure**

Run:

```bash
bun run --cwd services/web-app test app/routes/api.domain.tutor-response/route.test.ts app/routes/api.model.assignment-module-session/route.test.ts app/routes/api.model.assignment-module-session.$id/route.test.ts
```

Expected: FAIL because current checks only require a logged-in mutable user in several routes.

- [ ] **Step 3: Implement shared access policy**

Create `document-access-policy.server.ts` with functions:

```ts
export async function requireDocumentAccessForUser(params: {
  request: Request;
  documentId: string;
  intent: 'read' | 'write' | 'comment' | 'tutor';
}): Promise<{ userId: string; membershipId: string; role: string }> {
  // Student owner: document.membership.userId matches user.
  // Teacher: document belongs to a class taught by one of user's teacher memberships.
  // Admin: allowed.
  // Otherwise throw 403.
}

export async function requireAssignmentModuleSessionAccess(params: {
  request: Request;
  cmsId: string;
  intent: 'read' | 'write' | 'tutor';
}) {
  // Load cms -> documentId and delegate to requireDocumentAccessForUser.
}
```

Use existing membership/class relations; do not introduce schema changes for this task.

- [ ] **Step 4: Apply policy to routes**

In tutor response, authorize `cmsId` before building prompts or reading document text.

In session create/update, authorize `documentId` or `cmsId` before creating/updating sessions.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
bun run --cwd services/web-app test app/routes/api.domain.tutor-response app/routes/api.model.assignment-module-session app/utils/document-access-policy.server.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add services/web-app/app/utils/document-access-policy.server.ts services/web-app/app/utils/document-access-policy.server.test.ts services/web-app/app/routes/api.domain.tutor-response services/web-app/app/routes/api.model.assignment-module-session
git commit -m "fix: enforce document access on tutor session APIs"
```

## Task 11: Fix Raw-ID Authorization Gaps For Comments And Revisions

**Files:**

- Modify: `services/web-app/app/routes/api.model.document-comment/route.ts`
- Modify: `services/web-app/app/routes/api.model.document-comment-response/route.ts`
- Modify: `services/web-app/app/routes/api.model.document-comment.$id/route.ts`
- Modify: `services/web-app/app/routes/api.document.$id.revisions/route.ts`
- Test corresponding route tests.

- [ ] **Step 1: Write failing cross-org tests**

Assert unauthorized users cannot:

- Create a comment on another student's document.
- Respond to another student's document comment.
- Update/delete a comment outside their allowed document scope.
- Read another document's revision history.

- [ ] **Step 2: Run and verify failure**

Run:

```bash
bun run --cwd services/web-app test app/routes/api.model.document-comment app/routes/api.document.$id.revisions
```

Expected: FAIL on missing scope enforcement.

- [ ] **Step 3: Apply shared document access policy**

Use `requireDocumentAccessForUser` for document comments and revisions.

For comment responses, load the comment's document id first and authorize that document before writing.

- [ ] **Step 4: Run tests**

Run:

```bash
bun run --cwd services/web-app test app/routes/api.model.document-comment app/routes/api.document.$id.revisions app/routes/document-editor
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add services/web-app/app/routes/api.model.document-comment services/web-app/app/routes/api.model.document-comment-response services/web-app/app/routes/api.document.$id.revisions
git commit -m "fix: enforce document access on comments and revisions"
```

## Task 12: Enforce Real Session Expiry

**Files:**

- Modify: `services/web-app/app/utils/auth.server.ts`
- Modify: `services/web-app/app/routes/api.auth.check/route.ts`
- Modify: `services/web-app/app/routes/auth.login/route.tsx` only if UI copy changes.
- Test: `services/web-app/app/utils/auth.server.test.ts`
- Test: `services/web-app/app/routes/api.auth.check/route.test.ts`

- [ ] **Step 1: Write failing expiry tests**

Assert:

- `getUserId` returns null or destroys session when `expirationDate < now`.
- `api.auth.check` returns `{ valid: false, reason: 'expired' }`.
- Login creates a session with the new configured lifetime.

- [ ] **Step 2: Run and verify failure**

Run:

```bash
bun run --cwd services/web-app test app/utils/auth.server.test.ts app/routes/api.auth.check/route.test.ts
```

Expected: FAIL because current session duration is 100 years and check ignores expiration.

- [ ] **Step 3: Implement expiry policy**

Use conservative defaults:

```ts
export const SESSION_ABSOLUTE_EXPIRATION_TIME = 1000 * 60 * 60 * 24 * 30;
export const SESSION_IDLE_EXPIRATION_TIME = 1000 * 60 * 60 * 12;
```

If idle expiry requires schema support, implement absolute expiry first and create a follow-up task for idle expiry evidence. Do not leave 100-year sessions.

- [ ] **Step 4: Run targeted auth tests and smoke auth e2e**

Run:

```bash
bun run --cwd services/web-app test app/utils/auth.server.test.ts app/routes/api.auth.check/route.test.ts
bun run --cwd services/web-app playwright test --project=chromium e2e/tests/auth.signin.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add services/web-app/app/utils/auth.server.ts services/web-app/app/routes/api.auth.check/route.ts services/web-app/app/utils/auth.server.test.ts services/web-app/app/routes/api.auth.check/route.test.ts
git commit -m "fix: enforce session expiration"
```

## Task 13: Redact Sensitive Server Logs

**Files:**

- Create: `services/web-app/app/utils/safe-logging.server.ts`
- Modify: `services/web-app/app/entry.server.tsx`
- Modify: `services/web-app/app/utils/db.server.ts`
- Test: `services/web-app/app/utils/safe-logging.server.test.ts`

- [ ] **Step 1: Write redaction tests**

Test:

```ts
expect(redactHeaders({ cookie: 'secret', authorization: 'Bearer x', 'x-internal-token': 't', 'user-agent': 'UA' })).toEqual({
  cookie: '[redacted]',
  authorization: '[redacted]',
  'x-internal-token': '[redacted]',
  'user-agent': 'UA',
});
```

Also test email redaction in arbitrary strings.

- [ ] **Step 2: Run and verify failure**

Run: `bun run --cwd services/web-app test app/utils/safe-logging.server.test.ts`

Expected: FAIL because helper does not exist.

- [ ] **Step 3: Implement redaction and wire error handler**

Use helper functions:

```ts
export function redactHeaders(headers: Record<string, string>) { ... }
export function redactText(value: string) { ... }
```

Replace `Object.fromEntries(request.headers.entries())` with `redactHeaders(...)`.

For Prisma slow query logging, either disable query text in production or log only duration and a normalized operation label.

- [ ] **Step 4: Run tests**

Run:

```bash
bun run --cwd services/web-app test app/utils/safe-logging.server.test.ts
bun run --cwd services/web-app typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add services/web-app/app/utils/safe-logging.server.ts services/web-app/app/utils/safe-logging.server.test.ts services/web-app/app/entry.server.tsx services/web-app/app/utils/db.server.ts
git commit -m "fix: redact sensitive server logs"
```

## Task 14: Minimize And Retain LLM Logs

**Files:**

- Modify: `packages/prisma/schema.prisma`
- Add migration under `packages/prisma/migrations/`
- Modify: `services/web-app/app/utils/getLLMCompletion/getLLMCompletion.ts`
- Modify: `services/web-app/app/routes/api.domain.retention/route.ts`
- Test: `services/web-app/app/utils/getLLMCompletion/getLLMCompletion.test.ts`
- Test: `services/web-app/app/routes/api.domain.retention/route.test.ts`

- [ ] **Step 1: Write failing tests for minimized logging**

Assert by default:

- `llmLog.create` receives no raw `systemPrompt`, `messages`, or `response` unless `LLM_RAW_LOGGING_ENABLED=true`.
- metadata includes `feature`, `provider`, model, duration, token counts, and scoped IDs where available.

- [ ] **Step 2: Write failing retention test**

Update retention route test to expect `prisma.llmLog.deleteMany` with a 30-day cutoff.

- [ ] **Step 3: Run and verify failures**

Run:

```bash
bun run --cwd services/web-app test app/utils/getLLMCompletion/getLLMCompletion.test.ts app/routes/api.domain.retention/route.test.ts
```

Expected: FAIL because raw prompt/response logging is current behavior and retention ignores `LlmLog`.

- [ ] **Step 4: Implement logging policy**

Add nullable fields if needed:

```prisma
rawPayloadRetained Boolean @default(false)
retentionClass String @default("metadata-30d")
organizationId String?
schoolId String?
classId String?
documentId String?
submissionId String?
userId String?
```

Keep raw fields nullable for backward compatibility.

In logging code, default:

```ts
const rawLoggingEnabled = process.env.LLM_RAW_LOGGING_ENABLED === 'true';
systemPrompt: rawLoggingEnabled ? data.systemPrompt : undefined;
messages: rawLoggingEnabled ? data.messages : {};
response: rawLoggingEnabled ? data.response : undefined;
```

- [ ] **Step 5: Update retention**

Add `llmLog.deleteMany({ where: { createdAt: { lt: cutoff } } })` using a named constant `LLM_LOG_RETENTION_DAYS = 30`.

- [ ] **Step 6: Run Prisma and tests**

Run:

```bash
bun prisma:generate
bun run --cwd services/web-app test app/utils/getLLMCompletion app/routes/api.domain.retention/route.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/prisma/schema.prisma packages/prisma/migrations services/web-app/app/utils/getLLMCompletion services/web-app/app/routes/api.domain.retention
git commit -m "fix: minimize and retain LLM logs"
```

## Task 15: Add AI Provider Controls And UA AI Disclosure

**Files:**

- Create: `services/web-app/app/utils/ai-policy.server.ts`
- Modify: `services/web-app/app/utils/getLLMCompletion/getLLMCompletion.ts`
- Modify: `services/web-app/app/routes/api.domain.tutor-response/route.ts`
- Modify: `services/web-app/app/routes/api.domain.grade-essay-ai/route.ts`
- Modify: `services/web-app/app/routes/api.domain.assignment-pdf-extract/route.ts`
- Create: `docs/compliance/ai-data-governance/ai-data-inventory.md`
- Create: `docs/compliance/ai-data-governance/ua-ai-functionality-response.md`
- Create: `docs/compliance/ai-data-governance/subprocessor-inventory.md`
- Test: AI route tests.

- [ ] **Step 1: Write policy tests**

Test:

- OpenAI fallback is disabled when `AI_OPENAI_FALLBACK_ENABLED=false`.
- PDF extraction can be disabled by policy.
- Unknown model names are rejected unless in allow-list.

- [ ] **Step 2: Run and verify failures**

Run:

```bash
bun run --cwd services/web-app test app/utils/ai-policy.server.test.ts app/utils/getLLMCompletion/getLLMCompletion.test.ts app/routes/api.domain.assignment-pdf-extract/route.test.ts
```

Expected: FAIL until policy helper exists.

- [ ] **Step 3: Implement policy helper**

Default policy:

```ts
export function getAiPolicy() {
  return {
    anthropicEnabled: process.env.AI_ANTHROPIC_ENABLED !== 'false',
    openAiFallbackEnabled: process.env.AI_OPENAI_FALLBACK_ENABLED === 'true',
    pdfExtractionEnabled: process.env.AI_PDF_EXTRACTION_ENABLED !== 'false',
    allowedModels: (process.env.AI_ALLOWED_MODELS ?? 'claude-sonnet-4-6').split(',').map((s) => s.trim()),
  };
}
```

Wire fallback to this policy. This intentionally changes default OpenAI fallback posture to opt-in for vendor readiness.

- [ ] **Step 4: Document AI data inventory**

Inventory must include:

- Tutor: current message, prior chat, system/tutor instructions, optional full essay through `read_student_document`, stored tutor message context.
- Grading assistant: essay text, rubric, student first name, assignment metadata, AP source/rubric context.
- PDF extraction: uploaded assignment PDF sent to Anthropic.
- Logs: minimized metadata by default; raw payload disabled unless debugging.
- Providers: Anthropic primary; OpenAI fallback only if enabled and approved.
- Retention/deletion: 30-day metadata target; raw disabled by default.

- [ ] **Step 5: Draft UA AI functionality response**

Use wording:

```markdown
YAWP includes AI-assisted tutoring, grading feedback support, and optional assignment PDF prompt extraction. Anthropic Claude is the primary model provider. OpenAI fallback is disabled for UA unless separately approved as a subprocessor. YAWP does not use AI to make autonomous final grading decisions; teachers remain responsible for final grades and feedback release.
```

- [ ] **Step 6: Run tests and typecheck**

Run:

```bash
bun run --cwd services/web-app test app/utils/ai-policy.server.test.ts app/utils/getLLMCompletion app/routes/api.domain.tutor-response app/routes/api.domain.grade-essay-ai app/routes/api.domain.assignment-pdf-extract
bun run --cwd services/web-app typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add services/web-app/app/utils/ai-policy.server.ts services/web-app/app/utils/ai-policy.server.test.ts services/web-app/app/utils/getLLMCompletion services/web-app/app/routes/api.domain.tutor-response services/web-app/app/routes/api.domain.grade-essay-ai services/web-app/app/routes/api.domain.assignment-pdf-extract docs/compliance/ai-data-governance
git commit -m "feat: add AI provider policy and UA disclosure"
```

## Task 16: Harden PostHog And Analytics Posture

**Files:**

- Modify: `services/web-app/app/root.tsx`
- Modify: `services/web-app/app/utils/env.server.ts`
- Create: `docs/compliance/security/analytics-and-session-recording.md`
- Test: `services/web-app/app/root.test.tsx` or focused unit around config helper if root is not directly testable.

- [ ] **Step 1: Extract PostHog config helper**

Create a helper function that returns:

```ts
{
  capture_pageview: true,
  capture_pageleave: false,
  disable_session_recording: process.env.POSTHOG_SESSION_RECORDING_ENABLED !== 'true',
  autocapture: false,
}
```

for vendor-ready default.

- [ ] **Step 2: Write tests**

Assert:

- session recording is disabled by default.
- email/name are not sent unless `POSTHOG_IDENTIFY_PII_ENABLED=true`.
- UA mode can disable PostHog entirely.

- [ ] **Step 3: Run and verify failure**

Run: `bun run --cwd services/web-app test app/utils/posthog-client-config.test.ts`

Expected: FAIL until helper exists.

- [ ] **Step 4: Implement helper and root wiring**

Wire `root.tsx` to helper.

- [ ] **Step 5: Document posture**

State:

- Analytics is used for product improvement.
- Session recording is disabled by default for institutional deployments unless approved.
- Inputs are masked.
- PII identification is minimized.

- [ ] **Step 6: Commit**

Run:

```bash
git add services/web-app/app/root.tsx services/web-app/app/utils/env.server.ts services/web-app/app/utils/posthog-client-config.ts services/web-app/app/utils/posthog-client-config.test.ts docs/compliance/security/analytics-and-session-recording.md
git commit -m "fix: make analytics privacy posture vendor-safe"
```

## Task 17: Stop Unsanitized Production Data In Previews

**Files:**

- Modify: `.github/workflows/preview-environments.yml`
- Modify: `scripts/preview/deploy.sh`
- Modify: `docs/runbooks/preview.md`
- Create: `docs/compliance/security/preview-data-handling.md`
- Test: `scripts/preview/preview-env.test.js` or new script test.

- [ ] **Step 1: Write failing preview config test**

Assert default `PREVIEW_DB_DUMP_S3_URI` does not include `production.dump`.

- [ ] **Step 2: Run and verify failure**

Run: `bun test scripts/preview/preview-env.test.js`

Expected: FAIL if test checks current default.

- [ ] **Step 3: Implement sanitized default**

Change default to a sanitized fixture dump, for example:

```yaml
PREVIEW_DB_DUMP_S3_URI: ${{ vars.PREVIEW_DB_DUMP_S3_URI || 's3://yawp-preview-videos/sanitized-preview.dump' }}
```

In deploy script, print a warning and require explicit opt-in if URI includes `production.dump`:

```bash
if [[ "$DUMP_URI" == *"production.dump"* && "${ALLOW_UNSANITIZED_PREVIEW_DUMP:-false}" != "true" ]]; then
  echo "Refusing to restore production.dump into preview without ALLOW_UNSANITIZED_PREVIEW_DUMP=true" >&2
  exit 1
fi
```

- [ ] **Step 4: Document exception process**

`preview-data-handling.md` must state:

- sanitized fixture data is default,
- production data requires Bryant approval,
- access is time-limited,
- local dumps must be deleted after use,
- FERPA/PII risk is recorded.

- [ ] **Step 5: Run tests**

Run:

```bash
bun test scripts/preview/preview-env.test.js scripts/preview/render-compose.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add .github/workflows/preview-environments.yml scripts/preview/deploy.sh docs/runbooks/preview.md docs/compliance/security/preview-data-handling.md scripts/preview
git commit -m "fix: require sanitized data for previews"
```

## Task 18: Add Security Headers

**Files:**

- Modify: `services/web-app/app/root.tsx`
- Test: `services/web-app/app/root.test.tsx` or route header test.
- Create: `docs/compliance/security/security-headers.md`

- [ ] **Step 1: Write failing header test**

Assert root headers include:

- `Content-Security-Policy`
- `Strict-Transport-Security` in production
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy`
- `Permissions-Policy`
- `X-Frame-Options` or CSP `frame-ancestors`

- [ ] **Step 2: Run and verify failure**

Run: `bun run --cwd services/web-app test app/root.test.tsx`

Expected: FAIL until headers are added.

- [ ] **Step 3: Implement headers**

Add conservative CSP that supports current scripts/styles with nonce. Avoid breaking React Router runtime. Start with report-only if strict CSP breaks tests, then create follow-up to enforce.

- [ ] **Step 4: Run typecheck and smoke**

Run:

```bash
bun run --cwd services/web-app typecheck
bun run --cwd services/web-app playwright test --project=chromium e2e/tests/auth.signin.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add services/web-app/app/root.tsx services/web-app/app/root.test.tsx docs/compliance/security/security-headers.md
git commit -m "fix: add vendor-ready security headers"
```

## Task 19: Harden Infrastructure And Deployment Evidence

**Files:**

- Modify: `infra/main.tf`
- Modify: `.github/workflows/deploy.yml`
- Create: `docs/compliance/security/infrastructure-hardening.md`
- Create: `docs/compliance/security/deploy-change-management.md`
- Test: `scripts/deployment-contract.test.ts`
- Optional new tests: Terraform/static checks.

- [ ] **Step 1: Document current infrastructure posture**

Record:

- RDS private/encrypted, 7-day backups, `multi_az=false`, `skip_final_snapshot=true`.
- Bastion SSH currently open to `0.0.0.0/0`.
- ECR deploy uses mutable `latest`.
- GitHub deploy uses long-lived AWS keys.

- [ ] **Step 2: Plan Terraform changes behind variables**

Add variables:

```hcl
variable "bastion_allowed_cidr_blocks" {
  type = list(string)
  default = []
}

variable "rds_backup_retention_days" {
  type = number
  default = 14
}

variable "rds_deletion_protection" {
  type = bool
  default = true
}
```

Do not break existing deploy without applying env tfvars updates.

- [ ] **Step 3: Write static contract tests**

Extend `scripts/deployment-contract.test.ts` to assert deploy workflow uses immutable image tag or records commit SHA tag in addition to `latest`.

- [ ] **Step 4: Run tests**

Run:

```bash
bun test scripts/deployment-contract.test.ts
terraform -chdir=infra fmt -check
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add infra/main.tf infra/variables.tf .github/workflows/deploy.yml scripts/deployment-contract.test.ts docs/compliance/security/infrastructure-hardening.md docs/compliance/security/deploy-change-management.md
git commit -m "chore: document and start infrastructure hardening"
```

Human blocker: actually changing bastion CIDR, replacing SSH with SSM, enabling Multi-AZ, and changing production deploy identity may require AWS access and deployment coordination.

## Task 20: Add HECVAT-Lite And SOC 2 Readiness Packet

**Files:**

- Create: `docs/compliance/security/hecvat-lite-response.md`
- Create: `docs/compliance/security/soc2-readiness-control-matrix.md`
- Create: `docs/compliance/security/risk-register.md`
- Create: `docs/compliance/security/incident-response-plan.md`
- Create: `docs/compliance/security/backup-and-disaster-recovery.md`
- Create: `docs/compliance/security/access-control-review.md`
- Create: `docs/compliance/security/vendor-risk-management.md`
- Create: `docs/compliance/security/secure-sdlc.md`
- Create: `docs/compliance/security/vulnerability-management.md`
- Create: `docs/compliance/security/data-retention-and-deletion.md`

- [ ] **Step 1: Draft HECVAT-lite response**

Sections:

- Company/product overview.
- Data types collected.
- FERPA posture.
- Authentication/session controls.
- Authorization/tenant isolation.
- Encryption in transit/at rest.
- Logging/monitoring.
- AI providers and subprocessors.
- Analytics/subprocessors.
- Incident response.
- Backup/DR.
- Vulnerability management.
- Secure SDLC/change management.
- Accessibility cross-reference.

- [ ] **Step 2: Draft SOC 2 control matrix**

Use columns:

```markdown
| Control area | Current evidence | Gap | Implementation task | Operating evidence cadence |
|---|---|---|---|---|
```

Map to:

- Security
- Availability
- Confidentiality
- Privacy
- Processing integrity

- [ ] **Step 3: Draft operational policies**

Keep policies accurate to current operating state. Do not invent completed controls. Use "Current state", "Control target", and "Evidence to collect".

- [ ] **Step 4: Commit**

Run:

```bash
git add docs/compliance/security
git commit -m "docs: add HECVAT-lite and SOC 2 readiness packet"
```

## Task 21: Create Teacher's Lounge Media Accessibility Path

**Files:**

- Modify: `packages/prisma/schema.prisma`
- Add migration under `packages/prisma/migrations/`
- Modify: `services/web-app/app/routes/app.teacher-trainings.$id_.modules_.$moduleId/video-player.tsx`
- Modify: `services/web-app/app/routes/app.admin.teacher-trainings.$id_.modules_.$moduleId/route.tsx`
- Modify: `services/web-app/app/routes/app.admin.teacher-trainings.$id/route.tsx`
- Test: `services/web-app/e2e/tests/accessibility.teacher-lounge.spec.ts`
- Docs: `docs/compliance/accessibility/media-inventory.md`

- [ ] **Step 1: Write failing media test**

Assert:

```ts
await expect(page.locator('video track[kind="captions"]')).toHaveCount(1);
await expect(page.getByRole('link', { name: /transcript/i })).toBeVisible();
```

- [ ] **Step 2: Run and verify failure**

Run: `bun run --cwd services/web-app playwright test --project=chromium e2e/tests/accessibility.teacher-lounge.spec.ts`

Expected: FAIL because captions/transcripts are absent.

- [ ] **Step 3: Add nullable caption/transcript fields**

Add nullable fields to `TeacherTrainingModule`:

```prisma
captionS3Key String?
transcriptText String?
transcriptResourceId String?
```

Keep all fields nullable for backward compatibility.

- [ ] **Step 4: Render caption track and transcript**

In video player, render `<track kind="captions" src={captionUrl} srcLang="en" label="English" default />` when present.

On module page, show visible transcript text or transcript download link.

- [ ] **Step 5: Run tests**

Run:

```bash
bun prisma:generate
bun run --cwd services/web-app playwright test --project=chromium e2e/tests/accessibility.teacher-lounge.spec.ts
bun run --cwd services/web-app typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add packages/prisma/schema.prisma packages/prisma/migrations services/web-app/app/routes/app.teacher-trainings.$id_.modules_.$moduleId services/web-app/app/routes/app.admin.teacher-trainings.$id docs/compliance/accessibility/media-inventory.md services/web-app/e2e/tests/accessibility.teacher-lounge.spec.ts
git commit -m "feat: support captions and transcripts for teacher training videos"
```

## Task 22: Final UA Vendor Packet

**Files:**

- Create: `docs/compliance/ua-vendor-response-packet.md`
- Update: `docs/work/ua-accessibility-vendor-response.md`
- Update: all evidence docs as needed.

- [ ] **Step 1: Assemble packet**

Packet sections:

- Executive summary.
- Accessibility response with links to WCAG self-evaluation.
- Security/HECVAT-lite response.
- AI functionality and subprocessors.
- FERPA/data privacy posture.
- Known limitations and remediation dates.
- Platform access instructions, including the exact account role Bryant must create or approve for UA evaluators.
- Contact/support process.

- [ ] **Step 2: Run final verification commands**

Run:

```bash
git status --short
bun run --cwd services/web-app test
bun run --cwd services/web-app typecheck
bun run --cwd services/web-app playwright test --project=chromium e2e/tests/accessibility.public-pages.spec.ts e2e/tests/accessibility.ua-keyboard.spec.ts e2e/tests/accessibility.ua-semantics.spec.ts e2e/tests/accessibility.student-editor-tutor.spec.ts e2e/tests/accessibility.ua-zoom.spec.ts
bun run --cwd services/web-app test:e2e:smoke
```

If time permits before sending externally:

```bash
bun run --cwd services/web-app test:e2e:full
```

- [ ] **Step 3: Claim audit**

For each external claim in `ua-vendor-response-packet.md`, add an evidence link:

```markdown
Claim: Tutor chat announces new AI messages to screen readers.
Evidence: `services/web-app/e2e/tests/accessibility.ua-semantics.spec.ts`, screen reader log row SR-003.
```

If no evidence exists, lower the claim.

- [ ] **Step 4: Commit**

Run:

```bash
git add docs/compliance docs/work/ua-accessibility-vendor-response.md
git commit -m "docs: assemble UA vendor response packet"
```

## True Blockers

These block final external claims but not engineering progress:

- Bryant/legal must approve DPA/FERPA/subprocessor language.
- Bryant/legal/UA must approve OpenAI fallback if it remains available for UA.
- Bryant or a human tester must run at least one VoiceOver and one NVDA pass, or YAWP must contract an accessibility tester.
- Bryant must confirm the support inbox and SLA that UA can use.
- Bryant/UA must confirm whether Teacher's Lounge and tagged PDF exports are in initial scope.
- Bryant must create or approve UA evaluator account roles.
- AWS production changes requiring credentials or downtime must be coordinated by someone with environment access.

Everything else in this plan is agent-executable engineering or documentation.

## Final Self-Review Checklist

- [ ] No public claim says "fully accessible" unless every relevant WCAG criterion is supported by evidence.
- [ ] No VPAT/ACR is created unless Bryant explicitly asks for that artifact.
- [ ] No tagged PDF accessibility claim is made unless tagged PDF generation is implemented and verified.
- [ ] OpenAI fallback is disabled for UA unless approved.
- [ ] Raw LLM prompt/response logging is disabled by default.
- [ ] Every raw-ID API touched by tutor/comment/session/revision flows has cross-tenant tests.
- [ ] Every compliance doc distinguishes current state from target state.
- [ ] Every "Supports" WCAG status links to evidence.
- [ ] `git status --short` is clean after commits.
