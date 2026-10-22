import type { Page } from '@playwright/test';

export async function isDevPanelActive(page: Page) {
  return (
    (await page.getByRole('button', { name: 'Open developer tools' }).count()) >
    0
  );
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
  await page.getByRole('button', { name: 'Open developer tools' }).click();
  await page
    .getByRole('complementary', { name: 'Developer tools' })
    .getByRole('button', { name: 'Give feedback' })
    .click();
  return {
    panel: page.getByRole('dialog', { name: 'Give feedback' }),
    noteLabel: 'Note',
    hasSeverity: false,
  };
}
