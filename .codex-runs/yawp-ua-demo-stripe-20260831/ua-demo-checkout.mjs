import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { generateTOTP } from '../../services/web-app/app/utils/totp.server.ts';

const outputDir = new URL('./browser-proof/', import.meta.url).pathname;
await mkdir(outputDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const email = `ua-demo-qa-${stamp}@yawp.school`;
const password = 'Ua-demo-2026!Strong';
const entry =
  'https://ua-demo.yawp.school/?code=gentle-wren-7607&organizationCode=UA-DEMO-2026';

function readInvitation() {
  const escapedEmail = email.replaceAll("'", "''");
  const sql = [
    'SELECT row_to_json(invitation_row)::text FROM (',
    'SELECT "secret", "algorithm", "period", "charSet", "digits", "metadata"',
    'FROM "Invitation"',
    `WHERE "target" = '${escapedEmail}' AND "type" = 'onboard-student'`,
    'ORDER BY "createdAt" DESC LIMIT 1',
    ') AS invitation_row;',
  ].join(' ');
  const remote = [
    'docker',
    'exec',
    'preview-postgres',
    'psql',
    '--no-psqlrc',
    '-U',
    'postgres',
    '-d',
    'yawp_demo',
    '-At',
    '-c',
    `"${sql.replaceAll('"', '\\"')}"`,
  ].join(' ');
  const raw = execFileSync(
    'ssh',
    ['-i', `${process.env.HOME}/.ssh/yawp-demo`, '-o', 'BatchMode=yes', 'ec2-user@52.2.48.34', remote],
    { encoding: 'utf8' }
  ).trim();
  if (!raw) throw new Error('UA invitation was not created');
  const { secret, algorithm, period, charSet, digits, metadata } = JSON.parse(raw);
  const parsedMetadata = JSON.parse(metadata);
  if (
    parsedMetadata.partner !== 'ua' ||
    parsedMetadata.organizationId !== 'preview-seat-2'
  ) {
    throw new Error('UA invitation metadata was incorrect');
  }
  return {
    secret,
    algorithm,
    period: Number(period),
    charSet,
    digits: Number(digits),
  };
}

const browser = await chromium.launch({ headless: true, slowMo: 250 });
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: outputDir, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
const checkpoints = [];

try {
  await page.goto(entry, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Welcome to Yawp' }).waitFor();
  await page.getByAltText('The University of Alabama').waitFor();
  checkpoints.push('UA partner landing');
  await page.waitForTimeout(900);

  await page.getByRole('link', { name: 'Create an account' }).click();
  await page.waitForURL('**/auth/inv/signup');
  if ((await page.getByLabel('Code').count()) !== 0) {
    throw new Error('UA signup unexpectedly displayed the organization code input');
  }
  await page.getByText('University of Alabama code accepted').waitFor();
  checkpoints.push('Code-hidden signup');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForURL(/\/auth\/inv\/verify/, { timeout: 30_000 });

  const invitation = readInvitation();
  const { otp } = await generateTOTP(invitation);
  await page.getByLabel('Code').fill(otp);
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForURL(/\/auth\/inv\/onboard-student/, { timeout: 20_000 });
  checkpoints.push('Verified email');

  await page.getByLabel('Name').fill('UA Demo Student');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/\/billing\/ua$/, { timeout: 20_000 });
  await page.getByRole('heading', { name: 'Complete payment' }).waitFor();
  checkpoints.push('Unpaid student billing gate');
  await page.waitForTimeout(900);

  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  checkpoints.push('Stripe sandbox checkout');
  await page.waitForTimeout(1200);

  const cardLabel = page.getByText('Card', { exact: true });
  const cardBox = await cardLabel.boundingBox();
  if (!cardBox) throw new Error('Stripe card payment method was not visible');
  await page.mouse.click(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  const saveInformation = page.getByLabel(/Save my information for faster checkout/i);
  if (await saveInformation.isChecked().catch(() => false)) {
    await saveInformation.uncheck();
  }
  const card = page.getByLabel(/Card number/i);
  await card.fill('4242424242424242');
  await page.getByLabel(/Expiration|MM \/ YY/i).fill('1230');
  await page.getByRole('textbox', { name: 'CVC', exact: true }).fill('123');
  const name = page.getByLabel(/Cardholder name|Name on card/i);
  if (await name.count()) await name.fill('UA Demo Student');
  const country = page.getByLabel(/Country or region/i);
  if (await country.count()) await country.selectOption('US');
  const postal = page.getByLabel(/ZIP|Postal/i);
  if (await postal.count()) await postal.fill('35401');

  const pay = page.getByTestId('hosted-payment-submit-button');
  await pay.click();
  await page.waitForURL(/ua-demo\.yawp\.school\/(billing\/ua\/success|app)/, {
    timeout: 45_000,
  });
  await page.waitForURL(/\/app\/?$/, { timeout: 45_000 });
  await page.getByRole('dialog').waitFor({ timeout: 20_000 });
  checkpoints.push('Paid license and dashboard class-code dialog');
  await page.waitForTimeout(1600);

  const result = {
    email,
    password,
    finalUrl: page.url(),
    checkpoints,
    completedAt: new Date().toISOString(),
  };
  await writeFile(`${outputDir}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  await page.screenshot({ path: `${outputDir}/failure.png`, fullPage: true });
  await writeFile(
    `${outputDir}/failure.txt`,
    `${error?.stack ?? error}\nURL: ${page.url()}\n`
  );
  throw error;
} finally {
  await context.close();
  await browser.close();
}
