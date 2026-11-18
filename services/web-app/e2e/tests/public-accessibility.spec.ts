import { expect, test } from '@playwright/test';

test.describe('Public accessibility page', () => {
  test('login footer links to accessibility next to terms and privacy', async ({
    page,
  }) => {
    await page.goto('/auth/login');
    const footer = page.locator('footer.signon-footer');
    await expect(footer.getByRole('link', { name: 'Terms' })).toHaveAttribute(
      'href',
      '/terms'
    );
    await expect(footer.getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'href',
      '/privacy'
    );
    await expect(
      footer.getByRole('link', { name: 'Accessibility' })
    ).toHaveAttribute('href', '/accessibility');
  });

  test('links to accessibility information from the public info footer', async ({
    page,
  }) => {
    await page.goto('/info');

    await expect(
      page.locator('footer').getByRole('link', { name: 'Accessibility' })
    ).toHaveAttribute('href', '/accessibility');
  });

  test('publishes Yawp! accessibility status and reporting contact', async ({
    page,
  }) => {
    await page.goto('/accessibility');

    await expect(
      page.getByRole('heading', { name: 'Accessibility at Yawp!' })
    ).toBeVisible();
    await expect(
      page.getByText('designed and evaluated for WCAG 2.1 Level AA support')
    ).toBeVisible();
    await expect(page.getByText('working toward')).toHaveCount(0);
    await expect(page.getByText('Current status:')).toHaveCount(0);
    await expect(
      page.getByText('macOS VoiceOver smoke pass has covered')
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Known limitations' })
    ).toBeVisible();
    await expect(
      page.getByText('completed human keyboard-only walkthrough')
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Report an accessibility issue' })
    ).toBeVisible();

    const supportLink = page
      .locator('#report')
      .getByRole('link', { name: 'yawp@theconnellschool.com' });
    await expect(supportLink).toHaveAttribute(
      'href',
      /mailto:yawp@theconnellschool\.com/
    );

    await expect(
      page.getByRole('navigation', { name: 'Public legal navigation' })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Accessibility', exact: true })
    ).toHaveAttribute('href', '/accessibility');
    await expect(page.getByText('Last updated June 29, 2026.')).toBeVisible();
  });
});
