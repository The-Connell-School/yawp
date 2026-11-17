/**
 * Pixel check for the waiting-for-approval homepage at Brian's laptop width.
 * The approval card used to share a grid row with the welcome heading and
 * squeeze My Classes into a narrow column. This loads the real dashboard CSS
 * against that DOM shape.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';
import { chromium, type Browser } from 'playwright';

async function launchLayoutBrowser(): Promise<Browser> {
  const candidates = [
    process.env.PW_EXECUTABLE_PATH,
    '/opt/google/chrome/chrome',
    '/usr/bin/google-chrome',
  ].filter((path): path is string => Boolean(path));
  let last: unknown;
  for (const executablePath of candidates) {
    try {
      return await chromium.launch({ headless: true, executablePath });
    } catch (error) {
      last = error;
    }
  }
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    last = error;
  }
  throw last;
}

const css = readFileSync(
  new URL('../../app/app-teacher-shell.css', import.meta.url),
  'utf8'
);

const html = `<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>${css}</style>
<section data-testid="app._index" class="free-tier-b2-page-shell" style="width:100%">
  <div class="locked-home-b2 free-dashboard w-full pb-24">
    <div class="locked-home-columns">
      <div class="locked-home-main flex flex-col" style="display:flex;flex-direction:column;gap:20px">
        <h1 class="locked-home-welcome">Welcome, Brian!</h1>
        <div class="locked-home-pending-banner">
          <section data-testid="locked-dashboard-pending-card" style="padding:20px;border:1px solid #ddd">
            <h2>Awaiting approval from Dr. Patel</h2>
            <p>Sent on November 16. In the meantime, feel free to explore your classroom!</p>
          </section>
        </div>
        <div class="locked-home-sections" data-testid="teacher-classes-grid" style="display:flex;flex-direction:column;gap:12px">
          <div style="display:flex;justify-content:space-between"><h2>My Classes</h2><span>View all</span></div>
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px">
            <article data-testid="class-card" style="height:220px;border:1px solid #ddd">English 10</article>
            <article data-testid="getting-started" style="height:220px;border:1px solid #ddd">Getting started checklist with several words that must stay on one line together</article>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>`;

describe('pending homepage at 1130px', () => {
  test('the heading sits above the banner and the class row uses the width', async () => {
    const browser = await launchLayoutBrowser();
    const page = await browser.newPage({ viewport: { width: 1130, height: 800 } });
    try {
    await page.setContent(html);
    const shots = process.env.LAYOUT_SHOTS;
    if (shots) {
      const { mkdirSync } = await import('node:fs');
      mkdirSync(shots, { recursive: true });
      await page.screenshot({ path: `${shots}/pending-home-1130.png` });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: `${shots}/pending-home-390.png` });
      await page.setViewportSize({ width: 1130, height: 800 });
    }
    const box = await page.evaluate(() => {
      const rect = (selector: string) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, width: r.width };
      };
      const welcome = rect('.locked-home-welcome');
      const banner = rect('[data-testid="locked-dashboard-pending-card"]');
      const card = rect('[data-testid="class-card"]');
      const started = rect('[data-testid="getting-started"]');
      const main = rect('.locked-home-main');
      const heading = document.querySelector('h2');
      const headingWidth = heading
        ? heading.getBoundingClientRect().width
        : 0;
      return { welcome, banner, card, started, main, headingWidth };
    });

    expect(box.welcome).not.toBeNull();
    expect(box.banner).not.toBeNull();
    expect(box.welcome!.bottom).toBeLessThanOrEqual(box.banner!.top + 1);
    expect(box.main!.width).toBeGreaterThan(700);
    expect(box.card!.width).toBeGreaterThan(180);
    expect(box.started!.top).toBeLessThan(box.card!.bottom + 40);
    expect(box.headingWidth).toBeGreaterThan(80);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => {
      const rect = (selector: string) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, width: r.width };
      };
      return {
        welcome: rect('.locked-home-welcome'),
        banner: rect('[data-testid="locked-dashboard-pending-card"]'),
        main: rect('.locked-home-main'),
      };
    });
    expect(mobile.welcome!.bottom).toBeLessThanOrEqual(mobile.banner!.top + 1);
    expect(mobile.main!.width).toBeGreaterThan(300);
    } finally {
      await browser.close();
    }
  });
});
