import { expect, type Page } from '@playwright/test';

export function devToolsPanel(page: Page) {
  return page.locator('#devtools');
}

/** Panel chrome is mounted and shows locked or unlocked content (not a hydration shell). */
export async function waitForDevPanelReady(page: Page) {
  const panel = devToolsPanel(page);
  await expect(panel).toBeVisible({ timeout: 60_000 });
  await expect(panel).toHaveAttribute('data-yawp-dev-panel-ready', 'true', {
    timeout: 60_000,
  });
  const locked = page.getByText('Developer tools are locked');
  const loadError = page.getByText("Developer tools couldn't load");
  const giveFeedback = panel.getByRole('button', { name: 'Give feedback' });
  await expect(locked.or(loadError).or(giveFeedback)).toBeVisible({
    timeout: 60_000,
  });
  return panel;
}

export async function isDevPanelActive(page: Page) {
  if (await devToolsPanel(page).isVisible().catch(() => false)) return true;
  return (
    (await page.getByRole('button', { name: 'Open developer tools' }).count()) >
    0
  );
}

export async function openDevToolsPanel(page: Page) {
  const panel = devToolsPanel(page);
  if (await panel.isVisible().catch(() => false)) return panel;

  const beaker = page.getByRole('button', { name: 'Open developer tools' });
  await expect(beaker).toBeVisible({ timeout: 60_000 });
  await beaker.click();
  try {
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
  await expect(beaker.or(legacy)).toBeVisible({ timeout: 30_000 });
  if ((await beaker.count()) > 0) {
    const panel = await openDevToolsPanel(page);
    await expect(panel.getByRole('button', { name: 'Give feedback' })).toBeVisible();
    return;
  }
  await expect(legacy).toBeVisible();
}

export async function openGiveFeedback(page: Page) {
  const devPanelDialog = page.getByRole('dialog', { name: 'Give feedback' });
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
  await expect(feedbackRow).toBeVisible({ timeout: 60_000 });
  await feedbackRow.click();
  return {
    panel: page.getByRole('dialog', { name: 'Give feedback' }),
    noteLabel: 'Note',
    hasSeverity: false,
  };
}
