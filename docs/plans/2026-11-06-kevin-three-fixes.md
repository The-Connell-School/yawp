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
