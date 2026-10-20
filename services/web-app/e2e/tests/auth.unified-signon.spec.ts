import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { signonFixtures } from '../fixtures/unified-signon/states';

const evidence = process.env.SIGNON_EVIDENCE_DIR;

for (const width of [1280, 390]) {
  test(`unified typography uses the system sans token after fonts load at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
    for (const state of [
      'entry',
      'entry-invalid-email',
      'password',
      'account-type',
      'email-code',
      'trial',
      'membership',
    ]) {
      await page.goto(`/e2e/fixtures/unified-signon/index.html?state=${state}`);
      await expect(page.locator('.unified-signon')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const typography = await page.evaluate(() => {
        const shell = document.querySelector('.auth-page-shell')!;
        const probe = document.createElement('span');
        probe.style.fontFamily = 'var(--font-sans)';
        shell.append(probe);
        const expected = getComputedStyle(probe).fontFamily;
        const heading = shell.querySelector('h1')!;
        // V2 signon-03/04 uses this stack and 18px / 600 / 1.35 heading.
        // Measure wrapping with the same OS fonts rather than assuming a PNG's font installation.
        probe.textContent = heading.textContent;
        probe.style.cssText = `position: absolute; visibility: hidden; display: block; width: ${heading.getBoundingClientRect().width}px; font: 600 18px/1.35 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;`;
        const referenceHeight = probe.getBoundingClientRect().height;
        probe.remove();
        return {
          referenceHeight,
          expected,
          elements: [
            ...shell.querySelectorAll(
              '.unified-signon h1, .unified-signon p, .unified-signon label, .unified-signon input, .unified-signon button, .unified-signon a'
            ),
          ].map((element) => ({
            text: element.textContent,
            isCode: element.getAttribute('autocomplete') === 'one-time-code',
            font: getComputedStyle(element).fontFamily,
          })),
          headingWeight: getComputedStyle(shell.querySelector('h1')!)
            .fontWeight,
          headingHeight: shell.querySelector('h1')!.getBoundingClientRect()
            .height,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      expect(typography.expected).toMatch(/^ui-sans-serif, system-ui,/);
      for (const element of typography.elements) {
        if (element.isCode) {
          expect(element.font).toMatch(/^ui-monospace,/);
        } else {
          expect(element.font, `${state}: ${element.text}`).toBe(
            typography.expected
          );
        }
      }
      expect(typography.headingWeight).toBe('600');
      expect(typography.overflow).toBe(false);
      expect(typography.headingHeight).toBeCloseTo(
        typography.referenceHeight,
        1
      );
      if (evidence) {
        fs.mkdirSync(evidence, { recursive: true });
        fs.appendFileSync(
          path.join(evidence, 'typography.jsonl'),
          JSON.stringify({ state, width, ...typography }) + '\n'
        );
      }
    }
  });
}

for (const width of [1280, 390]) {
  test(`choice cards match artboard copy, geometry and keyboard paths at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
    for (const [state, labels] of [
      [
        'account-type',
        [
          "I'm a student I have a class code",
          "I'm a teacher Start or check a free trial",
        ],
      ],
      [
        'class-found',
        [
          "I'm new to YAWP Create an account",
          'I already have an account Sign in to join',
        ],
      ],
      [
        'class-found-ambiguity',
        [
          "Yes, it's a class code Join [English 11, Period 2]",
          "No, it's my handle Sign in as @eng-11x",
        ],
      ],
    ] as const) {
      await page.goto(`/e2e/fixtures/unified-signon/index.html?state=${state}`);
      const choices = page.locator('.signon-choice');
      await expect(choices).toHaveCount(2);
      for (const [i, label] of labels.entries()) {
        const choice = choices.nth(i);
        await expect(choice).toHaveAccessibleName(label);
        await expect(choice).toHaveCSS(
          'background-color',
          'rgb(255, 255, 255)'
        );
        await expect(choice).toHaveCSS(
          'border-top',
          '1px solid rgb(177, 175, 163)'
        );
        await expect(choice).toHaveCSS('padding', '16px 16px 16px 18px');
        await expect(choice).toHaveCSS('flex-direction', 'row');
        await expect(choice).toHaveCSS('gap', '14px');
        const copy = choice.locator('.signon-choice-copy');
        await expect(copy).toHaveCSS('gap', '2px');
        await expect(copy.locator('strong')).toHaveCSS('font-size', '16px');
        await expect(copy.locator('strong')).toHaveCSS('font-weight', '600');
        await expect(copy.locator('strong')).toHaveCSS('line-height', '22px');
        await expect(copy.locator('span')).toHaveCSS('font-size', '14px');
        await expect(copy.locator('span')).toHaveCSS('line-height', '20.3px');
        const chevron = choice.locator('svg');
        await expect(chevron).toHaveAttribute('aria-hidden', 'true');
        await expect(chevron).toHaveCSS('width', '18px');
        await expect(chevron).toHaveCSS('height', '18px');
        const textBox = (await copy.boundingBox())!;
        const iconBox = (await chevron.boundingBox())!;
        expect(iconBox.x - textBox.x - textBox.width).toBeCloseTo(14, 0);
        expect(iconBox.y + iconBox.height / 2).toBeCloseTo(
          textBox.y + textBox.height / 2,
          0
        );
      }
      await choices.first().focus();
      await page.keyboard.press('Tab');
      await expect(choices.last()).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('[data-signon-screen]')).toHaveAttribute(
        'data-signon-screen',
        state === 'account-type'
          ? 'teacher'
          : state === 'class-found'
            ? 'class-signin'
            : 'password'
      );
      expect(await page.context().cookies()).toEqual([]);
    }
  });
}

for (const width of [1280, 390]) {
  test(`every artboard state is accessible and responsive at ${width}`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
    const artboards = process.env.SIGNON_ARTBOARDS?.split(',');
    for (const fixture of signonFixtures.filter(
      (f) => !artboards || artboards.includes(f.artboard)
    )) {
      await page.goto(
        `/e2e/fixtures/unified-signon/index.html?state=${fixture.id}`
      );
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        fixture.title
      );
      await expect(page.locator('[data-signon-screen]')).toHaveAttribute(
        'data-signon-screen',
        fixture.state.screen
      );
      await expect(
        page.getByRole('link', { name: 'Terms', exact: true })
      ).toBeVisible();
      for (const copy of [
        fixture.state.error,
        fixture.state.notice,
        ...Object.values(fixture.state.fieldErrors ?? {}),
      ]) {
        if (copy)
          await expect(page.getByText(copy, { exact: true })).toBeVisible();
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true);
      await page.evaluate(() => document.fonts.ready);
      if (fixture.id === 'entry-focus')
        await page.getByLabel('Email, handle, or class code').focus();
      if (evidence) {
        fs.mkdirSync(evidence, { recursive: true });
        const filename = `${fixture.artboard}-${fixture.id}-${width}-impl.png`;
        await page.screenshot({
          path: path.join(evidence, filename),
          fullPage: true,
        });
        fs.appendFileSync(
          path.join(evidence, 'manifest.jsonl'),
          JSON.stringify({ ...fixture, width, filename }) + '\n'
        );
      }
    }
  });
}

test('entry validation, pending, back, safe redirect, Google unset, and handle ambiguity', async ({
  page,
}) => {
  await page.goto(
    '/e2e/fixtures/unified-signon/index.html?state=entry&google=unset&redirectTo=%2Fapp%2Fmy-classes'
  );
  const input = page.getByLabel('Email, handle, or class code');
  await expect(
    page.getByRole('button', { name: 'Continue with Google' })
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('Enter your email or handle.')).toBeVisible();
  await input.fill('bad@');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(
    page.getByText('That email looks incomplete. Check it and try again.')
  ).toBeVisible();
  await input.fill('ENG-11X');
  await input.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Continuing…' })
  ).toBeDisabled();
  await expect(
    page.getByRole('heading', { name: 'Is ENG-11X a class code?' })
  ).toBeVisible();
  await page.getByRole('button', { name: /No, it's my handle/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Enter your password' })
  ).toBeVisible();
  await expect(page.locator('input[name=redirectTo]')).toHaveValue(
    '/app/my-classes'
  );
  await page.getByRole('button', { name: 'Use a different account' }).click();
  await expect(
    page.getByLabel('Email or handle', { exact: true })
  ).toBeVisible();
});

test('class choice and account-type paths keep join context without server effects', async ({
  page,
}) => {
  const calls: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') calls.push(request.url());
  });
  await page.goto('/e2e/fixtures/unified-signon/index.html?state=class-found');
  await page.getByRole('button', { name: "I'm new to YAWP" }).click();
  await expect(
    page.getByRole('heading', { name: 'Create your account' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Join your class' })
  ).toBeVisible();
  expect(calls).toEqual([]);
});

test('OTP retry and membership selection are fixture responses only', async ({
  page,
}) => {
  await page.goto('/e2e/fixtures/unified-signon/index.html?state=email-code');
  await page.getByRole('button', { name: 'Resend code', exact: true }).click();
  await expect(page.getByText('New code sent. Check spam too.')).toBeVisible();
  await page.getByLabel('Code', { exact: true }).fill('000000');
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(
    page.getByText(
      "That code isn't right. Use the one from our most recent email."
    )
  ).toBeVisible();
  await page.goto('/e2e/fixtures/unified-signon/index.html?state=membership');
  await page.getByRole('button', { name: /Summer Writing Lab/ }).click();
  await expect(page.getByRole('heading', { name: "You're in!" })).toBeVisible();
  expect(await page.context().cookies()).toEqual([]);
});

test('throttled controls recover after the stated retry time', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto(
    '/e2e/fixtures/unified-signon/index.html?state=entry-throttled'
  );
  const button = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(button).toBeDisabled();
  await page.clock.fastForward(300_000);
  await expect(button).toBeEnabled();
});

test('configured Google cancellation and safe destinations stay local', async ({
  page,
}) => {
  await page.goto(
    '/e2e/fixtures/unified-signon/index.html?state=entry-default'
  );
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(
    page.getByText(
      'Google sign-in was cancelled. Try again, or use your email below.'
    )
  ).toBeVisible();
  await page.goto(
    '/e2e/fixtures/unified-signon/index.html?state=joined&redirectTo=https%3A%2F%2Fevil.example'
  );
  await expect(
    page.getByRole('link', { name: 'Go to my class' })
  ).toHaveAttribute('href', '/app');
  expect(await page.context().cookies()).toEqual([]);
});

for (const mode of ['handle', 'email']) {
  test(`class ${mode} signup keeps its mode and context after sign-in`, async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET') requests.push(request.url());
    });
    await page.goto(
      `/e2e/fixtures/unified-signon/index.html?state=class-found${mode === 'email' ? '-email' : ''}&redirectTo=%2Fapp%2Fmy-classes`
    );
    await page.getByRole('button', { name: "I'm new to YAWP" }).click();
    const target = mode === 'email' ? 'class-email' : 'class-handle';
    await expect(page.locator('[data-signon-screen]')).toHaveAttribute(
      'data-signon-screen',
      target
    );
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page
      .getByRole('button', { name: 'I already have an account' })
      .click();
    await page
      .getByRole('button', { name: 'New to YAWP!? Create an account' })
      .click();
    await expect(page.locator('[data-signon-screen]')).toHaveAttribute(
      'data-signon-screen',
      target
    );
    await expect(
      page.getByText('[English 11, Period 2]', { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText('[Ms. Okafor] · [Lincoln High School]', { exact: true })
    ).toBeVisible();
    await expect(page.locator('input[name=redirectTo]')).toHaveValue(
      '/app/my-classes'
    );
    await expect(
      page.getByLabel(mode === 'email' ? 'School email' : 'Handle', {
        exact: true,
      })
    ).toBeVisible();
    expect(requests).toEqual([]);
    expect(await page.context().cookies()).toEqual([]);
  });
}

test('expired fixture code can be resent and then verified without server effects', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') requests.push(request.url());
  });
  await page.goto(
    '/e2e/fixtures/unified-signon/index.html?state=email-code-expired'
  );
  await page
    .getByRole('button', { name: 'Send a new code', exact: true })
    .click();
  await expect(page.getByText('New code sent. Check spam too.')).toBeVisible();
  await expect(
    page.getByText('That code has expired. Send yourself a new one.')
  ).toHaveCount(0);
  await page.getByLabel('Code', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(page.locator('[data-signon-screen]')).toHaveAttribute(
    'data-signon-screen',
    'name-password'
  );
  expect(requests).toEqual([]);
  expect(await page.context().cookies()).toEqual([]);
});

for (const width of [1280, 390]) {
  test(`status badges and class summaries match artboards at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
    for (const fixture of signonFixtures.filter((f) =>
      ['trial-status', 'inactive', 'joined'].includes(f.state.screen)
    )) {
      await page.goto(
        `/e2e/fixtures/unified-signon/index.html?state=${fixture.id}`
      );
      const badge = page.locator('.signon-status-badge');
      await expect(badge).toHaveCSS('width', '40px');
      await expect(badge).toHaveCSS('height', '40px');
      await expect(badge).toHaveCSS('background-color', 'rgb(230, 226, 214)');
      const icon = badge.locator('svg');
      await expect(icon).toHaveAttribute('width', '22');
      await expect(icon).toHaveAttribute('height', '22');
      const variant = fixture.state.variant;
      if (fixture.state.screen === 'inactive' && variant === 'staff') {
        const logout = page.locator('.signon-card form');
        await expect(logout).toHaveAttribute('action', '/auth/logout');
        await expect(logout).toHaveAttribute('method', 'post');
        await expect(
          logout.getByRole('button', { name: 'Sign out' })
        ).toHaveClass(/signon-primary/);
      }
      const expectedIcon =
        fixture.state.screen === 'joined'
          ? 'circle-check'
          : fixture.state.screen === 'inactive' ||
              ['rejected', 'expired'].includes(variant ?? '')
            ? 'info'
            : variant === 'invited'
              ? 'mail'
              : 'clock';
      await expect(icon).toHaveClass(new RegExp(`lucide-${expectedIcon}`));
      const badgeBox = (await badge.boundingBox())!;
      const titleBox = (await page
        .getByRole('heading', { level: 1 })
        .boundingBox())!;
      expect(titleBox.y - badgeBox.y - badgeBox.height).toBeCloseTo(8, 0);
      const copy = page.locator(
        '.signon-card > .mt-6 > .signon-fields > .signon-copy'
      );
      if (await copy.count()) {
        const copyBox = (await copy.boundingBox())!;
        expect(copyBox.y - titleBox.y - titleBox.height).toBeCloseTo(8, 0);
        const form = page.locator('.signon-card form');
        if (await form.count()) {
          const formBox = (await form.boundingBox())!;
          expect(formBox.y - copyBox.y - copyBox.height).toBeCloseTo(24, 0);
        } else {
          const cardBox = (await page.locator('.signon-card').boundingBox())!;
          expect(
            cardBox.y + cardBox.height - copyBox.y - copyBox.height
          ).toBeCloseTo(24, 0);
        }
      }
    }
    for (const state of [
      'class-found',
      'class-handle',
      'class-email',
      'class-signin',
      'joined',
      'handle-join',
      'name-password',
    ]) {
      await page.goto(`/e2e/fixtures/unified-signon/index.html?state=${state}`);
      const summary = page.locator('.signon-class');
      await expect(summary).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await expect(summary).toHaveCSS(
        'border-top',
        '1px solid rgb(214, 213, 207)'
      );
      await expect(summary).toHaveCSS('padding', '12px 14px');
      await expect(summary).toHaveCSS('gap', '2px');
      await expect(summary.locator('strong')).toHaveCSS('line-height', '20px');
      await expect(summary.locator('span')).toHaveCSS('line-height', '18px');
    }
  });

  test(`email and membership design geometry at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
    await page.goto('/e2e/fixtures/unified-signon/index.html?state=email-code');
    await expect(page.locator('.signon-email-badge')).toHaveCSS(
      'width',
      '40px'
    );
    await expect(page.locator('.signon-email-badge')).toHaveCSS(
      'height',
      '40px'
    );
    await expect(page.getByLabel('Code', { exact: true })).toHaveCSS(
      'font-size',
      '18px'
    );
    await expect(page.getByLabel('Code', { exact: true })).toHaveCSS(
      'letter-spacing',
      '3.24px'
    );
    await page.goto('/e2e/fixtures/unified-signon/index.html?state=membership');
    const rows = page
      .getByRole('group', { name: 'Choose organization and role' })
      .getByRole('button');
    await expect(rows).toHaveCount(3);
    for (const row of await rows.all()) {
      const name = await row.locator('.signon-membership-name').boundingBox();
      const role = await row.locator('.signon-membership-role').boundingBox();
      const chevron = await row.locator('svg').boundingBox();
      expect(name!.x + name!.width).toBeLessThanOrEqual(role!.x);
      expect(role!.x + role!.width).toBeLessThanOrEqual(chevron!.x);
      await expect(row).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    }
    await rows.first().focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', { name: "You're in!" })
    ).toBeVisible();
  });
}
