# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: free-tier.admin-deny-design-evidence.spec.tsx >> admin deny and Q&A design evidence at 390px
- Location: e2e/tests/free-tier.admin-deny-design-evidence.spec.tsx:47:3

# Error details

```
Test timeout of 240000ms exceeded.
```

```
Error: locator.click: Test timeout of 240000ms exceeded.
Call log:
  - waiting for locator('form button[type="submit"]')

```

# Test source

```ts
  1   | /**
  2   |  * Design evidence for admin deny + Q&A (deny-v1 / deny-v2 frames).
  3   |  * Set ADMIN_DENY_DESIGN_EVIDENCE_DIR and run with playwright e2e config.
  4   |  */
  5   | import { expect, test } from '@playwright/test';
  6   | import { mkdir, writeFile } from 'node:fs/promises';
  7   | import path from 'node:path';
  8   | import { createE2EPrismaClient } from '../prisma-client';
  9   | import { mintFreeTierLinkForE2E } from '../helpers/mint-free-tier-link';
  10  | import { buildTeacherDeniedDesignedEmail } from '../../app/emails/build-free-tier-emails.server';
  11  | 
  12  | const OUT = process.env.ADMIN_DENY_DESIGN_EVIDENCE_DIR;
  13  | const TEACHER = 'Jordan Rivera';
  14  | const SCHOOL = 'Lincoln High School';
  15  | const evidenceEnabled =
  16  |   !!OUT &&
  17  |   !!process.env.APPROVAL_V2_BASE_URL &&
  18  |   !!process.env.E2E_DATABASE_URL;
  19  | 
  20  | const db = createE2EPrismaClient();
  21  | const apps: string[] = [];
  22  | 
  23  | async function capture(page: import('@playwright/test').Page, id: string) {
  24  |   await page.evaluate(() => document.fonts.ready);
  25  |   await page.screenshot({
  26  |     path: path.join(OUT!, `${id}.png`),
  27  |     fullPage: true,
  28  |   });
  29  | }
  30  | 
  31  | test.beforeAll(async () => {
  32  |   if (!OUT) return;
  33  |   await mkdir(OUT, { recursive: true });
  34  |   await db.setting.upsert({
  35  |     where: { name: 'feature_flag.free_tier' },
  36  |     create: { name: 'feature_flag.free_tier', value: 'true' },
  37  |     update: { value: 'true' },
  38  |   });
  39  | });
  40  | 
  41  | test.afterAll(async () => {
  42  |   await db.freeTierApplication.deleteMany({ where: { id: { in: apps } } });
  43  |   await db.$disconnect();
  44  | });
  45  | 
  46  | for (const width of [1440, 390]) {
  47  |   test(`admin deny and Q&A design evidence at ${width}px`, async ({ page }) => {
  48  |     test.skip(!evidenceEnabled, 'Set ADMIN_DENY_DESIGN_EVIDENCE_DIR');
  49  |     test.setTimeout(240_000);
  50  |     await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
  51  |     const base = process.env.APPROVAL_V2_BASE_URL!;
  52  |     const css = `${base}/app/app.css`;
  53  | 
  54  |     const app = await db.freeTierApplication.create({
  55  |       data: {
  56  |         email: `deny-evidence-${crypto.randomUUID()}@example.edu`,
  57  |         name: TEACHER,
  58  |         schoolName: SCHOOL,
  59  |         location: 'Local',
  60  |         gradeLevel: '11',
  61  |         status: 'SENT',
  62  |       },
  63  |     });
  64  |     apps.push(app.id);
  65  |     const approval = await db.freeTierAdminApproval.create({
  66  |       data: {
  67  |         applicationId: app.id,
  68  |         adminName: 'Dr. Patel',
  69  |         adminEmail: 'patel@lincolnusd.org',
  70  |         emailCopyVersionHash: 'design-evidence',
  71  |       },
  72  |     });
  73  |     const mint = await mintFreeTierLinkForE2E(db, {
  74  |       applicationId: app.id,
  75  |       purpose: 'ADMIN_APPROVE',
  76  |     });
  77  |     await db.freeTierAdminApproval.update({
  78  |       where: { id: approval.id },
  79  |       data: { signedLinkId: mint.linkId },
  80  |     });
  81  | 
  82  |     const approveUrl = `${base}/free/admin/approve?t=${encodeURIComponent(mint.token)}`;
  83  |     const denyUrl = `${base}/free/admin/approve/deny?t=${encodeURIComponent(mint.token)}`;
  84  | 
  85  |     await page.goto(approveUrl, { waitUntil: 'networkidle' });
  86  |     await capture(page, `02_approve-page-with-deny-qanda-placeholder_${width === 390 ? 'mobile' : 'desktop'}`);
  87  |     await capture(page, `01_approve_qa_a_all_closed_${width === 390 ? 'mobile' : 'desktop'}`);
  88  | 
  89  |     await page.goto(denyUrl, { waitUntil: 'networkidle' });
  90  |     await capture(page, `04_deny-confirm_${width === 390 ? 'mobile' : 'desktop'}`);
  91  | 
> 92  |     const email = await buildTeacherDeniedDesignedEmail({
      |                                                      ^ Error: locator.click: Test timeout of 240000ms exceeded.
  93  |       teacherName: TEACHER,
  94  |       adminName: 'Dr. Patel',
  95  |       schoolName: SCHOOL,
  96  |       statusUrl: `${base}/app/free-tier/pending?ask=1`,
  97  |       chainCapReached: false,
  98  |     });
  99  |     await page.setContent(email.html, { waitUntil: 'networkidle' });
  100 |     await capture(page, `24_teacher-deny-email_${width === 390 ? 'mobile' : 'desktop'}`);
  101 | 
  102 |     await writeFile(
  103 |       path.join(OUT!, `evidence-manifest-${width}.json`),
  104 |       JSON.stringify({ width, capturedAt: new Date().toISOString() }, null, 2)
  105 |     );
  106 |     expect(await page.title()).toBeTruthy();
  107 |   });
  108 | }
  109 | 
```