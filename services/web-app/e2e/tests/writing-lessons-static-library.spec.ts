import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

test.describe.serial('Writing Fundamentals Practice', () => {
  // Writing practice ships dark behind the org flag (default false): without
  // this every route here 302s and even the nav entry is hidden.
  test.beforeEach(async ({ e2eContext }) => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.organization.update({
        where: { id: e2eContext.organizationId },
        data: { writingPracticeEnabled: true },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterEach(async ({ e2eContext }) => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.organization.update({
        where: { id: e2eContext.organizationId },
        data: { writingPracticeEnabled: false },
      });
    } finally {
      await prisma.$disconnect();
    }
  });
  test('lets a student discover writing practice from the dashboard', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app');
    await expect(page.getByTestId('app._index')).toBeVisible();

    // Students reach the practice library from the persistent "Practice" entry
    // in the side menu.
    const practiceNav = page
      .locator('nav a[href="/app/writing-lessons"]')
      .first();
    await expect(practiceNav).toBeVisible();

    await practiceNav.click();
    await expect(
      page.getByRole('heading', { name: /writing practice/i }).first()
    ).toBeVisible();
    // Sections are collapsed by default; open Grammar & Mechanics to reach a lesson.
    await page.getByRole('button', { name: 'Grammar & Mechanics' }).click();
    await expect(
      page.getByRole('link', { name: /revising for wordiness/i })
    ).toBeVisible();
  });

  test('lets a student expand and collapse a practice section', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app/writing-lessons');

    // Sections start collapsed so the index stays compact: the section heading
    // is visible but its lessons are hidden until you open it.
    const lessonLink = page.getByRole('link', {
      name: /revising for wordiness/i,
    });
    await expect(lessonLink).toBeHidden();

    // The section heading doubles as a toggle. Opening it reveals the lessons.
    const toggle = page.getByRole('button', { name: 'Grammar & Mechanics' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(lessonLink).toBeVisible();

    // Collapsing it again hides the lessons and reclaims the space.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(lessonLink).toBeHidden();
  });

  test('lets a student create their own mixed practice set', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app/writing-lessons');

    await page.getByTestId('writing-practice-create').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/skills to practice/i)).toBeVisible();
    await dialog.getByTestId('practice-skill-fixing-comma-splices').click();
    await dialog.getByTestId('practice-skill-passive-voice').click();
    await dialog.getByTestId('practice-count-10').click();
    await dialog.getByTestId('start-mixed-practice').click();

    // Lands in a self-directed session built from both skills, ten problems
    // long — the set the student asked for, not a single-skill fallback.
    await expect(page).toHaveURL(
      /\/app\/writing-lessons\/practice\?skills=fixing-comma-splices%2Cpassive-voice&count=10/
    );
    await expect(
      page.getByRole('heading', { name: /grammar practice/i })
    ).toBeVisible();
    // Both skills are named in the header, so the set reads as the mix it is.
    await expect(
      page.getByText('Fixing Comma Splices', { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText('Passive Voice', { exact: true })
    ).toBeVisible();
    await expect(page.getByText(/1 of 10/i)).toBeVisible();

    // Answer an ACT multiple-choice question and see the deterministic result.
    await page.getByRole('radio').first().check();
    await page.getByRole('button', { name: /check my answer/i }).click();
    await expect(page.getByTestId('act-result')).toBeVisible();
  });

  test('lets a teacher assign one set covering several skills', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/writing-lessons');

    // Same corner, same button — a teacher creates an assignment where a
    // student creates practice.
    const create = page.getByTestId('writing-practice-create');
    await expect(create).toHaveText(/create assignment/i);
    await create.click();

    const dialog = page.getByRole('dialog');
    await dialog.getByTestId('practice-skill-fixing-comma-splices').click();
    await dialog.getByTestId('practice-skill-passive-voice').click();
    // Two skills, so the set is named for the mix rather than either one.
    await expect(dialog.getByLabel('Assignment title')).toHaveValue(
      'Mixed writing practice'
    );

    await dialog
      .getByTestId(/^writing-practice-class-/)
      .first()
      .click();
    await dialog.getByLabel('Due date').fill('2026-12-01');
    await dialog.getByLabel('Number of problems').fill('4');
    await dialog.getByRole('button', { name: /assign practice/i }).click();
    await expect(
      dialog.getByTestId('writing-practice-assign-result')
    ).toContainText(/assigned to/i);

    // One assignment carrying both skills — not one assignment per skill.
    await page.reload();
    const card = page
      .getByTestId('writing-practice-assignment-list')
      .locator('[data-testid^="writing-practice-assignment-"]')
      .filter({ hasText: 'Mixed writing practice' });
    await expect(card).toContainText('Fixing Comma Splices');
    await expect(card).toContainText('Passive Voice');

    // And the student it was assigned to works that one mixed set.
    await page.request.post('/auth/logout');
    await page.context().clearCookies();
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app/writing-lessons');
    await page
      .getByTestId('writing-practice-assignment-list')
      .locator('[data-testid^="writing-practice-assignment-"]')
      .filter({ hasText: 'Mixed writing practice' })
      .getByTestId(/^writing-practice-start-/)
      .click();
    await expect(page).toHaveURL(/\/app\/writing-lessons\/assigned\//);
    await expect(page.getByText(/Problem 1 of 4/i)).toBeVisible();
  });

  test('loads lessons by direct URL and supports a self-guided practice check', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app/writing-lessons');

    await expect(
      page.getByRole('heading', { name: /writing practice/i }).first()
    ).toBeVisible();
    // The page leads with the practice hero and its lesson/prompt counts.
    await expect(page.getByTestId('writing-practice-hero')).toBeVisible();
    await expect(
      page.getByTestId('writing-practice-student-intro')
    ).toBeVisible();
    // Sections start collapsed; open Grammar & Mechanics to see its lessons.
    await page.getByRole('button', { name: 'Grammar & Mechanics' }).click();
    await expect(
      page.getByRole('link', { name: /revising for wordiness/i })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /comma splices/i })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /pronoun agreement/i })
    ).toBeVisible();

    await page.getByRole('link', { name: /revising for wordiness/i }).click();

    await expect(
      page.getByRole('heading', { name: 'Revising for Wordiness' })
    ).toBeVisible();

    // The lesson hands the student the real practice screen rather than a
    // preview panel: one button, and they are working the same set layout an
    // assignment would put in front of them.
    const panel = page.getByRole('complementary');
    await expect(panel.getByText(/try it yourself/i)).toBeVisible();
    await panel.getByTestId('start-practice').click();

    await expect(
      page.getByRole('heading', { name: /problem 1 of 5/i })
    ).toBeVisible();
    // ACT English-style multiple choice: a sentence with an underlined portion
    // and four answer choices.
    await expect(page.getByText(/choose the best answer/i)).toBeVisible();
    // The first offline question drills a padded opening phrase.
    await expect(page.getByText(/committee has not reached/i)).toBeVisible();

    // Pick the concise correct answer and check — grading is deterministic and
    // works with no ANTHROPIC_API_KEY (E2E runs offline against the static bank).
    await page.getByRole('radio', { name: /currently/i }).check();
    await page.getByRole('button', { name: /check my answer/i }).click();

    const result = page.getByTestId('act-result');
    await expect(result).toBeVisible();
    await expect(result.getByText(/correct!/i)).toBeVisible();
    await expect(result.getByText(/currently/i)).toBeVisible();

    // The set keeps its own progress and works through to the end without ever
    // dead-ending — the offline bank is smaller than the set, so it cycles.
    await expect(page.getByText(/1 of 5 done/i)).toBeVisible();
    for (let problem = 2; problem <= 5; problem++) {
      await page.getByRole('button', { name: /next problem/i }).click();
      await expect(
        page.getByRole('heading', {
          name: new RegExp(`problem ${problem} of 5`, 'i'),
        })
      ).toBeVisible();
      await expect(page.getByTestId('act-result')).toHaveCount(0);
      await expect(page.getByText(/choose the best answer/i)).toBeVisible();

      // Each problem has to be answered before the set moves on.
      await page.getByRole('radio').first().check();
      await page.getByRole('button', { name: /check my answer/i }).click();
      await expect(page.getByTestId('act-result')).toBeVisible();
      await expect(
        page.getByText(new RegExp(`${problem} of 5 done`, 'i'))
      ).toBeVisible();
    }

    // Finishing the last problem closes the set out.
    await page.getByRole('button', { name: /finish/i }).click();
    await expect(page.getByText(/finished this practice set/i)).toBeVisible();
    await expect(page.getByTestId('practice-again')).toBeVisible();
  });

  test('lets a teacher assign a lesson to one of their classes', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/writing-lessons/fixing-comma-splices');

    // Teachers get the assign panel (and, below it, the practice panel).
    const assignPanel = page.getByRole('complementary');
    await expect(
      assignPanel.getByRole('heading', { name: /assign to your classes/i })
    ).toBeVisible();
    await expect(page.getByTestId('act-result')).toHaveCount(0);

    const classCheckbox = page.locator('input[name="classIds"]').first();
    await classCheckbox.check();
    await page.locator('input[name="problemCount"]').fill('4');
    await page.locator('input[name="dueAt"]').fill('2026-12-01');
    await page.getByRole('button', { name: /assign practice/i }).click();

    await expect(page.getByTestId('assign-result')).toContainText(
      /assigned to 1 class/i
    );
  });

  test('a student mid-assignment refreshes the skill without losing their place', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    // Leaving for the lesson page mid-set costs a student the problem they
    // were on, so the refresher comes to them.
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/writing-lessons/passive-voice');
    await page.locator('input[name="classIds"]').first().check();
    await page.locator('input[name="problemCount"]').fill('3');
    await page.locator('input[name="dueAt"]').fill('2026-12-01');
    await page.getByRole('button', { name: /assign practice/i }).click();
    await expect(page.getByTestId('assign-result')).toContainText(
      /assigned to/i
    );

    await page.request.post('/auth/logout');
    await page.context().clearCookies();
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app/writing-lessons');
    await page
      .getByTestId('writing-practice-assignment-list')
      .locator('[data-testid^="writing-practice-assignment-"]')
      .filter({ hasText: 'Passive Voice practice' })
      .getByTestId(/^writing-practice-start-/)
      .click();
    await expect(page).toHaveURL(/\/app\/writing-lessons\/assigned\//);
    const assignedUrl = page.url();
    await expect(
      page.getByRole('heading', { name: /problem 1 of 3/i })
    ).toBeVisible();

    // The refresher opens beside the problem, abridged: the rule and a worked
    // example, not the whole lesson.
    await page
      .getByRole('button', { name: /review lesson: passive voice/i })
      .click();
    const recap = page.getByTestId('lesson-recap');
    await expect(recap).toBeVisible();
    await expect(recap.getByText('The Rule')).toBeVisible();
    await expect(recap.getByText(/example 1/i)).toBeVisible();
    // The parts a student mid-set does not need are left behind.
    await expect(recap).not.toContainText(/why this matters/i);
    await expect(recap).not.toContainText(/practice time/i);
    // The full lesson is still one click away when the recap is not enough.
    await expect(
      recap.getByRole('link', { name: /read the full lesson/i })
    ).toBeVisible();

    // Closing it puts them back on the same problem, on the same page.
    await page.keyboard.press('Escape');
    await expect(recap).toHaveCount(0);
    expect(page.url()).toBe(assignedUrl);
    await expect(
      page.getByRole('heading', { name: /problem 1 of 3/i })
    ).toBeVisible();
  });

  test('lets a teacher try the practice themselves and check with Enter', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/writing-lessons/fixing-comma-splices');

    // Teachers can test-drive the lesson, not just assign it — and what they
    // get is the students' screen, labelled as a preview because a teacher is
    // evaluating it rather than practising.
    const panel = page.getByRole('complementary');
    await expect(panel.getByText(/preview the practice/i)).toBeVisible();
    await panel.getByTestId('start-practice').click();
    await expect(page.getByText(/choose the best answer/i)).toBeVisible();

    // The first comma-splice item is fixed with a semicolon. Select it and
    // press Enter to check — no button click needed.
    const correct = page.getByRole('radio', { name: /week; students/i });
    await correct.check();
    await correct.press('Enter');

    const result = page.getByTestId('act-result');
    await expect(result).toBeVisible();
    await expect(result.getByText(/correct!/i)).toBeVisible();
  });

  test('a teacher assignment reaches the student and records attempts', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    // Teacher assigns the lesson to their (and the student's) class.
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/writing-lessons/fixing-comma-splices');
    await page.locator('input[name="classIds"]').first().check();
    await page.locator('input[name="problemCount"]').fill('4');
    await page.locator('input[name="dueAt"]').fill('2026-12-01');
    await page.getByRole('button', { name: /assign practice/i }).click();
    await expect(page.getByTestId('assign-result')).toContainText(
      /assigned to/i
    );

    // The assignment also surfaces on the student dashboard's Assignments tab,
    // listed alongside their other assignments (not as a generic practice
    // banner).
    await page.request.post('/auth/logout');
    await page.context().clearCookies();
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app?tab=assignments');
    const dashboardCard = page
      .getByTestId('writing-practice-assignment-card')
      .first();
    await expect(dashboardCard).toBeVisible();

    // And under "Assigned to you" on the practice page, where "Start practice"
    // opens the assignment itself rather than the generic lesson page.
    await page.goto('/app/writing-lessons');
    await page
      .getByRole('link', { name: /start practice/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/app\/writing-lessons\/assigned\//);

    await expect(
      page.getByRole('heading', { name: /problem 1 of/i })
    ).toBeVisible();

    // The first offline question drills the comma splice; pick the semicolon fix.
    await expect(page.getByText(/choose the best answer/i)).toBeVisible();
    await page.getByRole('radio', { name: /week; students/i }).check();
    await page.getByRole('button', { name: /check & save/i }).click();

    // The deterministic result appears and the attempt is recorded.
    await expect(page.getByTestId('act-result')).toBeVisible();
    await expect(page.getByText(/1 of 4 done/i)).toBeVisible();

    await page.getByRole('button', { name: /next problem/i }).click();
    await expect(
      page.getByRole('heading', { name: /problem 2 of/i })
    ).toBeVisible();

    // Teacher sees the student's score (correct answers, not just answered)
    // plus how far through the problems they are.
    await page.request.post('/auth/logout');
    await page.context().clearCookies();
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/writing-lessons');
    await page
      .getByRole('link', { name: /view results/i })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { name: /student progress/i })
    ).toBeVisible();
    const studentRow = page
      .getByTestId('student-progress-row')
      .filter({ hasText: '1/4 correct' });
    await expect(studentRow).toBeVisible();
    await expect(studentRow).toContainText(/1 of 4 answered/i);

    // And can expand that student to read the exact answer and its feedback.
    await studentRow.click();
    const attempts = page.getByTestId('student-attempts');
    await expect(attempts).toBeVisible();
    await expect(attempts.getByText(/their answer/i)).toBeVisible();
    // The teacher sees the exact choice the student picked, marked correct.
    await expect(attempts.getByText(/week; students/i)).toBeVisible();
    await expect(attempts.getByText('Correct', { exact: true })).toBeVisible();
  });

  // KNOWN GAP, not a flake: writing practice is no longer an assignment type
  // inside the shared create-assignment sheet, and the dashboard has no
  // practice tile — both were dropped when this branch merged main's
  // redesigned dashboard and sheet. Assigning now happens from the per-lesson
  // sheet (covered by the test below). Decide whether the shared-sheet path
  // should come back, then restore or retire this.
  test('shows a teacher how the skill has landed in their classes', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    // A lesson page reads the same to both audiences until it carries
    // something only a teacher can act on: their own students' work.
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/writing-lessons/pronoun-agreement');

    const panel = page.getByRole('complementary');
    const evidence = panel.getByTestId('lesson-evidence');
    await expect(evidence).toBeVisible();
    // Nothing assigned yet, so it says what will appear here rather than
    // showing an empty table.
    await expect(panel.getByTestId('lesson-evidence-empty')).toBeVisible();

    await page.locator('input[name="classIds"]').first().check();
    await page.locator('input[name="problemCount"]').fill('3');
    await page.locator('input[name="dueAt"]').fill('2026-12-01');
    await page.getByRole('button', { name: /assign practice/i }).click();
    await expect(page.getByTestId('assign-result')).toContainText(
      /assigned to/i
    );

    // The student works it and gets the first question wrong.
    await page.request.post('/auth/logout');
    await page.context().clearCookies();
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app/writing-lessons');
    await page
      .getByTestId(/^writing-practice-start-/)
      .first()
      .click();
    await expect(page).toHaveURL(/\/app\/writing-lessons\/assigned\//);

    await page.getByRole('radio').first().check();
    await page.getByRole('button', { name: /check & save/i }).click();
    await expect(page.getByTestId('act-result')).toBeVisible();

    // The teacher comes back to the lesson and can see it — the class that
    // worked it, and the question that tripped them up.
    await page.request.post('/auth/logout');
    await page.context().clearCookies();
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/writing-lessons/pronoun-agreement');

    await expect(page.getByTestId('lesson-evidence-empty')).toHaveCount(0);
    const classes = page.getByTestId('lesson-evidence-classes');
    await expect(classes).toContainText(/1 of \d+ practiced/i);
    await expect(
      classes.getByRole('link', { name: /view results/i }).first()
    ).toBeVisible();

    const misses = page.getByTestId('lesson-evidence-misses');
    await expect(misses).toBeVisible();
    await expect(misses).toContainText(/1 of 1 missed this/i);
    await expect(misses).toContainText(/correct:/i);
    // The wording their students actually picked, ready for the board — not
    // the label on the button. "They chose: NO CHANGE" would tell a teacher
    // nothing about what their students wrote.
    await expect(misses.getByText(/They chose: \S+/)).toBeVisible();
    await expect(misses).not.toContainText(/they chose: no change/i);

    // A student never sees any of it.
    await page.request.post('/auth/logout');
    await page.context().clearCookies();
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app/writing-lessons/pronoun-agreement');
    await expect(page.getByTestId('lesson-evidence')).toHaveCount(0);
  });

  test.fixme('a teacher assigns interleaved writing practice from the create-assignment sheet', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app');
    await expect(page.getByTestId('app._index')).toBeVisible();

    // Teachers reach writing practice under the Assignments section (as a tile),
    // not a standalone Practice section.
    const assignmentsGrid = page.getByTestId('teacher-assignments-grid');
    await expect(
      assignmentsGrid.getByText(/writing fundamentals practice/i)
    ).toBeVisible();
    // The practice tile is illustrated with the café-cat artwork.
    await expect(
      assignmentsGrid.getByTestId('writing-fundamentals-tile-image')
    ).toBeVisible();

    await page
      .getByRole('button', { name: /create assignment|new assignment/i })
      .first()
      .click();

    // Pick "Writing Fundamentals Practice" as the assignment type.
    await page.getByRole('combobox').first().click();
    await page
      .getByRole('option', { name: /writing fundamentals practice/i })
      .click();

    const dialog = page.getByRole('dialog');
    // Title and due date are required for a practice assignment.
    await dialog.getByLabel(/^title/i).fill('Interleaved grammar set');
    await dialog.getByLabel(/due date/i).fill('2026-12-01');
    // First checkbox is the class; then pick two skills to interleave.
    await dialog.getByRole('checkbox').first().click();
    await dialog.getByText('Fixing Comma Splices', { exact: true }).click();
    await dialog.getByText('Passive Voice', { exact: true }).click();
    await dialog.getByRole('button', { name: '10', exact: true }).click();

    await dialog.getByRole('button', { name: /assign practice/i }).click();

    // The sheet closes on a successful assign.
    await expect(
      page.getByRole('button', { name: /assign practice/i })
    ).toHaveCount(0);
  });

  // KNOWN GAP, not a flake: same cause as above — writing practice is not in
  // the shared assignment-type dropdown on this branch.
  test.fixme('offers "Writing Fundamentals Practice" in the Assignments page type dropdown', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/assignments');

    await page.getByRole('button', { name: /new assignment/i }).click();

    const dialog = page.getByRole('dialog');
    // Open the assignment-type dropdown and choose writing practice.
    await dialog.getByRole('combobox').first().click();
    await page
      .getByRole('option', { name: /writing fundamentals practice/i })
      .click();

    // The sheet body swaps to the writing-practice builder.
    await expect(dialog.getByText(/skills to practice/i)).toBeVisible();
    await expect(dialog.getByText(/how many problems/i)).toBeVisible();
  });

  test('the writing-practice page has a direct per-lesson assignment entry point', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/writing-lessons');

    // Each lesson card carries its own "New <lesson> assignment" button, so a
    // teacher can assign the lesson they are looking at without leaving here.
    await page.getByRole('button', { name: 'Grammar & Mechanics' }).click();
    await page
      .getByTestId('writing-lesson-card-fixing-comma-splices')
      .getByRole('button', { name: /new .* assignment/i })
      .click();

    // Opens straight into the writing-practice assign sheet for that lesson.
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', { name: /assign fixing comma splices/i })
    ).toBeVisible();
    await expect(dialog.getByLabel('Assignment title')).toBeVisible();
    await expect(dialog.getByLabel('Number of problems')).toHaveValue('5');
  });
});
