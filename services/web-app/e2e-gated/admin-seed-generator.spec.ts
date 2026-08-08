import { expect, test, type Page } from '@playwright/test';

const MASTER_CODE = 'brave-otter-4193';
type MockSeedNode = {
  localId: string;
  kind: string;
  parentLocalId: string | null;
  status: string;
  committedEntityId: string | null;
  data: Record<string, unknown>;
};

async function openAsAdmin(page: Page) {
  await page.goto('/accessibility');
  await page.getByLabel('Access code').fill(MASTER_CODE);
  await page.getByRole('button', { name: 'Open preview' }).click();
  await page
    .getByRole('button', {
      name: 'Local development environment. Open dev login menu.',
    })
    .click();
  await page.getByRole('button', { name: /^Dev Admin\b/ }).click();
  await expect(page).toHaveURL(/\/app(\/|$)/);
}

test('admin opens the dedicated seed graph page from the organization card', async ({
  page,
}) => {
  await openAsAdmin(page);
  await page.goto('/app/admin/organizations/local-dev-org');
  await page.getByRole('link', { name: 'Open seed generator' }).click();

  await expect(
    page.getByRole('heading', { name: 'Seed data generator' })
  ).toBeVisible();
  await expect(page.getByLabel('Describe demo data')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'New seed plan' })
  ).toBeVisible();
  await expect(page.getByText('Entity graph')).toBeVisible();

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      )
      .toBe(true);
  }
});

test('admin reviews, lazy-fills, approves, and commits a complete graph', async ({
  page,
}) => {
  await openAsAdmin(page);
  let nodes: MockSeedNode[] = [
    {
      localId: 'class-1',
      kind: 'class',
      parentLocalId: null,
      status: 'proposed',
      committedEntityId: null,
      data: {
        title: 'English 9',
        grade: '9',
        period: '3',
        schoolYear: '2026-2027',
      },
    },
    {
      localId: 'assignment-1',
      kind: 'assignment',
      parentLocalId: 'class-1',
      status: 'proposed',
      committedEntityId: null,
      data: {
        title: 'Civic Essay',
        prompt: 'Write about civic responsibility.',
        assignmentTypeTitle: 'The Thesis-Driven Essay',
      },
    },
    {
      localId: 'student-1',
      kind: 'student',
      parentLocalId: 'class-1',
      status: 'proposed',
      committedEntityId: null,
      data: { name: 'Maya R.', writingProfile: 'on_track' },
    },
    {
      localId: 'document-1',
      kind: 'document',
      parentLocalId: 'assignment-1',
      status: 'proposed',
      committedEntityId: null,
      data: { title: 'Maya civic essay', studentLocalId: 'student-1' },
    },
    {
      localId: 'submission-1',
      kind: 'submission',
      parentLocalId: 'document-1',
      status: 'proposed',
      committedEntityId: null,
      data: { status: 'submitted' },
    },
  ];

  // The page reaches this resource route through `fetcher.submit`, and React
  // Router's single fetch appends a `.data` suffix to the request it actually
  // puts on the wire. Other specs mock plain `fetch()` calls and can match the
  // bare path; this one cannot, so the pattern has to stay open at the end.
  await page.route('**/app/api/domain/seed-generator*', async (route) => {
    const form = new URLSearchParams(route.request().postData() ?? '');
    const intent = form.get('intent');
    const localId = form.get('localId');
    if (intent === 'message') {
      await route.fulfill({
        json: {
          conversationId: 'conversation-e2e-1',
          reply: 'Proposed one complete writing chain.',
          nodes,
          isNewConversation: true,
        },
      });
      return;
    }
    if (intent === 'fill-node' && localId === 'submission-1') {
      nodes = nodes.map((node) =>
        node.localId === localId
          ? {
              ...node,
              data: {
                status: 'submitted',
                essayText: 'Civic responsibility starts with listening.',
              },
            }
          : node
      );
      await route.fulfill({ json: { nodes } });
      return;
    }
    if (intent === 'edit-node' && localId) {
      nodes = nodes.map((node) =>
        node.localId === localId
          ? { ...node, status: form.get('status') ?? node.status }
          : node
      );
      await route.fulfill({ json: { nodes } });
      return;
    }
    if (intent === 'commit-node') {
      nodes = nodes.map((node) => ({ ...node, status: 'committed' }));
      await route.fulfill({
        json: {
          nodes,
          summary: {
            classesCreated: 1,
            assignmentsCreated: 1,
            studentsCreated: 1,
            documentsCreated: 1,
            submissionsCreated: 1,
            skippedStudents: [],
          },
        },
      });
      return;
    }
    await route.fulfill({ status: 400, json: { error: 'Unexpected intent' } });
  });

  await page.goto('/app/admin/organizations/local-dev-org/seed-generator');
  await page
    .getByLabel('Describe demo data')
    .fill('Create one student with a submitted civic essay.');
  await page.getByRole('button', { name: 'Generate graph' }).click();
  await expect(page.getByText('English 9')).toBeVisible();

  await page.getByText('Essay content').click();
  await expect(
    page.getByText('Civic responsibility starts with listening.')
  ).toBeVisible();

  for (const name of [
    /Approve class English 9/,
    /Approve assignment Civic Essay/,
    /Approve student Maya R\./,
    /Approve document Maya civic essay/,
    /Approve submission submitted/,
  ]) {
    await page.getByRole('button', { name }).click();
  }

  await page.getByRole('button', { name: 'Commit 5 approved' }).click();
  await expect(
    page.getByText(/Created 1 classes, 1 assignments/)
  ).toBeVisible();
  await expect(page.locator('[data-node-status="committed"]')).toHaveCount(5);
});
