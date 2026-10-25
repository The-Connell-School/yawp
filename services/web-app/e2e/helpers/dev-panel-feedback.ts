import { expect, type Page } from '@playwright/test';

export function devToolsPanel(page: Page) {
  return page.locator('#devtools');
}

export function giveFeedbackDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Give feedback' });
}

export function freeTierStatesDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Free-tier states' });
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
  const giveFeedbackRow = panel.getByRole('button', { name: 'Give feedback' });
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

/** App shell + dev-panel mount are present; beaker clicks are not dropped on hydration. */
export async function waitForDeveloperToolsPageReady(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  const beaker = page.getByRole('button', { name: 'Open developer tools' });
  await expect(beaker).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#devtools')).toBeAttached({ timeout: 15_000 });
  await page
    .waitForFunction(
      () => {
        const button = document.querySelector<HTMLButtonElement>(
          'button[aria-label="Open developer tools"]'
        );
        return Boolean(button && button.offsetParent !== null);
      },
      undefined,
      { timeout: 5_000 }
    )
    .catch(async () => {
      await page.waitForTimeout(300);
    });
}

const DEV_TOOLS_CLICK_RETRY_BUDGET_MS = 15_000;
const DEV_TOOLS_CLICK_ATTEMPT_MS = 2_000;
const DEV_TOOLS_PANEL_READY_SHORT_MS = 5_000;

async function openDeveloperToolsViaBeakerClick(page: Page) {
  await waitForDeveloperToolsPageReady(page);
  const beaker = page.getByRole('button', { name: 'Open developer tools' });
  const deadline = Date.now() + DEV_TOOLS_CLICK_RETRY_BUDGET_MS;
  while (Date.now() < deadline) {
    const panel = devToolsPanel(page);
    if (await panel.isVisible().catch(() => false)) {
      await expect(panel).toHaveAttribute('data-yawp-dev-panel-ready', 'true', {
        timeout: DEV_TOOLS_PANEL_READY_SHORT_MS,
      });
      return;
    }
    await beaker.click({ timeout: DEV_TOOLS_CLICK_ATTEMPT_MS }).catch(() => {});
    if (await panel.isVisible().catch(() => false)) {
      await expect(panel).toHaveAttribute('data-yawp-dev-panel-ready', 'true', {
        timeout: DEV_TOOLS_PANEL_READY_SHORT_MS,
      });
      return;
    }
    await page.waitForTimeout(200);
  }
  throw new Error('developer_tools_button_did_not_open_panel');
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

  try {
    await openDeveloperToolsViaBeakerClick(page);
    await waitForDevPanelReady(page);
  } catch {
    await page.keyboard.press('Alt+Shift+D');
    await waitForDevPanelReady(page);
  }
  return devToolsPanel(page);
}

export async function expectGiveFeedbackAccessible(page: Page) {
  const beaker = page.getByRole('button', { name: 'Open developer tools' });
  const legacy = page.getByRole('button', { name: 'Give feedback', exact: true });
  await expect(beaker.or(legacy).first()).toBeVisible({ timeout: 30_000 });
  if ((await beaker.count()) > 0) {
    const panel = await openDevToolsPanel(page);
    const row = panel.getByRole('button', { name: 'Give feedback' });
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
  const legacyTrigger = page.getByRole('button', {
    name: 'Give feedback',
    exact: true,
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
  const feedbackRow = tools.getByRole('button', { name: 'Give feedback' });
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
