import { test, expect } from '../test-setup';

test.describe('Admin live status dashboard', () => {
  test('shows backend status and keeps polling without a user prompt', async ({
    page,
    signIn,
  }) => {
    let liveStatusRequests = 0;

    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/admin/live-status') {
        liveStatusRequests += 1;
      }
    });

    await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
    await page.goto('/app/admin/live-status');

    await expect(
      page.getByRole('heading', { name: 'Live Status' })
    ).toBeVisible();
    await expect(page.getByText('Backend reachable')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId('live-status-server-time')).toContainText(
      /\d{4}-\d{2}-\d{2}T/
    );
    await expect
      .poll(() => liveStatusRequests, { timeout: 7_000 })
      .toBeGreaterThanOrEqual(2);
  });
});
