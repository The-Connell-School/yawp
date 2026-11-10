# Plan: finalize the four How It Works pages, with each video at the top

Task (Kevin, due Wed Nov 11):

1. Finalize the four How It Works pages: Class Starter, Pre-Writing, Thesis
   Statement, Exit Ticket. Model: Brian's rebuilt teacher page (white cards,
   a collapsible "How to Teach It" block). Review Kevin's PR #893 pages.
2. Put each video at the top of its How It Works page.

## Status on Nov 10: neither item is done

| Piece | Where it stands |
| --- | --- |
| PR #893 (landing pages: Brian's copy, collapsible How to Teach It, new card art) | **Open, not merged.** Last commit Nov 6. Behind main by the PKG-0x merges and #930/#932. |
| PR #912 (Brian's Nov 5 look on every How It Works guide: one accent, white cards in accent panels; tutorial videos per lesson) | **Open, not merged, conflicts with main** (`mergeable_state: dirty`). Built on #893 and #892, so it needs both merged first. |
| Class Starter guide | On main (from #851) in the old look. Restyled maroon on #912. No collapsible How to Teach It block, no video. |
| Pre-Writing / Thesis Statement guide (`writing-step-guide.tsx`) | On main in the old look. Restyled navy / petrol on #912. Its header comment says "No clips yet. When the walk-through video is recorded it goes in the hero." No video on the page. |
| Exit Ticket guide | **Does not exist on any branch.** `howItWorksGuideFor` and `assignmentTypeHasHowItWorksGuide` don't know Exit Ticket, so there is no "See how it works" link and the URL redirects to the type's page. |
| Videos | Pre-Writing and Thesis Statement have tutorial videos: the Teachers' Lounge modules "Lesson 2: Pre-writing" and "Lesson 3: Developing a Thesis Statement" (on S3). #912 plays them only on a separate page (`/app/assignment-types/:id/tutorial/:lesson`), not at the top of the guide. **Class Starter and Exit Ticket have no video** anywhere in the repo or the Lounge fixtures. |

## Decisions needed from Kevin (blocking)

1. **Videos for Class Starter and Exit Ticket.** None exist. Options:
   a. Kevin or Brian records a 1–3 min walk-through for each and sends the
      MP4. Put it in `public/img/<type>-guide/overview.mp4` like the other
      clips, or upload it as a Lounge module.
   b. Record a screen walk-through from demo data with the existing
      Playwright recorder (`e2e/tools/record-*.ts`): silent, captioned,
      like the current clips.
   c. Ship these two without a hero video for now and add one later.
   Recommendation: (a) for Wednesday if the videos exist, otherwise (c)
   with (b) as a fallback.
2. **Which video goes at the top of Pre-Writing and Thesis Statement?** The
   full Lounge tutorial (Lesson 2 / 3, several minutes) is the obvious one.
   Confirm, or name a different cut.
3. **Merge order.** #893 → #892 → #912 → this work. Building on #912's branch
   means this work can't ship before #912 does. If #912 can't merge by
   Wednesday, the fallback is to cut this work from #893 and leave out
   #912's restyle. Recommendation: rebase #912 on main today and build on it.
4. **Exit Ticket builder.** #895 (Exit ticket v3, flagged) changes the
   builder. The guide's screenshots and clips should show the builder
   teachers will actually see. Recommendation: shoot the current builder,
   and reshoot when v3's flag turns on.

## Step 0: review the #893 pages (morning of Nov 10–11)

Open the #893 preview (link in the PR's sticky comment) as the dev teacher.
For each of the four types, check against Brian's Oct 31 doc and Nov 3 notes:

- [ ] Description shows in full beside the card art (no Read more), dark text.
- [ ] How to Teach It is in the spotlight box: open on arrival, Hide shows the
      heading plus a two-line preview, Show expands it, and keyboard focus
      lifts the box but a mouse click doesn't.
- [ ] The other sections are drop-downs, closed by default, and open into
      the same light box.
- [ ] New card art (beret dog, coffee cat, ticket stub) shows on preview.
- [ ] Every "Yawp" has its "!".
- [ ] Pre-Writing shows the 100-prompt library; Thesis Statement has no library.
- [ ] Exit Ticket copy is about 230 words; the builder's helper line sits under
      "Is there a correct answer?".
- [ ] Students and production (flags off) still see the old page.

Settle the open items in #893's description before merging:

- [ ] Decks and lesson PDFs are public by URL. Keep that, or make them teacher-only?
- [ ] Class Starter copy describes 3 grading bands, but the rubric in code
      has 4. Change the copy or the rubric? (Brian)
- [ ] How to Teach It copy still says "lesson stack (slides and handouts)".
      #912 changes it to "a slide deck and a short tutorial video" (Brian's
      Nov 6 call). Make sure the Pre-Writing and Thesis Statement leads
      (content.ts lines ~223 and ~283) change too.
- [ ] Merge main into #893 again (it's behind), rerun CI, and mark it ready.

Then rebase #912 on the merged #893 + #892, resolve its conflicts, and rerun
CI. Its e2e has never run, because CI skips heavy jobs on drafts.

## Step 1: shared pieces (guide.tsx)

Write the tests first, as AGENTS.md requires: unit tests in
`components/how-it-works/guide.test.tsx` and an e2e for the hero video.

1. **`GuideHeroVideo`**: the video at the top of the page, above or in
   place of the hero image.
   - Props: `src`, `poster`, `title`, `captions?` (VTT), `minutes?`.
   - Uses the native `<video controls preload="metadata">`. Not autoplay:
     these are narrated tutorials, unlike the silent looping clips.
   - It sits in a white card in the page's accent panel, matching Brian's
     look, and the page's lede follows it.
   - If there's no video, it renders nothing and the page falls back to
     today's hero image, so a missing S3 object never shows a broken player.
2. **`GuideHowToTeach`**: the collapsible How to Teach It block, moved out
   of `landing-copy/assignment-type-landing.tsx` (`HowToTeachSection`) into a
   shared component so the landing page and the guides use the same one.
   Same behavior: open on arrival, Hide/Show, a two-line preview, focus-only
   lift. On the guides it carries the page's `--page-accent`. The landing
   page's tests and e2e must still pass unchanged after the move.
3. **White cards**: #912's `GuidePanel` / `GuideCard`. Use them for every
   panel on the four pages so the pages match each other.
4. **Hero video source, server side**: a helper
   `getGuideHeroVideo(kind | key, membershipId)` that returns `{ src,
   poster, minutes } | null`:
   - Pre-Writing / Thesis Statement: `findThesisEssayCourse` (from #912)
     gives the Lesson 2 / 3 module, and `getTeacherTrainingPlaybackUrl`
     gives the signed URL, the same path #912's tutorial route uses. The
     page sits under the type's own access check (not the Lounge's
     temporary disable).
   - Class Starter / Exit Ticket: a static file in `public/img/<type>-guide/`
     once the video exists (decision 1), otherwise `null`.
   - Unit tests cover: a module with a video, no course, a module with no
     video, and a signing failure (returns `null`, doesn't throw).

## Step 2: the four pages

All four follow one order, so they read as a set:

1. Back link, then hero title (one color) and lede.
2. **The video**, at the top.
3. **How to Teach It**, the collapsible block: Brian's copy from #893's
   `content.ts`, plus the deck and tutorial row where there is one.
4. Existing sections (what it can do, the Tutor, grading) in accent panels
   with white cards.
5. Will / won't.
6. Footer with "Create an assignment".

| Page | Accent | Video at top | How to Teach It contents |
| --- | --- | --- | --- |
| Class Starter | maroon `#6E1A26` | Class Starter video (decision 1) | Brian's "How it works" copy: New or the library, Tutor on/off, grading is about effort |
| Pre-Writing | navy `#1E3A5F` | Lounge Lesson 2 tutorial | Lesson 2 slide deck + Watch tutorial (from #912) |
| Thesis Statement | petrol `#1F4E5F` | Lounge Lesson 3 tutorial | Lesson 3 slide deck + Watch tutorial |
| Exit Ticket | ink `#14213D` (the unused sixth color) | Exit Ticket video (decision 1) | Brian's copy: the two ticket types, Tutor off by default, grading optional |

### Class Starter (`class-starter-guide.tsx`)
- Add the hero video and the How to Teach It block. Keep the existing clips
  (library, generate, write, grade) further down.
- Fix the grading line to match whatever the 3-vs-4 bands decision is (Step 0).

### Pre-Writing and Thesis Statement (`writing-step-guide.tsx`)
- Replace the "No clips yet" comment. Pass the hero video in from the loader.
- How to Teach It holds the lesson's deck + Watch tutorial row. Since the
  video now sits at the top, the row's "Watch tutorial" can scroll to it
  instead of opening a separate page. Keep the `/tutorial/:lesson` route for
  the Thesis-Driven Essay course card.
- Brian flagged "It is supposed to be messy." (shared with
  `about-writing-step/content.ts`). Get his call before changing it.

### Exit Ticket (new: `exit-ticket-guide.tsx`)
- **Routing**: add `'exit-ticket'` to `HowItWorksGuide`, detected by the
  type's kind (`EXIT_TICKET` kind constant, the same way writing steps use
  `isWritingStepKind`), not by title. Make `assignmentTypeHasHowItWorksGuide`
  return true for it so the landing page shows "See how it works". Add a
  branch to the route loader and add `'exit-ticket': 'ink'` to
  `GUIDE_PAGE_ACCENTS`.
- **Content**: hero, then video, then How to Teach It (Brian's copy), then
  the two ticket types with a clip each (Reflection/Question, Check for
  understanding with key points), then "What makes a good exit ticket"
  (Brian's three bullets), then grading (optional, never grammar), then
  will / won't, then footer.
- **Will / won't, each line checked against the code** (see
  `docs/how-to-guides.md`):
  - `exit-ticket.ts` `composeExitTicketPrompt`: the wording rule.
  - `exit-ticket-rubric.ts`: grammar never scored.
  - Tutor default off: check the builder's default.
  - Grading Assistant reads every variant (#893 confirms this).
  - No student names to the Tutor, and no grade shown before release.
- **Clips**: record from demo data with the Playwright recorder into
  `public/img/exit-ticket-guide/`, with a poster `.jpg` per clip like the
  other guides. Use the current builder (decision 4).
- **Free tier**: check `locked-preview-assignment-type-routing.server.ts`.
  If Exit Ticket is a locked teaser, its How It Works should open the way
  #851 made the other locked types do.

## Step 3: rollout (backward compatibility)

- Gate the new hero video, the How to Teach It block on the guides, and the
  Exit Ticket guide behind `assignment-type-landing-v2` (#893's flag: on in
  demo and previews, off in production). With the flag off, the guides stay
  exactly as they are today, and Exit Ticket keeps no "See how it works" link.
- Nothing is written to the database, so there's no dual-write or migration.

## Step 4: tests (written before the code)

- **E2E, new** `teacher.how-it-works-four-pages.spec.ts`. For each of the
  four types with the flag on:
  - the video is the first media on the page (Pre-Writing and Thesis
    Statement: `<video>` with a signed `src` and a poster);
  - How to Teach It is open, then Hide shows the preview, then Show expands it;
  - accent panels with white cards are present;
  - the footer Create button links to the right type.
  - With the flag off: the Exit Ticket guide URL redirects to the type's
    page, and the other three render today's guide.
- **E2E, updated**: `teacher.daily-pages-class-starter-guides.spec.ts`,
  `teacher.thesis-essay-guide.spec.ts`, `free-tier.locked-preview.spec.ts`.
- **Unit**: `how-it-works-guide.test.ts` and
  `assignment-type-how-it-works.test.ts` (Exit Ticket now has a guide), the
  hero-video helper, `GuideHeroVideo`, `GuideHowToTeach`, and a render test
  per guide (as #912 does for Thesis-Driven Essay and Reporter).
- `./bin/project verify --profile prepush --json` before every push. Add any
  new test files to the CI test list (#893 did this in `ci.yml`).

## Step 5: QA and hand-off

- On the PR preview, screenshot each of the four pages at desktop and phone
  width, with the block open and collapsed. Post them for Brian.
- Play each video once on the preview, to check the S3 signing works there.
- Update `docs/how-to-guides.md` (the page list, the accent table, and where
  each video comes from).
- Give Brian a short report: page to color, the copy changes (if any), and
  open questions.

## Timeline to Wed Nov 11

| When | What |
| --- | --- |
| Tue AM | Decisions 1–4 from Kevin. Step 0 review of #893, and rebase #912. |
| Tue PM | Step 1 (tests, then shared pieces). Pre-Writing and Thesis Statement pages with the Lounge video. |
| Wed AM | Class Starter and Exit Ticket pages. Exit Ticket clips recorded. |
| Wed PM | E2E green on CI, preview QA, screenshots to Brian. |

The risk is the dependency chain. If #893 or #912 aren't merged by Wednesday,
the four pages can be done and reviewable on preview, but they can't ship
to main, even with the flag off.
