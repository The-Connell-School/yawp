# How to Teach It → ready-built lesson plans in the Lesson Planner

Kevin, Nov 5: on the new assignment-type pages, the "How to Teach It" block
should link to a lesson plan (a run of show) for The Thesis-Driven Essay,
Pre-Writing and Thesis Statement. Clicking it should drop the teacher into a
premade lesson in their own Lesson Planner, not a PDF.

## Where the PRs sit, and where this goes

| PR | What it holds | State |
| --- | --- | --- |
| #893 `claude/affectionate-ramanujan-54ym9s` | Brian's landing pages (v2) with the Thesis-Driven Essay course card: lesson plan PDFs and slide decks | open, clean against `main` |
| #905 `claude/fervent-carson-vrwvlm` | How to Teach It on the **old** page: one row per module with admin-pasted lesson and tutorial-video URLs | open, clean against `main`, conflicts with #893 in 7 files |
| #892 `claude/sleepy-allen-5mjnpq-restore-723` | Lesson Planner run 6: teachers' own decks, working time, writing override | open, independent |
| `main` | already has the stack page redesign (#723) and its guide (#886) | |

The new pages only exist on #893, so this branch is `main` with #893 merged
in, and the work stacks on top. Until #893 merges, this branch's diff on
GitHub includes #893's; once it merges, only this work shows. (Open the PR
against #893's branch to see this work alone.)

#905 is not merged in here. It is bridged instead: an admin can paste
`/app/lesson-planner/yawp/<slug>` into a module's "lesson link" and the old
page's row opens the same stack, with no further code.

## What a teacher gets

1. On The Thesis-Driven Essay page, each lesson row in the course card has a
   **Lesson plan** link. It opens that lesson in the teacher's Lesson Planner,
   on the stack page (the run of show), with the steps already built, timed and
   typed: Brian's plan, as the planner would have written it.
2. Pre-Writing and Thesis Statement get a **How to Teach It** box of their own,
   with the matching lesson (Lesson 2 and Lesson 3 of the course) and its
   slide deck.
3. The lesson is the teacher's: a real `LessonPlanConversation` in their
   library, editable, printable, shareable, with "Create … in Yawp!" where the
   planner offers it. Clicking the link again opens the same copy rather than
   making another.
4. Flag off, or no Lesson Planner for the school: the row shows Brian's PDF, as
   #893 ships it. Nothing else changes.

## How it is built

### Content: `app/domain/lesson-planner/yawp-lessons.ts`

The six Thesis-Driven Essay lessons that have Brian's lesson plan PDFs
(Lessons 1–6), each written in the planner's own reply format: a title, an
overview, then one `## Step (N min)` heading per step holding a
`yawp-material` block (`kind: notes`, `type: …`, `minutes: …`). Every step is a
notes block rather than a bare heading on purpose: a bare step whose title or
text mentions a thesis, a pre-write or "students write" grows a "Create … in
Yawp!" button with the step's first line as the prompt, which is wrong for a
lesson where the assignment already exists. A notes block gets the type chip,
the minutes and the writing badge (`type: thesis_essay` counts as writing time)
and no button. Fifty minutes per lesson. The slide deck is Brian's PPTX from
#893, linked from the lesson's overview and from the landing row.

Tests pin: every lesson parses into at least three pieces, every piece has
minutes and a known step type, the minutes add up to the period, no piece would
grow a create link, every deck file exists, and the slugs match the hrefs.

### Opening one: `/app/lesson-planner/yawp/:slug`

`app/routes/app.lesson-planner_.yawp.$slug/route.tsx`, loader only:

1. Flag `assignment-type-lesson-plans` off for the school → 404.
2. Not a teacher, or no Lesson Planner → redirect to `/app` (as the planner's
   guide page does).
3. Unknown slug → 404.
4. `openYawpLesson` (`yawp-lessons.server.ts`): the teacher's existing copy
   (`yawpLessonSlug`, not deleted), else a new conversation with the lesson's
   title and period, a teacher turn ("Open the Yawp! lesson …") and the plan
   as the planner's reply, filed into the stack through `fileReplyPieces`, the
   same path "Add everything" uses.
5. Redirect to `/app/lesson-planner/<id>/packet`, the stack page.

A GET that creates something is unusual; it is a find-or-create keyed on the
slug, so a repeated or prefetched request makes nothing new, and it has to be a
plain link so #905's pasted URLs and the landing rows can both use it.

### Data

`LessonPlanConversation.yawpLessonSlug String?` with an index on
`(membershipId, yawpLessonSlug)`. Migration `20261105130000_lesson_yawp_lesson_slug`
adds the column only, with a `rollback.sql`. Every existing row is null.

### Flag

`assignment-type-lesson-plans`: default on in demo and PR previews, off in
production, the same pattern as #893's two flags. `getAssignmentTypeLandingFlags`
returns it as `lessonPlans`. The landing route passes `lessonPlans && planner
enabled for the school` to the page, so a link is only shown where it works.

### Landing pages

- `thesis-essay-course.ts`: each lesson names its `yawpLesson` slug. The row
  component takes `yawpLessons: boolean`; on, "Lesson plan" goes to the
  planner (same tab), off, to the PDF in a new tab as before.
- `content.ts`: a new block, `{ type: 'lesson', slug, lead? }`, one course-style
  row. Pre-Writing and Thesis Statement each get a How to Teach It section
  first, with a short lead and that block. Brian's five pages stay word for
  word; the two leads are new copy and are flagged for Brian in the PR.
- `assignment-type-landing.tsx`: `LandingSections` takes `yawpLessons`.

### Tests

- e2e `teacher.assignment-type-lesson-plans.spec.ts` (written first): the
  course row links to the planner and lands on the stack with the steps; a
  second click reuses the copy; Pre-Writing shows its How to Teach It; with
  the flag off the row is the PDF and the route is a 404.
- Unit: catalog, `openYawpLesson`, the route loader, the flag registry and its
  defaults, the gate, content, the component, the landing loader.
- CI: the new unit test files join the lists in `ci.yml`.

## Not in this pass

- Tutorial videos: the rows have no video link yet. The lesson block has room
  for one when the clips exist.
- Lessons 7 and 8 (Titling, Review my essay) have no Brian lesson plan; their
  rows keep the deck only.
- A slide deck inside the stack: the planner's deck is its own JSON format, and
  turning Brian's PPTX into one is #892's "Keep it as is" work. For now the
  stack links to the PPTX.
