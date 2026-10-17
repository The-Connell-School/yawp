# Thesis-Driven Essay decks (hybrid)

New versions of all seven of Brian's Teacher Training slide decks for the
Thesis-Driven Essay. Each keeps every one of Brian's slides and his words,
in a hybrid look:

- **From the lesson planner's YAWP! tile template (PR #437):** a cream page,
  raised paper tiles, a mono eyebrow over a serif title, and the small YAWP!
  wordmark and slide number at the foot.
- **From Brian's original decks:** his teal, sunshine, coral, orange and pink;
  white line icons in coloured bubbles; confetti dots; yellow highlighter on
  the words that matter.

New in every deck: speaker notes on every slide (from Brian's lesson plans and
training videos), and current screenshots of the YAWP! app on that lesson's
step.

| Lesson | Deck | Slides | Preview | Lesson plan |
| --- | --- | ---: | --- | --- |
| 1 · Introduce Students to YAWP! | [`lesson-1-day-1.pptx`](../../../services/web-app/resources/thesis-essay-decks/lesson-1-day-1.pptx) | 16 | [preview](lesson-1-day-1-preview.jpg) | [`lesson-1-day-1-lesson-plan.pdf`](../../../services/web-app/resources/thesis-essay-decks/lesson-1-day-1-lesson-plan.pdf) (2 pp.) |
| 2 · Pre-Writing | [`lesson-2-pre-writing.pptx`](../../../services/web-app/resources/thesis-essay-decks/lesson-2-pre-writing.pptx) | 24 | [preview](lesson-2-pre-writing-preview.jpg) | [`lesson-2-pre-writing-lesson-plan.pdf`](../../../services/web-app/resources/thesis-essay-decks/lesson-2-pre-writing-lesson-plan.pdf) (3 pp.) |
| 3 · Thesis Statement | [`lesson-3-thesis-statement.pptx`](../../../services/web-app/resources/thesis-essay-decks/lesson-3-thesis-statement.pptx) | 47 | [preview](lesson-3-thesis-statement-preview.jpg) | [`lesson-3-thesis-statement-lesson-plan.pdf`](../../../services/web-app/resources/thesis-essay-decks/lesson-3-thesis-statement-lesson-plan.pdf) (3 pp.) |
| 4 · Introduction Paragraph | [`lesson-4-introduction.pptx`](../../../services/web-app/resources/thesis-essay-decks/lesson-4-introduction.pptx) | 25 | [preview](lesson-4-introduction-preview.jpg) | [`lesson-4-introduction-lesson-plan.pdf`](../../../services/web-app/resources/thesis-essay-decks/lesson-4-introduction-lesson-plan.pdf) (2 pp.) |
| 5 · Body Paragraphs | [`lesson-5-body-paragraphs.pptx`](../../../services/web-app/resources/thesis-essay-decks/lesson-5-body-paragraphs.pptx) | 28 | [preview](lesson-5-body-paragraphs-preview.jpg) | [`lesson-5-body-paragraphs-lesson-plan.pdf`](../../../services/web-app/resources/thesis-essay-decks/lesson-5-body-paragraphs-lesson-plan.pdf) (3 pp.) |
| 6 · Conclusion Paragraph | [`lesson-6-conclusion.pptx`](../../../services/web-app/resources/thesis-essay-decks/lesson-6-conclusion.pptx) | 29 | [preview](lesson-6-conclusion-preview.jpg) | [`lesson-6-conclusion-lesson-plan.pdf`](../../../services/web-app/resources/thesis-essay-decks/lesson-6-conclusion-lesson-plan.pdf) (2 pp.) |
| 7 · Titles and Formatting | [`lesson-7-titles.pptx`](../../../services/web-app/resources/thesis-essay-decks/lesson-7-titles.pptx) | 23 | [preview](lesson-7-titles-preview.jpg) | [`lesson-7-titles-lesson-plan.pdf`](../../../services/web-app/resources/thesis-essay-decks/lesson-7-titles-lesson-plan.pdf) (2 pp., new) |

Slide counts include Brian's slides plus what the hybrid adds: the new app
screenshots (one per lesson; Lesson 1's sign-up screenshot became three
slides of today's join flow), a closing slide on every deck, an "Optional ·
Quick Review" divider ahead of the review quiz in Lessons 3–6, the sample
essay's introduction on its own slide in Lesson 5, and a "Write your title"
practice slide in Lesson 7. The plan and decisions behind them are in
[PLAN.md](PLAN.md).

## Made for the back row

- **18pt is the floor** for every word students read; only the small mono
  labels sit below it. A test fails if any slide breaks it. Text is sized to
  fit its box (the largest size that fits, down to 18pt), and a passage too
  long for 18pt fails the build, so it gets split across slides instead of
  shrunk.
- **Reading slides** (sample essay passages, pre-write examples, prompts)
  and **screenshots** get a compact heading, so the text or image has more
  height.
- **Screenshots carry numbered markers** that match their numbered
  callouts, so the room can find the Tutor, the step name or the Submit
  button without reading the app's own small text.
- **Titles don't leave a word alone** on their last line.

## Lesson plans

Each deck has a lesson plan that corresponds to it. They are Brian's lesson
plan PDFs from the Teacher Training resources, in his words, and each step
names the slides it uses ("Slides 3–5"). They change only where the decks
did:

- **Day 1:** onboarding is today's join flow (the class's join link or QR
  code, then a handle and password), not the retired "Welcome to YAWP!"
  course. It also tells teachers to make their own Two Truths reveal slides.
- **Lessons 3–6:** the optional review quiz; Lesson 3 also covers the
  optional "to be" section.
- **Lessons 5–6:** the house analogy slides. In Lesson 5 the house analogy
  now comes before the writing slide, as the plan has it.
- **Lesson 7:** new. Brian wrote none, so it is written from his Lesson 7
  video.

Two handouts go with Day 1:

- [`student-sign-up.pdf`](../../../services/web-app/resources/thesis-essay-decks/student-sign-up.pdf): one page for
  students, replacing the old "Student Sign-up Process" PDF, which showed the
  teacher class-code flow.
- [`sample-essay-bored-in-the-usa.pdf`](../../../services/web-app/resources/thesis-essay-decks/sample-essay-bored-in-the-usa.pdf):
  the sample essay students read, mark up and come back to in later
  lessons. Its thesis is left unmarked; on Day 1 the class finds it.

Plans name slides by title, so moving a slide renumbers the plan, and a test
fails if a plan points at a slide that is not in its deck.

## In the app

With the `thesis_essay_decks` flag on, the Thesis-Driven Essay's page offers
each deck and its lesson plan inside its step in **Modules** (Pre-writing →
Lesson 2, Thesis Statement → Lesson 3, …), with Day 1's deck, lesson plan and
two handouts above the list. Teachers only; downloads come from
`/api/thesis-essay-deck/:slug` (`<deck>`, `<deck>-lesson-plan`,
`student-sign-up`, `sample-essay-bored-in-the-usa`). With the flag off the
page is unchanged.

## Rebuilding

The decks, lesson plans and handouts are generated together, so edit the
source, not the `.pptx` or `.pdf`:

```bash
cd services/web-app
bun scripts/thesis-essay-decks/build.ts          # all decks
bun scripts/thesis-essay-decks/build.ts "" lesson-3-thesis-statement
bun test scripts/thesis-essay-decks
```

- Content, one file per lesson: `scripts/thesis-essay-decks/*-deck.ts`
- Shared pieces (review quiz, conclusion structure, house analogy, sample essay):
  `shared-slides.ts`, `sample-essay.ts`
- Layouts: `render-hybrid-deck.ts`; colours and fonts: `hybrid-theme.ts`
- Lesson plans: `lesson-plans.ts`; their layout and the handouts:
  `render-lesson-plan.ts`
- Images and icons: `assets/` (icons have SVG sources next to their PNGs)

The decks are checked to open cleanly in PowerPoint as well as Google Slides.
pptxgenjs writes paragraph properties before every run of a paragraph, which
PowerPoint "repairs" by scrambling the formatting, so `render-hybrid-deck.ts`
keeps only the first; a test fails if a deck has the problem again.

The previews are rendered with LibreOffice, with Georgia or its
metric-compatible stand-in Gelasio installed, so lines wrap as they do in
PowerPoint and Google Slides.
