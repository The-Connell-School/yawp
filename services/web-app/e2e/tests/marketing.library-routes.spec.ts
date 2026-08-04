import { test, expect } from '../test-setup';
import {
  ALLOWED_ROUTES,
  MARKETING_LIBRARY,
} from '../../../../packages/marketing-media';

/**
 * The curated marketing library names real routes and films them unattended,
 * days or weeks after anyone last looked at the code. Nothing else ties those
 * storyboards to the app: when a page is retired, the library keeps pointing
 * at it and the breakage only surfaces later as a mystery `waitFor` timeout
 * on a preview renderer, at the end of a ten-minute feedback loop.
 *
 * That is exactly how the standalone assignments page cost a day — it was
 * deleted, and three storyboards went on navigating to it. This spec closes
 * that gap: it visits every route the library actually renders and fails in
 * the pull request that retires one, with an obvious message.
 *
 * Deliberately narrow. Seeded titles and click targets differ between the e2e
 * seed and the local-dev synthetic seed the storyboards are written against,
 * so asserting those here would fail for reasons that are not real breakage.
 * Route liveness is the part that is both stable across seeds and the part
 * that actually rotted.
 */

const APP_ERROR_BOUNDARY = /Oops! Something didn't work quite right/i;

/**
 * Every route a storyboard may navigate to, plus every route the curated
 * library actually films. The allowlist matters as much as the library: a
 * generated storyboard can send the renderer to any of those, so a dead one
 * is a render failure waiting to be discovered on a preview instead of here.
 */
function filmableRoutes(): string[] {
  const routes = new Set<string>(ALLOWED_ROUTES);
  for (const entry of MARKETING_LIBRARY) {
    const storyboard = entry.storyboard as {
      scenes?: { goto?: string }[];
    };
    for (const scene of storyboard.scenes ?? []) {
      if (scene.goto) routes.add(scene.goto);
    }
  }
  return [...routes].sort();
}

test.describe.serial('Marketing library routes still exist', () => {
  test.setTimeout(120_000);

  test('every route a storyboard may film still renders', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const routes = filmableRoutes();
    expect(routes.length).toBeGreaterThan(0);

    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');

    const broken: string[] = [];
    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      // The retired page did not 404 — it rendered the error boundary, which
      // has no <main> at all. That is why the renderer sat waiting on a
      // selector that was never coming.
      const erroredCount = await page.getByText(APP_ERROR_BOUNDARY).count();
      const mainCount = await page.locator('main').count();

      if (erroredCount > 0 || mainCount === 0) {
        broken.push(
          `${route} (error boundary: ${erroredCount > 0}, <main>: ${mainCount})`
        );
      }
    }

    expect(
      broken,
      `These routes are filmable by the marketing studio (ALLOWED_ROUTES or a curated library storyboard) but no longer render. Update packages/marketing-media (storyboard.ts, library.ts, route-guide.ts) to match the current app:\n${broken.join(
        '\n'
      )}`
    ).toEqual([]);
  });
});
