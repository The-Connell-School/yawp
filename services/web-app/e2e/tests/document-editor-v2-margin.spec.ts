import { test, expect } from '../test-setup';

async function selectWordInEditor(
  page: import('@playwright/test').Page,
  word: string
) {
  await page.evaluate((target) => {
    const root = document.querySelector<HTMLElement>(
      '[contenteditable="true"]'
    );
    if (!root) throw new Error('Editor surface not found');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Text | null = null;
    while ((node = walker.nextNode() as Text | null)) {
      const text = node.textContent ?? '';
      const index = text.indexOf(target);
      if (index === -1) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + target.length);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      root.dispatchEvent(new Event('selectionchange', { bubbles: true }));
      return;
    }
    throw new Error(`Could not select "${target}" in editor`);
  }, word);
}

test.describe('Document editor v2 margin comments', () => {
  test('v2 creates three margin comments in one session without duplicate cards', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    test.setTimeout(90_000);
    const consoleWarnings: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'warning') consoleWarnings.push(msg.text());
    });

    await signIn('jdoe@brock.software', 'johndoe');
    await page.setViewportSize({ width: 1440, height: 900 });
    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    const editor = helpers.getEditor();
    await expect(editor).toBeVisible({ timeout: 15_000 });
    await page
      .getByTestId('document-panel-toggles')
      .getByRole('button', { name: 'Comments' })
      .click();

    const words = ['grammar', 'students', 'writing'] as const;
    const createdIds: string[] = [];

    for (const [index, word] of words.entries()) {
      await editor.click();
      await selectWordInEditor(page, word);
      await page.getByTestId('editor-add-comment').click();
      await expect(page.getByTestId('margin-comment-draft-card')).toBeVisible({
        timeout: 10_000,
      });
      const draftId = await page
        .getByTestId('margin-comment-draft-card')
        .getAttribute('data-comment-card');
      expect(draftId).toBeTruthy();
      createdIds.push(draftId!);
      await page
        .getByTestId('margin-comment-draft-body')
        .fill(`Session comment ${index + 1} on ${word}.`);
      await page.getByTestId('margin-comment-draft-submit').click();
      await expect(
        page.getByTestId(`margin-comment-card-${draftId}`)
      ).toHaveCount(1, { timeout: 15_000 });
      await expect(page.getByTestId(`comment-body-${draftId}`)).toContainText(
        `Session comment ${index + 1}`
      );
    }

    for (const id of createdIds) {
      await expect(page.locator(`[data-comment-card="${id}"]`)).toHaveCount(1);
      await expect(
        page.locator(`.comment-mark[data-comment-id="${id}"]`)
      ).toHaveCount(1);
    }

    expect(
      consoleWarnings.some((line) => line.includes('same key'))
    ).toBe(false);

    const layout = await page.evaluate((ids) => {
      const scroll = document.querySelector(
        '[data-testid="document-editor-scroll"]'
      ) as HTMLElement | null;
      if (!scroll) return [];
      const scrollRect = scroll.getBoundingClientRect();
      const scrollTop = scroll.scrollTop;
      return ids
        .map((id) => {
          const mark = document.querySelector(
            `.comment-mark[data-comment-id="${CSS.escape(id)}"]`
          ) as HTMLElement | null;
          const cardHost = document.querySelector(
            `[data-margin-comment-for="${CSS.escape(id)}"]`
          ) as HTMLElement | null;
          if (!mark || !cardHost) return null;
          const cardTop = parseFloat(getComputedStyle(cardHost).top || '0');
          const cardHeight = cardHost.offsetHeight;
          return { id, cardTop, cardHeight };
        })
        .filter(Boolean) as {
        id: string;
        cardTop: number;
        cardHeight: number;
      }[];
    }, createdIds);

    expect(layout.length).toBe(3);
    const sorted = [...layout].sort((a, b) => a.cardTop - b.cardTop);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      expect(cur.cardTop).toBeGreaterThanOrEqual(
        prev.cardTop + prev.cardHeight - 4
      );
    }
  });

  test('v2 load does not raise Suspense hydration pageerrors', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    await signIn('jdoe@brock.software', 'johndoe');
    await page.evaluate(() => window.localStorage.clear());
    await page.setViewportSize({ width: 1440, height: 900 });
    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    await expect(page.locator('[data-document-editor-version="v2"]')).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForTimeout(2500);
    const hydrationPattern =
      /Suspense boundary received an update|Hydration failed because|Prop `aria-pressed` did not match|Prop `aria-expanded` did not match/i;
    const hydrationErrors = pageErrors.filter((message) =>
      hydrationPattern.test(message)
    );
    expect(hydrationErrors, hydrationErrors.join('\n')).toEqual([]);
  });
});