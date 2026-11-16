import { Locator, Page, expect } from '@playwright/test';
import { serializeDocumentWorkFilterIds } from '../app/utils/teacher-document-work-filter-options';

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
      if (viewport.width <= 480) {
        await page.reload({ waitUntil: 'networkidle' });
      }
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
 * Complete unified-signon student signup after `/join?t=` redirects to login.
 * RVF/React can drop fills that run before client hydration, so each field is
 * retried until its value sticks.
 */
export async function fillFreeTierJoinForm(
  page: Page,
  values: FreeTierJoinFormValues
) {
  await expect(page).toHaveURL(/\/auth\/login/, { timeout: 15_000 });
  const screen = page.locator('[data-signon-screen]');
  await expect(screen).toHaveAttribute('data-signon-screen', 'class-found', {
    timeout: 30_000,
  });
  await expect(screen).toHaveAttribute('aria-busy', 'false');
  const newStudent = page.getByRole('button', { name: 'New Create an account' });
  await expect(newStudent).toBeVisible({ timeout: 15_000 });
  await newStudent.click();
  await expect(screen).toHaveAttribute('data-signon-screen', 'class-handle', {
    timeout: 30_000,
  });

  const nameParts = values.displayName.trim().split(/\s+/);
  const firstName = nameParts[0] ?? values.displayName;
  const lastName = nameParts.slice(1).join(' ') || 'Student';

  const fields: Array<{ locator: Locator; value: string }> = [
    { locator: page.getByLabel('First name', { exact: true }), value: firstName },
    { locator: page.getByLabel('Last name', { exact: true }), value: lastName },
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

/** Signed-in students on `/enter-code` use USO (Class code + Join class). */
export async function submitSignedInEnterClassCode(
  page: Page,
  code: string,
  options?: {
    completeToApp?: boolean;
    timeoutMs?: number;
    membershipOrganization?: string;
  }
) {
  const completeToApp = options?.completeToApp ?? true;
  const { completeUnifiedSignonToApp } = await import('./helpers/unified-login');
  const uso = page.getByLabel('Class code', { exact: true });
  const legacy = page.getByLabel('Class Code', { exact: true });
  await expect(uso.or(legacy)).toBeVisible({ timeout: 15_000 });
  if (await uso.isVisible()) {
    await uso.fill(code);
    await page.getByRole('button', { name: 'Join class', exact: true }).click();
    if (completeToApp) {
      await completeUnifiedSignonToApp(page, options?.timeoutMs ?? 60_000, {
        membershipOrganization: options?.membershipOrganization,
      });
    }
    return;
  }
  await legacy.fill(code);
  await Promise.all([
    page.waitForURL(
      (url) => url.pathname === '/app' || url.pathname.startsWith('/app/'),
      { timeout: 15_000 }
    ),
    page.getByRole('button', { name: 'Continue', exact: true }).click(),
  ]);
}

/** Expand every grouped-by-type section so rows stay reachable under the flag. */
export async function expandAssignmentTypeSections(page: Page) {
  const sections = page.locator('[data-testid^="assignment-type-section-"]');
  const count = await sections.count();
  for (let index = 0; index < count; index++) {
    const heading = sections.nth(index).getByRole('button').first();
    if ((await heading.getAttribute('aria-expanded')) === 'false') {
      await heading.click();
    }
  }
}

async function selectMyAssignmentsTypePill(
  page: Page,
  typeTitle: string
) {
  const pills = page.getByTestId('my-assignments-type-pills');
  if ((await pills.count()) === 0) return;
  const pill = pills.getByRole('tab', {
    name: new RegExp(`^${typeTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  });
  await pill.scrollIntoViewIfNeeded();
  await pill.click();
  await expect(pill).toHaveAttribute('aria-selected', 'true');
}

async function ensureMyAssignmentsFilterOpen(page: Page) {
  const filter = page.getByTestId('my-assignments-filter');
  if ((await filter.getAttribute('aria-expanded')) !== 'true') {
    await filter.click();
  }
  await expect(page.getByTestId('my-assignments-search')).toBeVisible({
    timeout: 15_000,
  });
}

async function setMyAssignmentsClassFilter(
  page: Page,
  classOptionLabel: string | RegExp
) {
  await ensureMyAssignmentsFilterOpen(page);
  const classTrigger = page
    .getByText('Class', { exact: true })
    .locator('..')
    .getByRole('button')
    .first();
  await classTrigger.click();
  const classSearch = page.getByPlaceholder('Search classes');
  await expect(classSearch).toBeVisible({ timeout: 15_000 });
  const filterText =
    classOptionLabel instanceof RegExp
      ? 'Period 1st'
      : classOptionLabel;
  await classSearch.fill(filterText);
  const option = page
    .locator('[cmdk-item]')
    .filter({ hasText: classOptionLabel })
    .first();
  await expect(option).toBeVisible({ timeout: 15_000 });
  await option.click();
  await page.keyboard.press('Escape');
}

async function setMyAssignmentsSearchQuery(page: Page, query: string) {
  await ensureMyAssignmentsFilterOpen(page);
  const search = page.getByTestId('my-assignments-search');
  await search.fill(query);
  await expect(search).toHaveValue(query);
  // Filtering is live while the popover stays open; avoid re-toggling Filter,
  // which races closed on CI and hides the search field mid-assertion.
  await page.keyboard.press('Escape');
}

/** Default seeded E2E class label (`Grade 9th • Period 1st`). */
export const E2E_SEEDED_CLASS_LABEL = /Grade 9th.*Period 1st/i;

async function findMyAssignmentRow(
  page: Page,
  options: { assignmentId?: string; title?: string }
) {
  await expandAssignmentTypeSections(page);
  const target =
    options.assignmentId != null
      ? page.getByTestId(`my-assignment-open-${options.assignmentId}`)
      : page
          .locator('[data-testid^="my-assignment-open-"]')
          .filter({ hasText: options.title ?? '' })
          .first();
  const forward = page.getByRole('button', { name: 'go forward' });
  for (let pageIndex = 0; pageIndex < 25; pageIndex++) {
    if (await target.isVisible().catch(() => false)) {
      return target;
    }
    if (!(await forward.isEnabled().catch(() => false))) {
      break;
    }
    await forward.click();
  }
  return target;
}

/** My Assignments search lives inside the Filter popover — open it before typing. */
export async function fillMyAssignmentsSearch(
  page: Page,
  query: string,
  options?: {
    assignmentId?: string;
    assignmentTypeTitle?: string;
    classId?: string;
    /** Visible class label in the My Assignments class multiselect. */
    classLabel?: string | RegExp;
    /** When false, keep polling the list instead of opening assignment detail. */
    allowDetailFallback?: boolean;
  }
) {
  const trimmed = query.trim();
  const classLabel = options?.classLabel ?? E2E_SEEDED_CLASS_LABEL;

  const rowVisibleTimeout = 20_000;

  if (options?.assignmentId) {
    const pollTimeoutMs = 90_000;
    if (!page.url().includes('/app/assignments')) {
      await page.goto('/app/assignments', { waitUntil: 'domcontentloaded' });
    }
    await expect(page.getByTestId('my-assignments-filter')).toBeVisible({
      timeout: 30_000,
    });
    await expect
      .poll(
        async () => {
          if (!page.url().includes('/app/assignments')) {
            await page.goto('/app/assignments', {
              waitUntil: 'domcontentloaded',
            });
          }
          await expect(page.getByTestId('my-assignments-filter')).toBeVisible({
            timeout: 15_000,
          });
          await expandAssignmentTypeSections(page);
          if (options.assignmentTypeTitle) {
            await selectMyAssignmentsTypePill(page, options.assignmentTypeTitle);
          }
          if (options.classId) {
            await setMyAssignmentsClassFilter(page, classLabel);
          }
          if (trimmed) {
            await setMyAssignmentsSearchQuery(page, query);
          }
          const located = await findMyAssignmentRow(page, {
            assignmentId: options.assignmentId,
            title: trimmed || undefined,
          });
          return located.isVisible().catch(() => false);
        },
        { timeout: pollTimeoutMs }
      )
      .toBe(true);
    return;
  }

  await expect(page.getByTestId('my-assignments-filter')).toBeVisible({
    timeout: 30_000,
  });
  if (options?.assignmentTypeTitle) {
    await selectMyAssignmentsTypePill(page, options.assignmentTypeTitle);
  }
  if (options?.classId) {
    await setMyAssignmentsClassFilter(page, classLabel);
  }
  if (trimmed) {
    await setMyAssignmentsSearchQuery(page, query);
  }
  if (!trimmed) return;
  const located = await findMyAssignmentRow(page, { title: trimmed });
  await expect(located).toBeVisible({ timeout: rowVisibleTimeout });
}

const DEV_PANEL_DISMISS_EVENT = 'yawp:dismiss-dev-panel';

/** Clear dev-panel layout and Radix scroll-lock leftovers before teacher sheets (E2E). */
export async function stabilizeTeacherSheetShell(page: Page) {
  await page.evaluate((eventName: string) => {
    window.dispatchEvent(new Event(eventName));
    document.documentElement.style.removeProperty('pointer-events');
    document.body.style.removeProperty('pointer-events');
    document.body.removeAttribute('data-scroll-locked');
    const prefix = String.fromCharCode(
      121,
      97,
      119,
      112,
      45,
      100,
      101,
      118,
      45,
      112,
      97,
      110,
      101,
      108,
      45
    );
    for (const suffix of ['open', 'restored', 'closing']) {
      document.documentElement.classList.remove(`${prefix}${suffix}`);
    }
  }, DEV_PANEL_DISMISS_EVENT);
}

/** Navigates to assignment detail directly; avoids My Assignments list pagination on shared E2E DBs. */
export async function openMyAssignmentDetail(
  page: Page,
  assignmentId: string,
  classId: string
) {
  await page.goto(`/app/assignments/${assignmentId}?classId=${classId}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByTestId('assignment-detail-page')).toBeVisible({
    timeout: 30_000,
  });
  await stabilizeTeacherSheetShell(page);
}

export async function clickAssignmentDetailEdit(page: Page) {
  await stabilizeTeacherSheetShell(page);
  const edit = page.getByTestId('assignment-detail-edit');
  await expect(edit).toBeVisible({ timeout: 30_000 });
  await edit.click();
}

/** Editor v2 uses a title input; v1 used a page heading. */
export async function expectDocumentTitleVisible(
  page: Page,
  title: string,
  options?: { timeout?: number }
) {
  const timeout = options?.timeout ?? 30_000;
  const titleInput = page.getByTestId('document-title-input');
  if ((await titleInput.count()) > 0) {
    await expect(titleInput).toBeVisible({ timeout });
    await expect(titleInput).toHaveValue(title);
    return;
  }
  await expect(page.getByRole('heading', { name: title })).toBeVisible({
    timeout,
  });
}

/** Teacher submission grading shows the title in an input, not always as plain text. */
export async function expectSubmissionTitleVisible(
  page: Page,
  title: string,
  options?: { timeout?: number }
) {
  const timeout = options?.timeout ?? 30_000;
  const titleInput = page.getByTestId('submission-title-input');
  if ((await titleInput.count()) > 0) {
    await expect(titleInput).toBeVisible({ timeout });
    await expect(titleInput).toHaveValue(title);
    return;
  }
  await expect(page.getByText(title).first()).toBeVisible({ timeout });
}

async function openTeacherDocumentWorkFilter(page: Page) {
  const filter = page.getByRole('button', { name: /^Filter$/i }).first();
  await expect(filter).toBeVisible({ timeout: 15_000 });
  await filter.click();
}

/** Deep-link class documents (optional status / group / q query filters). */
export function classDocumentsTabUrl(
  classId: string,
  params?: {
    q?: string;
    documentGroup?: string;
    status?: string;
    assignmentId?: string;
    classAssignmentId?: string;
    studentId?: string;
  }
) {
  const search = new URLSearchParams({
    tab: 'documents',
    documentGroup: params?.documentGroup ?? 'none',
    status: params?.status ?? 'all',
  });
  if (params?.q) search.set('q', params.q.trim().toLowerCase());
  const assignmentParam = params?.assignmentId
    ? serializeDocumentWorkFilterIds([params.assignmentId])
    : null;
  if (assignmentParam) search.set('assignmentId', assignmentParam);
  if (params?.classAssignmentId) {
    search.set('classAssignmentId', params.classAssignmentId);
  }
  const studentParam = params?.studentId
    ? serializeDocumentWorkFilterIds([params.studentId])
    : null;
  if (studentParam) search.set('studentId', studentParam);
  return `/app/my-classes/${classId}?${search.toString()}`;
}

async function isClassDocumentsTableVisible(page: Page) {
  return page
    .getByRole('table', { name: /class documents/i })
    .isVisible()
    .catch(() => false);
}

/** Exit ticket assignment detail opens the creation sheet, not the edit route. */
export async function expectExitTicketEditSheetReady(
  page: Page,
  timeoutMs = 90_000
) {
  const sheet = page.getByTestId('assignment-creation-sheet');
  await expect(sheet).toBeVisible({ timeout: timeoutMs });
  await expect(
    sheet.getByRole('heading', { name: /Edit Assignment/i })
  ).toBeVisible({ timeout: timeoutMs });
  await expect(sheet.getByLabel('Title (optional)')).toBeVisible({
    timeout: timeoutMs,
  });
}

export async function expectClassDocumentsTable(page: Page) {
  await expect(
    page.getByRole('table', { name: /class documents/i })
  ).toBeVisible({ timeout: 30_000 });
}

export async function expectClassDocumentsTitleVisible(
  page: Page,
  title: string,
  timeoutMs = 60_000
) {
  const table = page.getByRole('table', { name: /class documents/i });
  await expect(table).toBeVisible({ timeout: 30_000 });
  await expect(table.getByText(title, { exact: true })).toBeVisible({
    timeout: timeoutMs,
  });
}

/** Narrow the class documents table via the Filter popover (preferred on CI). */
export async function filterClassDocumentsByTitle(
  page: Page,
  title: string,
  options?: { useUrl?: boolean; classId?: string }
) {
  const normalized = title.trim().toLowerCase();
  if (options?.useUrl) {
    const classId =
      options.classId ??
      page.url().match(/\/app\/my-classes\/([^/?]+)/)?.[1];
    if (!classId) {
      throw new Error('filterClassDocumentsByTitle requires a class id for URL mode');
    }
    await page.goto(
      classDocumentsTabUrl(classId, {
        q: normalized,
        status: 'all',
        documentGroup: 'none',
      })
    );
    await openClassDocumentsTab(page);
    await expectClassDocumentsTitleVisible(page, title.trim());
    return;
  }
  await fillTeacherDocumentWorkSearch(page, normalized);
  await expectClassDocumentsTitleVisible(page, title.trim());
}

export async function waitForClassDocumentTitle(
  page: Page,
  classId: string,
  title: string,
  options?: {
    assignmentId?: string;
    classAssignmentId?: string;
    studentId?: string;
    status?: string;
    q?: string;
    timeoutMs?: number;
  }
) {
  const timeoutMs = options?.timeoutMs ?? 90_000;
  const preferredStatus = options?.status ?? 'all';
  const statuses = preferredStatus === 'all' ? ['all'] : [preferredStatus, 'all'];
  const tableTitle = () =>
    page
      .getByRole('table', { name: /class documents/i })
      .getByText(title, { exact: true });
  const tabParams = (status: string) => ({
    status,
    documentGroup: 'none' as const,
    assignmentId: options?.assignmentId,
    classAssignmentId: options?.classAssignmentId,
    studentId: options?.studentId,
    q: options?.q,
  });
  const titleQuery = title.trim().toLowerCase();
  await expect
    .poll(
      async () => {
        for (const status of statuses) {
          await gotoClassDocumentsTab(page, classId, tabParams(status));
          if (!(await isClassDocumentsTableVisible(page))) {
            continue;
          }
          if (await tableTitle().isVisible().catch(() => false)) {
            return true;
          }
          await fillTeacherDocumentWorkSearch(page, titleQuery);
          if (await tableTitle().isVisible().catch(() => false)) {
            return true;
          }
        }
        return false;
      },
      { timeout: timeoutMs }
    )
    .toBe(true);
}

/** Filter popover search — use when URL `q` would hide rows the spec still needs visible. */
export async function filterClassDocumentsByTitleInPopover(
  page: Page,
  title: string
) {
  await fillTeacherDocumentWorkSearch(page, title.trim().toLowerCase());
  await expectClassDocumentsTitleVisible(page, title.trim());
}

/** Class detail documents tab (header tabs include counts in the label). */
export async function openClassDocumentsTab(page: Page) {
  const tab = page.locator('[data-header-tab="documents"]');
  await expect(tab).toBeVisible({ timeout: 15_000 });
  if ((await tab.getAttribute('aria-selected')) !== 'true') {
    await tab.click();
  }
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('class-documents-status-chips')).toBeVisible({
    timeout: 15_000,
  });
}

export async function gotoClassDocumentsTab(
  page: Page,
  classId: string,
  params?: {
    q?: string;
    documentGroup?: string;
    status?: string;
    assignmentId?: string;
    classAssignmentId?: string;
    studentId?: string;
  }
) {
  await page.goto(
    classDocumentsTabUrl(classId, {
      documentGroup: 'none',
      ...params,
    })
  );
  await openClassDocumentsTab(page);
}

/** Teacher document work search box (lives inside the Filter popover). */
export async function fillTeacherDocumentWorkSearch(page: Page, query: string) {
  await openTeacherDocumentWorkFilter(page);
  const search = page.getByRole('textbox', {
    name: /search (class )?documents/i,
  });
  await expect(search).toBeVisible({ timeout: 15_000 });
  await search.fill(query);
  await search.press('Enter');
  await expect(search).toHaveValue(query);
  await page.keyboard.press('Escape');
}

/** @deprecated Prefer classDocumentsTabUrl({ q }) — search is inside the Filter popover. */
export async function fillClassDocumentsSearch(page: Page, query: string) {
  await fillTeacherDocumentWorkSearch(page, query);
}

/** POST /start when the assignments list is slow to hydrate after join. */
export async function startStudentClassAssignment(
  page: Page,
  classAssignmentId: string
) {
  await expect(page.getByTestId('student-class-detail')).toBeVisible({
    timeout: 15_000,
  });
  await page.evaluate((id) => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = `/app/class-assignments/${id}/start`;
    document.body.append(form);
    form.requestSubmit();
  }, classAssignmentId);
  await page.waitForURL('**/app/documents/**', { timeout: 60_000 });
}

/** Class documents status chip (FilterPills may scroll horizontally). */
export async function clickClassDocumentsStatusTab(
  page: Page,
  name: string | RegExp
) {
  const chips = page.getByTestId('class-documents-status-chips');
  await expect(chips).toBeVisible({ timeout: 15_000 });
  const tab = chips.getByRole('tab', { name });
  for (let attempt = 0; attempt < 4; attempt++) {
    await tab.scrollIntoViewIfNeeded();
    if (await tab.isVisible()) {
      await tab.click();
      try {
        await expect(tab).toHaveAttribute('aria-selected', 'true', {
          timeout: 5_000,
        });
        return;
      } catch {
        // The chip can still be off-screen until the track scrolls.
      }
    }
    const scrollRight = page.getByTestId(
      'class-documents-status-chips-scroll-right'
    );
    if (await scrollRight.isVisible()) {
      await scrollRight.click();
    }
  }
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

/** Class detail assignments tab (header tabs include counts in the label). */
export async function openClassAssignmentsTab(page: Page) {
  const tab = page.locator('[data-header-tab="assignments"]');
  await expect(tab).toBeVisible({ timeout: 15_000 });
  if ((await tab.getAttribute('aria-selected')) !== 'true') {
    await tab.click();
  }
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(
    page.getByRole('textbox', { name: 'Search assignments' })
  ).toBeVisible({ timeout: 15_000 });
}

/** Class assignments rows open the assignment detail via the table row click handler. */
export async function clickClassAssignmentRow(
  page: Page,
  assignmentId: string,
  options?: { title?: string; classId?: string }
) {
  await openClassAssignmentsTab(page);
  const searchBox = page.getByTestId('class-assignments-search');
  if (options?.title) {
    await searchBox.fill('');
    await searchBox.fill(options.title);
    await expect(searchBox).toHaveValue(options.title);
  } else {
    await searchBox.fill('');
  }
  await expandAssignmentTypeSections(page);
  const open = page.getByTestId(`assignment-open-${assignmentId}`);
  const row = page.getByRole('row').filter({ has: open });
  try {
    await expect(open).toBeVisible({ timeout: 15_000 });
    await row.click();
  } catch (error) {
    if (!options?.classId) throw error;
    await page.goto(
      `/app/assignments/${assignmentId}?classId=${options.classId}`
    );
  }
}

/** Student class detail: ensure the Assignments tab is active (Radix tabs, not header tabs). */
export async function openStudentClassAssignmentsTab(page: Page) {
  const tab = page.getByRole('tab', { name: 'Assignments', exact: true });
  await expect(tab).toBeVisible({ timeout: 15_000 });
  if ((await tab.getAttribute('aria-selected')) !== 'true') {
    await tab.click();
  }
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

/** Student class Assignments tab rows navigate via the table row onClick handler. */
export async function clickStudentClassAssignmentRow(
  page: Page,
  options: {
    assignmentId?: string;
    title?: string;
    classAssignmentId?: string;
  }
) {
  await expect(page.getByTestId('student-class-detail')).toBeVisible({
    timeout: 15_000,
  });
  await openStudentClassAssignmentsTab(page);
  if (options.title) {
    const startButton = page.getByRole('button', {
      name: options.title,
      exact: true,
    });
    try {
      await expect(startButton).toBeVisible({ timeout: 15_000 });
      await startButton.click();
      return;
    } catch (error) {
      if (!options.classAssignmentId) throw error;
      await startStudentClassAssignment(page, options.classAssignmentId);
      return;
    }
  }
  if (options.classAssignmentId) {
    await startStudentClassAssignment(page, options.classAssignmentId);
    return;
  }
  await expandAssignmentTypeSections(page);
  const row = page
    .getByRole('row')
    .filter({ hasText: options.title ?? '' });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();
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

  const { completeUnifiedSignonToApp } = await import('./helpers/unified-login');
  await joinButton.click();
  await completeUnifiedSignonToApp(page, timeoutMs);
}
