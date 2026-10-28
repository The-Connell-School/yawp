import { Locator, Page, expect } from '@playwright/test';

/** Console noise from react-router when a new navigation aborts an in-flight /__manifest fetch. */
const ABORTED_MANIFEST_PATCH_FIRST_LINE =
  'Failed to fetch manifest patches TypeError: Failed to fetch';

/** Match only the first console line so Playwright stack suffixes do not bypass the filter. */
export function isAbortedManifestPatchConsoleMessage(text: string): boolean {
  const firstLine = text.split(/\r?\n/, 1)[0]?.trim() ?? '';
  return firstLine === ABORTED_MANIFEST_PATCH_FIRST_LINE;
}

const SUSPENSE_HYDRATION_RACE_PREFIX =
  'This Suspense boundary received an update before it finished hydrating';

/** Benign React Router / React 18 noise during controlled layout navigations. */
export function isIgnorableControlledNavigationErrorMessage(text: string): boolean {
  if (isAbortedManifestPatchConsoleMessage(text)) return true;
  const firstLine = text.split(/\r?\n/, 1)[0]?.trim() ?? '';
  return firstLine.startsWith(SUSPENSE_HYDRATION_RACE_PREFIX);
}

/** @deprecated Use isIgnorableControlledNavigationErrorMessage */
export const isIgnorableControlledNavigationConsoleMessage =
  isIgnorableControlledNavigationErrorMessage;

export type StrictPageObservability = {
  consoleErrors: string[];
  pageErrors: string[];
  gotoAndSettle: (url: string) => Promise<void>;
  waitForRouteSettled: () => Promise<void>;
  runControlled: (fn: () => Promise<void>) => Promise<void>;
  assertNoErrors: () => void;
};

/** Collect console/page errors; ignore known benign races only during controlled navigations. */
export function attachStrictPageObservability(
  page: Page
): StrictPageObservability {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  let inControlledNavigation = false;

  function shouldIgnoreError(text: string) {
    return (
      inControlledNavigation &&
      isIgnorableControlledNavigationErrorMessage(text)
    );
  }

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (shouldIgnoreError(text)) {
      return;
    }
    consoleErrors.push(text);
  });
  page.on('pageerror', (error) => {
    if (shouldIgnoreError(error.message)) {
      return;
    }
    pageErrors.push(error.message);
  });

  async function waitForRouteSettled() {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForLoadState('networkidle');
  }

  async function runControlled(fn: () => Promise<void>) {
    inControlledNavigation = true;
    try {
      await fn();
    } finally {
      inControlledNavigation = false;
    }
  }

  async function gotoAndSettle(url: string) {
    await runControlled(async () => {
      await page.goto(url, { waitUntil: 'networkidle' });
      await waitForRouteSettled();
    });
  }

  function assertNoErrors() {
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }

  return {
    consoleErrors,
    pageErrors,
    gotoAndSettle,
    waitForRouteSettled,
    runControlled,
    assertNoErrors,
  };
}

type ViewportSize = { width: number; height: number };

type ChatControlsInBoundsOptions = {
  path: string;
  composerLabel: string;
  sendButtonName: string;
  viewports?: ViewportSize[];
  assertMobileControls?: (page: Page) => Promise<void>;
};

const DEFAULT_DESKTOP_MOBILE_VIEWPORTS: ViewportSize[] = [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
];

/** Desktop + mobile layout checks with strict error collection (shared by planner/reporter specs). */
export async function assertChatControlsInBoundsAtBreakpoints(
  page: Page,
  options: ChatControlsInBoundsOptions
) {
  const observability = attachStrictPageObservability(page);
  const viewports = options.viewports ?? DEFAULT_DESKTOP_MOBILE_VIEWPORTS;

  for (let index = 0; index < viewports.length; index++) {
    const viewport = viewports[index]!;
    await observability.runControlled(async () => {
      if (index > 0) {
        await observability.waitForRouteSettled();
      }

      await page.setViewportSize(viewport);
      await page.goto(options.path, { waitUntil: 'networkidle' });
      await observability.waitForRouteSettled();

      const composer = page.getByLabel(options.composerLabel);
      const send = page.getByRole('button', { name: options.sendButtonName });
      await expect(composer).toBeVisible();
      await expect(send).toBeVisible();

      if (viewport.width === 390 && options.assertMobileControls) {
        await options.assertMobileControls(page);
      }

      for (const control of [composer, send] as Locator[]) {
        const box = await control.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      }

      const overflow = await page.evaluate(() => ({
        body: document.body.scrollWidth - window.innerWidth,
        document: document.documentElement.scrollWidth - window.innerWidth,
      }));
      expect(overflow.body).toBeLessThanOrEqual(0);
      expect(overflow.document).toBeLessThanOrEqual(0);

      await observability.waitForRouteSettled();
    });
  }

  observability.assertNoErrors();
}

/** Single source of truth for the editor DOM selector */
export const EDITOR_SELECTOR = '.ProseMirror';

export class TestHelpers {
  constructor(private page: Page) {}

  /** Open a document page and wait for the editor to be interactive */
  async openDocument(documentId: string, opts?: { retry?: boolean }) {
    const maxAttempts = opts?.retry ? 2 : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.page.goto(`/app/documents/${documentId}`);
      await this.page.waitForLoadState('networkidle');
      try {
        await this.page.waitForSelector(EDITOR_SELECTOR, { state: 'visible', timeout: 15000 });
        // Wait for ProseMirror's view to be fully wired into the DOM AND
        // useEditorSync's update handler to be registered. Without this,
        // typing can outrace PM's input handlers or the sync handler.
        await this.page.waitForFunction(
          (sel) => {
            const el = document.querySelector(sel) as any;
            // pmViewDesc is set by ProseMirror when the view owns this DOM node
            return el?.pmViewDesc && el?.dataset?.syncReady === 'true';
          },
          EDITOR_SELECTOR,
          { timeout: 10000 },
        );
        // Brief settle for ProseMirror's internal DOM event handler attachment
        await this.page.waitForTimeout(500);
        return;
      } catch {
        if (attempt === maxAttempts) throw new Error(`Editor did not appear after ${maxAttempts} attempts`);
      }
    }
  }

  /** Wait for the editor to be loaded and ready */
  async waitForEditorReady() {
    await this.page.waitForSelector(EDITOR_SELECTOR, {
      state: 'visible',
      timeout: 15000,
    });
    await this.page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel) as HTMLElement & {
          pmViewDesc?: unknown;
          dataset?: DOMStringMap;
        };
        return el?.pmViewDesc && el?.dataset?.syncReady === 'true';
      },
      EDITOR_SELECTOR,
      { timeout: 15000 },
    );
  }

  /** Get the editor locator */
  getEditor() {
    return this.page.locator(EDITOR_SELECTOR).first();
  }

  /** Type text in the editor */
  async typeInEditor(text: string) {
    const editor = this.getEditor();
    await editor.click();
    await editor.pressSequentially(text, { delay: 30 });
  }

  /** Paste content in the editor */
  async pasteInEditor(content: string) {
    const editor = this.getEditor();
    await editor.click();
    await this.page.evaluate(async (t) => {
      await navigator.clipboard.writeText(t);
    }, content);
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
    await this.page.keyboard.press(`${mod}+V`);
  }

  /**
   * Wait for the SyncService to complete a full save round-trip.
   *
   * Polls the `data-save-count` attribute on the ProseMirror element,
   * which is incremented by useEditorSync whenever the SyncService
   * transitions to 'synced' status.
   */
  async waitForSaved(timeout = 15000) {
    await this.page.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        return el && parseInt(el.getAttribute('data-save-count') ?? '0', 10) > 0;
      },
      EDITOR_SELECTOR,
      { timeout },
    );
  }

  /** Open document version history from the actions menu */
  async openDocumentHistory() {
    await this.page.getByTestId('document-actions-menu').click();
    await this.page.getByTestId('document-action-history').click();
  }

  /** Get the current text content of the editor */
  async getEditorContent() {
    return this.getEditor().textContent();
  }

  /** Clear the editor content */
  async clearEditor() {
    const editor = this.getEditor();
    await editor.click();
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
    await this.page.keyboard.press(`${mod}+A`);
    await this.page.keyboard.press('Delete');
  }

  /** Click the Exit link if present */
  async clickExitIfPresent() {
    const exitLink = this.page.getByRole('link', { name: /exit/i });
    if (await exitLink.count()) {
      await exitLink.first().click();
      await this.page.waitForLoadState('networkidle');
    }
  }

  /** Reload the page and verify text is still in the editor */
  async verifyPersistsOnReload(expectedText: string) {
    await this.page.reload();
    await this.page.waitForLoadState('networkidle');
    await this.waitForEditorReady();
    const editor = this.getEditor();
    await expect(editor).toContainText(expectedText, { timeout: 10000 });
  }
}

export type FreeTierJoinFormValues = {
  displayName: string;
  handle: string;
  password: string;
};

/**
 * Fill the legacy `/join?t=` handle signup form. RVF/React can drop fills that
 * run before client hydration, so each field is retried until its value sticks.
 */
export async function fillFreeTierJoinForm(
  page: Page,
  values: FreeTierJoinFormValues
) {
  await expect(
    page.getByRole('heading', { name: 'Create your student account' })
  ).toBeVisible({ timeout: 15_000 });

  const fields: Array<{
    locator: Locator;
    value: string;
  }> = [
    { locator: page.getByLabel('Display name'), value: values.displayName },
    { locator: page.getByLabel('Handle'), value: values.handle },
    {
      locator: page.getByLabel('Password', { exact: true }),
      value: values.password,
    },
    {
      locator: page.getByLabel('Confirm password'),
      value: values.password,
    },
  ];

  for (const { locator, value } of fields) {
    await expect(async () => {
      await expect(locator).toBeEditable();
      await locator.click();
      await locator.fill(value);
      await expect(locator).toHaveValue(value);
    }).toPass({ timeout: 15_000 });
  }
}

/** Submit join form and wait until the student lands in the authenticated app shell. */
export async function submitFreeTierJoinAndExpectApp(
  page: Page,
  options?: { timeoutMs?: number }
) {
  const timeoutMs = options?.timeoutMs ?? 60_000;
  const joinButton = page.getByRole('button', { name: 'Join class' });

  await expect(page.getByText('Name is too short')).not.toBeVisible();
  await expect(joinButton).toBeEnabled();
  await expect(joinButton).toHaveText('Join class');

  await Promise.all([
    page.waitForURL(
      (url) => url.pathname === '/app' || url.pathname.startsWith('/app/'),
      { timeout: timeoutMs }
    ),
    joinButton.click(),
  ]);
  await expect(page).toHaveURL(/\/app/, { timeout: 5_000 });
}
