# Login Page Brand Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh `/auth/login` with the approved conservative C+ brand direction while preserving existing authentication behavior.

**Architecture:** Keep the existing React Router route, loader, action, RVF form, and account links. Add a Playwright visual contract first, then update only the login route markup and page-scoped CSS classes in `app.css`; do not change global app tokens in this pass.

**Tech Stack:** React Router v7, TypeScript, RVF, Tailwind CSS plus existing `app.css`, Playwright

**Spec:** `docs/superpowers/specs/2026-05-26-login-page-brand-refresh-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `services/web-app/e2e/tests/auth.signin.spec.ts` | Modify | Add visual contract coverage for `/auth/login` before implementation |
| `services/web-app/app/routes/auth.login/route.tsx` | Modify | Keep auth logic, replace centered default markup with C+ login surface semantics |
| `services/web-app/app/app.css` | Modify | Add page-scoped `.yawp-login-*` styles for typography, surfaces, inputs, and buttons |

---

### Task 1: Add Failing Login Refresh E2E Contract

**Files:**
- Modify: `services/web-app/e2e/tests/auth.signin.spec.ts`

- [ ] **Step 1: Add the failing visual contract test**

Append this test inside the existing `Authentication - real sign in` describe block, before the real sign-in test or after it:

```ts
  test('shows the conservative C+ login brand refresh', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/auth/login');

    const shell = page.getByTestId('login-page');
    const panel = page.getByTestId('login-panel');
    const heading = page.getByRole('heading', { name: 'Welcome back' });
    const email = page.getByLabel('Email');
    const password = page.getByLabel('Password');
    const submit = page.getByRole('button', { name: /^log in$/i });
    const createAccount = page.getByRole('link', { name: /create account/i });

    await expect(shell).toBeVisible();
    await expect(panel).toBeVisible();
    await expect(heading).toBeVisible();
    await expect(email).toBeVisible();
    await expect(password).toBeVisible();
    await expect(page.getByRole('link', { name: /forgot password/i })).toBeVisible();
    await expect(submit).toBeVisible();
    await expect(createAccount).toBeVisible();

    await expect(shell).toHaveCSS('background-color', 'rgb(248, 241, 230)');
    await expect(panel).toHaveCSS('background-color', 'rgb(255, 253, 248)');
    await expect(submit).toHaveCSS('border-radius', '8px');
    await expect(email).toHaveCSS('border-radius', '8px');

    const headingFont = await heading.evaluate(
      (element) => window.getComputedStyle(element).fontFamily
    );
    expect(headingFont.toLowerCase()).toContain('cormorant');

    const submitBackground = await submit.evaluate(
      (element) => window.getComputedStyle(element).backgroundColor
    );
    const secondaryBackground = await createAccount.evaluate(
      (element) => window.getComputedStyle(element).backgroundColor
    );
    expect(submitBackground).toBe('rgb(191, 98, 68)');
    expect(secondaryBackground).not.toBe(submitBackground);
  });
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
cd services/web-app
bunx playwright test --project=chromium e2e/tests/auth.signin.spec.ts -g "conservative C\\+ login brand refresh"
```

Expected: FAIL because `data-testid="login-page"` and the C+ styling do not exist yet.

---

### Task 2: Implement C+ Login Markup and Page-Scoped Styles

**Files:**
- Modify: `services/web-app/app/routes/auth.login/route.tsx`
- Modify: `services/web-app/app/app.css`

- [ ] **Step 1: Update route markup without changing auth logic**

Replace only the JSX returned by `LoginPage`. Keep the existing imports, loader, action, form schema, `redirectTo`, `fetcher`, `isLoading`, and `useForm` behavior. The returned JSX should be:

```tsx
  return (
    <main className="yawp-login-page" data-testid="login-page">
      <section className="yawp-login-panel" data-testid="login-panel">
        <div className="yawp-login-brand">
          <img src="/img/logo_for_light_mode.png" alt="YAWP!" />
        </div>
        <div className="yawp-login-heading">
          <p>Account access</p>
          <h1>Welcome back</h1>
          <span>Continue to your YAWP workspace.</span>
        </div>
        <Form {...form.getFormProps()} className="yawp-login-form">
          <input type="hidden" name="redirectTo" value={redirectTo ?? ''} />
          <FormInput
            scope={form.scope('email')}
            type="email"
            label="Email"
            autoComplete="email"
          />
          <FormInput
            scope={form.scope('password')}
            type="password"
            label="Password"
            autoComplete="current-password"
          />
          <div className="yawp-login-forgot">
            <Link to="/auth/inv/forgot-password">Forgot password?</Link>
          </div>
          <Button
            className="yawp-login-submit"
            type="submit"
            isLoading={isLoading}
          >
            Log in
          </Button>
        </Form>
        <div className="yawp-login-secondary">
          <p>New to YAWP?</p>
          <Link
            className="yawp-login-create"
            to={
              redirectTo
                ? `/auth/inv/signup?${encodeURIComponent(redirectTo)}`
                : '/auth/inv/signup'
            }
          >
            Create account <ArrowRightIcon aria-hidden="true" />
          </Link>
        </div>
      </section>
    </main>
  );
```

- [ ] **Step 2: Remove unused button helper import**

After the JSX change, remove `button` from the UI button import so it reads:

```ts
import { Button } from '~/components/ui/button';
```

- [ ] **Step 3: Add page-scoped CSS**

Add these styles near the existing public/login page CSS in `services/web-app/app/app.css`:

```css
.yawp-login-page {
  align-items: center;
  background-color: #f8f1e6;
  color: #241f19;
  display: flex;
  justify-content: center;
  min-height: 100dvh;
  padding: 32px 18px;
}

.yawp-login-panel {
  background: #fffdf8;
  border: 1px solid rgba(36, 31, 25, 0.12);
  border-radius: 16px;
  box-shadow: 0 22px 58px rgba(48, 37, 25, 0.12);
  max-width: 386px;
  padding: 30px;
  width: 100%;
}

.yawp-login-brand {
  display: grid;
  place-items: center;
}

.yawp-login-brand img {
  border-radius: 999px;
  box-shadow: 0 1px 0 rgba(36, 31, 25, 0.08);
  height: 68px;
  object-fit: cover;
  width: 68px;
}

.yawp-login-heading {
  margin-top: 22px;
  text-align: center;
}

.yawp-login-heading p {
  color: #a9563d;
  font-size: 12px;
  font-weight: 750;
  letter-spacing: 0.08em;
  line-height: 1.5;
  margin: 0;
  text-transform: uppercase;
}

.yawp-login-heading h1 {
  color: #241f19;
  font-family: 'Cormorant Garamond', adobe-garamond-pro, Garamond, Georgia,
    serif;
  font-size: 38px;
  font-weight: 600;
  letter-spacing: 0;
  margin: 8px 0 0;
}

.yawp-login-heading span {
  color: #5f5750;
  display: block;
  font-size: 15px;
  line-height: 1.45;
  margin-top: 6px;
}

.yawp-login-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 26px;
}

.yawp-login-form label {
  color: #3f3933;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.4;
}

.yawp-login-form input:not([type='hidden']) {
  background-color: #ffffff;
  border-color: #d6ccbf;
  border-radius: 8px;
  color: #241f19;
  font-size: 16px;
  height: 46px;
}

.yawp-login-form input:not([type='hidden']):focus-visible {
  box-shadow: inset 0 0 0 1px #bf6244;
}

.yawp-login-forgot {
  display: flex;
  justify-content: flex-end;
  margin-top: -2px;
}

.yawp-login-forgot a {
  color: #a9563d;
  font-size: 13px;
  font-weight: 650;
  text-decoration: none;
}

.yawp-login-forgot a:hover {
  text-decoration: underline;
  text-underline-offset: 4px;
}

.yawp-login-submit {
  background-color: #bf6244;
  border-radius: 8px;
  color: #ffffff;
  height: 44px;
  margin-top: 2px;
}

.yawp-login-submit:hover {
  background-color: #aa563c;
}

.yawp-login-secondary {
  border-top: 1px solid rgba(36, 31, 25, 0.1);
  margin-top: 22px;
  padding-top: 18px;
}

.yawp-login-secondary p {
  color: #5f5750;
  font-size: 14px;
  line-height: 1.4;
  margin: 0;
  text-align: center;
}

.yawp-login-create {
  align-items: center;
  background-color: #f5eee6;
  border-radius: 8px;
  color: #66473b;
  display: flex;
  font-size: 14px;
  font-weight: 700;
  gap: 8px;
  height: 40px;
  justify-content: center;
  margin-top: 10px;
  text-decoration: none;
  width: 100%;
}

.yawp-login-create:hover {
  background-color: #efe3d6;
}

.yawp-login-create svg {
  height: 16px;
  width: 16px;
}

@media (max-width: 480px) {
  .yawp-login-page {
    align-items: stretch;
    padding: 18px;
  }

  .yawp-login-panel {
    align-self: center;
    padding: 26px 20px;
  }
}
```

- [ ] **Step 4: Run the new test and verify GREEN**

Run:

```bash
cd services/web-app
bunx playwright test --project=chromium e2e/tests/auth.signin.spec.ts -g "conservative C\\+ login brand refresh"
```

Expected: PASS.

---

### Task 3: Verify Auth Flow and Responsive Rendering

**Files:**
- No new files

- [ ] **Step 1: Run the auth e2e file**

Run:

```bash
cd services/web-app
bunx playwright test --project=chromium e2e/tests/auth.signin.spec.ts
```

Expected: both the visual contract and real sign-in test pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
cd services/web-app
bun run typecheck
```

Expected: typecheck exits 0.

- [ ] **Step 3: Capture browser screenshots for desktop and mobile**

Start the dev server if Playwright's web server is not already running:

```bash
cd services/web-app
bun run dev -- --port 5176 --host 127.0.0.1
```

Then inspect `/auth/login` at desktop and mobile widths. The page should show a compact centered panel, no text overlap, visible labels, and one visually dominant primary action.

---

## Self-Review

- Spec coverage: the plan covers the approved C+ direction, auth behavior preservation, page-scoped styles, button hierarchy, input styling, typography, and e2e-first verification.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: the new test IDs match the planned JSX; the CSS class names match the planned markup.

