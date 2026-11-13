# Kevin, Nov 6: three fixes after the first preview of #912

Three separate problems from Kevin's first pass over the preview. Each has its
own section, its own tests, and its own commits; they share a branch because
Kevin is reviewing them together.

## 1. The slides: Brian's Meyerowitz photo was missing, and "use it as is" did nothing

### What happened

Kevin tested the preview after the first push, before part 2 (Brian's deck
inside the stack) and before #892 (the PPTX-to-deck converter with pictures)
were on the branch. On that build:

- Opening a Yawp! lesson gave a stack with no deck, so the stack offered to
  build one. The planner's deck prompt knew only its gallery art, so it put the
  Bruegel cover painting where the Meyerowitz photograph goes and said so.
- Uploading his own deck and asking for it "as is" did nothing, because the
  "Keep it as is" flow is #892's, which was not there. The upload was read for
  its words only, as on `main`.

Both are already answered on the branch as it is now: part 2 files Brian's
deck, pictures included, into every copy, and #892 is merged in with its
upload flow. The preview redeployed at 14:09 UTC with both. PR previews seed
every `lesson_planner_*` flag on each deploy (create-only), so #892's flags are
on there.

### What still needs doing

- **Rebuilds must keep the lesson's pictures.** A Yawp! lesson's pictures
  belong to the conversation, not to an upload. The planner's deck prompt lists
  only upload pictures, so "Rebuild the slides" on a Yawp! lesson would lose
  the photograph again. Fix: the planner also lists the lesson's own pictures
  (rows with `conversationId` and no upload) as pictures it may place, the
  same way it lists an upload's. Test: the prompt sources include them.
- **CI runs no heavy jobs on a draft PR** (`pr_run_heavy_jobs` in `ci.yml`
  needs `draft == false`), so the e2e that proves the deck and the pictures has
  not run. Kevin's call: mark #912 ready for review.
- Re-test on the redeployed preview: open Pre-writing from the course card,
  check Print for class shows the deck, open Present and look for the
  Meyerowitz photo on slide 6.

## 2. Writing time: lecture steps counted as writing

### What happened

Kevin's run of show (built by the planner, not from the catalog) showed
"The shape of a critical essay" and "Pre-writing: what it is and why" as
Writing with a Create assignment button, both tagged Context. The rule
(step-types.ts, Brian's Nov 4) says a step named for a writing act is writing;
"essay" and "pre-writing" are writing acts, and the teacher-talk check only
catches titles that start with what/why/how or contain lecture words. Kevin's
titles do neither.

### Decision

Keep the writing meter (Kevin likes it). Make the rule trust the planner's own
type tag, and make the planner tag more carefully.

- **The rule.** A step the planner tagged `context` or `read_aloud` is the
  teacher talking or the class reading. A writing act in its title is not
  enough to count it; only a written prompt in its text does (an exit ticket
  line, "Pre-write: …", "students write"). The teacher-talk patterns also learn
  "X: what it is and why", "the shape/form/structure/parts of", "overview",
  "intro to", "defining". The same function decides the Create button, so the
  badge and the button never disagree.
- **The prompt.** The step-heading instruction says what the type tag means:
  `context` and `read_aloud` are the teacher talking or the class reading,
  whatever the step says about writing; a step where students write is
  `class_starter`, `daily_pages`, `thesis_essay` or `activity`; Yawp! counts
  writing time and offers Create from the student-writing steps only.
- **Not changed:** Brian's Nov 4 cases (a step named "Pre-write" is writing; a
  closing with an exit ticket line is writing; "What pre-writing is and why"
  is not). #892's "Don't count as writing" override stays for the rest.

Tests: Kevin's two titles tagged `context` are not writing and get no Create;
the same titles tagged `activity` with "Students write for 10 minutes" are;
the prompt test pins the new instruction.

## 3. How It Works pages: the visual and verbal layer

Brian's brief (pasted by Kevin): keep content, structure, screenshots and
clips; remove the eyebrow labels, the two-color headlines and terracotta; one
accent per page from six colors; accent on buttons, step circles and the big
panels (white headings, white cards with a soft shadow); darker body text; a
light copy pass on punchy one-liners and "not X, it's Y".

### Inventory

- **Pages under `/app/assignment-types/*/how-it-works`:** one. The route
  renders The Thesis-Driven Essay guide for that type, and the same guide for
  Thesis Statement in the free-tier locked preview. No Class Starter guide
  exists yet; the Reporter and Lesson Planner guides are other routes and are
  out of scope this round.
- **Terracotta (`text-primary`, `border-primary`, `bg-primary`) on the page:**
  the eyebrow labels; the hero's highlighted phrase ("one step at a time.");
  the numbered step circles and their labels; the "Open the course" link; the
  check and X icons in What it will do / won't; the footer's "Create an
  assignment" button; the clip pause button's focus ring.
- **Eyebrow labels:** "See how it works" (hero), "The assignment", "How it
  works", "The Yawp! Tutor", "Grade and release", "Bonus tip", "At a glance".

### Colors

| Page | Accent |
| --- | --- |
| The Thesis-Driven Essay (and Thesis Statement's locked-preview copy) | Forest green `#1F4D3A` |
| Class Starter (no guide yet; reserved) | Maroon `#6E1A26` |

The map lives in one place (`guide-accents.ts`) keyed by landing page key, so
the next guide picks the next color. Contrast: body `#3A3F4B` on the cream
page is 9.7:1, headings `#1A1F2E` 15:1, white on forest green 9.6:1 and on
every other accent higher, white at 86% on forest green 6.9:1, card body on
white 10.5:1. All pass AA.

### How it's built

The guide pieces in `components/how-it-works/guide.tsx` are shared with the
Reporter guide, so the change is a variant: `GuidePage` takes an optional
`accent`; when set it provides it to its children (a context and the
`--page-accent` token) and every piece switches to the new style. Without it,
nothing changes for Reporter. New `GuidePanel` and `GuideCard` pieces carry the
accent panel and the white cards; the page's two inline panels use them, and
WillWont uses them under the variant. The fixed colors apply in the light
theme; the dark theme keeps its tokens, where the fixed grays would not read.

### Copy (before → after)

1. Hero: "Teach the thesis-driven essay" + accent "one step at a time." →
   "Teach the thesis-driven essay one step at a time." (one color).
2. "This isn’t an online course students work through on their own. You
   teach the thesis-driven essay one step at a time, and the Tutor reinforces
   what you taught." → "You teach the thesis-driven essay one step at a time,
   and the Tutor reinforces what you taught."
3. Heading "The refusal is the point" → "When a student asks it to write for
   them".
4. "…and decide when students see it. Every grade is yours." → "…and decide
   when students see it, so every grade is yours."
5. Card "What it isn’t": "The final grade. Students see nothing until you
   release it, and it never accuses…" → "The final grade is yours to give.
   Students see nothing until you release it, and it never accuses…"

Everything else stays, including the will/won't lists, captions and the
"cardinal rule" line. The guide e2e that looked for "the refusal is the point"
looks for the new heading.

---

# Round 2 (Kevin, Nov 6, after the preview came back)

## 4. How to Teach It rows: slide deck and tutorial video only

Brian's call, relayed by Kevin: no handouts, and no link into the stack. "It'll
be overwhelming and confusing for most. So we'll just give 'em the
downloadable slide deck and the video."

- **Rows.** Each course row (and the single row on Pre-Writing and Thesis
  Statement) shows **Slide deck** (the PowerPoint download, as now) and
  **Watch tutorial**, which opens that lesson's module in the Teachers'
  Lounge course "The Thesis-Driven Essay" (`/app/teacher-trainings/<course>/
  modules/<module>`), where the video is. The module is found by its "Lesson
  N:" title, by the same rule the How It Works page uses to find the course
  (only when this teacher can open it). No lesson plan column: neither the
  stack link nor the PDF.
- **Copy.** Brian's lead said "a lesson stack (slides and handouts you can
  teach as is or edit)"; with no handouts and no stack it now says "a slide
  deck and a short tutorial video." Flagged for Brian. The two Pre-Writing /
  Thesis Statement leads say the same in their own words.
- **What stays.** The catalog, the deck builder and `/app/lesson-planner/yawp/
  :slug` stay on the branch behind `assignment-type-lesson-plans`, unlinked:
  Kevin still called the stack link "cool", and a URL is enough to show it.
  Lessons 7 and 8 keep deck-only and nothing, as before.

## 5. The teacher chooses the assignment type on Create

Kevin: the automatic send to Class Starter is intuitive and should stay, but
when the guess is wrong (a pre-write made into a Class Starter) the teacher
is stuck, because the sheet it opens cannot change type.

- **Defaults get smarter.** The writing types a school has now include
  Pre-Writing and Thesis Statement where they exist. A pre-write step
  defaults to Pre-Writing when the school has it, else Class Starter as now;
  an exit ticket to Exit Ticket; a thesis step to Thesis Statement.
- **Every create link carries its alternatives.** `StackCreateLink` gains
  `options`: the same prompt into each writing type the school has. The
  default keeps its label and href, so nothing that reads a link changes.
- **The button becomes a split control.** "+ Create assignment" still goes
  to the default type in one click (the existing tests and habit hold). A
  small chevron beside it opens the other types, each a link to the same
  prompt in that type. The finish line's "Not in Yawp! yet" list gets the
  same menu.

## 6. Writing time, round 2: "Deck: What Pre-Writing Is"

The round-1 fix made a `context` step need evidence in its text. The evidence
rule still counted the bare word "pre-write" anywhere in the text, and that
step's text has it. The fix is to stop guessing from nouns:

- **Text counts only when it says students write.** "Students (pre-)write",
  "write for N minutes", "N minutes of writing", "a written response", or a
  prompt line ("Pre-write: …", "Quick write: …", "Write: …", "Exit ticket:
  …"). The bare words pre-write, quick write, free write and journal in
  passing no longer count, for any step type.
- **A title counts only when it is the act.** "Pre-write", "Quick write (5
  min)", "Draft the body paragraphs", "Free write", "Journal", "Exit ticket".
  A noun ("Pre-writing"), or a title about the thing ("Deck: What Pre-Writing
  Is"), does not. A leading "Deck:" or "Slides:" is stripped before the
  teacher-talk check, so "Deck: What Pre-Writing Is" reads as "What …" and is
  the teacher talking.
- **The planner says it outright.** Its instructions now require every step
  where students write to carry a prompt line that starts with Write,
  Pre-write, Quick write or Exit ticket, the line the Create button needs
  anyway, and say that a step without one is not writing time.
- **The backstop.** #892's "Don't count as writing" / "Count as writing" on
  the stack page stays for whatever still slips, behind
  `lesson_planner_writing_override`.
- **Regression test** with the real titles from Kevin's preview lesson.

## Round 3 (Nov 7): the other How It Works pages

Brian's brief covers every How It Works page. When piece 3 was done only the
Thesis-Driven Essay and Reporter guides were on this branch; main's #851 then
added the Class Starter guide and the writing-step guide (Prewriting, Thesis
Statement), which the Nov 7 merge brought in with their accents (maroon,
navy, petrol) but without the copy pass. Kevin (Nov 7): do all four.

- **Class Starter**: read for items 8 and 9. Every line is already a plain,
  complete sentence; the headings and lists stay by item 10. No edits.
- **Prewriting and Thesis Statement**: the guide's own lines are plain. The
  lede, steps, Tutor and scoring lines come from
  `about-writing-step/content.ts`, shared with the free-tier landing pages,
  so they are out of this round ("Only change the How It Works pages this
  round"). No edits; the one candidate, "It is supposed to be messy.", is
  flagged for Brian.
- **Reporter**: charcoal (#2B2B2B), the fifth color; ink stays free. The page
  moves into `reporter-guide.tsx` so it can be rendered in a unit test the way
  the Thesis-Driven Essay guide is. Copy: two fragments become sentences
  ("Every student’s average, and who is trending down." → "It shows every
  student’s average and who is trending down."; "Scores over time, what your
  feedback keeps saying, and suggested next steps." → "The report shows
  scores over time, what your feedback keeps saying, and suggested next
  steps."). Lists, headings and the will/won't stay.
