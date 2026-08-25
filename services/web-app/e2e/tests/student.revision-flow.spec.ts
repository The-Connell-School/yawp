import { test, expect } from '../test-setup';
import { EDITOR_SELECTOR } from '../test-helpers';

/**
 * Student revision flow, V1 (behind Organization.revisionFlowEnabled, on for
 * the E2E organization).
 *
 * The graded submission and its feedback stay on the left; the live draft the
 * student rewrites is on the right. No tutor — that is V2.
 */
test.describe.serial('Student revises a released essay', () => {
  test('Revise Essay opens the split screen', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(`/app/submissions/${e2eContext.gradeId}`);

    await page.getByTestId('submission-revise-essay').click();

    await expect(page).toHaveURL(
      new RegExp(`/app/revise/${e2eContext.gradeId}`),
      { timeout: 15000 }
    );
    await expect(page.getByTestId('revision-graded-pane')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId('revision-draft-pane')).toBeVisible();
    await expect(page.locator('nav').getByText('Revising')).toBeVisible();
  });

  test('the graded pane carries the feedback and the draft pane carries none', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(`/app/revise/${e2eContext.gradeId}`);
    await expect(page.getByTestId('revision-graded-pane')).toBeVisible({
      timeout: 15000,
    });

    const gradedPane = page.getByTestId('revision-graded-pane');
    const draftPane = page.getByTestId('revision-draft-pane');

    // The teacher's marks live only on the released snapshot.
    await expect(gradedPane.locator('.grade-comment-mark').first()).toBeVisible(
      { timeout: 15000 }
    );
    await expect(draftPane.locator('.grade-comment-mark')).toHaveCount(0);
    await expect(draftPane.locator('.grammar-issue-mark')).toHaveCount(0);

    // The legend explains the colors but is not itself a mark: chips carrying
    // the mark classes would make "the first mark in the essay" select a chip.
    const legend = page.getByTestId('revision-mark-legend');
    await expect(legend).toBeVisible();
    await expect(legend.locator('.grade-comment-mark')).toHaveCount(0);
    await expect(legend.locator('.grammar-issue-mark')).toHaveCount(0);

    // Grade tab is the default view of the feedback panel. Scoped to the panel
    // because the pane header also carries the grade, so a student who has
    // collapsed the panel can still see what the essay scored.
    const feedbackPanel = page.getByTestId('revision-feedback-panel');
    await expect(feedbackPanel.getByText('77% (C+)')).toBeVisible();
    await expect(
      feedbackPanel.getByText('Good effort with room for improvement.')
    ).toBeVisible();

    await page.getByTestId('revision-feedback-tab-teacher').click();
    await expect(
      gradedPane.getByText('Strong thesis statement in the opening sentence.')
    ).toBeVisible();

    await page.getByTestId('revision-feedback-tab-assistant').click();
    await expect(
      gradedPane.getByText('E2E grammar highlight for student toggle.')
    ).toBeVisible();
  });

  test('the feedback panel collapses and reopens', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(`/app/revise/${e2eContext.gradeId}`);
    await expect(page.getByTestId('revision-graded-pane')).toBeVisible({
      timeout: 15000,
    });

    await expect(page.getByTestId('revision-feedback-panel')).toBeVisible();

    await page.getByRole('button', { name: 'Hide feedback' }).click();
    await expect(page.getByTestId('revision-feedback-panel')).toHaveCount(0);

    await page.getByRole('button', { name: 'Show feedback' }).click();
    await expect(page.getByTestId('revision-feedback-panel')).toBeVisible();
  });

  // Clicking a mark is how a student asks "what did they say about this?".
  // The panel has to come back out if they collapsed it, land on the right
  // tab, and put that note in front of them.
  test('clicking a teacher mark reopens the panel on that comment', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(`/app/revise/${e2eContext.gradeId}`);
    await expect(page.getByTestId('revision-graded-pane')).toBeVisible({
      timeout: 15000,
    });

    // Collapse it first: reopening is the part that matters.
    await page.getByRole('button', { name: 'Hide feedback' }).click();
    await expect(page.getByTestId('revision-feedback-panel')).toHaveCount(0);

    await page.locator('.grade-comment-mark').first().click();

    await expect(page.getByTestId('revision-feedback-panel')).toBeVisible();
    await expect(page.getByTestId('revision-feedback-tab-teacher')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(
      page
        .getByTestId('revision-feedback-panel')
        .getByText('Strong thesis statement in the opening sentence.')
    ).toBeInViewport();
  });

  test('clicking an assistant mark reopens the panel on that note', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(`/app/revise/${e2eContext.gradeId}`);
    await expect(page.getByTestId('revision-graded-pane')).toBeVisible({
      timeout: 15000,
    });

    await page.getByRole('button', { name: 'Hide feedback' }).click();
    await expect(page.getByTestId('revision-feedback-panel')).toHaveCount(0);

    await page.locator('.grammar-issue-mark').first().click();

    await expect(page.getByTestId('revision-feedback-panel')).toBeVisible();
    await expect(
      page.getByTestId('revision-feedback-tab-assistant')
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page
        .getByTestId('revision-feedback-panel')
        .getByText('E2E grammar highlight for student toggle.')
    ).toBeInViewport();
  });

  test('the draft pane is editable and the graded pane is not', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(`/app/revise/${e2eContext.gradeId}`);
    await expect(page.getByTestId('revision-graded-pane')).toBeVisible({
      timeout: 15000,
    });
    await helpers.waitForEditorReady();

    // Exactly one editing surface on the page: the revision draft.
    await expect(page.locator(EDITOR_SELECTOR)).toHaveCount(1);
    await expect(
      page.getByTestId('revision-draft-pane').locator(EDITOR_SELECTOR)
    ).toBeVisible();

    const editor = page.locator(EDITOR_SELECTOR).first();
    await editor.click();
    await editor.pressSequentially(' Revised in the split screen.', {
      delay: 20,
    });
    await helpers.waitForSaved();

    // The released snapshot is frozen: the revision never rewrites it.
    await expect(
      page.getByTestId('revision-graded-pane')
    ).not.toContainText('Revised in the split screen.');
  });

  // The two panes are one document seen twice, so a reader compares them line
  // by line. Both columns carry the same two rows of chrome to make that work,
  // and a change to either one's height would quietly break it.
  test('both panes start their text on the same line', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(`/app/revise/${e2eContext.gradeId}`);
    await expect(page.getByTestId('revision-graded-pane')).toBeVisible({
      timeout: 15000,
    });
    await page.locator(EDITOR_SELECTOR).first().waitFor({ timeout: 15000 });

    const topOf = (locator: ReturnType<typeof page.locator>) =>
      locator.first().evaluate((el) => el.getBoundingClientRect().top);

    const gradedTop = await topOf(
      page.getByTestId('revision-graded-pane').locator('.submission-essay p')
    );
    const draftTop = await topOf(
      page.getByTestId('revision-draft-pane').locator(`${EDITOR_SELECTOR} p`)
    );

    expect(Math.abs(draftTop - gradedTop)).toBeLessThanOrEqual(2);
  });

  // The prompt describes the assignment both drafts answer, so it spans the
  // screen once rather than sitting inside the editor above one of them.
  test('the assignment prompt spans both panes', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(`/app/revise/${e2eContext.gradeId}`);
    const prompt = page.getByTestId('revision-assignment-prompt');
    await expect(prompt).toBeVisible({ timeout: 15000 });

    const promptWidth = await prompt.evaluate(
      (el) => el.getBoundingClientRect().width
    );
    const draftWidth = await page
      .getByTestId('revision-draft-pane')
      .evaluate((el) => el.getBoundingClientRect().width);

    expect(promptWidth).toBeGreaterThan(draftWidth * 1.5);
    await expect(
      page.getByTestId('revision-draft-pane').getByTestId('assignment-prompt-panel')
    ).toHaveCount(0);
  });

  test('an unreleased submission cannot be revised yet', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(
      `/app/revise/${e2eContext.unreleasedGradedSubmissionId}`
    );

    await expect(page).toHaveURL(
      new RegExp(
        `/app/submissions/${e2eContext.unreleasedGradedSubmissionId}`
      ),
      { timeout: 15000 }
    );
    await expect(page.getByTestId('revision-draft-pane')).toHaveCount(0);
  });

  test('a teacher is refused the student revision screen', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/revise/${e2eContext.gradeId}`);

    await expect(page).toHaveURL(
      new RegExp(`/app/submissions/${e2eContext.gradeId}`),
      { timeout: 15000 }
    );
    await expect(page.getByTestId('revision-draft-pane')).toHaveCount(0);
  });
});
