import { test, expect } from '../test-setup';
import { EDITOR_SELECTOR } from '../test-helpers';
import { createE2EPrismaClient } from '../prisma-client';
import {
  invalidateUserSessions,
} from '../db-helpers';

const PASTE_SHORTCUT = process.platform === 'darwin' ? 'Meta+V' : 'Control+V';
const SELECT_ALL_SHORTCUT = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';
const COPY_SHORTCUT = process.platform === 'darwin' ? 'Meta+C' : 'Control+C';
const CUT_SHORTCUT = process.platform === 'darwin' ? 'Meta+X' : 'Control+X';

async function expectExitControlVisible(page: import('@playwright/test').Page) {
  const exitButton = page.getByRole('button', { name: /^exit$/i });
  if ((await exitButton.count()) > 0) {
    await expect(exitButton.first()).toBeVisible({ timeout: 10000 });
    return;
  }

  const backToClass = page.getByTestId('document-exit-button');
  if ((await backToClass.count()) > 0) {
    await expect(backToClass.first()).toBeVisible({ timeout: 10000 });
    return;
  }

  await expect(page.getByRole('link', { name: /^exit$/i }).first()).toBeVisible({
    timeout: 10000,
  });
}

test.describe.serial('Document Editor E2E Tests', () => {
  test('should display basic document page structure', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');

    // Navigate to a seeded document and allow one retry for transient route errors.
    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    const editor = helpers.getEditor();

    // Check that basic page structure is present
    await expectExitControlVisible(page);
    await expect(editor).toBeVisible({ timeout: 10000 });
  });

  test('submits a practice document', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      await signIn('jdoe@brock.software', 'johndoe');
      await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });

      await expect(page.getByTestId('document-submit-button')).toBeVisible({
        timeout: 10000,
      });
      await page.getByTestId('document-submit-button').click();
      await expect(
        page.getByTestId('document-submit-confirm-popover')
      ).toBeVisible();
      await page.getByTestId('document-finalize-submit').click();
      await expect(page.getByText('Submitted').first()).toBeVisible({
        timeout: 15000,
      });
      await expect
        .poll(
          () =>
            prisma.submission.count({
              where: { documentId: e2eContext.editedDocumentId },
            }),
          { timeout: 10000 }
        )
        .toBeGreaterThan(0);
    } finally {
      await prisma.$disconnect();
    }
  });

  test('clicking editor pane padding focuses so typing works', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    // Left padding of scroll pane (inside p-5), not on ProseMirror text
    await page.getByTestId('document-editor-scroll').click({ position: { x: 6, y: 320 } });
    const editor = helpers.getEditor();
    await expect(editor).toBeFocused();
    await editor.pressSequentially('z', { delay: 30 });
    await expect(editor).toContainText('z');
  });

  test('submit is disabled with tooltip when document is empty', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    const editor = helpers.getEditor();
    await editor.click();
    await page.keyboard.press(SELECT_ALL_SHORTCUT);
    await page.keyboard.press('Backspace');
    const submitBtn = page.getByTestId('document-submit-button');
    await expect(submitBtn).toBeDisabled({ timeout: 10000 });
    await page.getByTestId('document-submit-empty-trigger').hover();
    await expect(
      page.getByText("You can't submit an empty document. Add text first.")
    ).toBeVisible({ timeout: 5000 });
  });

  test('should allow typing in document editor with simulated saving', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');

    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    const editor = helpers.getEditor();

    // Type some content
    const testText = 'This is test content for e2e testing!';
    await helpers.typeInEditor(testText);

    // Verify the text appears in the editor
    await expect(editor).toContainText(testText);

    // Wait for save round-trip (SyncService debounce fires ~2s after last keystroke)
    await helpers.waitForSaved();
    await helpers.verifyPersistsOnReload(testText);
  });

  test('should handle pasting content in document editor', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');

    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    const editor = helpers.getEditor();

    // Simulate pasting content by inserting text directly
    const pasteContent = 'This content was pasted into the editor.';
    await editor.click();
    await page.keyboard.insertText(pasteContent);

    // Verify pasted content appears
    await expect(editor).toContainText(pasteContent);

    // Wait for auto-save then verify persistence
    await helpers.waitForSaved();
    await helpers.verifyPersistsOnReload(pasteContent);
  });

  test('should handle multiple rapid edits without data loss', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');

    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    const editor = helpers.getEditor();

    // Rapid typing simulation
    const words = ['Rapid', 'typing', 'test', 'with', 'multiple', 'words'];
    for (const word of words) {
      await editor.pressSequentially(`${word} `, { delay: 50 });
    }

    // Wait for debounced save to complete
    await helpers.waitForSaved();

    // Verify all content is present
    for (const word of words) {
      await expect(editor).toContainText(word);
    }

    // Verify content actually persisted to the server (the real test — no data loss)
    await helpers.verifyPersistsOnReload(words[0]);
  });

  test('does not allow an older delayed save to overwrite newer content', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');

    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    const editor = helpers.getEditor();

    let firstSaveRoute: Parameters<Parameters<typeof page.route>[1]>[0] | null = null;
    let firstSaveReleased = false;
    let seenSaveCount = 0;

    await page.route('**/api/model/document/**', async (route) => {
      if (route.request().method() !== 'PUT') {
        await route.continue();
        return;
      }

      seenSaveCount += 1;
      if (seenSaveCount === 1) {
        firstSaveRoute = route;
        return;
      }

      await route.continue();
      if (firstSaveRoute && !firstSaveReleased) {
        firstSaveReleased = true;
        await page.waitForTimeout(800); // brief hold to simulate out-of-order network response
        await firstSaveRoute.continue();
      }
    });

    await editor.click();
    await editor.pressSequentially(' older');
    await page.waitForTimeout(1700); // allow first debounce to fire
    await editor.pressSequentially(' newest');
    await helpers.waitForSaved();

    await helpers.verifyPersistsOnReload('newest');
  });

  test('updating the title does not overwrite newer editor content', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');

    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    const editor = helpers.getEditor();

    await editor.click();
    const appendedText = ' Content that should survive a title edit.';
    await editor.pressSequentially(appendedText);

    const titleInput = page.getByPlaceholder('Untitled document');
    await expect(titleInput).toBeVisible({ timeout: 10000 });
    await titleInput.fill('Updated E2E Title');
    await titleInput.blur();

    await helpers.waitForSaved();

    await helpers.verifyPersistsOnReload(appendedText.trim());
  });

  test('locks editor and shows session modal when autosave gets auth failure', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      await signIn('jdoe@brock.software', 'johndoe');
      await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
      const editor = helpers.getEditor();

      await helpers.typeInEditor('Baseline text before session expiry.');
      await helpers.waitForSaved();

      await invalidateUserSessions({
        prisma,
        userId: e2eContext.userId,
      });

      await editor.click();
      await editor.pressSequentially(' Trigger auth check.');
      // The auth heartbeat checks /api/auth/check on focus/visibility events.
      // Simulate a visibility change to trigger the re-check after session invalidation.
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await expect(
        page.getByRole('heading', { name: /session expired/i })
      ).toBeVisible({ timeout: 10000 });
      await expect
        .poll(
          async () => page.locator(EDITOR_SELECTOR).first().getAttribute('contenteditable'),
          { timeout: 5000 }
        )
        .toBe('false');
    } finally {
      await prisma.$disconnect();
    }
  });

  test('locks editor on focus auth check after session expires in background', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      await signIn('jdoe@brock.software', 'johndoe');
      await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
      const editor = helpers.getEditor();
      await expect(editor).toBeVisible({ timeout: 10000 });

      await invalidateUserSessions({
        prisma,
        userId: e2eContext.userId,
      });

      await page.evaluate(() => {
        window.dispatchEvent(new Event('focus'));
      });

      await expect(
        page.getByRole('heading', { name: /session expired/i })
      ).toBeVisible({ timeout: 10000 });
      await expect
        .poll(
          async () => page.locator(EDITOR_SELECTOR).first().getAttribute('contenteditable'),
          { timeout: 5000 }
        )
        .toBe('false');
    } finally {
      await prisma.$disconnect();
    }
  });

  test('blocks tutor actions when session is locked', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      await signIn('jdoe@brock.software', 'johndoe');
      await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });

      let tutorRequests = 0;
      await page.route('**/api/domain/tutor-response', async (route) => {
        if (route.request().method() === 'POST') tutorRequests += 1;
        await route.continue();
      });

      await invalidateUserSessions({
        prisma,
        userId: e2eContext.userId,
      });

      await page.evaluate(() => {
        window.dispatchEvent(new Event('focus'));
      });

      await expect(
        page.getByRole('heading', { name: /session expired/i })
      ).toBeVisible({ timeout: 10000 });
      await expect(page.getByTestId('tutor-chat-open')).toBeDisabled();
      await expect.poll(() => tutorRequests).toBe(0);
    } finally {
      await prisma.$disconnect();
    }
  });

  test('posts paste-alert when pasting large text not copied from editor', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      await signIn('jdoe@brock.software', 'johndoe');
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

      await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
      const editor = helpers.getEditor();
      const longText = 'x'.repeat(201);

      // Clear any prior paste alerts for this document
      await prisma.pasteAlert.deleteMany({ where: { documentId: e2eContext.editedDocumentId } });

      await page.evaluate(async (text) => {
        await navigator.clipboard.writeText(text);
      }, longText);

      await editor.click();

      // Wait for the paste-alert POST to complete
      const pasteAlertResponse = page.waitForResponse(
        (res) => res.url().includes('/api/paste-alert') && res.request().method() === 'POST',
        { timeout: 15000 }
      );

      await page.keyboard.press(PASTE_SHORTCUT);
      await pasteAlertResponse;

      // Verify a PasteAlert record was created in the database
      const alert = await prisma.pasteAlert.findFirst({
        where: { documentId: e2eContext.editedDocumentId },
        orderBy: { createdAt: 'desc' },
      });
      expect(alert).not.toBeNull();
      expect(alert!.textLength).toBe(201);
    } finally {
      await prisma.$disconnect();
    }
  });

  test('does not post paste-alert when pasting large text copied from same editor', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    const editor = helpers.getEditor();
    const longText = 'y'.repeat(201);

    await editor.click();
    await page.keyboard.insertText(longText);
    await expect(editor).toContainText(longText);

    await page.keyboard.press(SELECT_ALL_SHORTCUT);
    await page.keyboard.press(COPY_SHORTCUT);

    let pasteAlertCount = 0;
    page.on('request', (req) => {
      if (req.url().includes('/api/paste-alert') && req.method() === 'POST') {
        pasteAlertCount++;
      }
    });

    await page.keyboard.press(PASTE_SHORTCUT);
    // Brief pause for any in-flight paste-alert requests to arrive before asserting zero
    await page.waitForTimeout(500);

    expect(pasteAlertCount).toBe(0);
  });

  test('does not post paste-alert when cut-then-pasting to reorder a paragraph in the same editor', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    const editor = helpers.getEditor();
    const longText = 'z'.repeat(201);

    await editor.click();
    await page.keyboard.insertText(longText);
    await expect(editor).toContainText(longText);

    // Cut the paragraph (as if reordering it), rather than copy.
    await page.keyboard.press(SELECT_ALL_SHORTCUT);
    await page.keyboard.press(CUT_SHORTCUT);
    await expect(editor).not.toContainText(longText);

    let pasteAlertCount = 0;
    page.on('request', (req) => {
      if (req.url().includes('/api/paste-alert') && req.method() === 'POST') {
        pasteAlertCount++;
      }
    });

    await page.keyboard.press(PASTE_SHORTCUT);
    await expect(editor).toContainText(longText);
    // Brief pause for any in-flight paste-alert requests to arrive before asserting zero
    await page.waitForTimeout(500);

    expect(pasteAlertCount).toBe(0);
  });

  test('does not post paste-alert when the copy happened on a non-editor page before navigating in', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      await signIn('jdoe@brock.software', 'johndoe');
      await page
        .context()
        .grantPermissions(['clipboard-read', 'clipboard-write']);

      // Start on a page with no document editor on it at all.
      await page.goto('/app');
      await page.waitForLoadState('networkidle');
      await expect(page.locator(EDITOR_SELECTOR)).toHaveCount(0);

      // A real browser copy of app content from that page — the copy event
      // has to be heard by the layout, not by an editor that isn't mounted.
      const longText = 'w'.repeat(201);
      const copied = await page.evaluate((text) => {
        const source = document.createElement('p');
        source.id = 'e2e-non-editor-copy-source';
        source.textContent = text;
        document.body.appendChild(source);
        const range = document.createRange();
        range.selectNodeContents(source);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        // execCommand rather than the keyboard shortcut: this is a real
        // browser copy (it fires the copy event and fills the clipboard)
        // from a plain page region, not a focused contenteditable.
        return document.execCommand('copy');
      }, longText);
      expect(copied).toBe(true);
      await expect
        .poll(() =>
          page.evaluate(() =>
            localStorage.getItem('yawp-internal-clipboard-copy')
          )
        )
        .not.toBeNull();

      const alertsBefore = await prisma.pasteAlert.count({
        where: { documentId: e2eContext.editedDocumentId },
      });

      let pasteAlertCount = 0;
      page.on('request', (req) => {
        if (req.url().includes('/api/paste-alert') && req.method() === 'POST') {
          pasteAlertCount++;
        }
      });

      // Now navigate into a document and paste what was copied.
      await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
      const editor = helpers.getEditor();
      await editor.click();
      await page.keyboard.press(PASTE_SHORTCUT);
      await expect(editor).toContainText(longText);
      // Brief pause for any in-flight paste-alert requests to arrive before asserting zero
      await page.waitForTimeout(500);

      expect(pasteAlertCount).toBe(0);
      expect(
        await prisma.pasteAlert.count({
          where: { documentId: e2eContext.editedDocumentId },
        })
      ).toBe(alertsBefore);
    } finally {
      await prisma.$disconnect();
    }
  });

  test('submit dialog default title matches live nav title without reload', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });

    const liveTitle = `E2E nav title ${Date.now()}`;
    await page.getByTestId('document-title-input').fill(liveTitle);
    await helpers.getEditor().click();

    await page.waitForResponse(
      (r) =>
        r.url().includes(`/api/model/document/${e2eContext.editedDocumentId}`) &&
        r.request().method() === 'POST',
      { timeout: 15000 }
    );

    await page.getByTestId('document-submit-button').click();
    await expect(
      page.getByRole('textbox', { name: /^submission title$/i })
    ).toHaveValue(liveTitle);
  });

  test('document editor version matches rollout (v2 on in E2E seed)', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    await expect(
      page.locator('[data-document-editor-version="v2"]')
    ).toBeVisible({ timeout: 10000 });
  });

  test('staff ?editor=v1 opts out of v2 when rollout is on', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
    await helpers.openDocument(
      `${e2eContext.editedDocumentId}?editor=v1`,
      { retry: true }
    );
    await expect(
      page.locator('[data-document-editor-version="v1"]')
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('[data-document-editor-staff-opt-out="v1"]')
    ).toBeVisible({ timeout: 10_000 });
  });

  test('v2 desktop margin rail hides when Comments panel is toggled off', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await page.setViewportSize({ width: 1280, height: 720 });
    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    const editor = helpers.getEditor();
    await editor.click();
    await page.keyboard.press(SELECT_ALL_SHORTCUT);
    await page.getByTestId('editor-add-comment').click();
    await page.getByTestId('margin-comment-draft-body').fill('Panel toggle E2E');
    await page.getByTestId('margin-comment-draft-submit').click();
    await expect(page.getByTestId('document-margin-comments-aside')).toBeVisible({
      timeout: 15_000,
    });
    const commentsToggle = page.getByRole('button', { name: 'Comments' });
    await commentsToggle.click();
    await expect(page.getByTestId('document-margin-comments-aside')).toBeHidden({
      timeout: 10_000,
    });
    await commentsToggle.click();
    await expect(page.getByTestId('document-margin-comments-aside')).toBeVisible(
      { timeout: 10_000 }
    );
  });

  test('v2 student can cancel an expanded comment reply', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('teacher.e2e@yawp.test', 'teacher-e2e-password');
    await page.setViewportSize({ width: 1280, height: 720 });
    await helpers.openDocument(
      `${e2eContext.gradedDocumentId}?tab=editor`,
      { retry: true }
    );
    const commentId = e2eContext.v2GradedCommentId;
    await expect(page.getByTestId('document-margin-comments-aside')).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByTestId(`margin-comment-card-${commentId}`)
    ).toBeVisible({ timeout: 10_000 });
    const replyPill = page.getByTestId(`comment-reply-input-${commentId}`);
    const replyExpanded = page.getByTestId(`comment-reply-expanded-${commentId}`);
    if (await replyExpanded.isVisible().catch(() => false)) {
      await page.getByTestId(`comment-reply-body-${commentId}`).fill('Draft only');
    } else {
      await replyPill.click();
      await page.getByTestId(`comment-reply-body-${commentId}`).fill('Draft only');
    }
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(
      page.getByTestId(`comment-reply-input-${commentId}`)
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByTestId(`comment-reply-expanded-${commentId}`)
    ).toBeHidden();
  });

  test('v2 chrome shows tutor step header when v2 is active', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    await expect(page.getByTestId('tutor-step-indicator')).toBeVisible({
      timeout: 10000,
    });
  });

  test('v2 student can add a margin comment from selection', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await page.setViewportSize({ width: 1280, height: 720 });
    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    const editor = helpers.getEditor();
    await editor.click();
    await page.keyboard.press(SELECT_ALL_SHORTCUT);
    await page.getByTestId('editor-add-comment').click();
    await expect(page.getByTestId('margin-comment-draft-card')).toBeVisible({
      timeout: 10_000,
    });
    await page.getByTestId('margin-comment-draft-body').fill('Student E2E comment body');
    await page.getByTestId('margin-comment-draft-submit').click();
    await expect(page.locator('[id^="comment-"]').first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.locator('[data-testid^="margin-comment-card-"]').first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test('v2 teacher margin comments support reply and resolve', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('teacher.e2e@yawp.test', 'teacher-e2e-password');
    await page.setViewportSize({ width: 1280, height: 720 });
    await helpers.openDocument(
      `${e2eContext.gradedDocumentId}?tab=editor`,
      { retry: true }
    );
    const card = page.getByTestId(
      `margin-comment-card-${e2eContext.v2GradedCommentId}`
    );
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText('Thanks — I will expand this section.');
    await page
      .getByTestId(`comment-reply-input-${e2eContext.v2GradedCommentId}`)
      .click();
    await page
      .getByTestId(`comment-reply-body-${e2eContext.v2GradedCommentId}`)
      .fill('Reply from teacher E2E.');
    await page
      .getByTestId(`comment-reply-send-${e2eContext.v2GradedCommentId}`)
      .click();
    await expect(card).toContainText('Reply from teacher E2E.', {
      timeout: 10_000,
    });
    const resolveButton = page.getByTestId(
      `comment-resolve-${e2eContext.v2GradedCommentId}`
    );
    await resolveButton.click();
    await expect(resolveButton).toBeHidden({ timeout: 10_000 });
  });

  test('v2 teacher can open a comment draft from text selection', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('teacher.e2e@yawp.test', 'teacher-e2e-password');
    await page.setViewportSize({ width: 1280, height: 720 });
    await helpers.openDocument(
      `${e2eContext.gradedDocumentId}?tab=editor`,
      { retry: true }
    );
    await expect(page.getByTestId('document-view-only-banner')).toBeVisible({
      timeout: 10_000,
    });
    const editor = helpers.getEditor();
    await editor.click();
    await page.keyboard.press(SELECT_ALL_SHORTCUT);
    await page.getByTestId('editor-add-comment').click();
    await expect(page.getByTestId('margin-comment-draft-card')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId('margin-comment-draft-body')).toBeVisible();
  });

  test('v2 shows mobile tab bar at 390px width', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await page.setViewportSize({ width: 390, height: 844 });
    await helpers.openDocument(
      `${e2eContext.editedDocumentId}?tab=editor`,
      { retry: true }
    );
    await expect(page.getByTestId('document-mobile-tabbar')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('v2 mobile comments sheet does not throw selection provider errors', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    test.setTimeout(60_000);
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await signIn('jdoe@brock.software', 'johndoe');
    await page.setViewportSize({ width: 390, height: 844 });
    await helpers.openDocument(
      `${e2eContext.editedDocumentId}?tab=editor`,
      { retry: true }
    );
    await page.getByTestId('document-mobile-tabbar').getByText('Comments').click();
    await expect(page.getByTestId('mobile-comments-sheet')).toBeVisible({
      timeout: 10_000,
    });
    expect(
      consoleErrors.some((line) =>
        line.includes('useCommentsSelection must be used within')
      )
    ).toBe(false);
  });

  test('v2 desktop margin rail is hidden by default on reload', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await page.setViewportSize({ width: 1440, height: 900 });
    await helpers.openDocument(
      `${e2eContext.gradedDocumentId}?tab=editor`,
      { retry: true }
    );
    await expect(page.getByTestId('document-margin-comments-aside')).toBeHidden({
      timeout: 10_000,
    });
    await page.getByRole('button', { name: 'Comments' }).click();
    await expect(page.getByTestId('document-margin-comments-aside')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('v2 each comment keeps exactly one highlight and margin cards do not overlap', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('teacher.e2e@yawp.test', 'teacher-e2e-password');
    await page.setViewportSize({ width: 1440, height: 900 });
    await helpers.openDocument(
      `${e2eContext.gradedDocumentId}?tab=editor`,
      { retry: true }
    );
    await expect(page.getByTestId('document-margin-comments-aside')).toBeVisible({
      timeout: 15_000,
    });

    const activeIds = [
      e2eContext.v2GradedCommentId,
      e2eContext.v2GradedResolvedCommentId,
    ];

    for (const id of activeIds) {
      const marks = page.locator(
        `.comment-mark[data-comment-id="${id}"]`
      );
      await expect(marks).toHaveCount(1, { timeout: 10_000 });
    }

    const tops = await page
      .locator('[data-margin-comment-for]')
      .evaluateAll((nodes) =>
        nodes.map((node) =>
          Math.round(Number.parseFloat(getComputedStyle(node).top || '0'))
        )
      );
    expect(tops.length).toBeGreaterThan(1);
    expect(new Set(tops).size).toBe(tops.length);
  });

  test('v2 canceling a comment draft removes the transient highlight', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await page.setViewportSize({ width: 1440, height: 900 });
    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    const editor = helpers.getEditor();
    await editor.click();
    await page.keyboard.press('Control+a');
    await page.getByTestId('editor-add-comment').click();
    const draftId = await page
      .getByTestId('margin-comment-draft-card')
      .getAttribute('data-comment-card');
    expect(draftId).toBeTruthy();
    await expect(
      page.locator(`.comment-mark[data-comment-id="${draftId}"]`)
    ).toHaveCount(1);
    await page.getByRole('button', { name: 'Cancel' }).first().click();
    await expect(
      page.locator(`.comment-mark[data-comment-id="${draftId}"]`)
    ).toHaveCount(0, { timeout: 10_000 });
  });

  test('v2 creating a comment keeps the highlight on the selection', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await page.setViewportSize({ width: 1440, height: 900 });
    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    const editor = helpers.getEditor();
    await editor.click();
    await page.keyboard.press('Control+a');
    await page.getByTestId('editor-add-comment').click();
    const draftId = await page
      .getByTestId('margin-comment-draft-card')
      .getAttribute('data-comment-card');
    await page.getByTestId('margin-comment-draft-body').fill('Highlight must persist');
    await page.getByTestId('margin-comment-draft-submit').click();
    await expect(
      page.locator(`.comment-mark[data-comment-id="${draftId}"]`)
    ).toHaveCount(1, { timeout: 15_000 });
  });

  test('v2 auto-focused reply shows a single reply field', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('teacher.e2e@yawp.test', 'teacher-e2e-password');
    await page.setViewportSize({ width: 1440, height: 900 });
    await helpers.openDocument(
      `${e2eContext.gradedDocumentId}?tab=editor`,
      { retry: true }
    );
    const commentId = e2eContext.v2GradedCommentId;
    await page.getByTestId(`margin-comment-card-${commentId}`).click();
    await page
      .getByTestId(`comment-reply-input-${commentId}`)
      .click();
    await expect(
      page.getByTestId(`comment-reply-expanded-${commentId}`)
    ).toBeVisible();
    await expect(
      page.getByTestId(`comment-reply-input-${commentId}`)
    ).toHaveCount(0);
  });
});
