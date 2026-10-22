import { expect, type Page } from '@playwright/test';

export async function isDevPanelActive(page: Page) {
  return (
    (await page.getByRole('button', { name: 'Open developer tools' }).count()) >
    0
  );
}

export function devToolsPanel(page: Page) {
  return page.locator('#devtools');
}

export async function openDevToolsPanel(page: Page) {
  await page.getByRole('button', { name: 'Open developer tools' }).click();
  const panel = devToolsPanel(page);
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
  const panel = await openDevToolsPanel(page);
  await panel.getByRole('button', { name: 'Give feedback' }).click();
  return {
    panel: page.getByRole('dialog', { name: 'Give feedback' }),
    noteLabel: 'Note',
    hasSeverity: false,
  };
}
