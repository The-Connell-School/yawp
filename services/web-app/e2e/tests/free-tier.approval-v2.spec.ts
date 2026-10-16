import { expect, test } from '@playwright/test';
import { PrismaClient } from '@app/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { mkdir } from 'node:fs/promises';
import { createCookieSessionStorage } from 'react-router';

if (!process.env.APPROVAL_V2_BASE_URL || !process.env.E2E_DATABASE_URL ||
    !['localhost', '127.0.0.1'].includes(new URL(process.env.E2E_DATABASE_URL).hostname)) {
  throw new Error('Use the isolated approval-v2 project profile');
}
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.E2E_DATABASE_URL }) });
const shots = process.env.APPROVAL_V2_EVIDENCE_DIR;
async function flag(mode: 'off' | 'everyone' | 'targeted') {
  await db.setting.upsert({ where: { name: 'feature_flag.free-tier-onboarding-v2' },
    create: { name: 'feature_flag.free-tier-onboarding-v2', value: JSON.stringify({mode, orgIds: ['another-org']}) },
    update: {value: JSON.stringify({mode, orgIds: ['another-org']})} });
}
async function capture(page: import('@playwright/test').Page, name: string) {
  if (shots) { await mkdir(shots, { recursive: true }); await page.screenshot({ path: `${shots}/${name}-impl.png`, fullPage: true }); }
}
const apps: string[]=[]; const users: string[]=[];
async function fixture(page: import('@playwright/test').Page) {
  const user=await db.user.create({data:{email:`approval-${crypto.randomUUID()}@example.org`,name:'Ms. Okafor',memberships:{create:{organizationId:'default-org',role:'TEACHER'}}}});
  users.push(user.id);
  const app=await db.freeTierApplication.create({data:{userId:user.id,email:user.email!,name:user.name!,schoolName:'Lincoln High',location:'Local',gradeLevel:'11',status:'SENT'}}); apps.push(app.id);
  const approval=await db.freeTierAdminApproval.create({data:{applicationId:app.id,adminName:'Dr. Patel',adminEmail:'patel+approval@example.org',emailCopyVersionHash:'test',firstSentAt:new Date('2026-10-14T15:02:00Z')}});
  const session=await db.session.create({data:{userId:user.id,expirationDate:new Date(Date.now()+3600000)}});
  const storage=createCookieSessionStorage({cookie:{name:'en_session',secrets:process.env.SESSION_SECRET!.split(','),path:'/',httpOnly:true,sameSite:'lax'}});
  const cookie=await storage.getSession(); cookie.set('sessionId',session.id);
  await page.context().addCookies([{name:'en_session',value:(await storage.commitSession(cookie)).split(';')[0].slice('en_session='.length),url:process.env.APPROVAL_V2_BASE_URL!}]);
  return {app,approval,user};
}
test.beforeEach(async()=>{
  await db.organization.upsert({where:{id:'default-org'},create:{id:'default-org',name:'Local placeholder',plan:'FREE_CLASSROOM'},update:{plan:'FREE_CLASSROOM'}});
  await db.setting.upsert({where:{name:'feature_flag.free_tier'},create:{name:'feature_flag.free_tier',value:'true'},update:{value:'true'}});
});
test.afterAll(async () => {
  await flag('off'); await db.freeTierApplication.deleteMany({where:{id:{in:apps}}}); await db.user.deleteMany({where:{id:{in:users}}}); await db.$disconnect();
});
for (const width of [1280, 390]) test(`waiting and forwarding at ${width}`, async ({ page }) => {
  await flag('everyone');
  await page.setViewportSize({ width, height: 960 });
  await fixture(page);
  await page.goto('/app/free-tier/pending');
  if(process.env.APPROVAL_V2_BASELINE==='1') { await capture(page, `${width}-waiting-before`); return; }
  await expect(page.getByText('Sent to Dr. Patel on October 14')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Draft an email' })).toHaveAttribute('href', /mailto:patel%2Bapproval%40example\.org\?subject=/);
  await capture(page, `${width}-waiting`);
  await page.getByText('Not the right person? Forward this request').click();
  await capture(page, `${width}-forward`);
  await page.getByRole('button', { name: 'Forward request', exact: true }).click();
  await expect(page.getByLabel('Administrator name')).toHaveAttribute('aria-invalid', 'true');
  await capture(page, `${width}-forward-validation`);
});
test('flag-off and non-target controls', async ({ page }) => {
  await fixture(page);
  for (const mode of ['off', 'targeted'] as const) {
    await flag(mode);
    await page.goto('/app/free-tier/pending');
    await expect(page.getByRole('link', { name: 'Draft an email' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Resend reminder' })).toBeVisible();
    await capture(page, `1280-${mode}`);
  }
});
