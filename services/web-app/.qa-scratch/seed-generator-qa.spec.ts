import { test, expect } from '@playwright/test';

const ACCESS_CODE = 'gentle-gecko-9153';
const ORG_ID = 'local-dev-org';

test('Bryant Macbeth scenario: two-turn continuity, graph, expandable content', async ({
  page,
}) => {
  test.setTimeout(240_000);

  // 1. Preview access gate
  await page.goto('/');
  await expect(page.getByLabel('Access code')).toBeVisible({
    timeout: 20_000,
  });
  await page.screenshot({ path: '/tmp/qa-01-gate.png', fullPage: true });
  await page.getByLabel('Access code').fill(ACCESS_CODE);
  await page.getByRole('button', { name: 'Open preview' }).click();
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: '/tmp/qa-02-post-gate.png', fullPage: true });

  // The gate lands on the marketing homepage; go to /app to reach the
  // login screen where the dev environment bar renders.
  await page.goto('/app');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: '/tmp/qa-02b-app-login.png', fullPage: true });

  // 2. Dev login as Dev Admin via flask icon
  const devMenuTrigger = page.getByRole('button', {
    name: /Open dev login menu/i,
  });
  await expect(devMenuTrigger).toBeVisible({ timeout: 20_000 });
  await devMenuTrigger.click();
  const devAdminButton = page.getByRole('button', { name: /^Dev Admin\b/ });
  await expect(devAdminButton).toBeVisible({ timeout: 10_000 });
  await devAdminButton.click();
  await expect(page).toHaveURL(/\/app(\/|$)/, { timeout: 20_000 });
  await page.screenshot({ path: '/tmp/qa-03-logged-in.png', fullPage: true });

  // 3. Go to the seed generator page
  await page.goto(`/app/admin/organizations/${ORG_ID}/seed-generator`);
  await expect(page.getByText('Seed data generator')).toBeVisible({
    timeout: 20_000,
  });
  await page.screenshot({
    path: '/tmp/qa-04-seed-generator-empty.png',
    fullPage: true,
  });

  // Capture raw network responses from the seed-generator action so we can
  // see the actual server response, not just what the UI renders.
  page.on('response', async (response) => {
    if (response.url().includes('/app/api/domain/seed-generator')) {
      try {
        const body = await response.text();
        console.log(
          `NETWORK_RESPONSE status=${response.status()} body=${body}`
        );
      } catch (error) {
        console.log(`NETWORK_RESPONSE_ERROR ${String(error)}`);
      }
    }
  });

  // 4. Turn 1: new student + new Macbeth paper
  const turn1Start = Date.now();
  await page
    .getByLabel('Describe demo data')
    .fill('Create a new student with a new Macbeth paper.');
  await page.getByRole('button', { name: 'Generate graph' }).click();
  await expect(page.getByText('Entity graph')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('[data-node-kind="student"]').first()).toBeVisible(
    { timeout: 30_000 }
  );
  await expect(
    page.locator('[data-node-kind="document"]').first()
  ).toBeVisible({ timeout: 30_000 });
  const turn1Ms = Date.now() - turn1Start;
  console.log(`TURN1_STRUCTURAL_MS=${turn1Ms}`);
  await page.screenshot({
    path: '/tmp/qa-05-turn1-graph.png',
    fullPage: true,
  });

  const studentCountAfterTurn1 = await page
    .locator('[data-node-kind="student"]')
    .count();
  const documentCountAfterTurn1 = await page
    .locator('[data-node-kind="document"]')
    .count();
  console.log(
    `AFTER_TURN1 students=${studentCountAfterTurn1} documents=${documentCountAfterTurn1}`
  );

  // 5. Turn 2 (same thread): follow-up asking for an ungraded submission
  // for that paper -- must resolve to the SAME student/document, not create
  // new ones.
  const turn2Start = Date.now();
  await page
    .getByLabel('Describe demo data')
    .fill('Now add an ungraded submission for that paper.');
  await page.getByRole('button', { name: 'Add to graph' }).click();
  await expect(page.locator('[data-node-kind="submission"]').first()).toBeVisible(
    { timeout: 30_000 }
  );
  const turn2Ms = Date.now() - turn2Start;
  console.log(`TURN2_STRUCTURAL_MS=${turn2Ms}`);
  await page.screenshot({
    path: '/tmp/qa-06-turn2-graph.png',
    fullPage: true,
  });

  const studentCountAfterTurn2 = await page
    .locator('[data-node-kind="student"]')
    .count();
  const documentCountAfterTurn2 = await page
    .locator('[data-node-kind="document"]')
    .count();
  const submissionCount = await page
    .locator('[data-node-kind="submission"]')
    .count();
  console.log(
    `AFTER_TURN2 students=${studentCountAfterTurn2} documents=${documentCountAfterTurn2} submissions=${submissionCount}`
  );
  // Continuity check: turn 2 must NOT have created a second student or a
  // second document -- it must have attached the submission to the entities
  // from turn 1.
  expect(studentCountAfterTurn2).toBe(studentCountAfterTurn1);
  expect(documentCountAfterTurn2).toBe(documentCountAfterTurn1);
  expect(submissionCount).toBeGreaterThan(0);

  // 6. Expand the essay content dropdown -- lazy content fill
  const fillStart = Date.now();
  await page.getByText('Essay content').click();
  await expect(page.getByText(/\w+/).first()).toBeVisible();
  // Wait for either the loading state to clear or content text to render.
  await page.waitForTimeout(500);
  await page.screenshot({
    path: '/tmp/qa-07-essay-expanded.png',
    fullPage: true,
  });
  const fillMs = Date.now() - fillStart;
  console.log(`CONTENT_FILL_TRIGGER_MS=${fillMs}`);

  // 7. Approve everything visible and commit
  const approveButtons = page.getByRole('button', { name: /^Approve / });
  const approveCount = await approveButtons.count();
  for (let i = 0; i < approveCount; i++) {
    await page.getByRole('button', { name: /^Approve / }).first().click();
    await page.waitForTimeout(300);
  }
  await page.screenshot({
    path: '/tmp/qa-08-approved.png',
    fullPage: true,
  });

  const commitStart = Date.now();
  const commitButton = page.getByRole('button', { name: /^Commit \d+ approved$/ });
  await expect(commitButton).toBeVisible({ timeout: 10_000 });
  await commitButton.click();
  await expect(page.getByText(/Created \d+ classes/)).toBeVisible({
    timeout: 60_000,
  });
  const commitMs = Date.now() - commitStart;
  console.log(`COMMIT_MS=${commitMs}`);
  await page.screenshot({
    path: '/tmp/qa-09-committed.png',
    fullPage: true,
  });

  console.log(
    `TOTAL_END_TO_END_MS=${turn1Ms + turn2Ms + fillMs + commitMs}`
  );
});
