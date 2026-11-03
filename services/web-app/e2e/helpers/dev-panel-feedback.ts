import { expect, type Page } from '@playwright/test';

export const DEV_PANEL_STORAGE_KEY = 'yawp-dev-panel';

/** Clears persisted dev-panel state once the document is stable (retries through navigation). */
export async function clearDevPanelStorageWhenStable(page: Page) {
  await expect(async () => {
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate((key: string) => {
      localStorage.removeItem(key);
    }, DEV_PANEL_STORAGE_KEY);
  }).toPass({ timeout: 15_000 });
}

export function devToolsPanel(page: Page) {
  return page.locator('#devtools');
}

export function giveFeedbackDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Give feedback' });
}

export function freeTierStatesDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Free-tier states' });
}

/** Dev panel pin row — accessible name includes the subtitle (Note, screenshot, URL / Writing…). */
export function devPanelGiveFeedbackRow(panel: ReturnType<typeof devToolsPanel>) {
  return panel.getByRole('button', { name: /^Give feedback\b/ });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Free-tier sheet row — accessible name includes the state description (StatesSheet.dc.html). */
export function devPanelFreeTierStateOption(
  sheet: ReturnType<typeof freeTierStatesDialog>,
  label: string
) {
  return sheet.getByRole('button', {
    name: new RegExp(`^${escapeRegExp(label)}\\b`),
  });
}

/** Free-tier accordion group trigger — title plus subtitle in the accessible name. */
export function devPanelFreeTierGroupTrigger(
  sheet: ReturnType<typeof freeTierStatesDialog>,
  groupTitle: string
) {
  return sheet.getByRole('button', {
    name: new RegExp(`^${escapeRegExp(groupTitle)}\\b`),
  });
}

/** Panel chrome is mounted and shows locked, main menu, or a restored sub-sheet. */
export async function waitForDevPanelReady(page: Page) {
  const panel = devToolsPanel(page);
  await expect(panel).toBeVisible({ timeout: 60_000 });
  await expect(panel).toHaveAttribute('data-yawp-dev-panel-ready', 'true', {
    timeout: 60_000,
  });
  const locked = page.getByText('Developer tools are locked');
  const loadError = page.getByText("Developer tools couldn't load");
  const giveFeedbackRow = devPanelGiveFeedbackRow(panel);
  const giveFeedbackSheet = giveFeedbackDialog(page);
  const freeTierSheet = freeTierStatesDialog(page);
  const signInSection = panel.getByText('Sign in as');
  await expect(
    locked
      .or(loadError)
      .or(giveFeedbackRow)
      .or(giveFeedbackSheet)
      .or(freeTierSheet)
      .or(signInSection)
      .first()
  ).toBeVisible({ timeout: 60_000 });
  return panel;
}

export async function isDevPanelActive(page: Page) {
  if (await devToolsPanel(page).isVisible().catch(() => false)) return true;
  if (await giveFeedbackDialog(page).isVisible().catch(() => false)) return true;
  return (
    (await page.getByRole('button', { name: 'Open developer tools' }).count()) >
    0
  );
}

/** App shell + dev-panel mount are present; beaker is actionable (hydrated) before click. */
export async function waitForDeveloperToolsPageReady(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  const beaker = page.getByRole('button', { name: 'Open developer tools' });
  await expect(beaker).toBeVisible({ timeout: 15_000 });
  await expect(async () => {
    await beaker.click({ trial: true });
  }).toPass({ timeout: 15_000 });
}

export async function openDevToolsPanel(page: Page) {
  const panel = devToolsPanel(page);
  if (await panel.isVisible().catch(() => false)) {
    await waitForDevPanelReady(page);
    return panel;
  }
  if (await giveFeedbackDialog(page).isVisible().catch(() => false)) {
    await waitForDevPanelReady(page);
    return panel;
  }
  if (await freeTierStatesDialog(page).isVisible().catch(() => false)) {
    await waitForDevPanelReady(page);
    return panel;
  }

  await waitForDeveloperToolsPageReady(page);
  const beaker = page.getByRole('button', { name: 'Open developer tools' });
  const devPanel = devToolsPanel(page);

  let openAttempts = 0;
  await expect(async () => {
    openAttempts += 1;
    if (!(await devPanel.isVisible())) {
      await beaker.click({ timeout: 2_000 }).catch(() => {});
    }
    if (await devPanel.isVisible()) {
      await expect(devPanel).toBeVisible({ timeout: 3_000 });
      return;
    }
    if (openAttempts >= 2) {
      await page.keyboard.press('Alt+Shift+D');
    }
    await expect(devPanel).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });

  await waitForDevPanelReady(page);
  return devToolsPanel(page);
}

/** Opens a dev panel collapsible section when persisted state left it closed. */
export async function openDevPanelSection(page: Page, sectionName: string) {
  const panel = await openDevToolsPanel(page);
  const trigger = panel.getByRole('button', {
    name: new RegExp(`^${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`),
  });
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  const expanded = await trigger.getAttribute('aria-expanded');
  if (expanded !== 'true') {
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  }
  return panel;
}

/** Opens the class simulation flyout from the Tester tools section row (not the flyout action). */
export async function openDevPanelClassSimulationFlyout(page: Page) {
  const panel = await openDevToolsPanel(page);
  const testerToolsTrigger = panel.getByRole('button', {
    name: /^Tester tools/,
  });
  await expect(testerToolsTrigger).toBeVisible({ timeout: 15_000 });
  const expanded = await testerToolsTrigger.getAttribute('aria-expanded');
  if (expanded !== 'true') {
    await testerToolsTrigger.click();
    await expect(testerToolsTrigger).toHaveAttribute('aria-expanded', 'true');
  }
  await panel
    .locator('.yawp-dev-panel-login-row')
    .filter({ hasText: 'Populate class' })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Class simulation' })
  ).toBeVisible({ timeout: 15_000 });
}

export async function expectGiveFeedbackAccessible(page: Page) {
  const beaker = page.getByRole('button', { name: 'Open developer tools' });
  const legacy = page.locator('button[data-demo-feedback]', {
    hasText: /^Give feedback$/,
  });
  await expect(beaker.or(legacy).first()).toBeVisible({ timeout: 30_000 });
  if ((await beaker.count()) > 0) {
    const panel = await openDevToolsPanel(page);
    const row = devPanelGiveFeedbackRow(panel);
    const sheet = giveFeedbackDialog(page);
    await expect(row.or(sheet).first()).toBeVisible();
    return;
  }
  await expect(legacy).toBeVisible();
}

export async function openGiveFeedback(page: Page) {
  const devPanelDialog = giveFeedbackDialog(page);
  if (await devPanelDialog.isVisible().catch(() => false)) {
    return {
      panel: devPanelDialog,
      noteLabel: 'Note',
      hasSeverity: false,
    };
  }
  const legacyTrigger = page.locator('button[data-demo-feedback]', {
    hasText: /^Give feedback$/,
  });
  if (await legacyTrigger.count()) {
    await legacyTrigger.click();
    return {
      panel: page.getByRole('dialog', { name: 'Give feedback' }),
      noteLabel: 'Your note',
      hasSeverity: true,
    };
  }
  const tools = await openDevToolsPanel(page);
  const feedbackRow = devPanelGiveFeedbackRow(tools);
  if (await feedbackRow.isVisible().catch(() => false)) {
    await feedbackRow.click();
  } else {
    await expect(giveFeedbackDialog(page)).toBeVisible({ timeout: 60_000 });
  }
  return {
    panel: page.getByRole('dialog', { name: 'Give feedback' }),
    noteLabel: 'Note',
    hasSeverity: false,
  };
}
