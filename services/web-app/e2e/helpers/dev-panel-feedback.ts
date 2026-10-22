import { expect, type Page } from '@playwright/test';

export async function isDevPanelActive(page: Page) {
  if ((await devToolsPanel(page).count()) > 0) return true;
  return (
    (await page.getByRole('button', { name: 'Open developer tools' }).count()) >
    0
  );
}

export function devToolsPanel(page: Page) {
  return page.locator('#devtools');
}

export async function openDevToolsPanel(page: Page) {
  const panel = devToolsPanel(page);
  if (!(await panel.isVisible())) {
    await page.getByRole('button', { name: 'Open developer tools' }).click();
  }
  await expect(panel).toBeVisible({ timeout: 30_000 });
  return panel;
}

export async function expectGiveFeedbackAccessible(page: Page) {
  if (await isDevPanelActive(page)) {
    const panel = await openDevToolsPanel(page);
    await expect(panel.getByRole('button', { name: 'Give feedback' })).toBeVisible();
    return;
  }
  await expect(
    page.getByRole('button', { name: 'Give feedback', exact: true })
  ).toBeVisible();
}

export async function openGiveFeedback(page: Page) {
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
  await expect(feedbackRow).toBeVisible({ timeout: 15_000 });
  await feedbackRow.click();
  return {
    panel: page.getByRole('dialog', { name: 'Give feedback' }),
    noteLabel: 'Note',
    hasSeverity: false,
  };
}
