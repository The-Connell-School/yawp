import { expect, test } from '../test-setup';
import type { Page, Response } from '@playwright/test';
import type { E2EContext } from '../seed-e2e';

/**
 * Two browsers in one shared draft.
 *
 * The collaborative page had no e2e coverage at all: convergence between two
 * clients had been demonstrated by hand and nothing held it. This is the spec
 * for the thing a group actually experiences — seeing each other write rather
 * than watching sentences appear from nowhere — and it exercises the whole
 * path, from a keystroke through the presence endpoint and the poll to a caret
 * drawn in someone else's browser.
 *
 * Timings are generous on purpose. The transport polls once a second by design,
 * so a second or two of lag is the feature working, not a flake.
 */

const CARET = '.collaboration-cursor__caret';
const CARET_LABEL = '.collaboration-cursor__label';
const SELECTION = '.collaboration-cursor__selection';
const EDITOR = '[data-testid="collab-editor-surface"] .ProseMirror';

/** Signs in on a page of our own rather than the fixture's shared one. */
async function signInOn(
  page: Page,
  email: string,
  password: string,
  classCode: string
) {
  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /log in/i }).click();
  await page.waitForURL(
    (url) => url.pathname.startsWith('/app') || url.pathname === '/enter-code',
    { timeout: 20000 }
  );
  if (new URL(page.url()).pathname === '/enter-code') {
    await page.locator('input[name="code"]').fill(classCode);
    await page.getByRole('button', { name: /continue/i }).click();
    await page.waitForURL('**/app**', { timeout: 20000 });
  }
}

async function openSharedDraft(page: Page, documentId: string) {
  await page.goto(`/app/collab-documents/${documentId}`);
  await page.waitForSelector(EDITOR, { state: 'visible', timeout: 20000 });
  // The surface renders before the room has loaded; it only becomes writable
  // once the provider reports live.
  await expect(page.locator(`${EDITOR}[contenteditable="true"]`)).toBeVisible({
    timeout: 20000,
  });
}

/**
 * Hovers a caret by its coordinates.
 *
 * `locator.hover()` waits for actionability on a two-pixel-wide element and can
 * sit there until the test times out. The caret is static once its writer stops
 * typing, so moving the mouse to the middle of its box is both simpler and what
 * a person does.
 */
async function hoverCaret(page: Page) {
  const box = await page.locator(CARET).first().boundingBox();
  if (!box) throw new Error('no caret to hover');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

/** Both writers, each in their own browser context with their own session. */
async function twoWriters(browser: any, ctx: E2EContext) {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const sam = await first.newPage();
  const riley = await second.newPage();

  await signInOn(sam, 'jdoe@brock.software', 'johndoe', ctx.classCode);
  await signInOn(
    riley,
    ctx.secondStudentEmail,
    ctx.secondStudentPassword,
    ctx.classCode
  );
  await openSharedDraft(sam, ctx.collabDocumentId);
  await openSharedDraft(riley, ctx.collabDocumentId);

  return {
    sam,
    riley,
    close: async () => {
      // Give each tab a normal route exit before closing its browser context.
      // A hard context close deliberately exercises the 15-second crash TTL;
      // leaving those rows behind would make the next test look like extra tabs
      // from the same writers are still open.
      await Promise.allSettled([
        sam.isClosed() ? Promise.resolve() : sam.goto('/app'),
        riley.isClosed() ? Promise.resolve() : riley.goto('/app'),
      ]);
      await new Promise((resolve) => setTimeout(resolve, 250));
      await first.close();
      await second.close();
    },
  };
}

test.describe('collaborative carets', () => {
  test.setTimeout(120_000);

  test("a writer sees their teammate's caret, named", async ({
    browser,
    e2eContext,
  }) => {
    const { sam, riley, close } = await twoWriters(browser, e2eContext);

    try {
      await sam.locator(EDITOR).click();
      const startedAt = Date.now();
      await sam.locator(EDITOR).pressSequentially('We start here.', {
        delay: 30,
      });

      // The text arrives — the part that already worked.
      await expect(riley.locator(EDITOR)).toContainText('We start here.', {
        timeout: 20000,
      });
      const observedLatencyMs = Date.now() - startedAt;
      expect(observedLatencyMs).toBeLessThan(3000);
      console.log(`collaboration-latency-ms=${observedLatencyMs}`);
      test.info().annotations.push({
        type: 'collaboration-latency-ms',
        description: String(observedLatencyMs),
      });

      // And now so does the person writing it.
      const caret = riley.locator(CARET).first();
      await expect(caret).toBeVisible({ timeout: 20000 });

      // The name stays visible, like Google Docs, rather than requiring a
      // precision hover over a two-pixel caret.
      const label = caret.locator(CARET_LABEL);
      await expect(label).not.toHaveCSS('opacity', '0');
      await expect(label).toHaveText('John Doe');

      await expect(
        riley.locator(
          `[data-membership-id="${e2eContext.membershipId}"][data-presence-status="editing"]`
        )
      ).toBeVisible();

      // Sam sees no caret of his own: y-prosemirror filters out the local
      // client, so nobody watches their own cursor duplicated.
      await expect(sam.locator(CARET)).toHaveCount(0);
    } finally {
      await close();
    }
  });

  test('a teammate selection is visible, not only their insertion point', async ({
    browser,
    e2eContext,
  }) => {
    const { sam, riley, close } = await twoWriters(browser, e2eContext);

    try {
      await sam.locator(EDITOR).click();
      await sam.locator(EDITOR).pressSequentially('Select these words', {
        delay: 20,
      });
      await expect(riley.locator(EDITOR)).toContainText('Select these words', {
        timeout: 20000,
      });
      await sam.locator(EDITOR).press('Shift+ArrowLeft');
      await sam.locator(EDITOR).press('Shift+ArrowLeft');
      await sam.locator(EDITOR).press('Shift+ArrowLeft');

      await expect(riley.locator(SELECTION).first()).toBeVisible({
        timeout: 20000,
      });
    } finally {
      await close();
    }
  });

  test('the roster distinguishes a background tab from an offline teammate', async ({
    browser,
    e2eContext,
  }) => {
    const { sam, riley, close } = await twoWriters(browser, e2eContext);
    const samPresence = riley.locator(
      `[data-membership-id="${e2eContext.membershipId}"]`
    );

    try {
      await expect(samPresence).not.toHaveAttribute(
        'data-presence-status',
        'offline',
        { timeout: 20000 }
      );

      await sam.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          value: 'hidden',
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await expect(samPresence).toHaveAttribute(
        'data-presence-status',
        'background',
        { timeout: 20000 }
      );

      await sam.goto('/app');
      await expect(samPresence).toHaveAttribute(
        'data-presence-status',
        'offline',
        { timeout: 20000 }
      );
    } finally {
      await close();
    }
  });

  test("a caret is the colour of its owner's initials in the header", async ({
    browser,
    e2eContext,
  }) => {
    // One colour, one person, on every surface. The scale is a function of the
    // ordered member list, so this fails the moment two queries order the
    // roster differently — which is exactly what it is here to catch.
    const { sam, riley, close } = await twoWriters(browser, e2eContext);

    try {
      await sam.locator(EDITOR).click();
      await sam
        .locator(EDITOR)
        .pressSequentially('Colour check.', { delay: 30 });

      await expect(riley.locator(CARET).first()).toBeVisible({
        timeout: 20000,
      });
      await hoverCaret(riley);
      const label = riley.locator(CARET_LABEL).first();
      await expect(label).toHaveCSS('opacity', '1');

      const caretColour = await label.evaluate(
        (node: Element) => getComputedStyle(node).backgroundColor
      );
      const avatarColour = await riley
        .getByRole('listitem')
        .filter({ hasText: 'JD' })
        .first()
        .evaluate((node: Element) => getComputedStyle(node).backgroundColor);

      expect(caretColour).toBe(avatarColour);
    } finally {
      await close();
    }
  });

  test('a caret goes when its writer closes the draft', async ({
    browser,
    e2eContext,
  }) => {
    // The goodbye a closing tab sends. Without it the caret would sit in the
    // margin until the presence TTL expired it.
    const { sam, riley, close } = await twoWriters(browser, e2eContext);

    try {
      await sam.locator(EDITOR).click();
      await sam
        .locator(EDITOR)
        .pressSequentially('Leaving soon.', { delay: 30 });
      await expect(riley.locator(CARET).first()).toBeVisible({
        timeout: 20000,
      });

      const leavingAt = Date.now();
      await sam.goto('/app');

      await expect(riley.locator(CARET)).toHaveCount(0, { timeout: 20000 });
      await expect(
        riley.locator(`[data-membership-id="${e2eContext.membershipId}"]`)
      ).toHaveAttribute('data-presence-status', 'offline');
      expect(Date.now() - leavingAt).toBeLessThan(3000);
    } finally {
      await close();
    }
  });

  test('a writer can submit an assignment-owned shared draft', async ({
    browser,
    e2eContext,
  }) => {
    const { sam, close } = await twoWriters(browser, e2eContext);

    try {
      const roomUpdate = sam.waitForResponse(
        (response: Response) =>
          response.request().method() === 'POST' &&
          response.url().includes(`/api/collab/${e2eContext.collabDocumentId}/updates`) &&
          response.ok()
      );
      await sam.locator(EDITOR).click();
      await sam
        .locator(EDITOR)
        .pressSequentially('Ready for group submission.', { delay: 20 });
      await roomUpdate;

      const submitResponse = sam.waitForResponse(
        (response: Response) =>
          response.request().method() === 'POST' &&
          response.url().includes(
            `/api/collab/${e2eContext.collabDocumentId}/submit`
          )
      );
      await sam.getByRole('button', { name: 'Submit', exact: true }).click();

      const response = await submitResponse;
      expect(response.status()).toBe(200);
      await expect(
        sam.getByRole('button', { name: 'Submitted', exact: true })
      ).toBeVisible();
    } finally {
      await close();
    }
  });
});

test.describe('students cannot start their own shared drafts', () => {
  test.setTimeout(60_000);

  test('the course page offers no way to write with a classmate', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    // The kind of writing is in the collaboration pilot, so this is the page
    // that used to carry the link. Hidden, not removed — the route behind it is
    // still built and still tested.
    await signIn('jdoe@brock.software', 'johndoe');
    await page.goto(
      `/app/assignment-types/${e2eContext.collabAssignmentTypeId}`
    );
    await page.waitForLoadState('networkidle');

    // Prove we are on the page before proving something is missing from it. The
    // first version of this test did not, and passed while the loader was
    // bouncing the student back to the dashboard with "Assignment type not
    // found" — an absent link is trivially absent on a page that never rendered.
    await expect(
      page.getByRole('heading', { name: 'E2E Group Writing' })
    ).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`/app/assignment-types/${e2eContext.collabAssignmentTypeId}`)
    );

    await expect(
      page.getByRole('link', { name: /write with a classmate/i })
    ).toHaveCount(0);
  });

  test('the page itself answers as though it does not exist', async ({
    page,
    signIn,
  }) => {
    // Hiding the links is not the gate. A student who kept the URL gets the
    // same answer a teacher does.
    await signIn('jdoe@brock.software', 'johndoe');
    const response = await page.goto('/app/shared-drafts/new');

    expect(response?.status()).toBe(404);
  });
});
