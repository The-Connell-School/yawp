import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appCss = readFileSync(path.join(root, 'app/app.css'), 'utf8');

function mobileChromePaddingCss() {
  const authShell = appCss.match(/\.auth-page-shell\s*\{[^}]+\}/s)?.[0] ?? '';
  const freeTierShell =
    appCss.match(/\.free-tier-page \.auth-page-shell\s*\{[^}]+\}/s)?.[0] ?? '';
  const mobileBackLink =
    appCss.match(
      /@media \(max-width: 639px\)\s*\{\s*\/\* Back link is fixed[\s\S]*?\n\}/s
    )?.[0] ?? '';
  return [authShell, freeTierShell, mobileBackLink].join('\n');
}

function fixtureShell(withBackLink) {
  const backLink = withBackLink
    ? '<a class="card-page-back-link" href="/auth/login"><span>Back to sign in</span></a>'
    : '';
  return `<div class="free-tier-page"><main class="auth-page-shell auth-page-shell--chrome">${backLink}<div class="auth-page-frame"><div class="auth-page-logo"><img alt="" src=""/></div></div></main></div>`;
}

async function shellPaddingTopAt320(body) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
  await page.setContent(
    `<!DOCTYPE html><html><head><style>${mobileChromePaddingCss()}</style></head><body>${body}</body></html>`,
    { waitUntil: 'load' }
  );
  const result = await page.evaluate(() => {
    const shell = document.querySelector('.free-tier-page .auth-page-shell--chrome');
    return {
      paddingTop: getComputedStyle(shell).paddingTop,
      hasBackLink: Boolean(shell.querySelector(':scope > .card-page-back-link')),
    };
  });
  await browser.close();
  return result;
}

const adminResult = await shellPaddingTopAt320(fixtureShell(false));
const freeResult = await shellPaddingTopAt320(fixtureShell(true));
const failures = [];
if (adminResult.hasBackLink !== false) failures.push('admin: unexpected back link');
if (adminResult.paddingTop !== '32px') {
  failures.push(`admin: expected 32px padding-top, got ${adminResult.paddingTop}`);
}
if (freeResult.hasBackLink !== true) failures.push('free: missing back link');
if (freeResult.paddingTop !== '72px') {
  failures.push(`free: expected 72px padding-top, got ${freeResult.paddingTop}`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('ok');
